import {DatabaseSync} from 'node:sqlite'
import {createHash,randomUUID} from 'node:crypto'
import {SalesError} from './salesDrafts.js'
export function knownUnitCost(db:DatabaseSync,id:number,cost:number){return cost>0||!!(db.prepare("SELECT 1 FROM sqlite_master WHERE name='variant_price_state'").get()&&db.prepare('SELECT 1 FROM variant_price_state WHERE variant_id=? AND cost_set=1').get(id))?cost:null}
export function markPriceSet(db:DatabaseSync,id:number,cost:boolean,sale:boolean){if((!cost&&!sale)||!db.prepare("SELECT 1 FROM sqlite_master WHERE name='variant_price_state'").get())return;db.prepare('INSERT INTO variant_price_state(variant_id,cost_set,sale_set) VALUES(?,?,?) ON CONFLICT(variant_id) DO UPDATE SET cost_set=cost_set OR excluded.cost_set,sale_set=sale_set OR excluded.sale_set,revision=revision+1 WHERE (excluded.cost_set=1 AND cost_set=0) OR (excluded.sale_set=1 AND sale_set=0)').run(id,cost?1:0,sale?1:0)}

export function bootstrapPriceBulk(db:DatabaseSync){
 db.exec(`CREATE TABLE IF NOT EXISTS variant_price_state(variant_id INTEGER PRIMARY KEY REFERENCES product_variants(id) ON DELETE CASCADE,cost_set INTEGER NOT NULL DEFAULT 0,sale_set INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS price_imports(id TEXT PRIMARY KEY,input_hash TEXT NOT NULL,result TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (datetime('now')));
 CREATE TRIGGER IF NOT EXISTS price_cost_set AFTER UPDATE OF cost_price ON product_variants WHEN NEW.cost_price<>OLD.cost_price BEGIN INSERT INTO variant_price_state(variant_id,revision) VALUES(NEW.id,2) ON CONFLICT(variant_id) DO UPDATE SET revision=revision+1; END;
 CREATE TRIGGER IF NOT EXISTS price_sale_set AFTER UPDATE OF sale_price ON product_variants WHEN NEW.sale_price<>OLD.sale_price BEGIN INSERT INTO variant_price_state(variant_id,revision) VALUES(NEW.id,2) ON CONFLICT(variant_id) DO UPDATE SET revision=revision+1; END;`)
}
export function priceBulkService(db:DatabaseSync,stock:()=>any[]){
 bootstrapPriceBulk(db)
 function snapshot(){
  let instance=String(db.prepare("SELECT value FROM app_metadata WHERE key='cloud-instance'").get()?.value||'')
  if(!instance){instance=randomUUID();db.prepare("INSERT INTO app_metadata(key,value) VALUES('cloud-instance',?)").run(instance)}
  const rows=stock().flatMap(p=>p.variants.filter((v:any)=>v.stock>0).map((v:any)=>{const s=db.prepare('SELECT * FROM variant_price_state WHERE variant_id=?').get(v.variant_id);return {id:v.variant_id,sku:v.sku,productCode:p.product_code,name:p.product_name,size:v.size,stock:v.stock,cost:v.cost_price,sale:v.sale_price,costSet:v.cost_price>0||s?.cost_set===1,saleSet:v.sale_price>0||s?.sale_set===1,version:Number(s?.revision||1)}}))
  return {scope:'LOCAL',instance,exportedAt:new Date().toISOString(),rows,history:db.prepare('SELECT id,result,created_at FROM price_imports ORDER BY created_at DESC,id LIMIT 20').all().map(r=>{const p=JSON.parse(String(r.result));return {id:r.id,created_at:r.created_at,result:{costCount:p.costCount,saleCount:p.saleCount}}})}
 }
 function preview(raw:any){
  const now=snapshot();if(raw?.scope!==now.scope||raw.instance!==now.instance)throw new SalesError('File thuộc nguồn dữ liệu/kho khác. Xuất lại từ đúng màn hình.',409)
  if(!Array.isArray(raw.rows)||!raw.rows.length||raw.rows.length>5000)throw new SalesError('File cần từ 1 đến 5.000 dòng')
  const map=new Map(now.rows.map(r=>[r.id,r])),seen=new Set<number>()
  const rows=raw.rows.map((r:any)=>{if(!Number.isSafeInteger(r.id)||seen.has(r.id))throw new SalesError('Mã size trùng hoặc không hợp lệ');seen.add(r.id)
   const current=map.get(r.id);if(!current||current.sku!==r.sku||current.productCode!==r.productCode||current.size!==r.size)throw new SalesError('Dòng '+r.id+': mã/size không khớp hoặc không còn tồn. Xuất lại báo cáo.')
   for(const k of ['cost','sale'])if(r[k]!==null&&r[k]!==undefined&&(!Number.isSafeInteger(r[k])||r[k]<0))throw new SalesError('Dòng '+r.id+': giá phải là số đồng nguyên không âm')
   if(!Number.isSafeInteger(r.version)||r.version<1)throw new SalesError('Thiếu phiên bản giá')
   const stale=current.version!==r.version, cost=!stale&&!current.costSet&&r.cost!=null?r.cost:null,sale=!stale&&!current.saleSet&&r.sale!=null?r.sale:null
   return {...current,costInput:r.cost??null,saleInput:r.sale??null,applyCost:cost,applySale:sale,status:stale?'Giá đã thay đổi — bỏ qua':cost!==null||sale!==null?'Sẽ bổ sung':'Giữ giá hiện có / ô trống'}
  });return {rows,costCount:rows.filter((r:any)=>r.applyCost!==null).length,saleCount:rows.filter((r:any)=>r.applySale!==null).length}
 }
 return {snapshot,preview,history(id:string){const r=db.prepare('SELECT result FROM price_imports WHERE id=?').get(id);if(!r)throw new SalesError('Không tìm thấy lần nhập giá',404);return JSON.parse(String(r.result))},commit(raw:any,key:unknown){
  if(typeof key!=='string'||!/^[-a-zA-Z0-9]{16,100}$/.test(key))throw new SalesError('Thiếu mã lần nhập')
  const hash=createHash('sha256').update(JSON.stringify(raw)).digest('hex')
  db.exec('BEGIN IMMEDIATE');try{
   const prior=db.prepare('SELECT * FROM price_imports WHERE id=?').get(key);if(prior){if(prior.input_hash!==hash)throw new SalesError('Mã lần nhập đã có nội dung khác',409);db.exec('COMMIT');return JSON.parse(String(prior.result))}
   const result=preview(raw)
   for(const r of result.rows){if(r.applyCost!==null)db.prepare("UPDATE product_variants SET cost_price=?,updated_at=datetime('now') WHERE id=?").run(r.applyCost,r.id);if(r.applySale!==null)db.prepare("UPDATE product_variants SET sale_price=?,updated_at=datetime('now') WHERE id=?").run(r.applySale,r.id);markPriceSet(db,r.id,r.applyCost!==null,r.applySale!==null);if(r.applyCost!==null||r.applySale!==null)r.status='Đã bổ sung'}
   db.prepare('INSERT INTO price_imports(id,input_hash,result) VALUES(?,?,?)').run(key,hash,JSON.stringify(result));db.exec('COMMIT');return result
  }catch(e){db.exec('ROLLBACK');throw e}
 }}
}
