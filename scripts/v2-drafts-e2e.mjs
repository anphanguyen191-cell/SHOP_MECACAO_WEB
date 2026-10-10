import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import {spawn,spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {setTimeout as sleep} from 'node:timers/promises'
import sharp from 'sharp'

const root=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-v2-http-')),store=path.join(root,'warehouse'),photo=path.join(store,'Mau test','Size 1','001.jpg'),dbPath=path.join(root,'database','drafts.db')
fs.mkdirSync(path.dirname(photo),{recursive:true});fs.mkdirSync(path.dirname(dbPath),{recursive:true})
await sharp({create:{width:300,height:400,channels:3,background:'#9bd6be'}}).jpeg().toFile(photo)
const hash=()=>createHash('sha256').update(fs.readFileSync(photo)).digest('hex'),original=hash()
const sock=net.createServer();await new Promise(r=>sock.listen(0,'127.0.0.1',r));const port=sock.address().port;await new Promise(r=>sock.close(r))
const base='http://127.0.0.1:'+port
let child,logs='',checks=0
async function start(enabled=true){
 logs='';child=spawn(process.execPath,['apps/api/dist/server.js'],{env:{...process.env,PORT:String(port),SHOP_HOST:'127.0.0.1',SHOP_SANDBOX_ROOT:root,SHOP_DB_PATH:dbPath,SHOP_ENABLE_V2_DRAFTS:enabled?'1':''},stdio:['ignore','pipe','pipe']});child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x)
 for(let i=0;i<80;i++){if(child.exitCode!==null)throw Error(logs);try{const r=await fetch(base+'/api/health');if(r.ok)return await r.json()}catch{}await sleep(100)}throw Error('API timeout '+logs)
}
async function stop(){if(child&&child.exitCode===null){const c=child;await new Promise(r=>{c.once('exit',r);c.kill()})}child=null}
async function api(url,method='GET',body,expected=200,headers={}){
 const r=await fetch(base+url,{method,headers:{Origin:base,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)}),j=await r.json();assert.equal(r.status,expected,method+' '+url+': '+JSON.stringify(j));checks++;return j
}
try{
 const health=await start();assert(health.schema===120&&health.salesDrafts&&health.sandbox);checks++
 await api('/api/store/import','POST',{confirmed:true,product:{rootPath:store,name:'Mau test',productCode:'V2TEST',variants:[{size:'Size 1',sku:'V2TEST-S1',images:[photo],openingStock:1,costPrice:10000,salePrice:50000}]}},201)
 const inventory=await api('/api/inventory/explorer'),id=inventory[0].variants[0].images[0].id
 const input={items:[{imageId:id,unitPrice:50000}],discount:5000,note:'test'},key='http-request-key-0001'
 const d=await api('/api/sales/drafts','POST',input,201,{'Idempotency-Key':key})
 assert(d.total===45000&&d.quantity===1&&!d.reservesStock);checks++
 assert((await api('/api/sales/drafts','POST',input,201,{'Idempotency-Key':key})).id===d.id);checks++
 await api('/api/sales/drafts','POST',{...input,discount:1},409,{'Idempotency-Key':key})
 await api('/api/sales/drafts','POST',input,403,{Origin:'https://untrusted.example','Idempotency-Key':'untrusted-request-key'})
 await api('/api/sales/drafts','POST',input,403,{Origin:'','Idempotency-Key':'originless-request-key'})
 await api('/api/sales/drafts/'+d.id,'PUT',{...input,version:1,discount:0})
 await api('/api/sales/drafts/'+d.id,'PUT',{...input,version:1},409)
 const warning=await api('/api/sales/drafts','POST',input,409,{'Idempotency-Key':'http-duplicate-key-002'})
 assert(warning.code==='DRAFT_IMAGE_CONFLICT'&&warning.conflicts[0].orders[0].id===d.id);checks++
 assert((await api('/api/sales/drafts')).length===1);checks++
 const shared=await api('/api/sales/drafts','POST',{...input,conflictToken:warning.conflictToken},201,{'Idempotency-Key':'http-duplicate-key-002'})
 await api('/api/sales/drafts/'+shared.id+'/cancel','POST',{version:1})
 const preview=await api('/api/sales/drafts/'+d.id+'/preview','POST',{version:2})
 assert(preview.readOnly&&preview.quantity===1&&preview.items[0].width===300&&preview.items[0].height===400);checks++
 const light=await fetch(base+'/api/sales/drafts/'+d.id+'/preview/'+id+'?version=2&hash='+preview.items[0].sourceHash);assert(light.ok&&light.headers.get('content-type').includes('image/jpeg')&&light.headers.get('cache-control')==='no-store');checks++
 await api('/api/sales/drafts/'+d.id+'/preview','POST',{version:1},409)
 await api('/api/sales/drafts/'+d.id+'/preview','POST',{version:2},403,{Origin:'https://untrusted.example'})
 const stock=await api('/api/inventory/dashboard');assert(stock.stock===1&&hash()===original);checks++
 const ledger=await api('/api/inventory/history');assert(ledger.length===1&&ledger[0].transaction_type==='OPENING');checks++
 await stop();await start();assert((await api('/api/sales/drafts/'+d.id)).version===2);checks++
 // Actual Chromium exercises the real API and UI, rather than mocking draft writes.
 if(process.platform!=='win32'&&process.env.V2_SKIP_BROWSER!=='1')await browserTest(base,id)
 else console.log('V2 browser SKIPPED on this host; Linux CI must run without V2_SKIP_BROWSER')
 await api('/api/sales/drafts/'+d.id+'/cancel','POST',{version:2})
 assert((await api('/api/inventory/dashboard')).stock===1&&hash()===original);checks++
 await stop()
 const protectedPath=path.join(root,'must-not-open.db')
 const denied=spawnSync(process.execPath,['apps/api/dist/server.js'],{env:{...process.env,SHOP_SANDBOX_ROOT:'',SHOP_DB_PATH:protectedPath,SHOP_ENABLE_V2_DRAFTS:'1'},encoding:'utf8'})
 assert(denied.status!==0&&!fs.existsSync(protectedPath));checks++
 // V1 cannot silently consume a V2 DB.
 const old=spawnSync(process.execPath,['apps/api/dist/server.js'],{env:{...process.env,SHOP_SANDBOX_ROOT:root,SHOP_DB_PATH:dbPath,SHOP_ENABLE_V2_DRAFTS:''},encoding:'utf8'})
 assert(old.status!==0&&old.stderr.includes('schema mới hơn'));checks++
 console.log('V2_DRAFT_HTTP PASS: '+checks+' assertions; real CRUD, same-origin, retry, stale version, restart, sandbox gate, V1 newer-schema refusal, unchanged physical stock/ledger')
}finally{await stop();fs.rmSync(root,{recursive:true,force:true})}

async function browserTest(base,id){
 const chrome=process.env.CHROME_BIN||['/usr/bin/google-chrome','/usr/bin/chromium'].find(fs.existsSync);assert(chrome,'Chromium required for Linux V2 UI test')
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-v2-browser-')),c=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-proxy-server','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'})
 let ws,n=0;const pending=new Map()
 function cmd(method,params={}){return new Promise((resolve,reject)=>{const seq=++n,t=setTimeout(()=>{pending.delete(seq);reject(Error(method+' timeout'))},15000);pending.set(seq,{resolve:x=>{clearTimeout(t);resolve(x)},reject});ws.send(JSON.stringify({id:seq,method,params}))})}
 async function run(expression){const r=await cmd('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
 async function until(expression){for(let i=0;i<100;i++){if(await run(expression))return;await sleep(100)}throw Error('UI wait: '+expression)}
 try{
  for(let i=0;i<150&&!fs.existsSync(path.join(profile,'DevToolsActivePort'));i++)await sleep(100)
  const p=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]),targets=await(await fetch('http://127.0.0.1:'+p+'/json/list')).json()
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})})
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data),cb=pending.get(m.id);if(cb){pending.delete(m.id);m.error?cb.reject(Error(JSON.stringify(m.error))):cb.resolve(m.result)}})
  await cmd('Page.enable');await cmd('Runtime.enable');await cmd('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});await cmd('Page.navigate',{url:base})
  await until("Array.from(document.querySelectorAll('.sidebar button')).some(b=>b.textContent==='Bán hàng')")
  await run("Array.from(document.querySelectorAll('.sidebar button')).find(b=>b.textContent==='Tồn kho').click()")
  await until("!!document.querySelector('.treeProductHead')")
  // Navigate into the gallery using the actual explorer controls.
  await run("document.querySelector('.treeProductHead').click()")
  await until("!!document.querySelector('.treeVariantHead')")
  await run("document.querySelector('.treeVariantHead').click()")
  await until("!!document.querySelector('.stockImageSelect')")
  await run("document.querySelector('.stockImageSelect').click()")
  await until("!!document.querySelector('.imageSendBar')")
  await run("Array.from(document.querySelectorAll('.imageSendActions button')).find(b=>b.textContent==='TẠO ĐƠN NHÁP').click()")
  await until("!!document.querySelector('.draftConflictDialog')")
  assert(await run("document.querySelector('.draftConflictDialog').textContent.includes('bộ đã có trong đơn nháp khác')"));checks++
  await run("document.querySelector('.draftConflictDialog .salesActionSecondary').click()")
  await until("!document.querySelector('.draftConflictDialog') && !document.querySelector('.imageSendActions button').disabled")
  assert((await api('/api/sales/drafts')).length===1,'declining creates no extra order');checks++
  await run("Array.from(document.querySelectorAll('.imageSendActions button')).find(b=>b.textContent==='TẠO ĐƠN NHÁP').click()")
  await until("!!document.querySelector('.draftConflictDialog')")
  for(const width of [1366,390]){
   await cmd('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:768,deviceScaleFactor:1,mobile:width===390})
   assert(await run('document.documentElement.scrollWidth')<=width+2,'conflict modal overflow');checks++
  }
  await run("document.querySelector('.draftConflictDialog .salesActionWarning').click()")
  await until("!!document.querySelector('.salesItem')")
  assert(await run("!!document.querySelector('.draftOverlapBadge')"));checks++
  await run("document.querySelector('.salesPreviewHeading button').click()")
  await until("!!document.querySelector('.salesPreviewCompare')")
  await until("document.querySelector('.salesPreviewCompare figure:nth-child(2) img').naturalWidth>0")
  assert(await run("document.querySelector('.salesPreviewStats').textContent.includes('bộ')"));checks++
  for(const width of [1366,390]){
   await cmd('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:768,deviceScaleFactor:1,mobile:width===390})
   assert(await run('document.documentElement.scrollWidth')<=width+2,'preview overflow');checks++
  }

  assert(await run("getComputedStyle(document.querySelector('.salesHeading .salesActionPrimary')).backgroundColor==='rgb(163, 63, 107)'"));checks++
  assert(await run("document.querySelector('.salesEditorHead').textContent.includes('Phiên bản 1')"));checks++
  await run("(()=>{const i=document.querySelector('.salesMoney input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'1000');i.dispatchEvent(new Event('input',{bubbles:true}))})()")
  await until("!document.querySelector('.salesButtons button').disabled")
  await run("document.querySelector('.salesButtons button').click()")
  await until("document.querySelector('.salesEditorHead').textContent.includes('Phiên bản 2')")
  assert(await run("document.querySelector('.salesTotals').textContent.includes('49.000')"));checks++
  const artifact=path.resolve('artifacts/v2-drafts');fs.mkdirSync(artifact,{recursive:true})
  for(const width of [1366,390])for(const dark of [false,true]){
   await cmd('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:768,deviceScaleFactor:1,mobile:width===390})
   if(await run("document.querySelector('.shell').classList.contains('themeDark')")!==dark)await run("document.querySelector('.themeToggle').click()")
   await sleep(100);assert(await run('document.documentElement.scrollWidth')<=width+2,'V2 horizontal overflow '+width);checks++
   const pic=await cmd('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifact,width+'-'+(dark?'dark':'light')+'.png'),Buffer.from(pic.data,'base64'))
  }
  console.log('V2_BROWSER PASS: inventory selection -> draft -> edit -> save, 1366/390px light/dark layout')
 }finally{ws?.close();c.kill();await sleep(300);fs.rmSync(profile,{recursive:true,force:true})}
}
