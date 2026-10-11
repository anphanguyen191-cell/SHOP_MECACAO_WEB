import {DatabaseSync} from 'node:sqlite'
import {createHash} from 'node:crypto'
import {optimizeCloudImage} from './cloudImages.js'
import {salesExecutionService} from './salesExecution.js'
import {salesPreflightService} from './salesPreflight.js'

/** Only call with an authenticated proof fetched directly from the fixed Cloud RPC. */
let replayTail:Promise<unknown>=Promise.resolve()
export function reconcileCloudSale(db:DatabaseSync,root:string,proof:any){
 const result=replayTail.then(()=>reconcile(db,root,proof));replayTail=result.catch(()=>{});return result
}
async function reconcile(db:DatabaseSync,root:string,proof:any){
 const instance=db.prepare("SELECT value FROM app_metadata WHERE key='cloud-instance'").get()?.value
 if(!instance||proof?.instance!==instance)throw Error('Cloud thuộc kho khác; không đối soát vào kho hiện tại.')
 const o=proof.order,c=proof.confirmation,items=proof.items,assets=proof.assets
 if(!o||typeof o.id!=='string'||!/^[-A-Za-z0-9_]{1,100}$/.test(o.id)||!c||c.order_id!==o.id||!Array.isArray(items)||items.length<1||items.length>100||!Array.isArray(assets)||!Number.isSafeInteger(o.version)||o.version<1)throw Error('Bằng chứng SOLD Cloud không hợp lệ.')
 const stable={...proof,assets:assets.map((a:any)=>({image_id:a.image_id,object_path:a.object_path,sha256:a.sha256,bytes:a.bytes,revision:a.revision})).sort((a:any,b:any)=>a.image_id-b.image_id)}
 const hash=createHash('sha256').update(JSON.stringify(stable)).digest('hex'),marker='cloud-sold:'+o.id,key='cloud-sale-'+o.id
 const previous=db.prepare('SELECT value FROM app_metadata WHERE key=?').get(marker)
 const costs=new Map<number,number>(items.map((i:any)=>[i.image_id,i.unit_cost??0]));if([...costs.values()].some(v=>!Number.isSafeInteger(v)||v<0))throw Error('Giá vốn snapshot Cloud không hợp lệ.');
 const execution=salesExecutionService(db,root,costs)
 if(previous){if(previous.value!==hash)throw Error('Bằng chứng SOLD Cloud thay đổi.');const status=await execution.status(key);if(!status.sold)throw Error('Lưu trữ SOLD Windows cần phục hồi.');return status}
 const existing=await execution.status(key)
 if(existing.sold){db.prepare('INSERT INTO app_metadata(key,value) VALUES(?,?)').run(marker,hash);return existing}
 if(execution.pending())throw Error('Giao dịch Windows cần phục hồi trước khi đối soát Cloud.')
 if(db.prepare('SELECT 1 FROM sales_confirmations WHERE order_id=?').get(o.id))throw Error('Đơn đã SOLD tại Windows với giao dịch khác. Cần đối soát thủ công.')
 const ids=new Set<number>()
 for(const i of items){
  if(!Number.isSafeInteger(i.image_id)||ids.has(i.image_id)||!Number.isSafeInteger(i.unit_price)||i.unit_price<0)throw Error('Danh sách SOLD Cloud không hợp lệ.');ids.add(i.image_id)
  const local=db.prepare('SELECT i.file_path,i.product_id,i.variant_id,v.cost_price FROM product_images i JOIN product_variants v ON v.id=i.variant_id WHERE i.id=?').get(i.image_id)
  const asset=assets.find((a:any)=>a.image_id===i.image_id)
  if(!local||local.product_id!==i.product_id||local.variant_id!==i.variant_id||!asset||!/^[a-f0-9]{64}$/.test(asset.sha256))throw Error('Ảnh SOLD không khớp định danh kho Windows.')
  const optimized=await optimizeCloudImage(String(local.file_path))
  if(optimized.sha256!==asset.sha256)throw Error('Ảnh gốc #'+i.image_id+' khác ảnh đã bán trên Cloud. Dừng để đối soát.')
 }
 const subtotal=items.reduce((n:number,i:any)=>n+i.unit_price,0)
 if(!Number.isSafeInteger(subtotal)||subtotal!==c.subtotal||o.discount!==c.discount||subtotal-o.discount!==c.total)throw Error('Tổng SOLD Cloud không khớp.')
 db.exec('BEGIN IMMEDIATE')
 try{
  const old=db.prepare('SELECT request_key FROM sales_orders WHERE id=?').get(o.id)
  if(old&&old.request_key!=='cloud-import-'+o.id)throw Error('Định danh đơn trùng với đơn độc lập tại Windows.')
  db.prepare('INSERT INTO sales_orders(id,request_key,request_hash,discount,note,version) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET discount=excluded.discount,note=excluded.note,version=excluded.version').run(o.id,'cloud-import-'+o.id,hash,o.discount,o.note,o.version)
  db.prepare('DELETE FROM sales_order_images WHERE order_id=?').run(o.id)
  const insert=db.prepare('INSERT INTO sales_order_images(order_id,image_id,product_id,variant_id,product_name,product_code,size,sku,unit_price,unit_cost,position) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
  items.forEach((i:any,index:number)=>insert.run(o.id,i.image_id,i.product_id,i.variant_id,i.product_name,i.product_code,i.size,i.sku,i.unit_price,i.unit_cost>0?i.unit_cost:null,index))
  const contact=proof.contact||{}
  db.prepare('INSERT INTO order_contacts(order_id,recipient_name,phone,address,shipping_fee) VALUES(?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET recipient_name=excluded.recipient_name,phone=excluded.phone,address=excluded.address,shipping_fee=excluded.shipping_fee').run(o.id,contact.recipient_name||'',contact.phone||'',contact.address||'',contact.shipping_fee||0)
  db.exec('COMMIT')
 }catch(e){db.exec('ROLLBACK');throw e}
 const check=await salesPreflightService(db,root,true).check(o.id,o.version)
 if(!check.checksPassed)throw Error('Ảnh gốc SOLD chưa đạt kiểm tra lưu trữ Windows.')
 const result=await execution.confirm(o.id,{version:o.version,token:check.token,confirmed:true,acknowledgeZeroPrice:true},key)
 if(!result.sold)throw Error('Lưu trữ SOLD Windows chưa được xác minh.')
 db.prepare('INSERT INTO app_metadata(key,value) VALUES(?,?)').run(marker,hash)
 return result
}
