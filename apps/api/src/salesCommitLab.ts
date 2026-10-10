import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import sharp from 'sharp'
import {DatabaseSync} from 'node:sqlite'
import {assertDatabaseIntegrity,readSchemaVersion} from './schema.js'
import {SalesError} from './salesDrafts.js'
import {STAGING_LAB,salesStagingLab,type CommitDecision} from './salesStagingLab.js'

export const COMMIT_LAB_SCHEMA=129
export type CommitLabInput={operationId:string;requestKey:string;orderId:string;version:number;planHash:string;acknowledgeZeroPrice?:boolean;items:Array<{imageId:number;sourceHash:string;archivePath:string;archiveHash:string}>}
type Snapshot={order:{id:string;status:string;version:number;discount:number;note:string};items:Array<{image_id:number;product_id:number;variant_id:number;product_name:string;product_code:string;size:string;sku:string;unit_price:number;unit_cost:number|null;position:number;file_path:string;product_status:string;variant_status:string}>;subtotal:number;total:number}
type Prepared={input:CommitLabInput;snapshot:Snapshot;staged:Array<{canonical:string;staged:string;sha256:string}>}
type Operation={id:string;request_key:string;payload_hash:string;plan_hash:string;payload:string;status:string}
const digest=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex')
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v)
const sha=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
function contained(root:string,p:string){const r=path.relative(root,p);return !!r&&!path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep)}
function labPath(db:DatabaseSync,root:string){
 const realRoot=fs.realpathSync(root),lab=path.join(realRoot,STAGING_LAB)
 const file=(db.prepare('PRAGMA database_list').all().find(r=>r.name==='main') as {file:string}).file
 if(!file||!contained(lab,path.resolve(file))||fs.realpathSync(file)!==path.resolve(file))throw Error('Commit prototype only accepts a copied database inside the recovery lab')
 if(!fs.existsSync(lab)||fs.realpathSync(lab)!==lab)throw Error('Unsafe recovery lab root')
 return lab
}
/** Not installed by server boot. Experimental schema is confined to copied lab DBs and rejected by V1/V2 launchers. */
export function bootstrapCommitLab(db:DatabaseSync,root:string){
 labPath(db,root);db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL')
 const version=readSchemaVersion(db)
 if(version===COMMIT_LAB_SCHEMA){assertDatabaseIntegrity(db);return version}
 if(version!==120)throw Error('Commit lab requires a copied schema120 database')
 assertDatabaseIntegrity(db)
 const file=(db.prepare('PRAGMA database_list').get() as {file:string}).file,backup=file+'.pre-v129.bak'
 if(fs.existsSync(backup))throw Error('Commit lab migration backup already exists; do not overwrite')
 db.exec("VACUUM INTO '"+backup.replace(/'/g,"''")+"'")
 const before=new DatabaseSync(backup,{readOnly:true});try{assertDatabaseIntegrity(before);if(readSchemaVersion(before)!==120)throw Error('Lab migration backup schema mismatch')}finally{before.close()}
 db.exec('BEGIN IMMEDIATE')
 try{
  db.exec(`
   CREATE TABLE lab_sale_operations(id TEXT PRIMARY KEY,request_key TEXT NOT NULL UNIQUE,payload_hash TEXT NOT NULL,plan_hash TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('PREPARED','SOLD')),created_at TEXT NOT NULL DEFAULT(datetime('now')));
   CREATE TABLE lab_sales(operation_id TEXT PRIMARY KEY REFERENCES lab_sale_operations(id),order_id TEXT NOT NULL UNIQUE REFERENCES sales_orders(id),order_version INTEGER NOT NULL,subtotal INTEGER NOT NULL CHECK(subtotal BETWEEN 0 AND 9007199254740991),discount INTEGER NOT NULL CHECK(discount BETWEEN 0 AND subtotal),total INTEGER NOT NULL CHECK(total=subtotal-discount),note TEXT NOT NULL,status TEXT NOT NULL CHECK(status='SOLD'),created_at TEXT NOT NULL DEFAULT(datetime('now')));
   CREATE TABLE lab_sale_images(operation_id TEXT NOT NULL REFERENCES lab_sales(operation_id),image_id INTEGER NOT NULL REFERENCES product_images(id),variant_id INTEGER NOT NULL REFERENCES product_variants(id),snapshot TEXT NOT NULL,source_hash TEXT NOT NULL,archive_path TEXT NOT NULL,archive_hash TEXT NOT NULL,PRIMARY KEY(operation_id,image_id));
   CREATE TABLE lab_sale_claims(image_id INTEGER PRIMARY KEY REFERENCES product_images(id),operation_id TEXT NOT NULL,FOREIGN KEY(operation_id,image_id) REFERENCES lab_sale_images(operation_id,image_id));
   CREATE TABLE lab_sale_ledger(operation_id TEXT NOT NULL,image_id INTEGER NOT NULL,variant_id INTEGER NOT NULL REFERENCES product_variants(id),transaction_type TEXT NOT NULL CHECK(transaction_type='SALE'),quantity INTEGER NOT NULL CHECK(quantity=1),unit_cost INTEGER CHECK(unit_cost IS NULL OR unit_cost>=0),PRIMARY KEY(operation_id,image_id),FOREIGN KEY(operation_id,image_id) REFERENCES lab_sale_images(operation_id,image_id));
   CREATE VIEW lab_reconciled_ledger AS SELECT variant_id,SUM(quantity) stock FROM (SELECT variant_id,CASE WHEN transaction_type='ADJUST_MINUS' THEN -quantity ELSE quantity END quantity FROM inventory_transactions UNION ALL SELECT variant_id,-quantity FROM lab_sale_ledger) GROUP BY variant_id;
   UPDATE app_metadata SET value='129',updated_at=datetime('now') WHERE key='schema_version';
  `)
  for(const table of ['lab_sales','lab_sale_images','lab_sale_claims','lab_sale_ledger'])for(const action of ['UPDATE','DELETE'])db.exec(`CREATE TRIGGER ${table}_${action.toLowerCase()}_immutable BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'Committed lab sales are immutable'); END`)
  db.exec("CREATE TRIGGER lab_operation_payload_immutable BEFORE UPDATE OF id,request_key,payload_hash,plan_hash,payload ON lab_sale_operations BEGIN SELECT RAISE(ABORT,'Operation evidence is immutable'); END; CREATE TRIGGER lab_operation_sold_immutable BEFORE UPDATE OF status ON lab_sale_operations WHEN OLD.status='SOLD' BEGIN SELECT RAISE(ABORT,'Sold operation cannot be reverted'); END; CREATE TRIGGER lab_operation_delete_immutable BEFORE DELETE ON lab_sale_operations BEGIN SELECT RAISE(ABORT,'Operation evidence cannot be deleted'); END")
  assertDatabaseIntegrity(db);db.exec('COMMIT')
 }catch(e){db.exec('ROLLBACK');throw e}
 return COMMIT_LAB_SCHEMA
}

/** Atomic commit contract + DB-derived recovery decisions. Files are exclusively clones; no deletion is implemented. */
export function salesCommitLab(db:DatabaseSync,root:string){
 const lab=labPath(db,root),warehouse=path.join(lab,'warehouse'),stage=path.join(lab,'staged'),archive=path.join(lab,'archive')
 if(readSchemaVersion(db)!==COMMIT_LAB_SCHEMA)throw Error('Copied database has not passed the commit lab migration')
 db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL')
 function transaction<T>(fn:()=>T){db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value}catch(e){db.exec('ROLLBACK');throw e}}
 function file(p:string,area:string,expected?:string){
  if(typeof p!=='string'||path.resolve(p)!==p||!contained(area,p)||fs.realpathSync(p)!==p||fs.lstatSync(p).isSymbolicLink()||!fs.lstatSync(p).isFile())throw Error('Unsafe commit lab file')
  if(fs.statSync(p).size>32*1024*1024)throw Error('Commit lab file exceeds32MB')
  const bytes=fs.readFileSync(p);if(bytes.length>32*1024*1024||(expected&&digest(bytes)!==expected))throw Error('Commit lab checksum changed; review required')
  return bytes
 }
 function snapshot(id:string,version:number):Snapshot{
  const order=db.prepare('SELECT id,status,version,discount,note FROM sales_orders WHERE id=?').get(id) as Snapshot['order']|undefined
  if(!order||order.status!=='DRAFT'||order.version!==version)throw new SalesError('Draft changed/cancelled; reload before confirming',409)
  const saved=db.prepare(`SELECT s.*,i.file_path,p.status product_status,v.status variant_status,v.cost_price current_cost FROM sales_order_images s JOIN product_images i ON i.id=s.image_id JOIN products p ON p.id=s.product_id JOIN product_variants v ON v.id=s.variant_id WHERE s.order_id=? ORDER BY s.position`).all(id) as Array<Snapshot['items'][number]&{current_cost:number}>
  if(saved.some(i=>!Number.isSafeInteger(i.current_cost)||i.current_cost<0))throw new SalesError('Current cost is invalid',409)
  // Sale price stays as selected in the draft; cost is captured from the current variant at preparation/commit.
  const items=saved.map(({current_cost,...i})=>({...i,unit_cost:current_cost>0?current_cost:null}))
  if(!items.length||items.length>100||items.length!==Number(db.prepare('SELECT COUNT(*) n FROM sales_order_images WHERE order_id=?').get(id)!.n)||new Set(items.map(i=>i.image_id)).size!==items.length)throw new SalesError('Invalid image snapshot',409)
  if(items.some(i=>!Number.isSafeInteger(i.unit_price)||i.unit_price<0||(i.unit_cost!==null&&(!Number.isSafeInteger(i.unit_cost)||i.unit_cost<0))||i.product_status!=='active'||i.variant_status!=='active'))throw new SalesError('Invalid price/cost or inactive product/size',409)
  for(const i of items){const row=db.prepare('SELECT product_id,variant_id FROM product_images WHERE id=?').get(i.image_id);if(row?.product_id!==i.product_id||row?.variant_id!==i.variant_id)throw new SalesError('Image relation changed',409);const v=db.prepare('SELECT product_id FROM product_variants WHERE id=?').get(i.variant_id);if(v?.product_id!==i.product_id)throw new SalesError('Variant relation changed',409)}
  const subtotal=items.reduce((n,i)=>n+i.unit_price,0),total=subtotal-order.discount
  if(!Number.isSafeInteger(subtotal)||!Number.isSafeInteger(order.discount)||order.discount<0||!Number.isSafeInteger(total)||total<0)throw new SalesError('Unsafe order totals',409)
  return {order,items,subtotal,total}
 }
 function operation(id:string){const o=db.prepare('SELECT * FROM lab_sale_operations WHERE id=?').get(id) as Operation|undefined;if(!o)throw new SalesError('No durable lab operation; recovery is ambiguous',409);return o}
 function evidence(o:Operation){if(digest(o.payload)!==o.payload_hash)throw Error('Corrupt operation payload');const p=JSON.parse(o.payload) as Prepared;if(p.input.operationId!==o.id||p.input.requestKey!==o.request_key||p.input.planHash!==o.plan_hash)throw Error('Operation evidence mismatch');return p}
 function journal(input:CommitLabInput){const bytes=file(path.join(lab,input.operationId+'.json'),lab,input.planHash),j=JSON.parse(bytes.toString());if(j.format!==1||j.id!==input.operationId||!Array.isArray(j.files)||j.files.length!==input.items.length)throw Error('Staging journal mismatch');return j.files as Prepared['staged']}
 function stagedEvidence(p:Prepared){
  if(digest(file(path.join(lab,p.input.operationId+'.json'),lab))!==p.input.planHash)throw Error('Journal changed')
  p.staged.forEach((s,n)=>{
   const i=p.input.items[n],saved=p.snapshot.items[n]
   if(s.canonical!==saved.file_path||s.sha256!==i.sourceHash||!contained(warehouse,s.canonical)||!contained(stage,s.staged))throw Error('Staging evidence does not match saved image')
   // A dangling symlink/occupied canonical path is also a conflict; never ignore it with existsSync.
   try{fs.lstatSync(s.canonical);throw Error('Canonical clone still occupied; staging is incomplete')}catch(e:any){if(e.code!=='ENOENT')throw e}
   file(s.staged,stage,s.sha256);file(i.archivePath,archive,i.archiveHash)
  })
 }
 function result(o:Operation){const row=db.prepare('SELECT * FROM lab_sales WHERE operation_id=?').get(o.id);return {operationId:o.id,requestKey:o.request_key,status:o.status,labOnly:true,originalsRetained:true,sourceOrderUnchanged:true,sale:row??null}}
 const service={
  prepare(input:CommitLabInput){
   if(!input||!uuid(input.operationId)||!uuid(input.orderId)||typeof input.requestKey!=='string'||! /^[A-Za-z0-9_-]{16,100}$/.test(input.requestKey)||!Number.isSafeInteger(input.version)||input.version<1||!sha(input.planHash)||!Array.isArray(input.items)||!input.items.length||input.items.length>100||new Set(input.items.map(i=>i.imageId)).size!==input.items.length||input.items.some(i=>!Number.isSafeInteger(i.imageId)||i.imageId<1||!sha(i.sourceHash)||!sha(i.archiveHash)||typeof i.archivePath!=='string'))throw new SalesError('Invalid lab confirmation input')
   return transaction(()=>{
    const old=db.prepare('SELECT * FROM lab_sale_operations WHERE request_key=? OR id=?').all(input.requestKey,input.operationId) as Operation[]
    if(old.length){if(old.length!==1||JSON.stringify(evidence(old[0]).input)!==JSON.stringify(input))throw new SalesError('Request key/operation reused with another payload',409);if(old[0].status==='SOLD'&&service.decision(old[0].id,old[0].plan_hash)!=='COMMITTED')throw new SalesError('Committed evidence needs manual review',409);return result(old[0])}
    const saved=snapshot(input.orderId,input.version),staged=journal(input)
    if(saved.items.some(i=>i.unit_price===0)&&input.acknowledgeZeroPrice!==true)throw new SalesError('Explicit acknowledgement required for zero-price units',409)
    if(saved.items.length!==input.items.length||saved.items.some((i,n)=>i.image_id!==input.items[n].imageId))throw new SalesError('Confirmation must contain the whole saved order',409)
    if(db.prepare('SELECT 1 FROM lab_sales WHERE order_id=?').get(input.orderId))throw new SalesError('Draft already sold in copied lab database',409)
    for(let n=0;n<saved.items.length;n++){
     const i=input.items[n],s=staged[n]
     if(s.canonical!==saved.items[n].file_path||s.sha256!==i.sourceHash||!contained(warehouse,s.canonical)||!contained(stage,s.staged)||db.prepare('SELECT 1 FROM lab_sale_claims WHERE image_id=?').get(i.imageId))throw new SalesError('Image unavailable/already claimed',409)
     file(s.canonical,warehouse,i.sourceHash);file(i.archivePath,archive,i.archiveHash)
    }
    const payload=JSON.stringify({input,snapshot:saved,staged})
    db.prepare("INSERT INTO lab_sale_operations(id,request_key,payload_hash,plan_hash,payload,status) VALUES(?,?,?,?,?,'PREPARED')").run(input.operationId,input.requestKey,digest(payload),input.planHash,payload)
    return result(operation(input.operationId))
   })
  },
  async commit(id:string,payloadHash:string,checkpoint:(point:string)=>void=()=>{}){
   const initial=operation(id);if(initial.payload_hash!==payloadHash)throw new SalesError('Operation payload hash mismatch',409)
   if(initial.status==='SOLD'){if(service.decision(id,initial.plan_hash)!=='COMMITTED')throw new SalesError('Committed evidence needs manual review',409);return result(initial)}
   const p=evidence(initial);stagedEvidence(p)
   for(const i of p.input.items){const bytes=file(i.archivePath,archive,i.archiveHash),image=sharp(bytes,{limitInputPixels:40_000_000,failOn:'warning'});const meta=await image.metadata();if(meta.format!=='jpeg'||!meta.width||!meta.height||meta.width>1280||meta.height>1280)throw Error('Invalid archive JPEG');await image.stats()}
   checkpoint('before-db')
   const done=transaction(()=>{
    const o=operation(id);if(o.payload_hash!==payloadHash)throw new SalesError('Operation changed',409);if(o.status==='SOLD'){if(service.decision(id,o.plan_hash)!=='COMMITTED')throw new SalesError('Committed evidence needs manual review',409);return result(o)}
    if(JSON.stringify(snapshot(p.input.orderId,p.input.version))!==JSON.stringify(p.snapshot))throw new SalesError('Saved draft changed after preparation',409)
    stagedEvidence(p)
    if(p.input.items.some(i=>db.prepare('SELECT 1 FROM lab_sale_claims WHERE image_id=?').get(i.imageId)))throw new SalesError('A unit was already sold by another order; no partial sale',409)
    db.prepare("INSERT INTO lab_sales(operation_id,order_id,order_version,subtotal,discount,total,note,status) VALUES(?,?,?,?,?,?,?,'SOLD')").run(id,p.input.orderId,p.input.version,p.snapshot.subtotal,p.snapshot.order.discount,p.snapshot.total,p.snapshot.order.note)
    checkpoint('sale-row')
    p.input.items.forEach((i,n)=>{
     const saved=p.snapshot.items[n]
     db.prepare('INSERT INTO lab_sale_images(operation_id,image_id,variant_id,snapshot,source_hash,archive_path,archive_hash) VALUES(?,?,?,?,?,?,?)').run(id,i.imageId,saved.variant_id,JSON.stringify(saved),i.sourceHash,i.archivePath,i.archiveHash)
     db.prepare('INSERT INTO lab_sale_claims(image_id,operation_id) VALUES(?,?)').run(i.imageId,id)
     db.prepare("INSERT INTO lab_sale_ledger(operation_id,image_id,variant_id,transaction_type,quantity,unit_cost) VALUES(?,?,?,'SALE',1,?)").run(id,i.imageId,saved.variant_id,saved.unit_cost)
     checkpoint('image:'+n)
    })
    db.prepare("UPDATE lab_sale_operations SET status='SOLD' WHERE id=?").run(id)
    assertDatabaseIntegrity(db);checkpoint('before-commit');return result(operation(id))
   })
   checkpoint('after-commit');return done
  },
  recover(id:string):{status:string;originalsRetained:number}{
   const journalHash=digest(file(path.join(lab,id+'.json'),lab)),decision=service.decision(id,journalHash)
   if(decision==='AMBIGUOUS')throw new SalesError('Database/journal evidence is ambiguous; no file changes allowed',409)
   return salesStagingLab(root).recover(id,decision)
  },
  payloadHash:(id:string)=>operation(id).payload_hash,
  status(id:string){
   const o=operation(id);let databaseDecision:CommitDecision='AMBIGUOUS'
   try{databaseDecision=service.decision(id,digest(file(path.join(lab,id+'.json'),lab)))}catch{}
   return {...result(o),status:databaseDecision==='AMBIGUOUS'?'RECOVERY_REQUIRED':o.status,databaseDecision,requiresReview:databaseDecision==='AMBIGUOUS'}
  },
  decision(id:string,planHash:string):CommitDecision{
   try{
    if(!sha(planHash)||readSchemaVersion(db)!==COMMIT_LAB_SCHEMA)throw Error('Unsupported evidence')
    assertDatabaseIntegrity(db)
    const o=operation(id);if(o.plan_hash!==planHash)throw Error('Wrong journal')
    const p=evidence(o),rows=db.prepare('SELECT * FROM lab_sale_images WHERE operation_id=? ORDER BY image_id').all(id),sale=db.prepare('SELECT * FROM lab_sales WHERE operation_id=?').get(id)
    const claims=db.prepare('SELECT * FROM lab_sale_claims WHERE operation_id=?').all(id),ledger=db.prepare('SELECT * FROM lab_sale_ledger WHERE operation_id=?').all(id)
    if(o.status==='PREPARED'){
     if(sale||rows.length||claims.length||ledger.length||p.input.items.some(i=>db.prepare('SELECT 1 FROM lab_sale_claims WHERE image_id=?').get(i.imageId)))throw Error('Conflicting commit evidence')
     return 'UNCOMMITTED'
    }
    if(o.status!=='SOLD'||!sale||rows.length!==p.input.items.length||claims.length!==rows.length||ledger.length!==rows.length||sale.order_id!==p.input.orderId||sale.order_version!==p.input.version||sale.subtotal!==p.snapshot.subtotal||sale.discount!==p.snapshot.order.discount||sale.total!==p.snapshot.total||sale.note!==p.snapshot.order.note||sale.status!=='SOLD')throw Error('Incomplete commit evidence')
    for(let n=0;n<p.input.items.length;n++){
     const i=p.input.items[n],s=p.snapshot.items[n],r=rows.find(r=>r.image_id===i.imageId),l=ledger.find(r=>r.image_id===i.imageId)
     if(!r||!l||!claims.some(c=>c.image_id===i.imageId)||r.snapshot!==JSON.stringify(s)||r.variant_id!==s.variant_id||r.source_hash!==i.sourceHash||r.archive_path!==i.archivePath||r.archive_hash!==i.archiveHash||l.variant_id!==s.variant_id||l.transaction_type!=='SALE'||l.quantity!==1||l.unit_cost!==s.unit_cost)throw Error('Commit rows differ from durable evidence')
    }
    return 'COMMITTED'
   }catch{return 'AMBIGUOUS'}
  }
 }
 return service
}
