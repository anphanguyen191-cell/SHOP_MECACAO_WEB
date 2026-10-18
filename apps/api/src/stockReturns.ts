import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import sharp from 'sharp'
import type {DatabaseSync} from 'node:sqlite'
import {SalesError} from './salesDrafts.js'
import {SALES_AREA,salesActivity,salesExecutionService,exactFile,writeDurable,syncDirectory} from './salesExecution.js'
import {nextNamedImage,reserveNamedImageSequences} from './imageNaming.js'
import {STOCK_RETURN_LOCK,bootstrapStockReturns,pendingStockReturn} from './stockReturnState.js'
import {type ReturnPlan,type ReturnUnit,returnHash,returnJournal,relativeReturnPath,readReturnPlan,validateStockReturnProof,returnNote} from './stockReturnProof.js'

export function stockReturnService(db:DatabaseSync,rootInput:string){
 bootstrapStockReturns(db)
 const root=fs.realpathSync(rootInput),lock=path.join(root,STOCK_RETURN_LOCK),sale=salesExecutionService(db,root)
 const at=(r:string)=>relativeReturnPath(root,r),file=(r:string)=>exactFile(at(r))
 const exists=(p:string)=>{try{fs.lstatSync(p);return true}catch(e:any){if(e.code==='ENOENT')return false;throw e}}
 function safeDirectory(dir:string){if(fs.realpathSync(dir)!==dir||!fs.lstatSync(dir).isDirectory())throw Error('Thư mục kho có liên kết; dừng nhận lại')}
 function release(){fs.unlinkSync(lock);syncDirectory(root)}
 function result(row:any){
  const p=readReturnPlan(row,file);validateStockReturnProof(db,p,String(row.status))
  return {status:row.status,operationId:p.id,orderId:p.orderId,quantity:p.units.length,reason:p.reason,items:db.prepare('SELECT source_image_id AS sourceId,new_image_id AS newImageId FROM stock_return_units WHERE operation_id=? ORDER BY source_image_id').all(p.id),recoveryRequired:exists(lock)}
 }
 function status(key:unknown){
  if(typeof key!=='string'||! /^[A-Za-z0-9_-]{16,100}$/.test(key))throw new SalesError('Mã nhận lại không hợp lệ')
  const row=db.prepare('SELECT * FROM stock_return_operations WHERE request_key=?').get(key)
  return row?result(row):{status:'NOT_FOUND',recoveryRequired:pendingStockReturn(db,root)}
 }
 function list(orderId:string){
  if(!db.prepare('SELECT 1 FROM sales_confirmations WHERE order_id=?').get(orderId))throw new SalesError('Đơn SOLD chưa có chứng từ trên laptop. Đồng bộ Cloud tại laptop trước.',409)
  const units=db.prepare(`SELECT u.image_id AS imageId,u.snapshot,r.new_image_id AS newImageId,o.created_at AS returnedAt
   FROM sales_units u LEFT JOIN stock_return_units r ON r.source_image_id=u.image_id
   LEFT JOIN stock_return_operations o ON o.id=r.operation_id WHERE u.order_id=? ORDER BY u.image_id`).all(orderId)
  return {orderId,recoveryRequired:pendingStockReturn(db,root),items:units.map(u=>{const s=JSON.parse(String(u.snapshot));return {imageId:u.imageId,productName:s.product_name,size:s.size,newImageId:u.newImageId,returnedAt:u.returnedAt}})}
 }
 async function receive(orderId:string,raw:any,key:unknown,checkpoint:(p:string)=>void=()=>{}){
  if(typeof key!=='string'||! /^[A-Za-z0-9_-]{16,100}$/.test(key)||raw?.received!==true||!Array.isArray(raw.imageIds)||!raw.imageIds.length||raw.imageIds.length>100||raw.imageIds.some((i:any)=>!Number.isSafeInteger(i)||i<1)||new Set(raw.imageIds).size!==raw.imageIds.length||typeof raw.reason!=='string'||!raw.reason.trim()||raw.reason.length>500)throw new SalesError('Chọn bộ hàng, ghi lý do và xác nhận đã thực nhận hàng tại shop')
  const ids:number[]=[...raw.imageIds].sort((a,b)=>a-b),reason=raw.reason.trim(),inputHash=returnHash(JSON.stringify({orderId,ids,reason,received:true})),old=db.prepare('SELECT * FROM stock_return_operations WHERE request_key=?').get(key)
  if(old){if(old.input_hash!==inputHash)throw new SalesError('Mã nhận lại đã dùng với nội dung khác',409);return result(old)}
  if(salesActivity.busy||salesActivity.readers||sale.pending()||pendingStockReturn(db,root))throw new SalesError('Có giao dịch kho đang xử lý hoặc cần phục hồi',409)
  salesActivity.busy=true;let locked=false,prepared=false
  const id=randomUUID()
  try{
   writeDurable(lock,JSON.stringify({format:1,id,requestKey:key,pid:process.pid}));locked=true;checkpoint('lock')
   const sourceOp=db.prepare('SELECT o.* FROM sales_confirmations c JOIN sales_operations o ON o.id=c.operation_id WHERE c.order_id=?').get(orderId)
   if(!sourceOp||!(await sale.status(sourceOp.request_key)).sold)throw new SalesError('Chứng từ SOLD/ảnh gốc chưa đủ hoặc chưa đồng bộ tại laptop',409)
   const soldPlan=JSON.parse(String(sourceOp.payload)),units:ReturnUnit[]=[],reserved=new Set(db.prepare('SELECT file_path FROM product_images').all().map(i=>String(i.file_path).toLowerCase()))
   const warehouse=db.prepare("SELECT value FROM app_metadata WHERE key='warehouse_layout'").get()?.value==='DIRECT'?root:path.join(root,'warehouse')
   safeDirectory(warehouse)
   const area=path.join(root,SALES_AREA);safeDirectory(area)
   const returns=path.join(area,'returns');if(!exists(returns)){fs.mkdirSync(returns);syncDirectory(area)}safeDirectory(returns)
   const folder=path.join(returns,id);fs.mkdirSync(folder);syncDirectory(returns)
   for(const imageId of ids){
    if(db.prepare('SELECT 1 FROM stock_return_units WHERE source_image_id=?').get(imageId))throw new SalesError('Bộ ảnh '+imageId+' đã được nhận lại; không nhập trùng',409)
    const source=soldPlan.units.find((u:any)=>u.imageId===imageId),v=db.prepare(`SELECT v.*,p.name AS product_name,p.status AS product_status FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=?`).get(source?.snapshot?.variant_id??-1)
    if(!source||!v||v.status!=='active'||v.product_status!=='active')throw new SalesError('Bộ hàng không thuộc đơn hoặc Product/Size đã ngừng sử dụng',409)
    for(const segment of [String(v.product_name),String(v.size)])if(!segment||segment==='.'||segment==='..'||/[\\/:*?"<>|]/.test(segment)||/[. ]$/.test(segment))throw new SalesError('Tên Product/Size không an toàn')
    const dir=path.join(warehouse,String(v.product_name),String(v.size));safeDirectory(path.dirname(dir));safeDirectory(dir)
    const ext=path.extname(source.canonical);if(!/^\.(jpe?g|png|webp|heic|heif|avif)$/i.test(ext))throw new SalesError('Định dạng ảnh gốc chưa hỗ trợ nhận lại')
    const destination=nextNamedImage(dir,String(v.product_name),String(v.size),ext,reserved,db)
    const bytes=exactFile(at(source.staged),source.sourceHash);await sharp(bytes).stats()
    units.push({sourceId:imageId,productId:Number(v.product_id),variantId:Number(v.id),source:source.staged,sha:source.sourceHash,destination:path.relative(root,destination),staging:path.relative(root,path.join(folder,imageId+'.copy')),cost:source.snapshot.unit_cost})
   }
   reserveNamedImageSequences(units.map(u=>at(u.destination)),db)
   const plan:ReturnPlan={format:1,id,orderId,inputHash,reason,units},payload=JSON.stringify(plan)
   writeDurable(at(returnJournal(id)),payload);checkpoint('journal')
   db.prepare("INSERT INTO stock_return_operations(id,order_id,request_key,input_hash,payload,payload_hash,status) VALUES(?,?,?,?,?,?,'PREPARED')").run(id,orderId,key,inputHash,payload,returnHash(payload));prepared=true;checkpoint('prepared')
   for(let i=0;i<units.length;i++){
    const u=units[i];writeDurable(at(u.staging),exactFile(at(u.source),u.sha));checkpoint('copied:'+i)
    exactFile(at(u.staging),u.sha);safeDirectory(path.dirname(at(u.destination)))
    fs.linkSync(at(u.staging),at(u.destination));syncDirectory(path.dirname(at(u.destination)));checkpoint('published:'+i)
   }
   db.exec('BEGIN IMMEDIATE')
   try{
    for(let i=0;i<units.length;i++){
     const u=units[i];exactFile(at(u.source),u.sha);exactFile(at(u.destination),u.sha)
     const image=db.prepare('INSERT INTO product_images(product_id,variant_id,file_path) VALUES(?,?,?)').run(u.productId,u.variantId,at(u.destination))
     const ledger=db.prepare("INSERT INTO inventory_transactions(variant_id,transaction_type,quantity,unit_cost,note) VALUES(?,'IMPORT',1,?,?)").run(u.variantId,u.cost,returnNote(plan,u))
     db.prepare('INSERT INTO stock_return_units(source_image_id,operation_id,new_image_id,transaction_id) VALUES(?,?,?,?)').run(u.sourceId,id,image.lastInsertRowid,ledger.lastInsertRowid);checkpoint('unit:'+i)
    }
    db.prepare("UPDATE stock_return_operations SET status='RETURNED' WHERE id=?").run(id);checkpoint('before-commit');db.exec('COMMIT')
   }catch(e){db.exec('ROLLBACK');throw e}
   checkpoint('after-commit')
   const done=status(key);for(const u of units)fs.unlinkSync(at(u.staging));syncDirectory(folder);release();locked=false;checkpoint('released')
   return {...done,recoveryRequired:false}
  }catch(e){if(locked&&!prepared){release();locked=false}throw e}finally{salesActivity.busy=false}
 }
 function recover(){
  if(salesActivity.busy||salesActivity.readers)throw new SalesError('Có thao tác kho đang chạy',409)
  if(!exists(lock)){if(pendingStockReturn(db,root))throw new SalesError('Thiếu khóa phục hồi nhận lại; cần đối soát',409);return {status:'CLEAR'}}
  const marker=JSON.parse(exactFile(lock).toString());if(marker.format!==1||typeof marker.id!=='string'||! /^[a-f0-9-]{36}$/.test(marker.id)||!Number.isSafeInteger(marker.pid))throw Error('Khóa nhận lại không hợp lệ')
  if(marker.pid!==process.pid){try{process.kill(marker.pid,0);throw new SalesError('Tiến trình nhận lại còn chạy',409)}catch(e:any){if(e.code!=='ESRCH')throw e}}
  salesActivity.busy=true
  try{
   const row=db.prepare('SELECT * FROM stock_return_operations WHERE id=? AND request_key=?').get(marker.id,marker.requestKey)
   // The protocol never publishes files before PREPARED. An orphan plan is inert evidence.
   if(!row){release();return {status:'ROLLED_BACK'}}
   const p=readReturnPlan(row,file);validateStockReturnProof(db,p,String(row.status))
   const published=p.units.filter(u=>exists(at(u.destination)))
   for(const u of p.units){exactFile(at(u.source),u.sha);if(exists(at(u.staging)))exactFile(at(u.staging))}
   for(const u of published){
    exactFile(at(u.destination),u.sha)
    if(row.status!=='RETURNED'){
     if(db.prepare('SELECT 1 FROM product_images WHERE file_path=?').get(at(u.destination)))throw Error('File nhận lại đã có đăng ký khác; cần đối soát')
     const dest=fs.statSync(at(u.destination)),staged=fs.statSync(at(u.staging))
     if(dest.ino!==staged.ino||dest.dev!==staged.dev)throw Error('File đích không thuộc lần nhận lại này; không xóa')
    }
   }
   if(row.status==='RETURNED'&&published.length!==p.units.length)throw Error('Thiếu tồn đã nhận lại; cần đối soát')
   if(row.status!=='RETURNED'){
    for(const u of published){fs.unlinkSync(at(u.destination));syncDirectory(path.dirname(at(u.destination)))}
    if(row.status==='PREPARED')db.prepare("UPDATE stock_return_operations SET status='ROLLED_BACK' WHERE id=?").run(p.id)
   }
   for(const u of p.units)if(exists(at(u.staging)))fs.unlinkSync(at(u.staging))
   syncDirectory(path.dirname(at(returnJournal(p.id))));release();return {status:row.status==='RETURNED'?'RETURNED':'ROLLED_BACK'}
  }finally{salesActivity.busy=false}
 }
 return {receive,list,status,recover,pending:()=>pendingStockReturn(db,root)}
}
