import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
const file=process.argv[2]
if(!file)throw Error('Expected the isolated Windows CI SQLite path')
const origin='http://127.0.0.1:3000'
async function call(route,method='GET',body,extra={}){
 const r=await fetch(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)})
 const data=await r.json()
 if(!r.ok)throw Error(method+' '+route+' returned '+r.status+': '+JSON.stringify(data))
 return {data,r}
}
let db=new DatabaseSync(file)
const original=db.prepare("SELECT value FROM app_metadata WHERE key='cloud-authority'").get()?.value
const sample=db.prepare("SELECT i.id FROM product_images i JOIN products p ON p.id=i.product_id WHERE p.product_code='V8AUDITOLD' AND NOT EXISTS(SELECT 1 FROM sales_units u WHERE u.image_id=i.id) ORDER BY i.id LIMIT 1").get()
assert(Number(sample?.id)>0,'An actual Windows import must exist before cloud-active sale smoke')
db.close()
let cloudToggled=false
try{
 const {data:state}=await call('/api/local/auth/state')
 assert.equal(state.configured,false,'Fresh isolated EXE should require owner setup')
 const {r:setup}=await call('/api/local/auth/setup','POST',{username:'ciowner',password:'CI-Owner-2026-Safe!Smoke',remember:false})
 const cookie=setup.headers.getSetCookie().find(v=>v.startsWith('mecacao_windows_session='))?.split(';')[0]
 assert(cookie,'Windows authentication cookie missing')
 const auth={Cookie:cookie}
 db=new DatabaseSync(file)
 try{db.prepare("INSERT INTO app_metadata(key,value) VALUES('cloud-authority','enabled') ON CONFLICT(key) DO UPDATE SET value='enabled'").run();cloudToggled=true}finally{db.close()}
 assert.equal((await call('/api/health','GET',undefined,auth)).data.cloudAuthority,true)
 const {data:draft}=await call('/api/sales/drafts','POST',{items:[{imageId:Number(sample.id),unitPrice:45000}],discount:0,note:''},{...auth,'Idempotency-Key':'ci-cloud-authority-sale-0001'})
 assert(draft.id&&draft.quantity===1,'Windows must create a draft under Cloud-active mode')
 const {data:stored}=await call('/api/sales/drafts/'+encodeURIComponent(draft.id),'GET',undefined,auth)
 assert.equal(stored.status,'DRAFT')
 assert.equal(stored.items.length,1)
 const {data:cancelled}=await call('/api/sales/drafts/'+encodeURIComponent(draft.id)+'/cancel','POST',{version:stored.version},auth)
 assert.equal(cancelled.status,'CANCELLED_DRAFT')
 console.log('WINDOWS_CLOUD_ACTIVE_SALE_PASS: packaged EXE owner login -> create/read/cancel local order after Cloud enabled')
}finally{
 if(cloudToggled){
  db=new DatabaseSync(file)
  try{
   if(original===undefined)db.prepare("DELETE FROM app_metadata WHERE key='cloud-authority'").run()
   else db.prepare("INSERT INTO app_metadata(key,value) VALUES('cloud-authority',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(original)
   assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok')
   assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0)
  }finally{db.close()}
 }
}
