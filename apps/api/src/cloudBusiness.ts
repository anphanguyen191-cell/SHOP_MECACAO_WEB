import type {DatabaseSync} from 'node:sqlite'
import {createHash} from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import {salesActivity,SALES_AREA,exactFile} from './salesExecution.js'
import {pendingStockReturn} from './stockReturnState.js'
import {reconcileCloudSale} from './cloudReconcile.js'
import {validateFinance} from './orderFinance.js'
import {validateStocktakes} from './stocktake.js'

export const businessColumns:Record<string,string>={
 shop_customers:'id,name,phone,phone_key,address,note,version,created_at,updated_at',
 product_images:'id,product_id,variant_id,file_path,sort_order,is_primary,created_at',
 sales_orders:'id,request_key,request_hash,status,version,discount,note,created_at,updated_at',
 sales_order_images:'order_id,image_id,product_id,variant_id,product_name,product_code,size,sku,unit_price,unit_cost,position',
 order_contacts:'order_id,customer_id,recipient_name,phone,address,shipping_fee',
 sales_operations:'id,request_key,input_hash,payload,payload_hash,status,created_at',
 sales_confirmations:'order_id,operation_id,version,subtotal,discount,total,note,created_at',
 sales_units:'image_id,order_id,variant_id,snapshot,source_hash,archive_path,archive_hash',
 sales_ledger:'image_id,order_id,variant_id,transaction_type,quantity,unit_cost,created_at',
 order_finance:'order_id,version,method,delivery,tracking',
 finance_entries:'id,order_id,request_key,input_hash,payload,sequence,kind,amount,method,note,created_at',
 aftercare_cases:'id,order_id,request_key,input_hash,kind,note,status,resolution,version,created_at,updated_at',
 stocktake_sessions:'id,request_key,input_hash,title,status,version,fingerprint,snapshot_hash,created_at,closed_at,conclusion',
 stocktake_rows:'session_id,variant_id,snapshot,counted,note'
}
export type BusinessPayload=Record<string,any[]>
export const businessDigest=(data:unknown)=>createHash('sha256').update(JSON.stringify(data)).digest('hex')
// Strip machine paths from opaque evidence while retaining its source checksum.
function portable(value:any):any{
 if(Array.isArray(value))return value.map(portable)
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,/^(file_path|canonical|staged|archive|archive_path|sourcePath|root|source)$/i.test(k)?null:portable(v)]))
 return value
}
export function readLocalBusiness(db:DatabaseSync,root:string){
 if(salesActivity.busy||salesActivity.readers||fs.existsSync(path.join(root,SALES_AREA+'-pending.json'))||pendingStockReturn(db,root))throw Error('Chờ giao dịch bán/nhận lại hàng hoàn tất trước khi đồng bộ hồ sơ.')
 db.exec('BEGIN')
 try{
  if(db.prepare("SELECT 1 FROM sales_operations WHERE status='PREPARED'").get())throw Error('Giao dịch bán cần phục hồi trước khi đồng bộ.')
  validateFinance(db);validateStocktakes(db)
  const instance=String(db.prepare("SELECT value FROM app_metadata WHERE key='cloud-instance'").get()?.value||'')
  if(!instance)throw Error('Chưa liên kết kho laptop với Cloud.')
  const rows:BusinessPayload={}
  for(const [table,columns] of Object.entries(businessColumns)){
   const exists=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)
   const filter=table==='product_images'?' WHERE id IN (SELECT image_id FROM sales_order_images UNION SELECT image_id FROM sales_units)':table==='sales_operations'?" WHERE status='SOLD'":''
   rows[table]=exists?db.prepare(`SELECT ${columns} FROM ${table}${filter} ORDER BY ${columns.split(',').slice(0,table==='sales_order_images'||table==='stocktake_rows'?2:1).join(',')}`).all():[]
  }
  for(const unit of rows.sales_units){
   const archive=path.resolve(root,String(unit.archive_path)),relative=path.relative(root,archive)
   if(path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep))throw Error('Ảnh lưu SOLD ngoài vùng dữ liệu hiện tại.')
   exactFile(archive,String(unit.archive_hash))
  }
  const sourceHash=businessDigest(rows)
  for(const image of rows.product_images)image.file_path='v7/'+instance+'/'+image.id+'.jpg'
  for(const op of rows.sales_operations){const payload={origin:'WINDOWS',operationId:op.id,sourcePayloadHash:op.payload_hash};op.payload=JSON.stringify(payload);op.payload_hash=businessDigest(payload)}
  for(const unit of rows.sales_units){unit.snapshot=JSON.stringify(portable(JSON.parse(unit.snapshot)));unit.archive_path='local-proof/'+unit.order_id+'/'+unit.image_id}
  for(const row of rows.stocktake_rows)row.snapshot=JSON.stringify(portable(JSON.parse(row.snapshot)))
  db.exec('COMMIT')
  const counts=Object.fromEntries(Object.entries(rows).map(([t,r])=>[t,r.length]))
  if(Object.values(counts).reduce((a,b)=>a+b,0)>50000||Buffer.byteLength(JSON.stringify(rows))>12*1024*1024)throw Error('Hồ sơ vượt giới hạn đồng bộ một lượt; cần chia đợt trước khi kích hoạt.')
  return {instance,sourceHash,rows,counts}
 }catch(e){if(db.isTransaction)db.exec('ROLLBACK');throw e}
}

export async function uploadLocalBusiness(db:DatabaseSync,root:string,rpc:(name:string,args:any)=>Promise<any>){
 const snapshot=readLocalBusiness(db,root)
 const result=await rpc('mc_v8_business_import',{p_instance:snapshot.instance,p_request:'business:'+snapshot.instance+':'+snapshot.sourceHash,p_payload:snapshot.rows})
 if(result?.instance!==snapshot.instance||JSON.stringify(result.counts)!==JSON.stringify(snapshot.counts)){
  // JSON objects from PostgreSQL have a different key order.
  if(result?.instance!==snapshot.instance||Object.entries(snapshot.counts).some(([t,n])=>result?.counts?.[t]!==n))throw Error('Cloud chưa xác nhận đủ khách hàng, đơn và sổ tiền. Chưa kích hoạt.')
 }
 if(readLocalBusiness(db,root).sourceHash!==snapshot.sourceHash)throw Error('Nghiệp vụ laptop vừa thay đổi. Đang chờ đồng bộ lại trước khi kích hoạt.')
 db.prepare("INSERT INTO app_metadata(key,value) VALUES('cloud-business-upload',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({sourceHash:snapshot.sourceHash,counts:snapshot.counts,at:new Date().toISOString()}))
 for(const c of snapshot.rows.sales_confirmations)db.prepare('INSERT INTO app_metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('cloud-local-sold:'+c.order_id,c.operation_id)
 return {counts:snapshot.counts,sourceHash:snapshot.sourceHash}
}

export function verifyImportedLocalSale(db:DatabaseSync,root:string,proof:any){
 const id=proof?.order?.id,marker=typeof id==='string'?db.prepare('SELECT value FROM app_metadata WHERE key=?').get('cloud-local-sold:'+id):null
 if(!marker)return null
 const local=db.prepare('SELECT * FROM sales_confirmations WHERE order_id=?').get(id)
 if(!local||proof.instance!==db.prepare("SELECT value FROM app_metadata WHERE key='cloud-instance'").get()?.value||proof.confirmation?.operation_id!==marker.value)throw Error('Chứng từ SOLD đã đồng bộ không khớp laptop.')
 for(const key of ['operation_id','version','subtotal','discount','total','note','created_at'])if(local[key]!==proof.confirmation[key])throw Error('Chứng từ SOLD Cloud khác laptop: '+key)
 const items=db.prepare('SELECT image_id,product_id,variant_id,unit_price,unit_cost,position FROM sales_order_images WHERE order_id=? ORDER BY position').all(id)
 if(!Array.isArray(proof.items)||items.length!==proof.items.length||items.some((i,index)=>Object.keys(i).some(k=>i[k]!==proof.items[index]?.[k])))throw Error('Danh sách SOLD Cloud khác laptop.')
 for(const unit of db.prepare('SELECT archive_path,archive_hash FROM sales_units WHERE order_id=?').all(id)){
  const archive=path.resolve(root,String(unit.archive_path)),rel=path.relative(root,archive)
  if(path.isAbsolute(rel)||rel==='..'||rel.startsWith('..'+path.sep))throw Error('Ảnh lưu SOLD không hợp lệ.')
  exactFile(archive,String(unit.archive_hash))
 }
 return {sold:true,operationId:String(local.operation_id)}
}

export function assertBusinessUploaded(db:DatabaseSync,root:string){
 const previous=db.prepare("SELECT value FROM app_metadata WHERE key='cloud-business-upload'").get()
 if(!previous||JSON.parse(String(previous.value)).sourceHash!==readLocalBusiness(db,root).sourceHash)throw Error('Khách hàng/đơn bán/sổ tiền chưa đồng bộ đủ. Bấm Đồng bộ / Tiếp tục.')
}

/** Cloud commands become the shared writer only after the complete LOCAL handoff.
 * Mirror their customer/contact/payment rows into the same LOCAL database too. */
export async function pullCloudBusiness(db:DatabaseSync,root:string,rpc:(name:string,args:any)=>Promise<any>){
 const before=await rpc('mc_v7_health',{}),instance=db.prepare("SELECT value FROM app_metadata WHERE key='cloud-instance'").get()?.value
 if(before.role!=='owner'||before.instance!==instance||!instance||!db.prepare("SELECT 1 FROM app_metadata WHERE key='cloud-authority' AND value='enabled'").get())throw Error('Chưa xác nhận cùng kho Cloud/laptop để nhận nghiệp vụ.')
 const tables=['shop_customers','sales_orders','sales_order_images','order_contacts','order_finance','finance_entries','aftercare_cases','sales_confirmations']
 const data:BusinessPayload={}
 for(const table of tables){
  data[table]=[];let offset=0
  for(;;){const page=await rpc('mc_v7_rows',{p_table:table,p_after:String(offset),p_limit:500});if(!Array.isArray(page?.rows)||page.rows.length>500||page.nextOffset!==offset+page.rows.length||page.nextOffset>50000)throw Error('Trang hồ sơ Cloud không hợp lệ.');data[table].push(...page.rows);if(page.rows.length<500)break;offset=page.nextOffset}
 }
 if((await rpc('mc_v7_health',{})).sequence!==before.sequence)throw Error('Cloud vừa thay đổi; sẽ đọc lại hồ sơ cùng một mốc.')
 if(salesActivity.busy||salesActivity.readers||pendingStockReturn(db,root))throw Error('Chờ giao dịch laptop hoàn tất trước khi nhận hồ sơ Cloud.')
 // Customers are dependencies of contacts. Their data is a Cloud-authority mirror.
 const writeRow=(table:string,row:any)=>{
  const keys=businessColumns[table].split(','),pk=table==='sales_order_images'?['order_id','image_id']:['order_contacts','order_finance'].includes(table)?['order_id']:['id']
  if(keys.some(k=>row[k]===undefined))throw Error('Cloud thiếu trường '+table)
  const where=pk.map(k=>k+'=?').join(' AND '),values=pk.map(k=>row[k]),old=db.prepare('SELECT * FROM '+table+' WHERE '+where).get(...values)
  if(!old)db.prepare(`INSERT INTO ${table}(${keys}) VALUES(${keys.map(()=>'?')})`).run(...keys.map(k=>row[k]))
  else{const changed=keys.filter(k=>!pk.includes(k)&&old[k]!==row[k]);if(changed.length)db.prepare(`UPDATE ${table} SET ${changed.map(k=>k+'=?')} WHERE ${where}`).run(...changed.map(k=>row[k]),...values)}
 }
 db.exec('BEGIN IMMEDIATE')
 try{for(const row of data.shop_customers)writeRow('shop_customers',row);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
 for(const confirmation of data.sales_confirmations){
  if(db.prepare('SELECT 1 FROM sales_confirmations WHERE order_id=?').get(confirmation.order_id))continue
  await reconcileCloudSale(db,root,await rpc('mc_v7_sold_proof',{p_id:confirmation.order_id}))
 }
 if((await rpc('mc_v7_health',{})).sequence!==before.sequence)throw Error('Cloud vừa thay đổi; sẽ đọc lại sổ nghiệp vụ.')
 db.exec('BEGIN IMMEDIATE')
 try{
  for(const row of data.sales_orders)if(!db.prepare('SELECT 1 FROM sales_confirmations WHERE order_id=?').get(row.id))writeRow('sales_orders',row)
  for(const order of data.sales_orders){
   if(db.prepare('SELECT 1 FROM sales_confirmations WHERE order_id=?').get(order.id))continue
   db.prepare('DELETE FROM sales_order_images WHERE order_id=?').run(order.id)
   for(const item of data.sales_order_images.filter(i=>i.order_id===order.id))writeRow('sales_order_images',item)
   for(const contact of data.order_contacts.filter(i=>i.order_id===order.id))writeRow('order_contacts',contact)
  }
  for(const table of ['order_finance','finance_entries','aftercare_cases'])for(const row of data[table])writeRow(table,table==='aftercare_cases'?{...row,input_hash:businessDigest({id:row.order_id,kind:row.kind,note:row.note})}:row)
  db.prepare("INSERT INTO app_metadata(key,value) VALUES('cloud-business-pull',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({sequence:before.sequence,at:new Date().toISOString()}))
  db.exec('COMMIT')
 }catch(e){db.exec('ROLLBACK');throw e}
 return {sequence:before.sequence,customers:data.shop_customers.length,orders:data.sales_orders.length,finance:data.finance_entries.length}
}
