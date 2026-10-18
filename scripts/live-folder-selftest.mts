import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {setTimeout as delay} from 'node:timers/promises'
import {spawn} from 'node:child_process'
import net from 'node:net'
import {DatabaseSync} from 'node:sqlite'
import sharp from 'sharp'
import {bootstrapSalesDrafts} from '../apps/api/src/salesSchema.js'
import {bootstrapSalesExecution,salesExecutionService,salesActivity} from '../apps/api/src/salesExecution.js'
import {salesDraftService} from '../apps/api/src/salesDrafts.js'
import {salesPreflightService} from '../apps/api/src/salesPreflight.js'
import {createWarehouseLive} from '../apps/api/src/warehouseLive.js'
import {createLiveFolderSync} from '../apps/web/src/liveFolderSync.ts'
import {readCloudSourceSnapshot} from '../apps/web/src/cloudSyncAudit.ts'
import {createSalesBackup,restoreSalesBackup} from '../apps/api/src/salesBackup.js'
const base=fs.mkdtempSync(path.join(os.tmpdir(),'mc-live-folder-')),root=path.join(base,'warehouse'),dir=path.join(root,'Test','S'),file=path.join(base,'shop.db')
fs.mkdirSync(dir,{recursive:true});let db=new DatabaseSync(file),now=1000,busy=false,changes=0
bootstrapSalesDrafts(db);db.exec("INSERT INTO products(id,product_code,name) VALUES(1,'P1','Test');INSERT INTO product_variants(id,product_id,sku,size,cost_price,sale_price) VALUES(1,1,'P1-S','S',12000,50000)");bootstrapSalesExecution(db,base)
let live=createWarehouseLive(db,root,()=>busy,()=>changes++,{clock:()=>now,settleMs:1000})
const count=(table:string)=>Number(db.prepare('SELECT COUNT(*) n FROM '+table).get()!.n)
const photo=async(name:string,color:string)=>{const p=path.join(dir,name);await sharp({create:{width:90,height:120,channels:3,background:color}}).png().toFile(p);return p}
async function settle(){await live.inspect();now+=1500;return live.inspect()}
let checks=0;function eq(a:unknown,b:unknown){assert.deepEqual(a,b);checks++}
try{
 const first=await photo('original.png','#112233');eq((await live.inspect()).ready,false);eq(count('product_images'),0);now+=1500;eq((await live.inspect()).ready,true);eq(count('product_images'),1);eq(count('inventory_transactions'),1)
 const firstId=Number(db.prepare('SELECT id FROM product_images').get()!.id)
 const firstState=live.snapshot();assert(firstState.pendingSync);live.acknowledge(firstState.revision);eq(live.snapshot().pendingSync,false)
 for(let i=0;i<4;i++)await live.inspect();eq(count('inventory_transactions'),1);eq(changes,1)
 db.exec('UPDATE product_variants SET cost_price=23000,sale_price=69000 WHERE id=1')
 const second=await photo('second.png','#334455');await settle();eq(count('product_images'),2);eq(count('inventory_transactions'),2);eq(db.prepare('SELECT cost_price FROM product_variants').get()!.cost_price,23000);eq(db.prepare('SELECT unit_cost FROM inventory_transactions ORDER BY id DESC LIMIT 1').get()!.unit_cost,23000)
 const duplicate=path.join(dir,'duplicate.png');fs.copyFileSync(first,duplicate);await settle();eq(count('product_images'),2);assert(live.snapshot().error.includes('trùng'));fs.unlinkSync(duplicate);await settle()
 const partial=path.join(dir,'partial.png');fs.writeFileSync(partial,'unfinished');await settle();eq(count('product_images'),2);await photo('partial.png','#778899');await settle();eq(count('product_images'),3)
 const unknown=path.join(root,'Test','New size');fs.mkdirSync(unknown);fs.copyFileSync(first,path.join(unknown,'new.png'));await settle();eq(count('product_variants'),1);eq(count('product_images'),3);assert(live.snapshot().pending>0)
 const renamed=path.join(dir,'renamed.png');fs.renameSync(first,renamed);await settle();eq(count('product_images'),3);eq(db.prepare('SELECT file_path FROM product_images WHERE id=?').get(firstId)!.file_path,renamed);eq(count('inventory_transactions'),3)
 // Native events while another warehouse operation is busy must wait, never import twice.
 busy=true;const queued=await photo('queued.png','#abc123');await live.inspect();eq(count('product_images'),3);busy=false;await settle();eq(count('product_images'),4)
 const saved=live.snapshot().revision;live.acknowledge(saved-1);eq(live.snapshot().pendingSync,true);assert.throws(()=>live.acknowledge(saved+1));live.acknowledge(saved)
 fs.unlinkSync(second);await settle();eq(live.present(second),false);eq(count('product_images'),4);eq(count('inventory_transactions'),4);eq(count('sales_confirmations'),0)
 // All photos may be removed intentionally while the known folder tree remains readable.
 fs.unlinkSync(renamed);fs.unlinkSync(partial);fs.unlinkSync(queued);await settle();eq(live.snapshot().allMissingConfirmed,true);eq(live.present(renamed),false)
 const page={instance:'fixture',images:[{id:firstId}],sourceState:[{id:firstId,present:false}],sourceGuard:{healthy:true,revision:live.snapshot().revision,allMissingConfirmed:true},done:true}
 eq((await readCloudSourceSnapshot(async()=>page)).length,1);await assert.rejects(()=>readCloudSourceSnapshot(async()=>({...page,sourceGuard:undefined})));await assert.rejects(()=>readCloudSourceSnapshot(async()=>({...page,sourceGuard:{...page.sourceGuard,healthy:false}})))
 const away=path.join(base,'disconnected');fs.renameSync(root,away);eq((await live.inspect()).ready,false);assert.throws(()=>live.present(renamed));fs.mkdirSync(root);eq((await live.inspect()).phase,'ERROR');fs.rmdirSync(root);fs.renameSync(away,root);await settle();eq(live.snapshot().ready,true)
 // Missing/modified originals never turn a restored SOLD image into new inventory.
 const salePhoto=await photo('sold.png','#456789');await settle();const saleId=Number(db.prepare('SELECT id FROM product_images WHERE file_path=?').get(salePhoto)!.id),original=fs.readFileSync(salePhoto)
 const draft=salesDraftService(db,base).create({items:[{imageId:saleId,unitPrice:69000}],discount:0,note:''},'live-draft-sale-0001'),token=(await salesPreflightService(db,base).check(draft.id,1)).token
 await salesExecutionService(db,base).confirm(draft.id,{version:1,token,confirmed:true,acknowledgeZeroPrice:false},'live-confirm-sale-0001');await settle()
 fs.writeFileSync(path.join(dir,'sold-copy.png'),original);await settle();eq(count('product_images'),5);assert(live.snapshot().error.includes('đã bán'));fs.unlinkSync(path.join(dir,'sold-copy.png'));await settle()
 // Persistent pending revisions survive service/database restart without repeating IMPORT.
 const pendingRevision=live.snapshot().revision;live.close();db.close();db=new DatabaseSync(file);live=createWarehouseLive(db,root,()=>busy,()=>changes++,{clock:()=>now,settleMs:1000});eq(live.snapshot().revision,pendingRevision);eq(live.snapshot().pendingSync,true);await settle();eq(count('inventory_transactions'),5)
 // Backup and portable restore retain cache evidence, but bind the restored warehouse anew.
 assert.throws(()=>createSalesBackup(db,file,base),'Lossless backup must not claim to contain genuinely missing originals')
 for(const [name,color] of [['renamed.png','#112233'],['second.png','#334455'],['partial.png','#778899'],['queued.png','#abc123']])await photo(name,color)
 await settle();eq(count('inventory_transactions'),5)
 const backup=createSalesBackup(db,file,base),restored=restoreSalesBackup(backup.directory,path.join(base,'restore-copy'),root),copy=new DatabaseSync(restored.database)
 const copyLive=createWarehouseLive(copy,path.join(base,'restore-copy','warehouse'),()=>false,()=>{},{clock:()=>now,settleMs:1});await copyLive.inspect();now+=100;await copyLive.inspect();eq(Number(copy.prepare('SELECT COUNT(*) n FROM inventory_transactions').get()!.n),5);copyLive.close();copy.close()
 // Real fs.watch + polling fallback, with no manual scan or browser refresh.
 live.close();live=createWarehouseLive(db,root,()=>busy,()=>changes++,{settleMs:50});live.start();const native=await photo('native.png','#fedcba')
 for(let i=0;i<100&&!db.prepare('SELECT 1 FROM product_images WHERE file_path=?').get(native);i++)await delay(100)
 assert(db.prepare('SELECT 1 FROM product_images WHERE file_path=?').get(native),'Native folder intake timed out');eq(count('inventory_transactions'),6)
 fs.unlinkSync(native);for(let i=0;i<100;i++){if(live.snapshot().ready&&!live.present(native))break;await delay(100)}eq(live.present(native),false)
 // Production HTTP middleware and monitor startup, not a simulated scan callback.
 live.close();db.prepare("INSERT INTO app_settings(key,value) VALUES('warehouse-watch',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({rootPath:root,startup:false,periodic:false,intervalSeconds:300,autoRename:false,popup:true}));db.close()
 const socket=net.createServer();await new Promise<void>(r=>socket.listen(0,'127.0.0.1',r));const port=(socket.address() as any).port;await new Promise<void>(r=>socket.close(()=>r()))
 let logs='';const server=spawn(process.execPath,['--import','tsx','apps/api/src/server.ts'],{env:{...process.env,PORT:String(port),SHOP_HOST:'127.0.0.1',SHOP_DB_PATH:file,SHOP_SANDBOX_ROOT:base,SHOP_ENABLE_V2_DRAFTS:'1',SHOP_ENABLE_V2_SALES:'1',SHOP_LIVE_WAREHOUSE:'1'},stdio:['ignore','pipe','pipe']});server.stdout.on('data',x=>logs+=x);server.stderr.on('data',x=>logs+=x)
 const api=async(route:string)=>{const response=await fetch('http://127.0.0.1:'+port+'/api'+route),body=await response.json();assert(response.ok,JSON.stringify(body));return body}
 async function waitRevision(after=-1){for(let i=0;i<150;i++){if(server.exitCode!==null)throw Error(logs);try{const state=(await api('/cloud/state')).live;if(state.ready&&state.revision>after)return state}catch{}await delay(100)}throw Error('HTTP folder monitor did not settle: '+logs)}
 const streamAbort=new AbortController()
 try{
  const initial=await waitRevision(),events=await fetch('http://127.0.0.1:'+port+'/api/cloud/live/events',{signal:streamAbort.signal});eq(events.headers.get('content-type')?.startsWith('text/event-stream'),true);const reader=events.body!.getReader();await reader.read()
  const httpPhoto=await photo('http-live.png','#765432');const added=await waitRevision(initial.revision),catalog=await api('/cloud/catalog'),image=catalog.images.find((i:any)=>catalog.sourceState.some((s:any)=>s.id===i.id&&s.present)&&i.id===Math.max(...catalog.images.map((i:any)=>i.id)))
  const pushed=new TextDecoder().decode((await reader.read()).value);assert(pushed.includes('"revision":'+added.revision),'Folder changes push immediately over the open stream');assert(!pushed.includes('"root"'),'No local path in event frames')
  assert(image);eq(catalog.sourceGuard.revision,added.revision);eq(catalog.sourceGuard.healthy,true)
  const response=await fetch('http://127.0.0.1:'+port+'/api/cloud/images/'+image.id);eq(response.status,200);assert(Number(response.headers.get('content-length'))<=150000)
  fs.unlinkSync(httpPhoto);await waitRevision(added.revision);const removed=await api('/cloud/catalog');eq(removed.sourceState.find((s:any)=>s.id===image.id).present,false)
 }finally{streamAbort.abort();if(server.exitCode===null)await new Promise<void>(r=>{server.once('exit',()=>r());server.kill()});db=new DatabaseSync(file)}
 // A manual receipt/import that commits during async decoding wins its identity.
 const concurrentRoot=path.join(base,'concurrent'),concurrentPhoto=path.join(concurrentRoot,'Test','S','concurrent.png');fs.mkdirSync(path.dirname(concurrentPhoto),{recursive:true});await sharp({create:{width:40,height:50,channels:3,background:'#551177'}}).png().toFile(concurrentPhoto)
 const other=new DatabaseSync(path.join(base,'concurrent.db'));bootstrapSalesDrafts(other);other.exec("INSERT INTO products(id,product_code,name) VALUES(1,'P1','Test');INSERT INTO product_variants(id,product_id,sku,size,cost_price,sale_price) VALUES(1,1,'P1-S','S',12000,50000)")
 let blockedChecks=0
 const concurrent=createWarehouseLive(other,concurrentRoot,()=>{blockedChecks++;if(blockedChecks===3){other.prepare('INSERT INTO product_images(product_id,variant_id,file_path) VALUES(1,1,?)').run(concurrentPhoto);other.exec("INSERT INTO inventory_transactions(variant_id,transaction_type,quantity,unit_cost) VALUES(1,'IMPORT',1,12000)")}return false},()=>{},{clock:()=>now,settleMs:1})
 try{await concurrent.inspect();now+=100;eq((await concurrent.inspect()).ready,false);await concurrent.inspect();now+=100;await concurrent.inspect();eq(Number(other.prepare('SELECT COUNT(*) n FROM product_images').get()!.n),1);eq(Number(other.prepare('SELECT COUNT(*) n FROM inventory_transactions').get()!.n),1)}finally{concurrent.close();other.close()}
 // Durable Windows revision + serial runner handle offline, retries and mid-upload events.
 let online=false,blocked=false,syncs=0,ack=0,revision=1,time=0,release:()=>void=()=>{},errors=0
 const runner=createLiveFolderSync({online:()=>online,busy:()=>blocked,clock:()=>time,read:async()=>({enabled:true,live:{ready:true,pendingSync:revision>ack}}),onState:()=>{},onError:()=>errors++,sync:async()=>{syncs++;const start=revision;if(syncs===1)await new Promise<void>(r=>release=r);if(syncs===3)return false;ack=start;return true}})
 await runner.tick();eq(syncs,0);online=true;blocked=true;await runner.tick();eq(syncs,0);blocked=false;const initial=runner.tick();await delay(0);revision=2;runner.request();release();await initial;await delay(0);await runner.tick();eq(syncs,2);eq(ack,2)
 revision=3;await runner.tick();eq(syncs,3);await runner.tick();eq(syncs,3);time=1000;await runner.tick();eq(syncs,4);eq(ack,3);eq(errors,0);runner.close()
 console.log('LIVE_FOLDER PASS: '+checks+' checks; settled/partial photos, exact-once IMPORT, duplicate/SOLD guards, pending new Size, current prices, rename identity, physical deletion/empty stock, disconnected roots, durable restart, backup/restore, native watch and serial offline/retry queue')
}finally{live.close();db.close();salesActivity.busy=false;fs.rmSync(base,{recursive:true,force:true})}
