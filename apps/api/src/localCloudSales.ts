import type {DatabaseSync} from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {businessColumns,businessDigest,uploadLocalBusiness} from './cloudBusiness.js'
import {assertLocalDraftMatchesCloud} from './cloudReconcile.js'
import {optimizeCloudImage} from './cloudImages.js'
import {salesExecutionService,salesActivity} from './salesExecution.js'
import {salesPreflightService} from './salesPreflight.js'
import {validateFinance,financeService} from './orderFinance.js'
import {SalesError,salesDraftService} from './salesDrafts.js'
import {pendingStockReturn} from './stockReturnState.js'

class RequestConflict extends Error{}
const conflict=(message:string):never=>{throw new RequestConflict(message)}
const marker=(key:string)=>'cloud-local-request:'+key
const keyFor=(key:string)=>'mobile-sale-'+businessDigest(key)
const columns=(table:string,row:any)=>Object.fromEntries(businessColumns[table].split(',').map(k=>[k,row[k]??null]))
const comparable=(table:string,rows:any[])=>JSON.stringify(rows.map(r=>columns(table,r)).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))

/** Called only by the localhost owner endpoint after same-instance authentication.
 * Cloud supplies frozen intent. Only the ordinary LOCAL sale engine can commit it.
 */
export async function processLocalCloudSale(db:DatabaseSync,root:string,rpc:(name:string,args:any)=>Promise<any>,checkpoint:(point:string)=>void=()=>{}){
 const instance=String(db.prepare("SELECT value FROM app_metadata WHERE key='cloud-instance'").get()?.value||'')
 const health=await rpc('mc_v7_health',{})
 if(!instance||health.instance!==instance||health.role!=='owner'||health.status!=='CLOUD_TEST_READY'||!db.prepare("SELECT 1 FROM app_metadata WHERE key='cloud-authority' AND value='enabled'").get())throw Error('Chưa xác minh chủ shop và cùng kho laptop/Cloud.')
 if(salesActivity.busy||salesActivity.readers||pendingStockReturn(db,root))throw Error('Chờ giao dịch laptop hoàn tất trước khi xử lý yêu cầu mobile.')
 const execution=salesExecutionService(db,root)
 if(execution.pending())throw Error('Giao dịch laptop cần phục hồi trước khi nhận yêu cầu mobile.')
 await rpc('mc_v8_local_sales',{p_action:'enable',p_payload:{instance}})
 const request=await rpc('mc_v8_local_sales',{p_action:'next',p_payload:{instance}})
 if(!request)return {pending:false}
 const {requestKey,snapshot:s}=request,action=request.action||'sale.confirm',payload=request.payload||{}
 const financial=action!=='sale.confirm'
 if(typeof requestKey!=='string'||! /^[A-Za-z0-9_-]{16,100}$/.test(requestKey)||s?.instance!==instance)throw Error('Yêu cầu mobile không hợp lệ hoặc khác kho.')
 const operationKey=keyFor(requestKey),before=await execution.status(operationKey)
 const saveJournal=(state:string,error='')=>db.prepare('INSERT INTO app_metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(marker(requestKey),JSON.stringify({orderId:s.order?.id,state,error,at:new Date().toISOString()}))
 const journal=JSON.parse(String(db.prepare('SELECT value FROM app_metadata WHERE key=?').get(marker(requestKey))?.value||'null'))
 let committed=financial?['APPLIED','SOLD_WAITING_CLOUD','CONFIRMED'].includes(journal?.state):before.sold
 try{
  let result=before
  if(!committed){
   if(before.status!=='NOT_FOUND')throw Error('Yêu cầu bán cần kiểm tra phục hồi tại laptop.')
   const o=s.order,items=s.items
   if(!o||typeof o.id!=='string'||!/^[-A-Za-z0-9_]{1,100}$/.test(o.id)||o.status!=='DRAFT'||!Number.isSafeInteger(o.version)||o.version<1||!Number.isSafeInteger(o.discount)||o.discount<0||typeof o.note!=='string'||o.note.length>1000||!Array.isArray(items)||!items.length||items.length>100||!Array.isArray(s.assets))throw Error('Snapshot yêu cầu không hợp lệ; cần đối soát Cloud.')
   const localConfirmation=db.prepare('SELECT * FROM sales_confirmations WHERE order_id=?').get(o.id)
   if(!financial&&localConfirmation)conflict('Đơn đã bán tại laptop bằng giao dịch khác. Giữ nguyên chứng từ để đối soát.')
   if(financial&&Boolean(localConfirmation)!==Boolean(s.confirmation)||financial&&localConfirmation&&localConfirmation.operation_id!==s.confirmation.operation_id)conflict('Chứng từ bán của đơn khác laptop. Giữ nguyên lịch sử để đối soát.')
   const ids=new Set<number>(),sourceHashes=new Map<number,string>()
   const checkedItems=action==='draft.save'?s.requestItems:items
   if(!Array.isArray(checkedItems)||action==='draft.save'&&checkedItems.length!==payload.items?.length)conflict('Ảnh mới không còn đăng ký trên Cloud.')
   for(const i of checkedItems){
    if(!Number.isSafeInteger(i.image_id)||ids.has(i.image_id)||!Number.isSafeInteger(i.unit_price)||i.unit_price<0)throw Error('Snapshot hàng/giá không hợp lệ.');ids.add(i.image_id)
    if((!financial||action==='draft.save')&&db.prepare('SELECT 1 FROM sales_units WHERE image_id=?').get(i.image_id))conflict('Ảnh #'+i.image_id+' đã bán tại laptop. Yêu cầu mobile chưa được bán.')
    const local=db.prepare('SELECT i.file_path,i.product_id,i.variant_id,p.name product_name,p.product_code,v.size,v.sku FROM product_images i JOIN products p ON p.id=i.product_id JOIN product_variants v ON v.id=i.variant_id WHERE i.id=?').get(i.image_id)
    if(!local||['product_id','variant_id','product_name','product_code','size','sku'].some(k=>local[k]!==i[k]))conflict('Ảnh #'+i.image_id+' khác định danh hàng tại laptop.')
    if(financial&&action!=='draft.save')continue
    let file:string
    try{file=fs.realpathSync(String(local!.file_path))}catch{conflict('Thiếu ảnh nguồn #'+i.image_id+' tại laptop. Kiểm tra kho trước khi gửi lại.')}
    const rel=path.relative(fs.realpathSync(root),file!)
    if(!rel||path.isAbsolute(rel)||rel==='..'||rel.startsWith('..'+path.sep)||rel.split(path.sep).some(p=>p.startsWith('.mecacao-')))conflict('Ảnh không thuộc kho laptop hiện tại.')
    const asset=action==='draft.save'?i.asset:s.assets.find((a:any)=>a.image_id===i.image_id)
    if(!asset?.ready||!asset.source_present||!/^[a-f0-9]{64}$/.test(asset.sha256))conflict('Ảnh Cloud chưa sẵn sàng hoặc chưa xác minh nguồn.')
    if(fs.statSync(file!).size>32*1024*1024)conflict('Ảnh nguồn vượt giới hạn kiểm tra 32 MB.')
    const bytes=fs.readFileSync(file!);if(bytes.length>32*1024*1024)conflict('Ảnh nguồn vượt giới hạn kiểm tra 32 MB.')
    sourceHashes.set(i.image_id,createHash('sha256').update(bytes).digest('hex'))
    if((await optimizeCloudImage(bytes)).sha256!==asset.sha256)conflict('Nội dung ảnh #'+i.image_id+' đã đổi. Đối soát ảnh trước khi bán.')
   }
   checkpoint('source-verified')
   // No network calls between the comparison and the synchronous import. Recheck
   // LOCAL after image decoding; edits and stock changes must not be overwritten.
   if(salesActivity.busy||salesActivity.readers||execution.pending())throw Error('Laptop đang xử lý giao dịch khác; yêu cầu sẽ được kiểm tra lại.')
   const old=db.prepare('SELECT 1 FROM sales_orders WHERE id=?').get(o.id)
   if(old){
    try{assertLocalDraftMatchesCloud(db,o,items,s.contact)}catch(e){conflict((e as Error).message.replaceAll('SOLD Cloud','mobile'))}
    for(const table of ['order_finance','finance_entries','aftercare_cases']){
     const remote=(s[table]||[]).map((r:any)=>table==='aftercare_cases'?{...r,input_hash:businessDigest({id:r.order_id,kind:r.kind,note:r.note})}:r)
     const local=db.prepare('SELECT * FROM '+table+' WHERE order_id=?').all(o.id)
     if(comparable(table,local)!==comparable(table,remote))conflict('Sổ tiền/hậu mãi của đơn khác laptop. Giữ nguyên hồ sơ để đối soát.')
    }
   }else{
    db.exec('BEGIN IMMEDIATE')
    try{
     const insert=(table:string,row:any)=>{const keys=businessColumns[table].split(',');if(keys.some(k=>row[k]===undefined))throw Error('Snapshot thiếu trường '+table);db.prepare('INSERT INTO '+table+'('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>row[k]))}
     if(s.customer&&!db.prepare('SELECT 1 FROM shop_customers WHERE id=?').get(s.customer.id))insert('shop_customers',s.customer)
     insert('sales_orders',o)
     for(const i of items)insert('sales_order_images',i)
     if(s.contact)insert('order_contacts',s.contact)
     for(const table of ['order_finance','finance_entries','aftercare_cases'])for(const r of s[table]||[])insert(table,table==='aftercare_cases'?{...r,input_hash:businessDigest({id:r.order_id,kind:r.kind,note:r.note})}:r)
     validateFinance(db)
     db.exec('COMMIT')
    }catch(e){if(db.isTransaction)db.exec('ROLLBACK');throw e}
   }
   if(financial){
    const finance=financeService(db,()=>saveJournal('APPLIED'))
    try{
     if(action==='draft.save'||action==='draft.cancel'){
      const drafts=salesDraftService(db,root,false,{onWrite:()=>saveJournal('APPLIED'),beforeWrite:()=>{
       const c=s.contactCustomer;if(c&&!db.prepare('SELECT 1 FROM shop_customers WHERE id=?').get(c.id)){const keys=businessColumns.shop_customers.split(',');db.prepare('INSERT INTO shop_customers('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>c[k]))}
      }})
      if(action==='draft.save')drafts.update(o.id,payload);else drafts.cancel(o.id,payload.version)
     }else if(action==='finance.entry')finance.record(o.id,payload,operationKey)
     else if(action==='finance.configure')finance.configure(o.id,payload)
     else if(action==='aftercare.create')finance.createCase(o.id,payload,operationKey)
     else if(action==='aftercare.resolve')finance.resolveCase(o.id,payload.caseId,payload)
     else throw Error('Yêu cầu nghiệp vụ không được hỗ trợ.')
    }catch(e){if(e instanceof SalesError)conflict(e.message);throw e}
    committed=true
   }else{
   saveJournal('CHECKING')
   const check=await salesPreflightService(db,root).check(o.id,o.version)
   if(!check.checksPassed)conflict('Ảnh/đơn chưa đạt kiểm tra laptop. Chưa bán; kiểm tra tồn trước khi gửi lại.')
   if(check.items.some(i=>i.evidence?.sourceHash!==sourceHashes.get(i.imageId)))conflict('Ảnh đã thay đổi trong lúc xử lý yêu cầu. Chưa bán; đối soát ảnh rồi gửi lại.')
   // Existing draft conflicts need an explicit choice on LOCAL, not automatic
   // approval on behalf of the shop owner.
   if(check.conflicts.length)conflict('Ảnh đang có trong đơn nháp khác tại laptop. Kiểm tra và xử lý các nháp trước khi gửi lại.')
   result=await execution.confirm(o.id,{version:o.version,token:check.token,confirmed:true,acknowledgeZeroPrice:true},operationKey)
   committed=result.sold
   if(!committed)throw Error('Laptop chưa xác minh xong bằng chứng bán; cần kiểm tra phục hồi.')
   }
  }
  saveJournal('SOLD_WAITING_CLOUD')
  // Upload evidence first. Losing either reply leaves the durable request pending;
  // the stable LOCAL operation key resumes this branch without selling again.
  await uploadLocalBusiness(db,root,rpc,true)
  await rpc('mc_v8_local_sales',{p_action:'finish',p_key:requestKey,p_payload:{instance,operationId:result.operationId,localRequest:operationKey}})
  saveJournal('CONFIRMED')
  return {pending:true,state:'CONFIRMED',orderId:s.order.id}
 }catch(e){
  const message=e instanceof Error?e.message:'Chưa xử lý được yêu cầu mobile.'
  if(e instanceof RequestConflict&&!committed&&!db.prepare('SELECT 1 FROM sales_operations WHERE request_key=?').get(operationKey)){
   await rpc('mc_v8_local_sales',{p_action:'reject',p_key:requestKey,p_payload:{instance,error:message.slice(0,500)}})
   saveJournal('REJECTED',message)
   return {pending:true,state:'REJECTED',orderId:s.order.id,error:message}
  }
  saveJournal(committed?'SOLD_WAITING_CLOUD':'WAITING',message)
  throw e
 }
}
