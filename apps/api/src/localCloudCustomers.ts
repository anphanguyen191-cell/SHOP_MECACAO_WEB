import type {DatabaseSync} from 'node:sqlite'
import {customerService} from './customers.js'
import {SalesError} from './salesDrafts.js'
import {businessColumns,uploadLocalBusiness} from './cloudBusiness.js'
import {salesActivity,salesExecutionService} from './salesExecution.js'
import {pendingStockReturn} from './stockReturnState.js'

/** Separate queue: customer failures never hold the sale queue's head. */
export async function processLocalCloudCustomer(db:DatabaseSync,root:string,rpc:(name:string,args:any)=>Promise<any>){
 const instance=String(db.prepare("SELECT value FROM app_metadata WHERE key='cloud-instance'").get()?.value||'')
 const health=await rpc('mc_v7_health',{})
 if(!instance||health.instance!==instance||health.role!=='owner'||health.status!=='CLOUD_TEST_READY'||!db.prepare("SELECT 1 FROM app_metadata WHERE key='cloud-authority' AND value='enabled'").get())throw Error('Chưa xác minh chủ shop và cùng kho laptop/Cloud.')
 if(salesActivity.busy||salesActivity.readers||pendingStockReturn(db,root)||salesExecutionService(db,root).pending())throw Error('Chờ giao dịch laptop hoàn tất trước khi xử lý hồ sơ khách.')
 await rpc('mc_v8_local_customers',{p_action:'enable',p_payload:{instance}})
 const request=await rpc('mc_v8_local_customers',{p_action:'next',p_payload:{instance}})
 if(!request)return {pending:false}
 const {requestKey,customerId,payload,base}=request
 if(typeof requestKey!=='string'||! /^[A-Za-z0-9_-]{16,100}$/.test(requestKey)||typeof customerId!=='string'||!/^[-A-Za-z0-9_]{1,100}$/.test(customerId)||request.instance!==instance||payload?.id!==customerId||!Number.isSafeInteger(payload.version)||payload.version<0)throw Error('Yêu cầu hồ sơ khách không hợp lệ.')
 const marker='cloud-customer-request:'+requestKey
 const journal=JSON.parse(String(db.prepare('SELECT value FROM app_metadata WHERE key=?').get(marker)?.value||'null'))
 let applied=journal?.state==='APPLIED',appliedVersion=journal?.version
 try{
  if(!applied){
   if(salesActivity.busy||salesActivity.readers||pendingStockReturn(db,root)||salesExecutionService(db,root).pending())throw Error('Laptop đang xử lý giao dịch; hồ sơ khách sẽ được kiểm tra lại.')
   db.exec('BEGIN IMMEDIATE')
   try{
    const old=db.prepare('SELECT * FROM shop_customers WHERE id=?').get(customerId)
    const keys=businessColumns.shop_customers.split(',')
    if(base){
     if(base.id!==customerId||base.version!==payload.version||keys.some(k=>base[k]===undefined))throw Error('Snapshot hồ sơ khách thiếu trường.')
     if(old&&keys.some(k=>old[k]!==base[k]))throw new SalesError('Hồ sơ khách đã thay đổi tại laptop. Mở lại hồ sơ mới trước khi gửi lại.',409)
     if(!old)db.prepare('INSERT INTO shop_customers('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>base[k]))
    }else if(payload.version!==0||old)throw new SalesError('Mã khách đã có tại laptop. Mở lại hồ sơ để đối soát.',409)
    const saved=customerService(db).save(payload,base?customerId:undefined,base?undefined:customerId)
    appliedVersion=saved.version
    db.prepare('INSERT INTO app_metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(marker,JSON.stringify({state:'APPLIED',customerId,version:appliedVersion}))
    db.exec('COMMIT');applied=true
   }catch(e){if(db.isTransaction)db.exec('ROLLBACK');throw e}
  }
  // The durable journal and mutation commit together. Lost replies must upload
  // current LOCAL truth without reapplying the old edit over a later owner edit.
  await uploadLocalBusiness(db,root,rpc,true)
  const customer=db.prepare('SELECT * FROM shop_customers WHERE id=?').get(customerId)
  await rpc('mc_v8_local_customers',{p_action:'finish',p_key:requestKey,p_payload:{instance,appliedVersion,customer}})
  return {pending:true,state:'CONFIRMED',customerId}
 }catch(e){
  if(e instanceof SalesError&&!applied){
   await rpc('mc_v8_local_customers',{p_action:'reject',p_key:requestKey,p_payload:{instance,error:e.message.slice(0,500)}})
   return {pending:true,state:'REJECTED',customerId,error:e.message}
  }
  throw e
 }
}
