import fs from 'node:fs'
import path from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import sharp from 'sharp'
import {DatabaseSync} from 'node:sqlite'
import {assertDatabaseIntegrity,readSchemaVersion} from './schema.js'
import {salesDraftService,SalesError} from './salesDrafts.js'
import {salesPreflightService} from './salesPreflight.js'

export const SALES_AREA='.mecacao-v2-sales'
export const SALES_SCHEMA=130
export const salesActivity={busy:false,readers:0}
export const digest=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex')
export function contained(root:string,p:string){const r=path.relative(root,p);return !!r&&!path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep)}
export function syncDirectory(p:string){try{const d=fs.openSync(p,'r');try{fs.fsyncSync(d)}finally{fs.closeSync(d)}}catch(e){if(process.platform!=='win32')throw e}}
export function writeDurable(p:string,bytes:Buffer|string){const fd=fs.openSync(p,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd)}finally{fs.closeSync(fd)};syncDirectory(path.dirname(p))}
export function exactFile(p:string,sha?:string){if(fs.realpathSync(p)!==p||!fs.lstatSync(p).isFile()||fs.lstatSync(p).isSymbolicLink())throw Error('File bán hàng không an toàn');const bytes=fs.readFileSync(p);if(sha&&digest(bytes)!==sha)throw Error('File bán hàng thay đổi checksum');return bytes}
export function bootstrapSalesExecution(db:DatabaseSync,root:string){
 const real=fs.realpathSync(root),file=(db.prepare('PRAGMA database_list').all().find(r=>r.name==='main') as {file:string}).file
 if(!file||!contained(real,path.resolve(file))||fs.realpathSync(file)!==path.resolve(file))throw Error('Schema130 chỉ cho database trong sandbox riêng')
 if(readSchemaVersion(db)===SALES_SCHEMA){assertDatabaseIntegrity(db);return}
 if(readSchemaVersion(db)!==120)throw Error('Bán sandbox cần schema120 đã kiểm chứng')
 const backup=file+'.pre-v130-'+randomUUID()+'.bak';db.exec("VACUUM INTO '"+backup.replace(/'/g,"''")+"'");const check=new DatabaseSync(backup,{readOnly:true});try{assertDatabaseIntegrity(check);if(readSchemaVersion(check)!==120)throw Error('Migration backup sai schema')}finally{check.close()}
 db.exec('BEGIN IMMEDIATE')
 try{db.exec(`
 CREATE TABLE sales_operations(id TEXT PRIMARY KEY,request_key TEXT NOT NULL UNIQUE,input_hash TEXT NOT NULL,payload TEXT NOT NULL,payload_hash TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('PREPARED','SOLD','ROLLED_BACK')),created_at TEXT NOT NULL DEFAULT(datetime('now')));
 CREATE TABLE sales_confirmations(order_id TEXT PRIMARY KEY REFERENCES sales_orders(id),operation_id TEXT NOT NULL UNIQUE REFERENCES sales_operations(id),version INTEGER NOT NULL,subtotal INTEGER NOT NULL,discount INTEGER NOT NULL CHECK(discount>=0 AND discount<=subtotal),total INTEGER NOT NULL CHECK(total=subtotal-discount),note TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now')));
 CREATE TABLE sales_units(image_id INTEGER PRIMARY KEY REFERENCES product_images(id),order_id TEXT NOT NULL REFERENCES sales_confirmations(order_id),variant_id INTEGER NOT NULL REFERENCES product_variants(id),snapshot TEXT NOT NULL,source_hash TEXT NOT NULL,archive_path TEXT NOT NULL,archive_hash TEXT NOT NULL);
 CREATE TABLE sales_ledger(image_id INTEGER PRIMARY KEY REFERENCES sales_units(image_id),order_id TEXT NOT NULL REFERENCES sales_confirmations(order_id),variant_id INTEGER NOT NULL REFERENCES product_variants(id),transaction_type TEXT NOT NULL CHECK(transaction_type='SALE'),quantity INTEGER NOT NULL CHECK(quantity=1),unit_cost INTEGER CHECK(unit_cost IS NULL OR unit_cost>=0),created_at TEXT NOT NULL DEFAULT(datetime('now')));
 DROP VIEW inventory_stock;
 CREATE VIEW inventory_stock AS SELECT variant_id,SUM(quantity) stock FROM (SELECT variant_id,CASE WHEN transaction_type='ADJUST_MINUS' THEN -quantity ELSE quantity END quantity FROM inventory_transactions UNION ALL SELECT variant_id,-quantity FROM sales_ledger) GROUP BY variant_id;
 UPDATE app_metadata SET value='130',updated_at=datetime('now') WHERE key='schema_version';
 CREATE TRIGGER sales_operation_payload_immutable BEFORE UPDATE OF id,request_key,input_hash,payload,payload_hash ON sales_operations BEGIN SELECT RAISE(ABORT,'Sale evidence is immutable'); END;
 CREATE TRIGGER sales_operation_terminal_immutable BEFORE UPDATE OF status ON sales_operations WHEN OLD.status<>'PREPARED' BEGIN SELECT RAISE(ABORT,'Terminal sale is immutable'); END;
 CREATE TRIGGER sales_operation_delete_immutable BEFORE DELETE ON sales_operations BEGIN SELECT RAISE(ABORT,'Sale evidence is immutable'); END;
 CREATE TRIGGER sold_order_update BEFORE UPDATE ON sales_orders WHEN EXISTS(SELECT 1 FROM sales_confirmations WHERE order_id=OLD.id) BEGIN SELECT RAISE(ABORT,'Sold order is immutable'); END;
 CREATE TRIGGER sold_order_delete BEFORE DELETE ON sales_orders WHEN EXISTS(SELECT 1 FROM sales_confirmations WHERE order_id=OLD.id) BEGIN SELECT RAISE(ABORT,'Sold order is immutable'); END;
 CREATE TRIGGER sold_items_insert BEFORE INSERT ON sales_order_images WHEN EXISTS(SELECT 1 FROM sales_confirmations WHERE order_id=NEW.order_id) BEGIN SELECT RAISE(ABORT,'Sold order is immutable'); END;
 CREATE TRIGGER sold_items_update BEFORE UPDATE ON sales_order_images WHEN EXISTS(SELECT 1 FROM sales_confirmations WHERE order_id=OLD.order_id) BEGIN SELECT RAISE(ABORT,'Sold order is immutable'); END;
 CREATE TRIGGER sold_items_delete BEFORE DELETE ON sales_order_images WHEN EXISTS(SELECT 1 FROM sales_confirmations WHERE order_id=OLD.order_id) BEGIN SELECT RAISE(ABORT,'Sold order is immutable'); END;
 `);for(const t of ['sales_confirmations','sales_units','sales_ledger'])for(const a of ['UPDATE','DELETE'])db.exec(`CREATE TRIGGER ${t}_${a.toLowerCase()}_immutable BEFORE ${a} ON ${t} BEGIN SELECT RAISE(ABORT,'Sold evidence is immutable'); END`);assertDatabaseIntegrity(db);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
}
type Unit={imageId:number;canonical:string;staged:string;sourceHash:string;archive:string;archiveHash:string;snapshot:any}
type Plan={format:1;id:string;orderId:string;version:number;inputHash:string;draftHash:string;subtotal:number;discount:number;total:number;note:string;units:Unit[]}
type Op={id:string;request_key:string;input_hash:string;payload:string;payload_hash:string;status:string}
/** Actual SALE on the explicitly opted-in test sandbox, never on default LOCAL or draft sandbox. Originals retained. */
export function salesExecutionService(db:DatabaseSync,sandboxRoot:string){
 const root=fs.realpathSync(sandboxRoot),area=path.join(root,SALES_AREA),lock=path.join(root,SALES_AREA+'-pending.json'),drafts=salesDraftService(db,root),preflight=salesPreflightService(db,root)
 if(readSchemaVersion(db)!==130)throw Error('Sale sandbox schema130 required')
 db.exec('PRAGMA synchronous=FULL;PRAGMA busy_timeout=5000')
 function transaction<T>(fn:()=>T){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}
 function at(rel:string){const p=path.resolve(root,rel);if(typeof rel!=='string'||path.isAbsolute(rel)||!contained(root,p)||path.relative(root,p)!==rel)throw Error('Đường dẫn nhật ký không hợp lệ');return p}
 function mkdir(dir:string){if(!fs.existsSync(dir)){if(fs.realpathSync(path.dirname(dir))!==path.dirname(dir))throw Error('Unsafe sale parent');fs.mkdirSync(dir);syncDirectory(path.dirname(dir))}if(fs.realpathSync(dir)!==dir||!fs.lstatSync(dir).isDirectory())throw Error('Unsafe sale directory')}
 function op(id:string){const o=db.prepare('SELECT * FROM sales_operations WHERE id=?').get(id) as Op|undefined;if(!o)throw new SalesError('Không tìm thấy giao dịch',404);return o}
 function plan(o:Op){if(digest(o.payload)!==o.payload_hash)throw Error('Nhật ký database sai checksum');const p=JSON.parse(o.payload) as Plan;if(p.id!==o.id||p.inputHash!==o.input_hash||p.format!==1||!p.units.length||p.units.length>100)throw Error('Nhật ký database không khớp');const journal=path.join(area,o.id,'plan.json');if(digest(exactFile(journal))!==o.payload_hash)throw Error('Nhật ký file không khớp database');for(const u of p.units){if(!contained(path.join(area,o.id,'staged'),at(u.staged))||!contained(path.join(area,o.id,'archive'),at(u.archive))||u.canonical.split(path.sep).some(s=>s.startsWith('.mecacao-')))throw Error('Vai trò đường dẫn sai')}return p}
 function present(p:string){try{fs.lstatSync(p);return true}catch(e:any){if(e.code==='ENOENT')return false;throw e}}
 function proof(o:Op,p:Plan){
  assertDatabaseIntegrity(db);const c=db.prepare('SELECT * FROM sales_confirmations WHERE operation_id=?').get(o.id),units=db.prepare('SELECT * FROM sales_units WHERE order_id=?').all(p.orderId),ledger=db.prepare('SELECT * FROM sales_ledger WHERE order_id=?').all(p.orderId)
  if(o.status!=='SOLD'){if(c||units.length||ledger.length)throw Error('Bằng chứng commit không rõ');return false}
  if(!c||c.order_id!==p.orderId||c.version!==p.version||c.total!==p.total||c.subtotal!==p.subtotal||c.discount!==p.discount||c.note!==p.note||units.length!==p.units.length||ledger.length!==units.length)throw Error('Bằng chứng bán chưa đầy đủ')
  for(const u of p.units){const r=units.find(r=>r.image_id===u.imageId),l=ledger.find(r=>r.image_id===u.imageId);if(!r||!l||r.snapshot!==JSON.stringify(u.snapshot)||r.source_hash!==u.sourceHash||r.archive_path!==u.archive||r.archive_hash!==u.archiveHash||r.variant_id!==u.snapshot.variant_id||l.variant_id!==r.variant_id||l.quantity!==1||l.transaction_type!=='SALE'||l.unit_cost!==u.snapshot.unit_cost)throw Error('Bằng chứng từng bộ không khớp')}
  return true
 }
 function verifyFiles(p:Plan,sold:boolean){for(const u of p.units){const a=at(u.canonical),b=at(u.staged);exactFile(at(u.archive),u.archiveHash);if(sold){if(present(a))throw Error('Ảnh đã bán lại xuất hiện ở canonical');exactFile(b,u.sourceHash)}else{if(!present(a)&&!present(b))throw Error('Mất cả canonical và staging');if(present(a))exactFile(a,u.sourceHash);if(present(b))exactFile(b,u.sourceHash);if(present(a)&&present(b)){const x=fs.statSync(a),y=fs.statSync(b);if(x.dev!==y.dev||x.ino!==y.ino)throw Error('Hai bản gốc khác nhau; dừng để kiểm tra')}}}}
 function release(){if(present(lock)){exactFile(lock);fs.unlinkSync(lock);syncDirectory(root)}}
 async function status(key:unknown){if(typeof key!=='string'||! /^[A-Za-z0-9_-]{16,100}$/.test(key))throw new SalesError('Mã bán không hợp lệ');const row=db.prepare('SELECT * FROM sales_operations WHERE request_key=?').get(key) as Op|undefined;if(!row)return {status:salesActivity.busy?'CONFIRMING':'NOT_FOUND',canRecover:present(lock),sold:false};try{const p=plan(row);if(row.status==='ROLLED_BACK')return {status:'ROLLED_BACK',sold:false,orderId:p.orderId,canRecover:false};const sold=proof(row,p);verifyFiles(p,sold);if(sold)for(const u of p.units){const b=exactFile(at(u.archive),u.archiveHash);await sharp(b).stats()};verifyFiles(p,sold);return {status:row.status,sold,operationId:row.id,orderId:p.orderId,quantity:p.units.length,total:p.total,originalsRetained:true,canRecover:row.status==='PREPARED',cleanup:'RETAINED_FOR_ACCEPTANCE'}}catch(e){return {status:'RECOVERY_REQUIRED',sold:false,operationId:row.id,canRecover:false,error:e instanceof Error?e.message:'Cần kiểm tra thủ công'}}}
 async function recover(checkpoint:(point:string)=>void=()=>{}){
  if(salesActivity.busy||salesActivity.readers)throw new SalesError('Đang có tác vụ khác; đợi rồi phục hồi',409)
  if(!present(lock)){if(db.prepare("SELECT 1 FROM sales_operations WHERE status='PREPARED'").get())throw Error('Thiếu khóa cho PREPARED; cần kiểm tra thủ công');return {status:'CLEAR'}}
  salesActivity.busy=true
  try{const marker=JSON.parse(exactFile(lock).toString());if(marker.format!==1||! /^[a-f0-9-]{36}$/.test(marker.id))throw Error('Khóa bán không hợp lệ');if(marker.pid!==process.pid&&Number.isSafeInteger(marker.pid)){let live=false;try{process.kill(marker.pid,0);live=true}catch(e:any){if(e.code!=='ESRCH')throw Error('Không xác minh được tiến trình bán cũ')};if(live)throw Error('Tiến trình bán cũ còn chạy; không phục hồi cùng lúc')}const row=db.prepare('SELECT * FROM sales_operations WHERE id=?').get(marker.id) as Op|undefined
   if(!row){if(present(path.join(area,marker.id,'plan.json')))throw Error('Có plan nhưng thiếu DB operation; cần review');release();return {status:'ROLLED_BACK',message:'Chưa chuẩn bị giao dịch. Giữ bản dở để kiểm tra.'}}
   const p=plan(row),sold=proof(row,p);verifyFiles(p,sold)
   if(!sold){for(let n=0;n<p.units.length;n++){const u=p.units[n],a=at(u.canonical),b=at(u.staged);if(!present(a)){fs.linkSync(b,a);syncDirectory(path.dirname(a));checkpoint('restore-link:'+n)}if(present(b)){const x=fs.statSync(a),y=fs.statSync(b);if(x.dev!==y.dev||x.ino!==y.ino)throw Error('Canonical bị chiếm');exactFile(a,u.sourceHash);fs.unlinkSync(b);syncDirectory(path.dirname(b))}checkpoint('restored:'+n)}if(row.status==='PREPARED')transaction(()=>db.prepare("UPDATE sales_operations SET status='ROLLED_BACK' WHERE id=?").run(row.id))}
   else for(const u of p.units)await sharp(exactFile(at(u.archive),u.archiveHash)).stats()
   verifyFiles(p,sold);release();return {status:sold?'SOLD':'ROLLED_BACK',orderId:p.orderId,originalsRetained:true}
  }finally{salesActivity.busy=false}
 }
 return {status,recover,pending:()=>present(lock)||!!db.prepare("SELECT 1 FROM sales_operations WHERE status='PREPARED'").get(),
  async confirm(id:string,raw:any,key:unknown,checkpoint:(point:string)=>void=()=>{}){
   if(typeof key!=='string'||! /^[A-Za-z0-9_-]{16,100}$/.test(key)||!raw||!Number.isSafeInteger(raw.version)||raw.version<1||! /^[a-f0-9]{64}$/.test(raw.token)||raw.confirmed!==true||typeof raw.acknowledgeZeroPrice!=='boolean')throw new SalesError('Kiểm tra toàn đơn và xác nhận bán trong sandbox trước')
   const inputHash=digest(JSON.stringify({id,version:raw.version,token:raw.token,acknowledgeZeroPrice:raw.acknowledgeZeroPrice})),old=db.prepare('SELECT * FROM sales_operations WHERE request_key=?').get(key) as Op|undefined
   if(old){if(old.input_hash!==inputHash)throw new SalesError('Mã bán đã dùng với nội dung khác',409);return status(key)}
   if(salesActivity.busy||salesActivity.readers||present(lock)||db.prepare("SELECT 1 FROM sales_operations WHERE status='PREPARED'").get())throw new SalesError('Có tác vụ kho hoặc giao dịch cần phục hồi; chưa bán',409)
   salesActivity.busy=true
   const operationId=randomUUID();let started=false
   try{
    writeDurable(lock,JSON.stringify({format:1,id:operationId,requestKey:key,pid:process.pid}));started=true;checkpoint('lock')
    const checked=await preflight.check(id,raw.version,raw.token);if(!checked.checksPassed)throw new SalesError('Có bộ chưa đủ điều kiện',409);if(checked.zeroPriceCount&&!raw.acknowledgeZeroPrice)throw new SalesError('Cần xác nhận hàng giá 0 đồng',409)
    mkdir(area);const dir=path.join(area,operationId);mkdir(dir);mkdir(path.join(dir,'staged'));mkdir(path.join(dir,'archive'))
    const before=drafts.get(id),draftHash=digest(JSON.stringify(before)),units:Unit[]=[]
    for(let n=0;n<checked.items.length;n++){const i=checked.items[n],e=i.evidence!,canonical=e.sourcePath,bytes=exactFile(canonical,e.sourceHash);if(fs.statSync(canonical).dev!==fs.statSync(path.join(dir,'staged')).dev)throw Error('Staging phải cùng ổ đĩa');const archive=path.join(dir,'archive',i.imageId+'.jpg'),light=await sharp(bytes,{limitInputPixels:40_000_000,failOn:'warning'}).rotate().resize({width:1280,height:1280,fit:'inside',withoutEnlargement:true}).flatten({background:'#fff'}).jpeg({quality:82}).toBuffer();await sharp(light).stats();writeDurable(archive,light);const saved=before.items.find(s=>s.image_id===i.imageId)!,cost=Number(db.prepare('SELECT cost_price FROM product_variants WHERE id=?').get(saved.variant_id)!.cost_price);if(!Number.isSafeInteger(cost)||cost<0)throw Error('Giá vốn không hợp lệ');units.push({imageId:i.imageId,canonical:path.relative(root,canonical),staged:path.relative(root,path.join(dir,'staged',i.imageId+'.original')),sourceHash:e.sourceHash,archive:path.relative(root,archive),archiveHash:digest(light),snapshot:{...saved,unavailable:undefined,unit_cost:cost>0?cost:null}});checkpoint('archive:'+n)}
    await preflight.check(id,raw.version,raw.token)
    const p:Plan={format:1,id:operationId,orderId:id,version:raw.version,inputHash,draftHash,subtotal:before.subtotal,discount:before.discount,total:before.total,note:before.note,units},payload=JSON.stringify(p)
    // DB PREPARED is durable before journal and before any canonical movement. Missing journal fails closed.
    transaction(()=>db.prepare("INSERT INTO sales_operations(id,request_key,input_hash,payload,payload_hash,status) VALUES(?,?,?,?,?,'PREPARED')").run(operationId,key,inputHash,payload,digest(payload)));checkpoint('prepared-db');writeDurable(path.join(dir,'plan.json'),payload);checkpoint('journal')
    for(let n=0;n<units.length;n++){const u=units[n],a=at(u.canonical),b=at(u.staged);exactFile(a,u.sourceHash);fs.linkSync(a,b);syncDirectory(path.dirname(b));checkpoint('linked:'+n);exactFile(b,u.sourceHash);fs.unlinkSync(a);syncDirectory(path.dirname(a));checkpoint('staged:'+n)}
    // Draft comparison excludes availability changes caused by our own staging; version/items/prices/conflicts stay checked.
    const current=drafts.get(id);const normalize=(d:any)=>({...d,available:undefined,items:d.items.map((i:any)=>({...i,unavailable:undefined}))})
    if(JSON.stringify(normalize(current))!==JSON.stringify(normalize(before)))throw new SalesError('Nháp thay đổi trong lúc bán',409)
    for(const u of units){exactFile(at(u.staged),u.sourceHash);exactFile(at(u.archive),u.archiveHash);if(present(at(u.canonical)))throw Error('Canonical xuất hiện lại');const v=db.prepare('SELECT cost_price,status FROM product_variants WHERE id=?').get(u.snapshot.variant_id);const image=db.prepare('SELECT product_id,variant_id,file_path FROM product_images WHERE id=?').get(u.imageId),product=db.prepare('SELECT status FROM products WHERE id=?').get(u.snapshot.product_id);if(image?.product_id!==u.snapshot.product_id||image?.variant_id!==u.snapshot.variant_id||image?.file_path!==at(u.canonical)||product?.status!=='active')throw Error('Product/quan hệ ảnh đã đổi');if(v?.status!=='active'||(Number(v.cost_price)>0?Number(v.cost_price):null)!==u.snapshot.unit_cost)throw Error('Size/giá vốn đã đổi')}
    transaction(()=>{const order=db.prepare('SELECT status,version FROM sales_orders WHERE id=?').get(id);if(order?.status!=='DRAFT'||order.version!==raw.version||db.prepare('SELECT 1 FROM sales_confirmations WHERE order_id=?').get(id))throw new SalesError('Đơn không còn bán được',409);db.prepare('INSERT INTO sales_confirmations(order_id,operation_id,version,subtotal,discount,total,note) VALUES(?,?,?,?,?,?,?)').run(id,operationId,raw.version,p.subtotal,p.discount,p.total,p.note);checkpoint('sale-row');units.forEach((u,n)=>{db.prepare('INSERT INTO sales_units(image_id,order_id,variant_id,snapshot,source_hash,archive_path,archive_hash) VALUES(?,?,?,?,?,?,?)').run(u.imageId,id,u.snapshot.variant_id,JSON.stringify(u.snapshot),u.sourceHash,u.archive,u.archiveHash);db.prepare("INSERT INTO sales_ledger(image_id,order_id,variant_id,transaction_type,quantity,unit_cost) VALUES(?,?,?,'SALE',1,?)").run(u.imageId,id,u.snapshot.variant_id,u.snapshot.unit_cost);checkpoint('unit:'+n)});db.prepare("UPDATE sales_operations SET status='SOLD' WHERE id=?").run(operationId);assertDatabaseIntegrity(db);checkpoint('before-commit')});checkpoint('after-commit')
    const result=await status(key);if(!result.sold)throw Error('Đã commit nhưng cần kiểm tra bằng chứng');release();checkpoint('released');return result
   }catch(e){if(started&&!db.prepare('SELECT 1 FROM sales_operations WHERE id=?').get(operationId))release();throw e}finally{salesActivity.busy=false}
  },
  history(id:string){const row=db.prepare('SELECT * FROM sales_confirmations WHERE order_id=?').get(id);if(!row)throw new SalesError('Không có lịch sử đã bán',404);const units=db.prepare('SELECT * FROM sales_units WHERE order_id=? ORDER BY image_id').all(id);return {...row,status:'SOLD',quantity:units.length,items:units.map(u=>({...JSON.parse(String(u.snapshot)),image_id:u.image_id,archiveUrl:'/api/sales/drafts/'+id+'/sold-image/'+u.image_id})),originalsRetained:true}},
  async image(id:string,imageId:number){const u=db.prepare('SELECT archive_path,archive_hash FROM sales_units WHERE order_id=? AND image_id=?').get(id,imageId);if(!u)throw new SalesError('Không có ảnh đã bán',404);const b=exactFile(at(String(u.archive_path)),String(u.archive_hash));await sharp(b).stats();return b}
 }
}
