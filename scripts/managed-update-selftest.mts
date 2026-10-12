import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {DatabaseSync} from 'node:sqlite'
import sharp from 'sharp'
import {bootstrapSalesDrafts} from '../apps/api/src/salesSchema.ts'
import {salesDraftService} from '../apps/api/src/salesDrafts.ts'
import {bootstrapSalesExecution,salesExecutionService} from '../apps/api/src/salesExecution.ts'
import {salesPreflightService} from '../apps/api/src/salesPreflight.ts'
import {migrate} from './install-managed.mjs'
import {inspect,database,digest,read,atomic,extract,snapshot,sameDatabase,copyVerified,latest} from './managed-core.mjs'
import {launch,activate,activeRelease,run} from './managed-runtime.mjs'
if(process.argv[2]==='worker'){
 const h=process.argv[3],project=path.resolve('.');
 await run(h,{
  getLatest:async()=>{const m=read(path.join(h,'fake-network.json'));if(m.mode==='ci-fail')throw Error('FAKE CI chưa PASS');return {commit:'c'.repeat(40)}},
  downloadRelease:async(_r:any,target:string)=>{copyVerified(project,target,{code:true});if(read(path.join(h,'fake-network.json')).mode==='network-fail')throw Error('FAKE mất mạng khi tải')},
  prepareRelease:async(target:string)=>{if(read(path.join(h,'fake-network.json')).mode==='build-fail')throw Error('FAKE build lỗi');fs.cpSync(path.join(project,'apps/api/dist'),path.join(target,'apps/api/dist'),{recursive:true});fs.cpSync(path.join(project,'apps/web/dist'),path.join(target,'apps/web/dist'),{recursive:true});fs.symlinkSync(path.join(project,'node_modules'),path.join(target,'node_modules'),'junction');assert(fs.statSync(path.join(target,'apps','api','dist','server.js')).isFile())}
 });process.exit(0)
}
const base=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'mc-managed-'))),source=path.join(base,'Shop cũ có dấu'),home=path.join(base,'Dữ liệu cố định'),warehouse=path.join(base,'Kho ảnh cũ'),commit='a'.repeat(40),next='b'.repeat(40),root=path.join(source,'data','stage6-main-test'),file=path.join(root,'database','shop-stage6-main-test.db'),project=path.resolve('.')
let app:any,manager:any
try{
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.mkdirSync(warehouse);fs.writeFileSync(path.join(source,'START_SHOP.bat'),'OLD STARTER');fs.writeFileSync(path.join(source,'MO_SHOP.vbs'),'OLD VBS');atomic(path.join(root,'warehouse-config.json'),{format:1,warehouse});
 const db=new DatabaseSync(file);bootstrapSalesDrafts(db);bootstrapSalesExecution(db,root);
 db.exec("INSERT INTO app_metadata(key,value) VALUES('cloud-instance','fake-original-instance'),('cloud-authority','enabled'),('warehouse_layout','DIRECT');INSERT INTO products(id,product_code,name) VALUES(1,'TEST','Áo thử');INSERT INTO product_variants(id,product_id,sku,size,cost_price,sale_price) VALUES(1,1,'TEST-S1','S1',10000,50000);INSERT INTO inventory_transactions(variant_id,transaction_type,quantity) VALUES(1,'OPENING',2)");
 db.prepare("INSERT INTO app_settings(key,value) VALUES('warehouse-watch',?)").run(JSON.stringify({rootPath:warehouse,startup:false,periodic:false,intervalSeconds:300,autoRename:false,popup:true}));
 const photo=path.join(warehouse,'Áo thử','S1','1.png'),photo2=path.join(warehouse,'Áo thử','S1','2.png');fs.mkdirSync(path.dirname(photo),{recursive:true});await sharp({create:{width:60,height:80,channels:3,background:'#ffeeab'}}).png().toFile(photo);await sharp({create:{width:60,height:80,channels:3,background:'#ffeedd'}}).png().toFile(photo2);
 db.prepare('INSERT INTO product_images(id,product_id,variant_id,file_path) VALUES(1,1,1,?),(2,1,1,?)').run(photo,photo2);
 const drafts=salesDraftService(db,warehouse),draft=drafts.create({items:[{imageId:2,unitPrice:50000}],discount:0,note:'FAKE'},'managed-create-order-0001');const pre=await salesPreflightService(db,warehouse).check(draft.id,1);await salesExecutionService(db,warehouse).confirm(draft.id,{version:1,token:pre.token,confirmed:true,acknowledgeZeroPrice:false},'managed-fixture-sale-0001');db.close();
 const before=inspect(file),photoHash=digest(fs.readFileSync(photo));
 const lock=path.join(warehouse,'.mecacao-local-runtime.lock');atomic(lock,{format:1,pid:process.pid,database:file,configSha:'stage4-fresh'});await assert.rejects(()=>migrate(source,home,project,commit),/vẫn đang chạy/);assert.equal(fs.existsSync(home),false);fs.unlinkSync(lock);
 const actualFetch=globalThis.fetch;try{globalThis.fetch=(async(url:any)=>new Response(JSON.stringify(String(url).includes('/commits/')?{sha:commit,commit:{message:'FAKE'}}:{workflow_runs:[{head_sha:commit,head_branch:'main',path:'.github/workflows/pages.yml',status:'completed',conclusion:'failure'}]}))) as typeof fetch;await assert.rejects(()=>latest(),/chưa vượt qua CI/);globalThis.fetch=(async(url:any)=>new Response(JSON.stringify(String(url).includes('/commits/')?{sha:commit,commit:{message:'FAKE'}}:{workflow_runs:[{head_sha:commit,head_branch:'main',path:'.github/workflows/pages.yml',status:'completed',conclusion:'success',id:99,html_url:'FAKE'}]}))) as typeof fetch;assert.equal((await latest()).commit,commit)}finally{globalThis.fetch=actualFetch}

 const prepareProgram=async(target:string)=>{fs.cpSync(path.join(project,'apps/api/dist'),path.join(target,'apps/api/dist'),{recursive:true});fs.cpSync(path.join(project,'apps/web/dist'),path.join(target,'apps/web/dist'),{recursive:true});fs.symlinkSync(path.join(project,'node_modules'),path.join(target,'node_modules'),'junction');assert(fs.statSync(path.join(target,'apps','api','dist','server.js')).isFile())};
 await migrate(source,home,project,commit,{prepareProgram});sameDatabase(before,inspect(database(home)));sameDatabase(before,inspect(file));assert.equal(digest(fs.readFileSync(photo)),photoHash);assert.equal(read(path.join(home,'installation.json')).warehouse,warehouse);assert.equal(read(path.join(root,'managed-installation.json')).home,home);assert(fs.readFileSync(path.join(source,'START_SHOP.bat'),'utf8').includes('managed-installation.json'));
 await assert.rejects(()=>migrate(source,home,project,commit,{prepareProgram}),/đã tồn tại/);
 const old=activeRelease(home);app=await launch(home,old);const origin='http://127.0.0.1:3000';let response=await fetch(origin+'/api/settings/low-stock-threshold',{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({value:4})});assert.equal(response.status,503,'Candidate starts read-only');
 app.child.send({type:'managed:enable'});await new Promise(r=>setTimeout(r,100));response=await fetch(origin+'/api/local/update');const state=await response.json();assert.equal(state.managed,true);assert.equal(state.database,database(home));
 response=await fetch(origin+'/api/settings/low-stock-threshold',{method:'PUT',headers:{Origin:'https://evil.invalid','Content-Type':'application/json'},body:JSON.stringify({value:4})});assert.equal(response.status,403,'Foreign origin cannot mutate');
 app.child.send('SHOP_LOCAL_CLOSE');await app.exited;app=null;const proof=snapshot(home,'test');
 // A candidate startup failure must preserve the active release and restore an
 // independently verified DB snapshot, including SOLD and cloud identity.
 await assert.rejects(()=>activate(home,{commit:next,path:'not-used'},old,proof,async()=>{const d=new DatabaseSync(database(home));d.exec("UPDATE products SET name='BAD CANDIDATE'");d.close();throw Error('fake failed boot')}),/fake failed boot/);sameDatabase(before,inspect(database(home)));assert.equal(activeRelease(home).commit,commit);assert.equal(digest(fs.readFileSync(photo)),photoHash);
 const candidate=path.join(home,'releases',next);fs.mkdirSync(candidate);fs.cpSync(path.join(old.path,'apps'),path.join(candidate,'apps'),{recursive:true});fs.mkdirSync(path.join(candidate,'scripts'));fs.cpSync(path.join(old.path,'scripts'),path.join(candidate,'scripts'),{recursive:true});fs.symlinkSync(path.join(project,'node_modules'),path.join(candidate,'node_modules'),'junction');
 app=await activate(home,{commit:next,path:candidate},old,proof);assert.equal(activeRelease(home).commit,next);sameDatabase(before,inspect(database(home)));app.child.send('SHOP_LOCAL_CLOSE');await app.exited;app=null;
 // Real coordinator and host HTTP endpoint: unpassed CI, interrupted download,
 // failed build, then successful retry without resetting data or duplicating SOLD.
 atomic(path.join(home,'fake-network.json'),{mode:'ci-fail'});
 manager=spawn(process.execPath,['--import','tsx','scripts/managed-update-selftest.mts','worker',home],{cwd:project,env:{...process.env,SHOP_NO_BROWSER:'1'},stdio:['ignore','pipe','pipe','ipc']});let logs='';manager.stdout.on('data',(b:any)=>logs+=b);manager.stderr.on('data',(b:any)=>logs+=b);
 async function waitPhase(phases:string[],previousTime=''){for(let i=0;i<200;i++){if(manager.exitCode!==null)throw Error('Manager exited '+logs);try{const s=read(path.join(home,'update-status.json'));if(phases.includes(s.phase)&&s.updatedAt!==previousTime)return s}catch{}await new Promise(r=>setTimeout(r,100))}throw Error('Update phase timeout '+logs+' '+JSON.stringify(read(path.join(home,'update-status.json'))))}
 await waitPhase(['IDLE']);
 if(process.platform==='win32'){
  const env={...process.env,SHOP_NO_BROWSER:'1'};
  const bat=spawnSync('cmd.exe',['/d','/c','START_SHOP.bat'],{cwd:source,env,encoding:'utf8',timeout:15000});assert.equal(bat.status,0,bat.stdout+' '+bat.stderr);
  const vbs=spawnSync('cscript.exe',['//Nologo',path.join(home,'MO_SHOP.vbs')],{cwd:home,env,encoding:'utf8',timeout:15000});assert.equal(vbs.status,0,vbs.stdout+' '+vbs.stderr);
 }

 for(const mode of ['ci-fail','network-fail','build-fail']){const previousTime=read(path.join(home,'update-status.json')).updatedAt;atomic(path.join(home,'fake-network.json'),{mode});response=await fetch(origin+'/api/local/update',{method:'POST',headers:{Origin:origin}});assert.equal(response.status,202);const failed=await waitPhase(['FAILED'],previousTime);assert(failed.message.includes('FAKE'));assert.equal(activeRelease(home).commit,next);sameDatabase(before,inspect(database(home)));assert.equal((await fetch(origin+'/api/health')).status,200)}
 atomic(path.join(home,'fake-network.json'),{mode:'success'});response=await fetch(origin+'/api/local/update',{method:'POST',headers:{Origin:origin}});assert.equal(response.status,202);await waitPhase(['SUCCEEDED']);assert.equal(activeRelease(home).commit,'c'.repeat(40));sameDatabase(before,inspect(database(home)));assert.equal(digest(fs.readFileSync(photo)),photoHash);
 manager.send('SHOP_MANAGED_CLOSE');await new Promise(r=>manager.once('exit',r));manager=null;
 // Failed initial preparation must not redirect old launchers or alter source.
 const failedHome=path.join(base,'Failed install'),source2=path.join(base,'Other old shop');fs.cpSync(source,source2,{recursive:true});fs.unlinkSync(path.join(source2,'data/stage6-main-test/managed-installation.json'));fs.writeFileSync(path.join(source2,'START_SHOP.bat'),'UNCHANGED');await assert.rejects(()=>migrate(source2,failedHome,project,commit,{prepareProgram:async()=>{throw Error('fake build failed')}}),/fake build failed/);assert.equal(fs.readFileSync(path.join(source2,'START_SHOP.bat'),'utf8'),'UNCHANGED');sameDatabase(before,inspect(path.join(source2,'data/stage6-main-test/database/shop-stage6-main-test.db')));await migrate(source2,failedHome,project,commit,{prepareProgram});sameDatabase(before,inspect(database(failedHome)));assert(fs.readdirSync(base).some(n=>n.startsWith('Failed install-failed-')));
 for(const bad of ['repo/../../bad','repo/a\\bad','repo/C:/bad','repo/../bad','repo/a./bad'])assert.throws(()=>extract({[bad]:new Uint8Array([1])},path.join(base,'zip-'+Math.random())),/không an toàn/);
 console.log('PASS managed Windows: transfer exact database/business history/cloud instance, real SOLD archive retention, source and photos unchanged, failed migration refusal, real HTTP startup write fence/origin guard, candidate failure snapshot restoration, successful release switch and real HTTP one-button coordinator, CI refusal, lost-download/build-failure retries, repeated migration refusal, ZIP traversal rejection.');
}finally{if(manager&&manager.exitCode===null){manager.send('SHOP_MANAGED_CLOSE');await new Promise(r=>manager.once('exit',r))}if(app?.child.connected){app.child.send('SHOP_LOCAL_CLOSE');await app.exited}fs.rmSync(base,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
