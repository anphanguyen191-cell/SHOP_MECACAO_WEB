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
const server=http.createServer((req,res)=>{
 const name=decodeURIComponent(new URL(req.url||'/', 'http://localhost').pathname)
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
const child=spawn(chrome,['--headless=new','--no-sandbox','--no-proxy-server','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--remote-debugging-port=0','--window-size=390,844','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'})
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
 for(let i=0;i<100;i++){
  const file=path.join(profile,'DevToolsActivePort')
  if(child.exitCode!==null)throw Error('Chrome exited before debugger opened')
  if(fs.existsSync(file)){port=Number(fs.readFileSync(file,'utf8').split('\n')[0]);break}
  await sleep(150)
 }
 assert(port,'Chrome debugger port missing')
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
 await shot('inventory-light.png')
 await run("document.querySelector('.sizesInsight').scrollIntoView({block:'center'})")
 await sleep(350)
 await shot('inventory-chart-light.png')
 await run("document.querySelector('.inventoryPage .dashboardFoldToggle').click()")
 assert(await run("document.querySelector('.inventoryMetrics')===null"),'Inventory collapse failed')
 await run("document.querySelector('.inventoryPage .dashboardFoldToggle').click()")
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
 console.log('MOBILE_BROWSER_SMOKE PASS: 390px chart labels, mobile overflow, four dashboard folds, dark-mode contrast, drawer keyboard, route navigation')
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
