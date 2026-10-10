import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {DatabaseSync} from 'node:sqlite'
import {setTimeout as sleep} from 'node:timers/promises'
import sharp from 'sharp'
import {bootstrapV100} from '../apps/api/dist/schema.js'
import {digest} from '../apps/api/dist/salesExecution.js'
import {verifyLosslessBackup} from '../apps/api/dist/losslessVerify.js'

const root=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-local-review-http-')),source=path.join(root,'nguồn kho'),old=path.join(source,'warehouse'),bundle=path.join(root,'backup đầy đủ'),dbPath=path.join(source,'shop.db'),appdata=path.join(root,'AppData'),base='http://127.0.0.1:3017'
const env={...process.env,LOCALAPPDATA:appdata,SHOP_NO_OPEN_BROWSER:'1'}
let launcher,logs='',checks=0
const eq=(a,b)=>{assert.deepEqual(a,b);checks++}
async function api(url,method='GET',body,expected=200,headers={}){const r=await fetch(base+url,{method,headers:{Origin:base,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)}),data=await r.json();eq(r.status,expected);return data}
async function start(){logs='';launcher=spawn(process.execPath,['scripts/run-local-v2-review.mjs'],{env,stdio:['pipe','pipe','pipe','ipc']});let chosen=false;launcher.stdout.on('data',chunk=>{logs+=chunk;if(!chosen&&logs.includes('Chọn số gói')){chosen=true;launcher.stdin.write('1\n')}});launcher.stderr.on('data',x=>logs+=x);for(let i=0;i<150;i++){if(launcher.exitCode!==null)throw Error(logs);try{const h=await api('/api/health');if(h.localV2Review)return h}catch{}await sleep(100)}throw Error('Review launcher timeout: '+logs)}
async function stop(){if(launcher&&launcher.exitCode===null){const p=launcher;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Launcher shutdown timeout')),15000);p.once('exit',()=>{clearTimeout(timer);resolve()});p.send('stop')})}launcher=null}
async function checkReleaseCLI(expected){
 const child=spawn(process.execPath,['scripts/check-local-v2-release.mjs'],{env,stdio:['pipe','pipe','pipe']});let text='',first=false,second=false
 child.stdout.on('data',chunk=>{text+=chunk;if(!first&&text.includes('Chọn số gói: ')){first=true;child.stdin.write('1\n')}if(!second&&text.includes('Thư mục backup đầy đủ V1 cuối')){second=true;child.stdin.write('"'+bundle+'"\n')}});child.stderr.on('data',x=>text+=x)
 const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('Release check timeout '+text))},30000);child.once('exit',code=>{clearTimeout(timer);resolve(code)})})
 eq(code,expected==='BLOCKED'?1:0);assert(text.includes('KIỂM TRA LOCAL V2: '+expected));checks++;assert(text.includes('chưa cho phép kích hoạt kinh doanh'));checks++
}
try{
 fs.mkdirSync(path.join(old,'Mẫu có dấu','Size 1'),{recursive:true});fs.mkdirSync(bundle)
 const file=path.join(old,'Mẫu có dấu','Size 1','001.png');await sharp({create:{width:32,height:40,channels:3,background:'#aadecc'}}).png().toFile(file)
 const original=digest(fs.readFileSync(file)),db=new DatabaseSync(dbPath);bootstrapV100(db)
 db.exec("INSERT INTO products(id,product_code,name) VALUES(9,'TEST01','Mẫu có dấu');INSERT INTO product_variants(id,product_id,sku,size,cost_price,sale_price) VALUES(13,9,'TEST01-S1','Size 1',10000,50000);INSERT INTO inventory_transactions(id,variant_id,transaction_type,quantity) VALUES(27,13,'OPENING',8)")
 db.prepare('INSERT INTO product_images(id,product_id,variant_id,file_path) VALUES(31,9,13,?)').run(file);db.exec("VACUUM INTO '"+path.join(bundle,'shop.db').replace(/'/g,"''")+"'");db.close()
 fs.copyFileSync(file,path.join(bundle,'31.png'));fs.writeFileSync(path.join(bundle,'lossless-manifest.json'),JSON.stringify({version:1,mode:'lossless-recovery',database:'shop.db',database_sha256:digest(fs.readFileSync(path.join(bundle,'shop.db'))),files:[{id:31,source_path:file,backup_path:'31.png',size:fs.statSync(file).size,sha256:original}]}))
 const sourceHash=digest(fs.readFileSync(dbPath))
 // Drive the actual interactive preparation script using the two observed prompts.
 const setup=spawn(process.execPath,['scripts/prepare-local-v2.mjs'],{env,stdio:['pipe','pipe','pipe']});let output='',first=false,second=false
 setup.stdout.on('data',chunk=>{output+=chunk;if(!first&&output.includes('Thư mục backup đầy đủ V1: ')){first=true;setup.stdin.write('"'+bundle+'"\n')}if(!second&&output.includes('Đường dẫn kho gốc')){second=true;setup.stdin.write('"'+old+'"\n')}});setup.stderr.on('data',chunk=>output+=chunk)
 const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{setup.kill();reject(Error('Prepare CLI timeout '+output))},60000);setup.once('exit',code=>{clearTimeout(timer);resolve(code)})});eq(code,0);assert(output.includes('READY_FOR_REVIEW'));checks++
 const prepBase=path.join(appdata,'ShopMeCaCao','V2LocalPreparation'),packages=fs.readdirSync(prepBase);eq(packages.length,1)
 const ready=JSON.parse(fs.readFileSync(path.join(prepBase,packages[0],'local-v2-ready.json'),'utf8'));eq(ready.candidate.schema,130);eq(ready.activated,false)
 await checkReleaseCLI('TECHNICALLY_READY_FOR_REVIEW')
 const health=await start();eq(health.schema,130);eq(health.sandbox,true);eq(health.salesExecution,true);eq((await api('/api/inventory/dashboard')).stock,1)
 eq((await api('/api/products'))[0].total_stock,1)
 await api('/api/store/scan','POST',{rootPath:old},403)
 const draft=await api('/api/sales/drafts','POST',{items:[{imageId:31,unitPrice:50000}],discount:1000,note:'Bán trên bản sao'},201,{'Idempotency-Key':'local-review-draft-key-001'})
 const pre=await api('/api/sales/drafts/'+draft.id+'/preflight','POST',{version:1})
 const sold=await api('/api/sales/drafts/'+draft.id+'/confirm','POST',{version:1,token:pre.token,confirmed:true,acknowledgeZeroPrice:false},200,{'Idempotency-Key':'local-review-confirm-key-001'})
 eq(sold.status,'SOLD');eq(sold.total,49000);eq((await api('/api/inventory/dashboard')).stock,0)
 const backup=await api('/api/backup/lossless','POST',{},201);eq(verifyLosslessBackup(backup.backup.directory).soldImagesVerified,1)
 await stop();await start();eq((await api('/api/inventory/dashboard')).stock,0);eq((await api('/api/sales/drafts/'+draft.id)).status,'SOLD')
 const rollback=new DatabaseSync(ready.rollbackProof.database,{readOnly:true});try{eq(rollback.prepare("SELECT value FROM app_metadata WHERE key='schema_version'").get().value,'110');eq(rollback.prepare('SELECT quantity FROM inventory_transactions WHERE id=27').get().quantity,8)}finally{rollback.close()}
 eq(digest(fs.readFileSync(dbPath)),sourceHash);eq(digest(fs.readFileSync(file)),original);eq(fs.existsSync(path.join(ready.candidate.warehouse,'Mẫu có dấu','Size 1','001.png')),false)
 if(process.platform!=='win32'&&process.env.V2_SKIP_BROWSER!=='1')await browserReview()
 await stop()
 await checkReleaseCLI('BLOCKED')
 const reportDir=path.join(prepBase,packages[0],'release-reports'),reports=fs.readdirSync(reportDir).filter(n=>n.endsWith('.json')).map(n=>JSON.parse(fs.readFileSync(path.join(reportDir,n),'utf8')))
 eq(reports.length,2);eq(reports.every(r=>r.businessActivationAllowed===false&&r.requiresRecheckAtActivation),true)
 eq(digest(fs.readFileSync(dbPath)),sourceHash)
 console.log(`LOCAL_V2_REVIEW_HTTP PASS: ${checks} assertions; real interactive prepare/review launcher, accented/spaced paths, preserved IDs, physical stock1 vs ledger8, copy-only sale/restart/backup, original path denied, V1 rollback/source unchanged`)
}finally{await stop();fs.rmSync(root,{recursive:true,force:true})}

async function browserReview(){
 const profile=path.join(root,'chrome'),artifact=path.resolve('artifacts/local-v2-review');fs.mkdirSync(profile);fs.mkdirSync(artifact,{recursive:true})
 const executable=process.env.CHROME_BIN||['/usr/bin/google-chrome','/usr/bin/chromium'].find(fs.existsSync);assert(executable,'Chromium required for LOCAL review UI')
 const chrome=spawn(executable,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--no-proxy-server','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'})
 let ws,n=0;const pending=new Map()
 const cmd=(method,params={})=>new Promise((resolve,reject)=>{const id=++n,t=setTimeout(()=>reject(Error(method+' timeout')),15000);pending.set(id,{resolve:r=>{clearTimeout(t);resolve(r)},reject});ws.send(JSON.stringify({id,method,params}))})
 const evaluate=async expression=>{const r=await cmd('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
 try{
  for(let i=0;i<150&&!fs.existsSync(path.join(profile,'DevToolsActivePort'));i++)await sleep(100)
  const port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0],targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})});ws.addEventListener('message',event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}})
  await cmd('Page.enable');await cmd('Runtime.enable');await cmd('Page.navigate',{url:base})
  let loaded=false;for(let i=0;i<100;i++){if(await evaluate("document.querySelector('.sandboxSafetyBanner')?.textContent.includes('BẢN SAO ĐỂ DUYỆT')")){loaded=true;break}await sleep(100)}eq(loaded,true)
  for(const width of [1366,390])for(const dark of [false,true]){
   await cmd('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:768,deviceScaleFactor:1,mobile:width===390})
   await evaluate("document.querySelector('.shell').classList.toggle('themeDark',"+dark+")");await sleep(150)
   eq(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'),true)
   const shot=await cmd('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifact,width+'-'+(dark?'dark':'light')+'.png'),Buffer.from(shot.data,'base64'))
  }
 }finally{ws?.close();if(chrome.exitCode===null)await new Promise(r=>{chrome.once('exit',r);chrome.kill()})}
}
