import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import {spawn,spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {setTimeout as sleep} from 'node:timers/promises'
import sharp from 'sharp'
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-v2-sale-http-')),store=path.join(root,'warehouse'),dbPath=path.join(root,'database','sales.db'),photos=[]
fs.mkdirSync(path.dirname(dbPath),{recursive:true});for(let i=1;i<=3;i++){const p=path.join(store,'Mẫu test','Size 1',i+'.jpg');fs.mkdirSync(path.dirname(p),{recursive:true});await sharp({create:{width:300,height:400,channels:3,background:{r:40*i,g:130,b:180}}}).jpeg().toFile(p);photos.push(p)}
const original=photos.map(p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'))
const sock=net.createServer();await new Promise(r=>sock.listen(0,'127.0.0.1',r));const port=sock.address().port;await new Promise(r=>sock.close(r));const base='http://127.0.0.1:'+port
let child,logs='',checks=0
async function start(restored=null){logs='';child=spawn(process.execPath,['apps/api/dist/server.js'],{env:{...process.env,PORT:String(port),SHOP_HOST:'127.0.0.1',SHOP_SANDBOX_ROOT:restored?.targetRoot||root,SHOP_DB_PATH:restored?.database||dbPath,SHOP_ENABLE_V2_DRAFTS:'1',SHOP_ENABLE_V2_SALES:'1'},stdio:['ignore','pipe','pipe']});child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{const r=await fetch(base+'/api/health');if(r.ok)return r.json()}catch{}await sleep(100)}throw Error('Start timeout '+logs)}
async function stop(){if(child&&child.exitCode===null){const c=child;await new Promise(r=>{c.once('exit',r);c.kill()})}child=null}
async function api(url,method='GET',body,expected=200,headers={}){const r=await fetch(base+url,{method,headers:{Origin:base,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)}),j=await r.json();assert.equal(r.status,expected,url+': '+JSON.stringify(j));checks++;return j}
try{
 const health=await start();assert(health.schema===130&&health.salesExecution&&health.sandbox);checks++
 await api('/api/store/import','POST',{confirmed:true,product:{rootPath:store,name:'Mẫu test',productCode:'SALETEST',variants:[{size:'Size 1',sku:'SALETEST-S1',images:photos,openingStock:3,costPrice:10000,salePrice:50000}]}},201)
 const ex=await api('/api/inventory/explorer'),ids=ex[0].variants[0].images.map(i=>i.id),input={items:ids.slice(0,2).map(imageId=>({imageId,unitPrice:50000})),discount:1000,note:'Test bán'}
 const draft=await api('/api/sales/drafts','POST',input,201,{'Idempotency-Key':'sale-http-create-key-001'})
 const duplicate=await api('/api/sales/drafts','POST',input,409,{'Idempotency-Key':'sale-http-create-key-002'}),other=await api('/api/sales/drafts','POST',{...input,conflictToken:duplicate.conflictToken},201,{'Idempotency-Key':'sale-http-create-key-002'})
 const pre=await api('/api/sales/drafts/'+draft.id+'/preflight','POST',{version:1}),body={version:1,token:pre.token,confirmed:true,acknowledgeZeroPrice:false},key='sale-http-confirm-key-001'
 await api('/api/sales/drafts/'+draft.id+'/confirm','POST',body,403,{Origin:'https://bad.example','Idempotency-Key':key});await api('/api/sales/drafts/'+draft.id+'/confirm','POST',{...body,confirmed:false},400,{'Idempotency-Key':key})
 const sold=await api('/api/sales/drafts/'+draft.id+'/confirm','POST',body,200,{'Idempotency-Key':key});assert(sold.status==='SOLD'&&sold.quantity===2&&sold.total===99000);checks++
 assert((await api('/api/sales/drafts/'+draft.id+'/confirm','POST',body,200,{'Idempotency-Key':key})).operationId===sold.operationId);checks++
 await api('/api/sales/drafts/'+draft.id+'/confirm','POST',{...body,version:2},409,{'Idempotency-Key':key});assert((await api('/api/sales/drafts/operations/'+key)).status==='SOLD');checks++
 const stock=await api('/api/inventory/dashboard');assert(stock.stock===1);checks++
 assert((await api('/api/products'))[0].total_stock===1&&(await api('/api/inventory/explorer'))[0].variants[0].images.length===1);checks++
 assert((await api('/api/sales/drafts/'+draft.id)).status==='SOLD'&&(await api('/api/sales/drafts?status=SOLD')).length===1);checks++
 await api('/api/sales/drafts/'+draft.id,'PUT',{...input,version:1},409);await api('/api/sales/drafts/'+draft.id+'/cancel','POST',{version:1},409)
 const otherPre=await api('/api/sales/drafts/'+other.id+'/preflight','POST',{version:1});assert(otherPre.blockedCount===2);checks++
 await api('/api/sales/drafts/'+other.id+'/confirm','POST',{...body,token:otherPre.token},409,{'Idempotency-Key':'sale-http-conflict-key-001'})
 const history=await api('/api/sales/drafts/'+draft.id+'/sold');assert(history.quantity===2&&history.total===99000&&history.originalsRetained);checks++
 const light=await fetch(base+'/api/sales/drafts/'+draft.id+'/sold-image/'+ids[0]);assert(light.ok&&(await sharp(Buffer.from(await light.arrayBuffer())).metadata()).format==='jpeg');checks++
 await api('/api/inventory/share/prepare','POST',{ids:[ids[0]]},400);await api('/api/store/scan','POST',{rootPath:path.join(root,'.mecacao-v2-sales')},403)
 const rename=await api('/api/warehouse/rename/preview','POST',{rootPath:store});assert(rename.missing.length===0&&rename.summary.registered===1);checks++
 const scan=await api('/api/store/scan','POST',{rootPath:store});assert(scan.products.length===1&&scan.summary.images===1&&scan.summary.missingImages===0);checks++
 const ledger=await api('/api/inventory/history');assert(ledger.filter(r=>r.transaction_type==='SALE').length===2);checks++
 assert(!fs.existsSync(photos[0])&&!fs.existsSync(photos[1])&&createHash('sha256').update(fs.readFileSync(photos[2])).digest('hex')===original[2]);checks++
 const backup=await api('/api/backup/lossless','POST',{},201);assert(backup.backup.verified.soldImagesVerified===2&&backup.backup.imageCount===3);checks++
 const restored=await api('/api/backup/restore-test','POST',{directory:backup.backup.directory,warehouseRoot:store,confirmed:true});assert(restored.schema===130&&restored.status==='READY'&&restored.counts.sales_orders===2&&restored.counts.sales_confirmations===1);checks++
 await stop();await start(restored);assert((await api('/api/inventory/dashboard')).stock===1&&(await api('/api/sales/drafts/'+draft.id)).status==='SOLD');checks++;assert((await api('/api/sales/drafts/operations/'+key)).status==='SOLD');checks++
 await api('/api/backup/lossless','POST',{},201);await stop();await start();assert((await api('/api/inventory/dashboard')).stock===1);checks++
 const uiDraft=await api('/api/sales/drafts','POST',{items:[{imageId:ids[2],unitPrice:50000}],discount:0,note:'UI'},201,{'Idempotency-Key':'sale-http-ui-key-00001'})
 if(process.platform!=='win32'&&process.env.V2_SKIP_BROWSER!=='1')await browserTest(base,uiDraft.id)
 else console.log('V2_SALES browser skipped on Windows/local host; mandatory Chromium on Linux CI')
 await stop()
 const denied=spawnSync(process.execPath,['apps/api/dist/server.js'],{env:{...process.env,SHOP_DB_PATH:path.join(root,'forbidden.db'),SHOP_SANDBOX_ROOT:'',SHOP_ENABLE_V2_DRAFTS:'1',SHOP_ENABLE_V2_SALES:'1'},encoding:'utf8'});assert(denied.status!==0&&!fs.existsSync(path.join(root,'forbidden.db')));checks++
 const old=spawnSync(process.execPath,['apps/api/dist/server.js'],{env:{...process.env,SHOP_DB_PATH:dbPath,SHOP_SANDBOX_ROOT:root,SHOP_ENABLE_V2_DRAFTS:'1',SHOP_ENABLE_V2_SALES:''},encoding:'utf8'});assert(old.status!==0);checks++
 console.log('V2_SALES_HTTP PASS: '+checks+' assertions; real sandbox confirm, cross-module stock, sold history, duplicate guards, restart, portable full backup/restore and source release gates')
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
  await run("Array.from(document.querySelectorAll('.sidebar button')).find(b=>b.textContent==='Bán hàng').click()")
  await until("!!document.querySelector('.salesOrderRow')")
  await run("Array.from(document.querySelectorAll('.salesOrderRow')).find(b=>b.textContent.includes("+JSON.stringify(id.slice(0,8).toUpperCase())+")).click()")
  await until("!!document.querySelector('.preflightCheck')")

  await run("(()=>{const input=document.querySelectorAll('.contactGrid input')[0];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Mẹ test PNG');input.dispatchEvent(new Event('input',{bubbles:true}))})()")
  await until("document.querySelectorAll('.contactGrid input')[0].value==='Mẹ test PNG'")
  await run("(()=>{const input=document.querySelectorAll('.contactGrid input')[2];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'15000');input.dispatchEvent(new Event('input',{bubbles:true}))})()")
  await until("Array.from(document.querySelectorAll('.salesButtons button')).some(b=>b.textContent==='Lưu thay đổi'&&!b.disabled)")
  await run("Array.from(document.querySelectorAll('.salesButtons button')).find(b=>b.textContent==='Lưu thay đổi').click()")
  await until("!document.querySelector('.preflightCheck').disabled")
  const savedContact=(await api('/api/sales/drafts/'+id)).contact;assert(savedContact.recipientName==='Mẹ test PNG'&&savedContact.shippingFee===15000);checks++
  await run("document.querySelector('.orderSlip button').click()")
  await until("document.querySelector('.orderSlip img')?.naturalWidth===1080")
  assert(await run("document.querySelector('.orderSlip a').download.endsWith('.png')"));checks++
  // Stage3: record a real deposit in the UI before selling; the order still remains DRAFT.
  await until("!!document.querySelector('.financeMetrics')")
  for(const [label,value] of [['Số tiền chứng từ','10000'],['Nội dung chứng từ','Cọc qua giao diện']]){
   await run("(()=>{const i=document.querySelector("+JSON.stringify('input[aria-label="'+label+'"]')+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,"+JSON.stringify(value)+");i.dispatchEvent(new Event('input',{bubbles:true}))})()")
  }
  await until("Array.from(document.querySelectorAll('.financePanel button')).some(b=>b.textContent==='Ghi chứng từ'&&!b.disabled)")
  await run("Array.from(document.querySelectorAll('.financePanel button')).find(b=>b.textContent==='Ghi chứng từ').click()")
  await until("document.querySelector('.financeHistory')?.textContent.includes('Cọc qua giao diện')")
  const deposit=await api('/api/sales/drafts/'+id+'/finance');assert(deposit.netCollected===10000&&deposit.due===55000&&deposit.orderStatus==='DRAFT');checks++
    await run("document.querySelector('.preflightCheck').click()")
  await until("!!document.querySelector('.saleAgree')")
  assert(await run("document.querySelector('.saleConfirm').disabled"));checks++
  await run("document.querySelector('.saleAgree').click()")
  await until("!document.querySelector('.saleConfirm').disabled")
  await run("document.querySelector('.saleConfirm').click()")
  await until("document.querySelector('.salesEditorHead h3')?.textContent.includes('ĐÃ BÁN')")
  assert((await api('/api/inventory/dashboard')).stock===0);checks++
  await until("document.querySelector('.salesItem img')?.complete&&document.querySelector('.salesItem img').naturalWidth>0")
  assert(await run("document.querySelector('.salesEditor fieldset').disabled&&!document.querySelector('.salesActionRemove')"));checks++
  // Aftercare case through the UI; payment and delivery remain separate from SOLD.
  await until("!!document.querySelector('.aftercarePanel')")
  await run("document.querySelector('.aftercarePanel').open=true")
  await run("(()=>{const i=document.querySelector('.aftercarePanel input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'Khách cần hỗ trợ size');i.dispatchEvent(new Event('input',{bubbles:true}))})()")
  await until("Array.from(document.querySelectorAll('.aftercarePanel button')).some(b=>b.textContent==='Tạo yêu cầu hậu mãi'&&!b.disabled)")
  await run("Array.from(document.querySelectorAll('.aftercarePanel button')).find(b=>b.textContent==='Tạo yêu cầu hậu mãi').click()")
  await until("document.querySelector('.aftercarePanel')?.textContent.includes('Khách cần hỗ trợ size')")
  assert((await api('/api/sales/drafts/'+id+'/finance')).cases.length===1);checks++
  const artifact=path.resolve('artifacts/v2-sales');fs.mkdirSync(artifact,{recursive:true})
  for(const width of [1366,390])for(const dark of [false,true]){
   await cmd('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:768,deviceScaleFactor:1,mobile:width===390})
   await run("document.querySelector('.shell').classList.toggle('themeDark',"+dark+")")
   await sleep(150)
   if(!dark){assert(await run("new Set(Array.from(document.querySelectorAll('.salesKpis>*')).map(e=>getComputedStyle(e).backgroundColor)).size===3"));checks++}
   if(dark){assert(await run("getComputedStyle(document.querySelector('.salesFold')).color==='rgb(255, 245, 250)'"));checks++}
   assert(await run("document.documentElement.scrollWidth<=innerWidth+2"));checks++
   await run("document.querySelector('.financePanel').scrollIntoView({block:'start'})");await sleep(100)
   const financePic=await cmd('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifact,width+'-'+(dark?'dark':'light')+'-finance.png'),Buffer.from(financePic.data,'base64'))
   await run('window.scrollTo(0,0)')
   const pic=await cmd('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifact,width+'-'+(dark?'dark':'light')+'.png'),Buffer.from(pic.data,'base64'))
  }
  await run("Array.from(document.querySelectorAll('.sidebar button')).find(b=>b.textContent==='Công nợ').click()")
  await until("Array.from(document.querySelectorAll('.debtOrder')).some(b=>b.textContent.includes("+JSON.stringify(id.slice(0,8).toUpperCase())+"))")
  assert(await run("Array.from(document.querySelectorAll('.debtOrder')).find(b=>b.textContent.includes("+JSON.stringify(id.slice(0,8).toUpperCase())+")).textContent.includes('55.000')"));checks++
  // Stage4 browser acceptance through real forms; all inventory remains unchanged.
  await cmd('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false})
  await run("Array.from(document.querySelectorAll('.sidebar button')).find(b=>b.textContent==='Báo cáo').click()")
  await until("document.querySelector('.stage4Table')?.textContent.includes("+JSON.stringify(id.slice(0,8).toUpperCase())+" )")
  assert(await run("document.querySelector('.stage4Metrics').textContent.includes('10.000')"));checks++
  assert(await run("document.querySelector('a[href*=\"reports/export\"]').hasAttribute('download')"));checks++
  await run("Array.from(document.querySelectorAll('.sidebar button')).find(b=>b.textContent==='Kiểm kê').click()")
  await until("!!document.querySelector('input[aria-label=\"Tên phiên kiểm kê\"]')")
  await run("(()=>{const i=document.querySelector('input[aria-label=\"Tên phiên kiểm kê\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'Kiểm kê qua giao diện');i.dispatchEvent(new Event('input',{bubbles:true}))})()")
  await until("Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Mở phiên kiểm kê mới'&&!b.disabled)")
  await run("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Mở phiên kiểm kê mới').click()")
  await until("!!document.querySelector('.stocktakePanel input[type=number]')")
  await run("(()=>{const i=document.querySelector('.stocktakePanel input[type=number]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'1');i.dispatchEvent(new Event('input',{bubbles:true}))})()")
  await run("(()=>{const i=document.querySelector('.stocktakePanel input[aria-label^=\"Lý do\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'Đếm giả lập để đối chiếu hàng chưa có ảnh');i.dispatchEvent(new Event('input',{bubbles:true}))})()")
  await until("Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Lưu số đếm'&&!b.disabled)")
  await run("Array.from(document.querySelectorAll('.sidebar button')).find(b=>b.textContent==='Báo cáo').click()")
  assert(await run("!!document.querySelector('.stocktakePanel')&&document.querySelector('[role=alert]').textContent.includes('trước khi chuyển chức năng')"));checks++

  await run("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Lưu số đếm').click()")
  await until("Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Lưu số đếm'&&b.disabled)")
  await run("(()=>{const i=document.querySelector('input[aria-label=\"Kết luận kiểm kê\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'Đã lưu chênh lệch, kiểm tra nhập ảnh sau');i.dispatchEvent(new Event('input',{bubbles:true}))})()")
  await until("Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Xác nhận hoàn tất kiểm kê'&&!b.disabled)")
  await run("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Xác nhận hoàn tất kiểm kê').click()")
  await until("document.querySelector('.stocktakePanel')?.textContent.includes('Đã hoàn tất')")
  assert((await api('/api/inventory/dashboard')).stock===0);checks++
  const counted=(await api('/api/sales/drafts/stocktakes'))[0];assert(counted.status==='CLOSED');checks++
  const countDetail=await api('/api/sales/drafts/stocktakes/'+counted.id);assert(countDetail.rows[0].counted===1&&countDetail.rows[0].physical===0);checks++
  for(const section of ['Báo cáo','Kiểm kê']){
   await run("Array.from(document.querySelectorAll('.sidebar button')).find(b=>b.textContent==="+JSON.stringify(section)+").click()")
   await until(section==='Báo cáo'?"!!document.querySelector('.stage4Table')":"!!document.querySelector('.stage4SessionList button')")
   if(section==='Kiểm kê'){await run("document.querySelector('.stage4SessionList button').click()");await until("!!document.querySelector('.stocktakePanel')")}
   for(const width of [1366,390])for(const dark of [false,true]){
    await cmd('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:768,deviceScaleFactor:1,mobile:width===390});await run("document.querySelector('.shell').classList.toggle('themeDark',"+dark+")");await sleep(150)
    assert(await run("document.documentElement.scrollWidth<=innerWidth+2"));checks++
    await run("document.querySelector('.stage4Page').scrollIntoView({block:'start'})");const pic=await cmd('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifact,width+'-'+(dark?'dark':'light')+'-'+(section==='Báo cáo'?'reports':'stocktake')+'.png'),Buffer.from(pic.data,'base64'))
   }
  }
  await cmd('Page.reload');await until("Array.from(document.querySelectorAll('.sidebar button')).some(b=>b.textContent==='Bán hàng')")
  await run("Array.from(document.querySelectorAll('.sidebar button')).find(b=>b.textContent==='Bán hàng').click()")
  await until("!!document.querySelector('.salesListHead select')")
  await run("(()=>{const s=document.querySelector('.salesListHead select');const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(s,'SOLD');s.dispatchEvent(new Event('change',{bubbles:true}))})()")
  await until("Array.from(document.querySelectorAll('.salesOrderRow')).some(b=>b.textContent.includes("+JSON.stringify(id.slice(0,8).toUpperCase())+"))")
  await run("Array.from(document.querySelectorAll('.salesOrderRow')).find(b=>b.textContent.includes("+JSON.stringify(id.slice(0,8).toUpperCase())+")).click()")
  await until("document.querySelector('.salesItem img')?.naturalWidth>0")
  assert(await run("document.querySelector('.salesEditorHead h3').textContent.includes('ĐÃ BÁN')"));checks++
  await run("Array.from(document.querySelectorAll('.sidebar button')).find(b=>b.textContent==='Cài đặt').click()")
  await until("Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='BACKUP ĐẦY ĐỦ DB + ẢNH GỐC (KIỂM TRA SHA)')")
  await run("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='BACKUP ĐẦY ĐỦ DB + ẢNH GỐC (KIỂM TRA SHA)').click()")
  await until("document.querySelector('.restoreTestPanel input[readonly]')?.value.includes('sales-')")
  await run("(()=>{const i=document.querySelector('.restorePathRow input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,"+JSON.stringify(store)+");i.dispatchEvent(new Event('input',{bubbles:true}))})()")
  await run("document.querySelector('.restoreConfirm input').click()")
  await until("!document.querySelector('.restorePrimary').disabled")
  await run("document.querySelector('.restorePrimary').click()")
  await until("document.querySelector('.restoreResult')?.textContent.includes('READY')")
  assert(await run("document.querySelector('.restoreResult').textContent.includes('schema 130')&&document.querySelector('.restoreResult').textContent.includes('3 đơn và lịch sử')&&document.querySelector('.restoreResult').textContent.includes('RUN_WINDOWS_RESTORED_V2_SALES_TEST.bat')"));checks++
  console.log('V2_SALES_BROWSER PASS: preflight checkbox -> actual sandbox sale -> locked history JPEG -> reload SOLD filter; 1366/390px light/dark, schema130 restore READY UI; Stage3 deposit/aftercare/debt UI; Stage4 reports, counted discrepancy and immutable close UI')
 }finally{ws?.close();c.kill();await sleep(300);fs.rmSync(profile,{recursive:true,force:true})}
}
