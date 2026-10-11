import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import {spawn,spawnSync} from 'node:child_process'
import {setTimeout as sleep} from 'node:timers/promises'

const dist=path.resolve('apps/web/dist')
assert(fs.existsSync(path.join(dist,'index.html')),'Build the frontend before visual smoke')
const artifacts=path.resolve('artifacts/mobile-smoke')
fs.mkdirSync(artifacts,{recursive:true})
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'}
let catalogFailure=false,postedReceipt=null,receiptReads=0,receiptWrites=0,importWrites=0,renameWrites=0
const mockTasks=new Map(),mockKeys=new Map()
let warehouseNotices=[]
let nativeClipboardEnabled=true,clipboardFailure=false,clipboardCopies=[]
const stockImages=[501,502,503,504].map(id=>({id,file_name:id+'.jpg',file_path:'/sandbox/warehouse/'+id+'.jpg',exists:true}))
const inventoryFixture={product_id:101,product_code:'LOCAL01',product_name:'Local pastel outfit',product_status:'active',stock:3,variants:[{variant_id:1011,sku:'LOCAL01-S1',size:'Size 1',stock:2,ledger_stock:2,images:stockImages.slice(0,2)},{variant_id:1012,sku:'LOCAL01-S2',size:'Size 2',stock:1,ledger_stock:1,images:stockImages.slice(2,3)},{variant_id:1013,sku:'LOCAL01-S3',size:'Size 3',variant_status:'inactive',stock:1,ledger_stock:1,images:stockImages.slice(3)}]}
const renameFile={id:501,product:'Local pastel outfit',size:'Size 1',oldPath:'/sandbox/warehouse/Local pastel outfit/Size 1/001.jpg',newPath:'/sandbox/warehouse/Local pastel outfit/Size 1/ShopMeCaCao_Tole_Local_pastel_outfit_Size_1_0001.jpg',sha256:'fixture-checksum'}
const watchConfig={rootPath:'/sandbox/warehouse',startup:false,periodic:false,intervalSeconds:300,popup:false,autoRename:false}
const localProduct={id:101,product_code:'LOCAL01',name:'Local pastel outfit',variant_count:1,total_stock:1,sizes:['Size 1'],stock_by_size:[{size:'Size 1',stock:1}]}
const server=http.createServer(async (req,res)=>{
 const name=decodeURIComponent(new URL(req.url||'/', 'http://localhost').pathname)
 if(name.startsWith('/api/')){
  if(name.startsWith('/api/tasks/')){const id=name.split('/')[3],t=mockTasks.get(id);if(name.endsWith('/events')){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'}).end('data: '+JSON.stringify(t)+'\\n\\n');return}res.writeHead(t?200:404,{'Content-Type':'application/json'}).end(JSON.stringify(t||{error:'Missing task'}));return}
  if(name==='/api/tasks'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify([...mockTasks.values()].map(({result,...t})=>t)));return}

  if(name==='/api/warehouse/file'||name.startsWith('/api/images/')||name.startsWith('/api/inventory/share/image/')){
   res.writeHead(200,{'Content-Type':'image/svg+xml'}).end('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="250" viewBox="0 0 200 250"><rect width="200" height="250" fill="#fff5eb"/><path d="M60 25 30 55 50 85 65 72V140H135V72L150 85 170 55 140 25 120 40H80Z" fill="#95d7bf"/><path d="M65 153H135L148 225H112L100 185 88 225H52Z" fill="#95d7bf"/><circle cx="90" cy="80" r="6" fill="#fff"/><circle cx="118" cy="108" r="6" fill="#fff"/></svg>');return
  }
  const chunks=[];for await(const chunk of req)chunks.push(chunk)
  const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{}
  let data={},status=200
  if(name==='/api/health')data={ok:true,schema:110,sandbox:true,database:'browser-mock.db'}
  else if(name==='/api/inventory/share/capabilities')data={nativeFiles:nativeClipboardEnabled,maxImages:100}
  else if(name==='/api/inventory/share/prepare'){assert.deepEqual(req.headers['content-type'],'application/json');data={images:body.ids.map(id=>({id,name:id+'.jpg',url:'/api/inventory/share/image/'+id}))}}
  else if(name==='/api/inventory/share/copy'){assert.deepEqual(req.headers['content-type'],'application/json');clipboardCopies.push(body.ids);if(clipboardFailure){status=400;data={error:'TEST — ảnh không còn tồn'}}else data={copied:body.ids.length,format:'CF_HDROP'}}
  else if(name==='/api/inventory/explorer'){const q=new URL(req.url,'http://localhost').searchParams;const vs=inventoryFixture.variants.filter(v=>!q.get('size')||v.size===q.get('size'));data=[{...inventoryFixture,variants:vs,stock:vs.reduce((n,v)=>n+v.stock,0)}]}
  else if(name==='/api/products'){
   if(catalogFailure){status=503;data={error:'TEST — API tạm thời không sẵn sàng'}}else data=[localProduct]
  }else if(name==='/api/products/101')data={product:localProduct,variants:[{id:1011,size:'Size 1',sku:'LOCAL01-S1',cost_price:10000,sale_price:20000}],images:[]}
  else if(name==='/api/inventory/filter-options')data={sizes:['Size 1','Size 2'],categories:[]}
  else if(name==='/api/inventory/dashboard')data={stock:1,products:1,skus:1,outOfStock:0,mismatches:0,topProducts:[],lowProducts:[]}
  else if(name==='/api/catalog/dashboard')data={products:1,skus:1,categories:0,missingImages:0,missingPrices:0}
  else if(name==='/api/goods-receipt/dashboard'){receiptReads++;data={transactions:postedReceipt?1:0,importedQuantity:postedReceipt?1:0,importedValue:10000,lastImport:null,top:[],recent:[]}}
  else if(name==='/api/fs/roots')data=['/sandbox']
  else if(name==='/api/fs/list')data={path:new URL(req.url,'http://localhost').searchParams.get('path'),parent:'/sandbox',directories:[]}
  else if(name==='/api/goods-receipt/inspect'){await sleep(80);data={count:1,images:['/sandbox/incoming/001.jpg']}}
  else if(name==='/api/goods-receipt'){receiptWrites++;postedReceipt=body;status=201;data={result:{totalQuantity:1,copiedImages:1},events:[{phase:'DONE',percent:100,copied:1,total:1}]}}
  else if(name==='/api/inventory/suggestions')data=[]
  else if(name==='/api/warehouse/settings'){if(req.method==='PUT')Object.assign(watchConfig,body);data=watchConfig}
  else if(name==='/api/warehouse/notices')data=warehouseNotices
  else if(name.startsWith('/api/warehouse/notices/')){warehouseNotices=warehouseNotices.map(n=>({...n,state:body.state}));data=warehouseNotices}
  else if(name==='/api/warehouse/rename/preview')data={token:'fixture-preview-token',summary:{registered:1,correct:0,pending:1,missing:0},missing:[],files:[renameFile]}
  else if(name==='/api/warehouse/rename/commit'){assert.equal(body.confirmed,true);assert.deepEqual(body.ids,[501]);assert.equal(body.token,'fixture-preview-token');renameWrites++;data={renamed:1,log:'fixture-log.json'}}
  else if(name==='/api/warehouse/rename/logs')data=[]
  else if(name==='/api/store/scan')data={rootPath:watchConfig.rootPath,productCount:1,missing:[],scannedAt:new Date().toISOString(),summary:{newProducts:importWrites?0:1,newSizes:importWrites?0:1,products:1,sizes:1,images:1,registeredProducts:importWrites?1:0,registeredSizes:importWrites?1:0,registeredImages:importWrites?1:0,pendingImages:importWrites?0:1,missingImages:0},products:[{name:'Local pastel outfit',suggestedProductCode:'LOCAL01',existingProductId:importWrites?101:undefined,warnings:[],sizes:[{size:'Size 1',suggestedSku:'LOCAL01-S1',images:['/sandbox/warehouse/Local pastel outfit/Size 1/001.jpg'],pendingImages:importWrites?[]:['/sandbox/warehouse/Local pastel outfit/Size 1/001.jpg'],registeredImages:importWrites?['/sandbox/warehouse/Local pastel outfit/Size 1/001.jpg']:[],existingVariantId:importWrites?1011:undefined}]}]}
  else if(name==='/api/store/import-batch-task'){importWrites++;data={outcomes:body.products.map(p=>({name:p.name,status:'SAVED',images:1,sizes:1,message:'Đã đăng ký'}))}}
  else if(name==='/api/store/import'){importWrites++;status=201;data={registration:{images:1,sizes:1,products:1}}}
  if(req.headers.prefer==='respond-async'&&['/api/store/scan','/api/goods-receipt','/api/store/import-batch-task'].includes(name)){
   const key=req.headers['idempotency-key'];let t=mockKeys.get(key)
   if(!t){const id='mock-task-'+mockTasks.size,kind=name.includes('goods-receipt')?'RECEIPT':name.includes('batch')?'REGISTER_BATCH':'SCAN';t={id,key,kind,status:'SUCCEEDED',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),progress:{phase:'DONE',percent:100},result:name.includes('goods-receipt')?data.result:data};mockTasks.set(id,t);mockKeys.set(key,t)}
   status=202;data={task:t}
  }
  res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(data));return
 }
 let file=path.resolve(dist,'.'+name)
 if(!file.startsWith(dist+path.sep)&&file!==dist){res.writeHead(403).end();return}
 if(!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(dist,'index.html')
 res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream')
 fs.createReadStream(file).pipe(res)
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const chrome=process.env.CHROME_BIN||['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(fs.existsSync)
assert(chrome,'Chrome/Chromium not installed on test runner')
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-cdp-'))
const child=spawn(chrome,['--headless=new','--no-sandbox','--no-proxy-server','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--remote-debugging-port=0','--window-size=390,844','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']})
let chromeErrors=''
child.stderr?.on('data',data=>{chromeErrors=(chromeErrors+data.toString()).slice(-5000)})
let ws,seq=0
const pending=new Map()
async function command(method,params={}){
 const id=++seq
 return new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method))},16000)
  pending.set(id,{resolve:r=>{clearTimeout(timeout);resolve(r)},reject:e=>{clearTimeout(timeout);reject(e)}})
  ws.send(JSON.stringify({id,method,params}))
 })
}
async function run(expression){
 const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})
 if(r.exceptionDetails)throw Error('Browser exception '+r.exceptionDetails.text)
 return r.result?.value
}
async function until(expression,label){
 for(let i=0;i<100;i++){try{if(await run(expression))return}catch{}await sleep(150)}
 throw Error('Timed out waiting for '+label)
}
async function shot(name){
 const pic=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
 fs.writeFileSync(path.join(artifacts,name),Buffer.from(pic.data,'base64'))
}
async function clickMenu(label){
 await run("document.querySelector('.menuToggle').click()")
 await until("!!document.querySelector('.featureDrawer')",'feature menu')
 await run("Array.from(document.querySelectorAll('.drawerLinks button')).find(x=>x.textContent.includes("+JSON.stringify(label)+")).click()")
}
let failed
try{
 let port
 for(let i=0;i<300;i++){
  const file=path.join(profile,'DevToolsActivePort')
  if(child.exitCode!==null||child.signalCode)throw Error('Chrome exited before debugger opened: '+chromeErrors)
  if(fs.existsSync(file)){port=Number(fs.readFileSync(file,'utf8').split('\n')[0]);break}
  await sleep(150)
 }
 assert(port,'Chrome debugger port missing (45s): '+chromeErrors)
 const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json()
 const page=targets.find(x=>x.type==='page')
 assert(page,'Chrome page target unavailable')
 ws=new WebSocket(page.webSocketDebuggerUrl)
 await new Promise((ok,bad)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',bad,{once:true})})
 ws.addEventListener('message',event=>{
  const m=JSON.parse(event.data);const p=pending.get(m.id)
  if(!p)return
  pending.delete(m.id)
  m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result)
 })
 await command('Page.enable')
 await command('Runtime.enable')
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true})
 await command('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/?demo=1'})
 await until("!!document.querySelector('.overviewStats')",'overview screen')
 assert((await run('document.documentElement.scrollWidth'))<=392,'Overview horizontal scroll at 390px')
 assert((await run("document.querySelectorAll('.overviewStat').length"))===5,'Overview must have five KPI cards')
 await shot('overview.png')
 assert(await run("document.querySelector('.shell').classList.contains('densityMedium')"),'Fresh device defaults to Medium')
 // Desktop density: exercise every module in all three sizes, both themes, at 100% zoom.
 const desktopModules=[['Tổng quan','.overviewStats','overview'],['Danh mục sản phẩm','.catalogPanel','catalog'],['Nhập hàng','.receiptOverview','receipt'],['Import kho','.warehouseWorkspace','warehouse'],['Tồn kho','.inventoryMetrics','inventory'],['Cài đặt','.displayPreferences','settings']]
 const heights={}
 for(const width of [1366,1920]){
  const height=width===1366?768:1080
  await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false})
  for(const density of [1,2,0]){
   const compact=density===0
   await run("document.querySelectorAll('.headerActions .densitySwitch button')["+density+"].click()")
   await until("document.querySelector('.shell').classList.contains("+JSON.stringify(['densitySmall','densityMedium','densityLarge'][density])+")",'desktop density')
   for(const dark of [false,true]){
    if(await run("document.querySelector('.shell').classList.contains('themeDark')")!==dark)await run("document.querySelector('.themeToggle').click()")
    for(const [label,selector,slug] of desktopModules){
     await run("Array.from(document.querySelectorAll('.sidebar button')).find(b=>b.textContent==="+JSON.stringify(label)+").click()")
     await until("!!document.querySelector("+JSON.stringify(selector)+")",'desktop '+label)
     await run('window.scrollTo(0,0)');await sleep(100)
     assert((await run('document.documentElement.scrollWidth'))<=width+2,'Desktop overflow: '+label+' '+width+' '+compact+' '+dark)
     assert(await run("getComputedStyle(document.querySelector('.headerActions .densitySwitch')).display!=='none'"),'Desktop density control must be reachable')
     const shape=await run("(()=>{const h=document.querySelector('.topbar').getBoundingClientRect(),c=document.querySelector('.headerActions').getBoundingClientRect(),b=document.querySelector('.brandIdentity').getBoundingClientRect();return {header:h.height,overlap:b.right>c.left,main:document.querySelector('main').getBoundingClientRect().width,content:document.querySelector('main').lastElementChild.getBoundingClientRect().bottom-document.querySelector('main').getBoundingClientRect().top}})()")
     assert(!shape.overlap,'Desktop branding/actions overlap '+width)
     if(compact){assert(shape.header<=72,'Compact header remains too tall');assert(shape.main>width-220,'Compact main must use available desktop space')}
     if(!dark&&density!==2)heights[width+'-'+slug+'-'+compact]=shape.content
     if(compact&&slug==='receipt')assert(await run("new Set(Array.from(document.querySelectorAll('.receiptStats article')).map(e=>Math.round(e.getBoundingClientRect().top))).size===1"),'Five receipt KPIs must share one desktop row')
     await shot('desktop-'+width+'-'+slug+'-'+(dark?'dark':'light')+'-'+['small','medium','large'][density]+'.png')
    }
   }
  }
  for(const slug of ['overview','receipt','inventory','warehouse'])assert(heights[width+'-'+slug+'-true']<heights[width+'-'+slug+'-false']*.98,'Small must reduce '+slug+' scrolling: '+JSON.stringify(heights))
 }
 // Preference survives reload; mobile controls keep their original tap targets.
 await command('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/?demo=1'})
 await until("!!document.querySelector('.overviewStats')",'density reload')
 assert(await run("document.querySelector('.shell').classList.contains('densityCompact')"),'Density preference lost on reload')
 await run("document.querySelector('.themeToggle').click()")
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true})
 await until("getComputedStyle(document.querySelector('.headerActions .densitySwitch')).display==='none'",'mobile header density control hidden')
 console.log('DESKTOP_DENSITY PASS: 1366x768 / 1920x1080, all six modules, light/dark, small/medium/large, less fixture content height, no overflow/overlap, preference persistence')
 await run("document.querySelector('.dashboardFoldToggle').click()")
 assert(await run("document.querySelector('#overview-dashboard-body')===null"),'Overview collapse failed')
 await run("document.querySelector('.dashboardFoldToggle').click()")
 await run("document.querySelector('.menuToggle').click()")
 await until("!!document.querySelector('.featureDrawer')",'drawer')
 assert(!(await run("document.activeElement===document.querySelector('.drawerSearch input')")),'Drawer must not focus search on open')
 await sleep(350)
 await shot('drawer.png')
 await run("Array.from(document.querySelectorAll('.drawerLinks button')).find(x=>x.textContent.includes('Tồn kho')).click()")
 await until("!!document.querySelector('.inventoryPage .inventoryMetrics')",'inventory screen')
 const v=await run("(()=>{const e=document.querySelector('.sizesInsight .productStockBar'),b=e.querySelector('.productStockBarLabel b');return {display:getComputedStyle(e).display,width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height,scroll:document.documentElement.scrollWidth,rows:document.querySelectorAll('.inventoryMetrics article').length}})()")
 assert(v.display==='flex'&&v.width>110&&v.height<80,'Inventory chart product text is vertical or clipped: '+JSON.stringify(v))
 assert(v.scroll<=392&&v.rows===4,'Inventory cards overflow or missing: '+JSON.stringify(v))
 for(const width of [320,430,768]){
  await command('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:2,mobile:true})
  await sleep(120)
  const shape=await run("(()=>{const e=document.querySelector('.sizesInsight .productStockBarLabel b');return {overflow:document.documentElement.scrollWidth,display:getComputedStyle(document.querySelector('.sizesInsight .productStockBar')).display,nameWidth:e.getBoundingClientRect().width,nameHeight:e.getBoundingClientRect().height}})()")
  assert(shape.overflow<=width+2,'Horizontal scroll at '+width+'px: '+JSON.stringify(shape))
  assert(shape.display==='flex'&&shape.nameWidth>95&&shape.nameHeight<95,'Product label collapsed at '+width+'px: '+JSON.stringify(shape))
 }
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true})
 await sleep(100)
 await shot('inventory-light.png')
 await run("document.querySelector('.sizesInsight').scrollIntoView({block:'center'})")
 await sleep(350)
 await shot('inventory-chart-light.png')
 await run("document.querySelector('.inventoryPage .dashboardFoldToggle').click()")
 assert(await run("document.querySelector('.inventoryMetrics')===null"),'Inventory collapse failed')
 await run("document.querySelector('.inventoryPage .dashboardFoldToggle').click()")
 await run("document.querySelector('#inventory-search').focus()")
 await command('Input.insertText',{text:'Bộ'})
 await until("document.querySelector('.inventoryFilters .suggestions button')!==null",'inventory autocomplete')
 assert((await run("document.querySelector('.inventoryFilters .suggestions button').textContent")).includes('Size'),'Autocomplete must suggest an existing product Size')
 await run("document.querySelector('.inventoryFilters .suggestions button').click()")
 await until("document.querySelector('.inventoryResultCount')?.textContent?.includes('1 mẫu')",'inventory suggestion result')
 await run("document.querySelector('.clearFilter').click()")
 await until("document.querySelector('.inventoryResultCount')?.textContent?.includes('2 mẫu')",'inventory filter reset')
 await run("document.querySelector('.themeToggle').click()")
 await shot('inventory-dark.png')
 assert((await run("getComputedStyle(document.querySelector('.inventoryHeading h2')).color"))==='rgb(50, 38, 53)','Dark inventory title must remain readable on pastel header')
 await run("document.querySelector('.sizesInsight').scrollIntoView({block:'center'})")
 await sleep(350)
 await shot('inventory-chart-dark.png')
 await run("document.querySelector('.menuToggle').click()")
 await until("!!document.querySelector('.drawerSearch input')",'dark drawer search')
 const searchColor=await run("getComputedStyle(document.querySelector('.drawerSearch input')).backgroundColor")
 assert(searchColor==='rgba(0, 0, 0, 0)'||searchColor==='transparent','Dark theme drawer search background should be transparent: '+searchColor)
 await sleep(350)
 await shot('drawer-dark.png')
 await run("Array.from(document.querySelectorAll('.drawerLinks button')).find(x=>x.textContent.includes('Danh mục sản phẩm')).click()")
 await until("!!document.querySelector('.catalogMetrics')",'catalog')
 assert((await run('document.documentElement.scrollWidth'))<=392,'Catalog horizontal scroll')
 assert((await run("getComputedStyle(document.querySelector('.catalogMetrics strong')).color"))==='rgb(255, 245, 250)','Dark catalog KPI is low-contrast')
 assert((await run("document.querySelectorAll('.catalogInsights p').length"))>=4,'Demo catalog must include illustrative category and size breakdowns')
 await run("(()=>{const e=document.querySelector('.catalogFilterGrid select');e.value='Size 4';e.dispatchEvent(new Event('change',{bubbles:true}))})()")
 await until("document.querySelector('.catalogFilterSummary')?.textContent?.includes('1 mẫu')",'catalog Size filter')
 await run("(()=>{const e=document.querySelector('.catalogFilterGrid select');e.value='';e.dispatchEvent(new Event('change',{bubbles:true}))})()")
 await until("document.querySelector('.catalogFilterSummary')?.textContent?.includes('2 mẫu')",'catalog filter reset')
 await shot('catalog-dark.png')
 await run("document.querySelector('.dashboardFoldToggle').click()")
 assert(await run("document.querySelector('.catalogMetrics')===null"),'Catalog collapse failed')
 await run("document.querySelector('.dashboardFoldToggle').click()")
 await clickMenu('Nhập hàng')
 await until("!!document.querySelector('.receiptStats')",'receipt dashboard')
 await run("document.querySelector('.receiptOverview .dashboardFoldToggle').click()")
 assert(await run("document.querySelector('.receiptStats')===null"),'Receipt collapse failed')
 await run("document.querySelector('.receiptOverview .dashboardFoldToggle').click()")
 assert((await run("getComputedStyle(document.querySelector('.receiptStats article span')).color"))==='rgb(224, 198, 212)','Receipt KPI labels must remain readable in dark mode')
 await shot('receipt-dark.png')
 await clickMenu('Import kho')
 await until("Array.from(document.querySelectorAll('main h2,main h3')).some(x=>x.textContent.includes('Quét kho'))",'store scanner tab')
 assert((await run("document.querySelector('main').textContent")).includes('Chỉ đọc folder'),'Import tab must explain preview-only scanning')
 await shot('import-preview-dark.png')
 await clickMenu('Cài đặt')
 await until("Array.from(document.querySelectorAll('main h3')).some(x=>x.textContent.includes('Cài đặt'))",'settings tab')
 assert((await run("document.querySelector('main').textContent")).includes('DEMO không ghi cài đặt'),'Settings demo must not perform real writes')
 await shot('settings-demo-dark.png')
 // Mocked LOCAL browser flow exercises async UI binding, not the real API.
 // Real copy/rollback business logic remains in api-e2e-smoke.mjs.
 await command('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'})
 await until("!!document.querySelector('.sandboxSafetyBanner')",'backend sandbox identity')
 assert(await run("document.querySelector('.shell').classList.contains('themeDark')"),'Theme preference must survive page reload')
 await clickMenu('Nhập hàng')
 await until("!!document.querySelector('.pickerResults button')",'LOCAL receipt product selector')
 await run("document.querySelector('.taskJump').click()")
 await sleep(100)
 assert(await run("document.querySelector('#goods-receipt-form').getBoundingClientRect().top>=document.querySelector('.topbar').getBoundingClientRect().bottom-2"),'Jump-to-form must not hide heading under sticky header')
 await run("document.querySelector('.pickerResults button').click()")
 await until("!!document.querySelector('.variantChooser button')",'existing Size selection')
 assert(await run("getComputedStyle(document.querySelector('.flowTabs')).display==='grid'"),'LOCAL receipt workflows must be styled, not browser-default buttons')
 assert(await run("getComputedStyle(document.querySelector('.receipt')).backgroundColor==='rgb(36, 37, 50)'"),'Dark receipt form must not put white text on a white background')
 async function pickFolder(trigger,pathValue){
  await run("document.querySelector("+JSON.stringify(trigger)+").click()")
  await until("!!document.querySelector('.driveGrid button')",'folder roots')
  await run("document.querySelector('#folder-direct-path').focus()")
  await command('Input.insertText',{text:pathValue})
  await run("document.querySelector('.folderDirectPath button').click()")
  await until("!!document.querySelector('.chooseFolder')",'folder loaded')
  await run("document.querySelector('.chooseFolder').click()")
 }
 await pickFolder('.pickerInput button','/sandbox/warehouse')
 await pickFolder('.sourcePicker button','/sandbox/incoming')
 await until("document.querySelector('.imageCountBadge b')?.textContent==='1'",'source image count')
 assert(await run("document.querySelector('.sourcePicker input').value==='/sandbox/incoming'"),'Source path lost after async inspect')
 assert(await run("document.querySelector('.receipt .actions button').disabled===false"),'Scanned receipt should be submittable')
 const beforeReads=receiptReads
 await run("document.querySelector('.receipt .actions button').click();document.querySelector('.receipt .actions button').click()")
 await until("document.querySelector('.receipt .notice')?.textContent.includes('Nhập thành công')",'receipt commit UI')
 assert(postedReceipt?.sizes[0]?.sourcePath==='/sandbox/incoming'&&postedReceipt?.sizes[0]?.quantity===1,'Receipt payload must retain source path and physical count')
 assert.equal(receiptWrites,1,'Double click must not post a second receipt')
 await until("document.querySelector('.receipt .actions button').disabled===true",'prevent repeat receipt')
 await sleep(250)
 assert(receiptReads>beforeReads,'Receipt dashboard must refresh after successful commit')
 for(const width of [320,390,768,1280]){
  await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768})
  await sleep(100)
  assert((await run('document.documentElement.scrollWidth'))<=width+2,'LOCAL receipt overflow at '+width+'px')
 }
 await shot('receipt-local-after-commit.png')
 await command('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false})
 for(const density of [1,2,0]){
   const compact=density===0
  await run("document.querySelectorAll('.headerActions .densitySwitch button')["+density+"].click()")
  await run('window.scrollTo(0,0)');await sleep(100)
  await run("document.querySelector('.taskJump').click()")
  await sleep(120)
  assert(await run("document.querySelector('#goods-receipt-form').getBoundingClientRect().top>=document.querySelector('.topbar').getBoundingClientRect().bottom-2"),'Desktop form anchor must clear sticky header in both densities')
  assert((await run('document.documentElement.scrollWidth'))<=1368,'LOCAL desktop form overflow')
  await shot('receipt-local-1366-'+['small','medium','large'][density]+'.png')
 }
 assert.equal(receiptWrites,1,'Changing display density must never post a transaction')
 await run("document.querySelector('.receiptFields').scrollIntoView({block:'start'})")
 await sleep(100)
 await shot('receipt-local-form-desktop.png')
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
 catalogFailure=true
 await clickMenu('Danh mục sản phẩm')
 await until("document.querySelector('.catalogPanel [role=alert]')?.textContent.includes('TEST')",'catalog explicit error')
 assert(!(await run("document.querySelector('.catalogPanel').textContent.includes('Không tìm thấy sản phẩm phù hợp')")),'API failure must not masquerade as empty inventory')
 catalogFailure=false
 await run("document.querySelector('.catalogPanel [role=alert] button').click()")
 await until("document.querySelector('.catalogPanel .product h3')?.textContent==='Local pastel outfit'",'catalog retry succeeds')
 await run("document.querySelector('.catalogPanel').scrollIntoView({block:'start'})")
 await sleep(100)
 await shot('catalog-local-retry.png')
 await clickMenu('Import kho')
 await until("document.querySelector('.warehouseConfig input')?.value==='/sandbox/warehouse'",'remembered warehouse configuration')
 await run("Array.from(document.querySelectorAll('.warehouseConfig button')).find(b=>b.textContent==='QUÉT KHO').click()")
 await until("document.querySelectorAll('.warehouseMetrics button').length===10",'scan KPI dashboard')
 assert((await run("document.querySelector('.warehouseConfirm').textContent")).includes('1 ảnh mới'),'Selected pending file must be counted separately')
 for(const width of [320,390,768,1280]){await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});await run('window.scrollTo(0,0)');await sleep(120);assert((await run('document.documentElement.scrollWidth'))<=width+2,'LOCAL warehouse overflow at '+width+'px');await shot('warehouse-local-'+width+'.png')}
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true})
 await run("document.querySelector('.warehouseProduct').scrollIntoView({block:'start'})")
 await shot('warehouse-size-cards-mobile.png')
 await run("Array.from(document.querySelectorAll('.warehouseConfirm button')).find(b=>b.textContent==='DUYỆT LÔ TRƯỚC KHI LƯU').click()")
 await run("Array.from(document.querySelectorAll('.warehouseConfirm button')).find(b=>b.textContent==='XÁC NHẬN & LƯU HÀNG LOẠT').click()")
 await until("document.querySelector('.warehouseResults')?.textContent.includes('ĐÃ LƯU')",'persistent per-product import outcome')
 assert.equal(importWrites,1,'A reviewed batch should register only once')
 assert((await run("document.querySelector('.warehouseResults').textContent")).includes('+1 ảnh'),'Outcome must show actual registered files')
 await until("document.querySelector('.warehouseConfirm button')?.disabled===true",'saved batch selections cleared')
 await shot('warehouse-local-after-save.png')
 await run("Array.from(document.querySelectorAll('.renameWorkspace button')).find(b=>b.textContent==='KIỂM TRA TÊN FILE KHO').click()")
 await until("document.querySelectorAll('.renameRows input').length===1",'physical rename preview')
 await until("Array.from(document.querySelectorAll('.renameWorkspace button')).some(b=>b.textContent.includes('XEM TRƯỚC 1 ẢNH')&&!b.disabled)",'rename inspection finished')
 assert.equal(renameWrites,0,'Inspection must not rename files')
 await run("Array.from(document.querySelectorAll('.renameWorkspace button')).find(b=>b.textContent.includes('XEM TRƯỚC 1 ẢNH')).click()")
 await until("!!document.querySelector('[aria-label=\"Xác nhận rename\"]')",'selected rename confirmation')
 await until("Array.from(document.querySelectorAll('.renameWorkspace button')).some(b=>b.textContent==='XÁC NHẬN RENAME FILE ẢNH THẬT'&&!b.disabled)",'selected preview finished')
 assert.equal(renameWrites,0,'Selected preview must not rename files')
 await run("Array.from(document.querySelectorAll('.renameWorkspace button')).find(b=>b.textContent==='XÁC NHẬN RENAME FILE ẢNH THẬT').click()")
 await until("document.querySelector('.renameWorkspace [role=status]')?.textContent.includes('Đã đổi tên 1 ảnh')",'rename outcome')
 assert.equal(renameWrites,1,'Explicit confirmed rename should submit once')
 watchConfig.popup=true
 warehouseNotices=[{id:'browser-notice',kind:'changes',message:'1 ảnh chờ duyệt',createdAt:new Date().toISOString(),state:'unseen'}]
 await command('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'})
 await until("!!document.querySelector('[aria-label=\"Kho ảnh có thay đổi\"]')",'opt-in scan notification popup')
 assert((await run("document.querySelector('.warehouseNotifications [role=dialog]').textContent")).includes('1 ảnh chờ duyệt'),'Popup must identify pending stock')
 await run("Array.from(document.querySelectorAll('.warehouseNotifications [role=dialog] button')).find(b=>b.textContent==='XEM & DUYỆT').click()")
 await until("!!document.querySelector('.warehouseConfig')",'notification opens review workspace')
 assert.equal(warehouseNotices[0].state,'seen','Review must persist seen state')
 assert.equal(importWrites,1,'Reviewing a notification must not import automatically')
 await clickMenu('Tồn kho')
 await until("!!document.querySelector('.treeProductHead')",'LOCAL inventory for sharing')
 await run("document.querySelector('.treeProductHead').click()")
 await until("document.querySelectorAll('.treeVariantHead').length===3",'Size groups expanded')
 await run("document.querySelectorAll('.treeVariantHead')[0].click()")
 await run("document.querySelectorAll('.treeVariantHead')[1].click()")
 await run("document.querySelectorAll('.treeVariantHead')[2].click()")
 await until("document.querySelectorAll('.stockImageSelect').length===4",'physical stock image cards')
 assert.equal(await run("document.querySelectorAll('.stockImageSelect:not(:disabled)').length"),3,'Inactive Size must be visible but not selectable for sending')
 await run("document.querySelectorAll('.stockImageSelect')[0].click();document.querySelectorAll('.stockImageSelect')[1].dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}))")
 assert((await run("document.querySelector('.imageSendSummary b').textContent")).includes('2 ảnh'),'Shift range must select both images')
 await run("document.querySelector('[aria-label=\"Lọc theo Size\"]').value='Size 2';document.querySelector('[aria-label=\"Lọc theo Size\"]').dispatchEvent(new Event('change',{bubbles:true}))")
 await until("document.querySelectorAll('.stockImageSelect').length===1",'Size filter')
 assert((await run("document.querySelector('.imageSendSummary span').textContent")).includes('2 ảnh nằm ngoài'),'Filtered-out selections must remain visible in summary')
 await run("document.querySelector('.productSelectRow button').click()")
 await until("document.querySelector('.imageSendSummary b')?.textContent.includes('3 ảnh')",'select complete Product across filtered Size')
 await run("document.querySelector('.viewStockImage').click()")
 await until("!!document.querySelector('.stockViewer')",'large image viewer')
 assert.equal(await run("document.activeElement.textContent"),'ĐÓNG ×','Viewer must receive keyboard focus')
 await run("document.querySelector('.stockViewer').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))")
 await until("!document.querySelector('.stockViewer')",'viewer Escape closes')
 clipboardFailure=true
 await run("document.querySelector('.copySelectedImages').click()")
 await until("document.querySelector('.imageSendBar [role=status]')?.textContent.includes('TEST')",'copy failure must be explicit')
 assert((await run("document.querySelector('.imageSendSummary b').textContent")).includes('3 ảnh'),'Copy error must retain selected images')
 clipboardFailure=false
 await run("document.querySelector('.copySelectedImages').click();document.querySelector('.copySelectedImages').click()")
 await until("document.querySelector('.imageSendBar [role=status]')?.textContent.includes('Đã copy 3 ảnh')",'copy batch outcome')
 assert.deepEqual(clipboardCopies,[[501,502,503],[501,502,503]],'Exactly one ordered batch per action, including explicit retry')
 // Collapsing changes only presentation; the ordered selection remains intact.
 await run("document.querySelector('.selectionToggle').click()")
 assert(await run("document.querySelector('.imageSendActions').getBoundingClientRect().height===0"),'Collapsed panel must hide actions')
 assert(await run("document.querySelector('.selectionToggle strong').textContent.includes('3 ảnh')"),'Collapsed count')
 await run("document.querySelector('.selectionToggle').click()")
 assert(await run("document.querySelector('.selectedGroupChips').textContent.includes('Size 2')"),'Product/Size summary')
 for(const density of [0,1,2])for(const width of [320,390,768,1366])for(const dark of [false,true]){
  await run("document.querySelectorAll('.headerActions .densitySwitch button')["+density+"].click()")
  await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768})
  if((await run("document.querySelector('.shell').classList.contains('themeDark')"))!==dark)await run("document.querySelector('.themeToggle').click()")
  await run('window.scrollTo(0,document.body.scrollHeight)');await sleep(100)
  assert((await run('document.documentElement.scrollWidth'))<=width+2,'Image sending overflow at '+width)
  assert(await run("document.querySelector('.inventoryImage').getBoundingClientRect().bottom<=document.querySelector('.imageSendBar').getBoundingClientRect().top"),'Bottom send bar must not cover last stock image')
  assert(await run("(()=>{const p=document.querySelector('.floatingActions').getBoundingClientRect(),nav=document.querySelector('.mobileQuickNav');return p.left>=0&&p.right<=innerWidth&&innerWidth-p.right<40&&(!nav||getComputedStyle(nav).display==='none'||p.bottom<nav.getBoundingClientRect().top)})()"),'Right floating panel must clear bottom navigation')
  await shot('inventory-send-'+width+'-'+(dark?'dark':'light')+'-'+density+'.png')
 }
 await run("document.querySelector('.imageSendActions button:last-child').click()")
 await until("!document.querySelector('.imageSendBar')",'clear before Size group')
 await run("document.querySelector('.selectSizeImages').click()")
 assert((await run("document.querySelector('.imageSendSummary b').textContent")).includes('1 ảnh'),'Size group must select filtered Size only')
 await run("document.querySelector('.imageSendActions button:last-child').click()")
 await until("!document.querySelector('.imageSendBar')",'clear before filtered group')
 await run("document.querySelector('.quickImageSelection button').click()")
 assert((await run("document.querySelector('.imageSendSummary b').textContent")).includes('1 ảnh'),'Select results must respect filters')
 nativeClipboardEnabled=false
 await clickMenu('Cài đặt');await clickMenu('Tồn kho')
 await run("Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async d=>{window.sharedFiles=d.files.map(f=>f.name)}})")
 await until("document.querySelector('.quickImageSelection button')?.disabled===false",'mobile sharing inventory loaded')
 await run("document.querySelector('.quickImageSelection button').click()")
 await until("document.querySelector('.copySelectedImages')?.disabled===false",'mobile share capabilities')
 await run("document.querySelector('.copySelectedImages').click()")
 await until("document.querySelector('.copySelectedImages')?.textContent==='CHIA SẺ 3 ẢNH'",'share files prepared for fresh gesture')
 await run("document.querySelector('.copySelectedImages').click()")
 await until("window.sharedFiles?.length===3",'Web Share receives individual files')
 assert.deepEqual(await run('window.sharedFiles'),['MeCaCao_501.jpg','MeCaCao_502.jpg','MeCaCao_503.jpg'],'Share order and unique names')
 assert.equal(receiptWrites,1);assert.equal(importWrites,1);assert.equal(renameWrites,1,'Sharing never causes inventory writes')
 console.log('INVENTORY_SEND_UI PASS: range/group/filter selection, retained hidden selections, Product across Size filter, viewer focus/Escape, clipboard failure/retry/order/double-click, responsive bottom bar, Web Share individual files; native clipboard and external app paste require Windows acceptance')
 console.log('MOBILE_BROWSER_SMOKE PASS: DEMO and mocked LOCAL receipt/catalog/import; scan KPIs, batch review/result, rename confirmation, notice popup/review, responsive/dark, errors/retry and preferences')
}catch(e){failed=e;console.error(e instanceof Error?e.stack:String(e));try{await shot('failure.png')}catch{}}
finally{
 try{ws?.close()}catch{}
 child.kill('SIGTERM')
 await sleep(200)
 if(child.exitCode===null)child.kill('SIGKILL')
 server.close()
 fs.rmSync(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100})
}
if(failed)process.exitCode=1
