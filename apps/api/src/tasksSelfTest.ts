import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {createServer} from 'node:net'
import {DatabaseSync} from 'node:sqlite'
import sharp from 'sharp'
import {bootstrapV100} from './schema.js'
import {verifyLosslessBackup} from './losslessVerify.js'
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-tasks-'))),database=path.join(root,'database','shop.db'),warehouse=path.join(root,'warehouse'),incoming=path.join(root,'incoming')
fs.mkdirSync(path.dirname(database));fs.mkdirSync(incoming);fs.mkdirSync(warehouse)
const db=new DatabaseSync(database);bootstrapV100(db);db.close()
const probe=createServer();await new Promise<void>(r=>probe.listen(0,'127.0.0.1',r));const port=(probe.address() as {port:number}).port;await new Promise<void>(r=>probe.close(()=>r()))
const base='http://127.0.0.1:'+port,headers={'Content-Type':'application/json',Origin:base,Prefer:'respond-async'}
let child:ReturnType<typeof spawn>|undefined,checks=0,output=''
const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++},sleep=(n:number)=>new Promise(r=>setTimeout(r,n))
async function start(){child=spawn(process.execPath,['--import','tsx',fileURLToPath(new URL('./server.ts',import.meta.url))],{env:{...process.env,PORT:String(port),SHOP_DB_PATH:database,SHOP_SANDBOX_ROOT:root,SHOP_ENABLE_V2_DRAFTS:'',SHOP_ENABLE_V2_SALES:'',SHOP_LOCAL_V2_CONFIG:'',SHOP_LOCAL_V2_RESTORE_READY:'',SHOP_LOCAL_V2_REVIEW:''},stdio:['ignore','pipe','pipe']});child.stdout!.on('data',b=>{output+=b});child.stderr!.on('data',b=>{output+=b});for(let i=0;i<150;i++){try{if((await fetch(base+'/api/health')).ok)return}catch{}if(child.exitCode!==null)throw Error(output);await sleep(100)}throw Error('Server timeout '+output)}
async function stop(){if(child&&child.exitCode===null){const exited=new Promise(r=>child!.once('exit',r));child.kill('SIGTERM');await exited}}
async function post(url:string,payload:unknown,key:string,extra={}){const r=await fetch(base+url,{method:'POST',headers:{...headers,'Idempotency-Key':key,...extra},body:JSON.stringify(payload)});return {status:r.status,data:await r.json() as any}}
async function done(id:string){for(let i=0;i<300;i++){const t=await (await fetch(base+'/api/tasks/'+id)).json() as any;if(['SUCCEEDED','FAILED','REVIEW_REQUIRED'].includes(t.status))return t;await sleep(50)}throw Error('Task timeout '+id)}
try{
 for(let i=0;i<30;i++){const p=path.join(warehouse,'Mẫu '+i,'Size 1');fs.mkdirSync(p,{recursive:true});await sharp({create:{width:25,height:30,channels:3,background:{r:i*5,g:100,b:150}}}).png().toFile(path.join(p,'001.png'))}
 await sharp({create:{width:35,height:40,channels:3,background:'#d0aacc'}}).png().toFile(path.join(incoming,'new.png'))
 await start()
 eq((await post('/api/store/scan',{rootPath:warehouse},'tasks-scan-key-0001',{Origin:'https://evil.example'})).status,403)
 eq((await post('/api/store/scan',{rootPath:os.tmpdir()},'tasks-outside-key-0001')).status,403)
 const scan=await post('/api/store/scan',{rootPath:warehouse},'tasks-scan-key-0001');eq(scan.status,202)
 const streamAbort=new AbortController(),streamTimer=setTimeout(()=>streamAbort.abort(),15000)
 const sse=await fetch(base+'/api/tasks/'+scan.data.task.id+'/events',{signal:streamAbort.signal});eq(sse.headers.get('content-type')?.includes('text/event-stream'),true)
 const reader=sse.body!.getReader(),first=await reader.read();let streamed=new TextDecoder().decode(first.value);eq(streamed.includes(scan.data.task.id),true)
 const streamedDone=(async()=>{while(!streamed.includes('"status":"SUCCEEDED"')){const next=await reader.read();if(next.done)break;streamed+=new TextDecoder().decode(next.value)}eq(streamed.includes('"phase":"SCAN"'),true);eq(streamed.includes('"status":"SUCCEEDED"'),true);await reader.cancel();clearTimeout(streamTimer)})()
 eq((await post('/api/store/scan',{rootPath:warehouse},'tasks-scan-key-0001')).data.task.id,scan.data.task.id)
 eq((await post('/api/store/scan',{rootPath:root},'tasks-scan-key-0001')).status,409)
 const scanned=await done(scan.data.task.id);eq(scanned.status,'SUCCEEDED');eq(scanned.result.summary.products,30);eq(scanned.result.summary.images,30);eq(scanned.progress.phase,'SCAN')
 await streamedDone
 const batch=await post('/api/store/import-batch-task',{confirmed:true,products:[scanned.result.products[0],scanned.result.products[1]].map((p:any)=>({rootPath:warehouse,name:p.name,productCode:p.suggestedProductCode,variants:p.sizes.map((s:any)=>({size:s.size,sku:s.suggestedSku,images:s.images,openingStock:s.images.length}))}))},'tasks-register-key-0001')
 eq(batch.status,202);const registered=await done(batch.data.task.id);eq(registered.status,'SUCCEEDED');eq(registered.result.outcomes.filter((r:any)=>r.status==='SAVED').length,2)
 const receiptPayload={storeRoot:warehouse,name:'Mẫu nhập mới',productCode:'PN001',sizes:[{size:'Size 2',quantity:1,costPrice:10000,salePrice:50000,sourcePath:incoming}]}
 const receipt=await post('/api/goods-receipt',receiptPayload,'tasks-receipt-key-0001');eq(receipt.status,202)
 const replay=await post('/api/goods-receipt',receiptPayload,'tasks-receipt-key-0001');eq(replay.data.task.id,receipt.data.task.id)
 const received=await done(receipt.data.task.id);eq(received.status,'SUCCEEDED');eq(received.result.totalQuantity,1);eq(received.progress.phase,'DONE');eq(fs.existsSync(path.join(incoming,'new.png')),true)
 await stop();await start();const again=await post('/api/goods-receipt',receiptPayload,'tasks-receipt-key-0001');eq(again.data.task.id,receipt.data.task.id);eq(again.data.task.status,'SUCCEEDED')
 const proof=new DatabaseSync(database,{readOnly:true});eq(Number(proof.prepare("SELECT COUNT(*) n FROM inventory_transactions WHERE transaction_type='IMPORT'").get()!.n),1);proof.close()
 const backup=await post('/api/backup/lossless',{},'tasks-backup-key-0001');eq(backup.status,202);const backed=await done(backup.data.task.id);eq(backed.status,'SUCCEEDED');eq(verifyLosslessBackup(backed.result.directory).ok,true);eq(backed.progress.phase,'BACKUP_VERIFY')
 const bad=await post('/api/goods-receipt',{...receiptPayload,productCode:'PN002'},'tasks-receipt-fail-0001');const badResult=await done(bad.data.task.id);assert.equal(badResult.status,'FAILED',JSON.stringify(badResult));checks++
 // Kill a freshly started worker before it can return a verified final result.
 const interrupted=await post('/api/store/scan',{rootPath:warehouse},'tasks-interrupted-0001');eq(interrupted.status,202)
 let lock=JSON.parse(fs.readFileSync(path.join(root,'database','operation-tasks','active.json'),'utf8'))
 for(let i=0;i<100&&lock.pid===child!.pid;i++){await sleep(10);lock=JSON.parse(fs.readFileSync(path.join(root,'database','operation-tasks','active.json'),'utf8'))}
 assert.notEqual(lock.pid,child!.pid,'Only kill the sealed worker PID, never the server');process.kill(lock.pid,'SIGKILL')
 eq((await done(interrupted.data.task.id)).status,'REVIEW_REQUIRED');const blocked=await post('/api/backup/lossless',{},'tasks-blocked-key-0001');eq(blocked.status,409);eq(blocked.data.notAccepted,true)
 eq((await fetch(base+'/api/settings/low-stock-threshold',{method:'PUT',headers,body:JSON.stringify({value:3})})).status,409)
 await stop();await start();eq((await (await fetch(base+'/api/tasks/'+interrupted.data.task.id)).json() as any).status,'REVIEW_REQUIRED')
 const ack=await fetch(base+'/api/tasks/'+interrupted.data.task.id+'/acknowledge',{method:'POST',headers,body:JSON.stringify({confirmed:true})});eq(ack.status,200)
 eq((await post('/api/store/scan',{rootPath:warehouse},'tasks-interrupted-0001')).data.task.status,'FAILED')
 const final=await post('/api/store/scan',{rootPath:warehouse},'tasks-final-scan-0001');eq((await done(final.data.task.id)).result.summary.registeredImages,3)
 eq((await fetch(base+'/api/tasks/invalid-id')).status,404)
 console.log(`TASK_PROGRESS_HTTP PASS: ${checks} assertions; worker/SSE, same-key replay before/after restart, scoped roots/origin, batch registration, receipt source retained, verified backup, error and hard-killed worker fail-closed, review acknowledgement without replay`)
}finally{await stop();fs.rmSync(root,{recursive:true,force:true})}
