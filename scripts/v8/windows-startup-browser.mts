import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {setTimeout as sleep} from 'node:timers/promises'
import express from 'express'
import {createWindowsAuth} from '../../apps/api/src/windowsAuth.ts'

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cacao-startup-ui-'))
const artifacts=path.resolve('artifacts/main-release/startup-v2')
fs.mkdirSync(artifacts,{recursive:true})
const app=express();app.use(express.json())
const auth=createWindowsAuth(path.join(tmp,'data'))
app.use('/api/local/auth',auth.router)
app.get('/api/health',(_req,res)=>res.json({ok:true,windowsAuth:true,version:'8.0.test',schema:130,database:'shop-v8.db',customWarehouse:true,warehouse:'D:\\1-Me CaCao Store',salesDrafts:false,salesExecution:false,lanClient:false}))
app.use('/api',auth.gate)
const notices=[{id:'new-photos',kind:'changes',message:'2 mẫu mới · 56 Size mới · 0 ảnh chờ duyệt · 19 ảnh đã đăng ký bị thiếu',createdAt:'2026-10-16',state:'unseen'}]
app.get('/api/warehouse/notices',(_req,res)=>res.json(notices))
app.get('/api/warehouse/settings',(_req,res)=>res.json({popup:true,rootPath:'D:\\1-Me CaCao Store',startup:true,periodic:true,intervalSeconds:300,autoRename:false}))
app.post('/api/test/new-notice',(_req,res)=>{notices.unshift({id:'new-arrival',kind:'changes',message:'Mẫu mới được phát hiện sau khi mở chương trình',createdAt:new Date().toISOString(),state:'unseen'});res.json({ok:true})})
app.patch('/api/warehouse/notices/:id',(req,res)=>{const n=notices.find(x=>x.id===req.params.id);if(n)n.state=req.body.state;res.json(notices)})
app.get('/api/inventory/dashboard',(_req,res)=>res.json({stock:2966,products:14,skus:112,outOfStock:1,mismatches:12,topProducts:[]}))
app.get('/api/inventory/filter-options',(_req,res)=>res.json({sizes:[]}))
app.get('/api/products',(_req,res)=>res.json([]))
app.get('/api/lan/changes',(_req,res)=>res.json({version:1}))
const webDist=path.resolve('apps/web/dist')
app.use(express.static(webDist))
app.get('*',(_req,res)=>res.sendFile(path.join(webDist,'index.html')))
const server=app.listen(0,'127.0.0.1')
await new Promise<void>((resolve,reject)=>{if(server.listening)resolve();else{server.once('listening',resolve);server.once('error',reject)}})
const port=(server.address() as any).port
const chrome=process.env.CHROME_BIN||['/usr/bin/google-chrome','/usr/bin/chromium'].find(fs.existsSync)
assert(chrome,'Chromium required for startup visual acceptance')
const profile=path.join(tmp,'chrome')
let browser:any=null,ws:WebSocket|null=null,sequence=0
const pending=new Map<number,{resolve:(x:any)=>void;reject:(e:Error)=>void}>()
function command(method:string,params:Record<string,unknown>={}):Promise<any>{
 return new Promise((resolve,reject)=>{
  const id=++sequence
  const timeout=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'))},15000)
  pending.set(id,{resolve:x=>{clearTimeout(timeout);resolve(x)},reject:e=>{clearTimeout(timeout);reject(e)}})
  ws!.send(JSON.stringify({id,method,params}))
 })
}
async function run(expression:string){
 const x=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})
 if(x.exceptionDetails)throw Error(JSON.stringify(x.exceptionDetails))
 return x.result.value
}
async function until(expression:string,label=expression){
 for(let i=0;i<160;i++){if(await run(expression))return;await sleep(100)}
 throw Error('TIMEOUT '+label+'; '+await run('document.body.innerText.slice(0,500)'))
}
async function screenshot(name:string){
 const result=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
 fs.writeFileSync(path.join(artifacts,name),Buffer.from(result.data,'base64'))
}
try{
 browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-proxy-server','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']})
 for(let i=0;i<200&&!fs.existsSync(path.join(profile,'DevToolsActivePort'));i++)await sleep(100)
 assert(fs.existsSync(path.join(profile,'DevToolsActivePort')),'Chromium did not start')
 const debugPort=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0])
 const targets=await fetch('http://127.0.0.1:'+debugPort+'/json/list').then(r=>r.json())
 ws=new WebSocket(targets.find((t:any)=>t.type==='page').webSocketDebuggerUrl)
 await new Promise<void>((resolve,reject)=>{ws!.addEventListener('open',()=>resolve(),{once:true});ws!.addEventListener('error',()=>reject(Error('DevTools connection failed')),{once:true})})
 ws.addEventListener('message',event=>{
  const data=JSON.parse(String(event.data)),entry=pending.get(data.id)
  if(!entry)return
  pending.delete(data.id);data.error?entry.reject(Error(JSON.stringify(data.error))):entry.resolve(data.result)
 })
 await command('Page.enable');await command('Runtime.enable')
 await command('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false})
 await command('Page.navigate',{url:'http://127.0.0.1:'+port})
 await until("!!document.querySelector('.luxeSplashScreen')",'initial splash')
 assert(await run("!document.querySelector('.shell')"),'CORE must not mount before sign-in')
 await screenshot('01-welcome.png')
 await run("document.querySelector('.luxeSplashContinue').click()")
 await until("!!document.querySelector('.luxeStartupForm')",'first-time owner setup')
 assert(await run("document.querySelector('.luxeStartupCard h2').textContent.includes('Tạo tài khoản')"))
 assert(await run("(()=>{const scenic=document.querySelector('.cacaoDemoVisual')?.getBoundingClientRect(),form=document.querySelector('.cacaoDemoFormZone')?.getBoundingClientRect();return !!scenic&&!!form&&scenic.width>form.width&&scenic.right<=form.left+2&&scenic.height>500&&form.height>500})()"),'Approved demo login must have large left scenic panel and right form, not a centered card')
 assert(await run("getComputedStyle(document.querySelector('.cacaoDemoScene')).backgroundImage.includes('travel-luxe-login-scene.svg')"),'Use original demo scenic illustration')
 await screenshot('02-setup.png')
 await command('Emulation.setDeviceMetricsOverride',{width:1872,height:860,deviceScaleFactor:1,mobile:false})
 assert(await run("(()=>{const screen=document.querySelector('.cacaoDemoAuthScreen').getBoundingClientRect(),visual=document.querySelector('.cacaoDemoVisual').getBoundingClientRect(),form=document.querySelector('.cacaoDemoFormZone').getBoundingClientRect();return Math.abs(screen.width-innerWidth)<2&&visual.width>650&&form.width>390&&Math.abs(screen.height-innerHeight)<2})()"),'Approved sign-in must fill 1872x860 laptop viewport without narrow old card')
 await screenshot('02b-setup-full-laptop.png')
 await command('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false})
 await run("document.querySelector('input[name=username]').value='owner';document.querySelector('input[name=username]').dispatchEvent(new Event('input',{bubbles:true}))")
 await run("(()=>{const input=document.querySelector('input[name=password]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'MecacaoOwner2026!Secure');input.dispatchEvent(new Event('input',{bubbles:true}));const confirm=document.querySelector('input[autocomplete=new-password]:not([name=password])');setter.call(confirm,'MecacaoOwner2026!Secure');confirm.dispatchEvent(new Event('input',{bubbles:true}))})()")
 await run("document.querySelector('.luxeStartupForm button[type=submit]').click()")
 await until("!!document.querySelector('.luxeDesktopSidebar')",'authenticated desktop')
 await until("document.querySelector('.warehouseNotifications>button span')?.textContent==='1'",'initial warehouse notice in bell')
 assert.equal(await run("document.querySelectorAll('.warehouseToast').length"),0,'Initial scan must not interrupt Dashboard')
 await run("fetch('/api/test/new-notice',{method:'POST'})")
 await run("window.dispatchEvent(new Event('mecacao-server-change'))")
 await until("!!document.querySelector('.warehouseToast')",'one compact warehouse toast after new change')
 assert.equal(await run("document.querySelectorAll('.warehouseToast').length"),1)
 assert.equal(await run("document.querySelectorAll('.folderModal,.folderOverlay').length"),0)
 await screenshot('03-dashboard-one-notice.png')
 await run("document.querySelector('.warehouseNotifications>button').click()")
 await until("!!document.querySelector('.warehouseNoticePanel')",'bell panel')
 assert.equal(await run("document.querySelectorAll('.warehouseToast').length"),0,'Bell panel must replace toast')
 assert(await run("!!document.querySelector('.warehouseNoticeTabs')"),'Notification panel must offer pending/history tabs')
 assert(await run("document.querySelectorAll('.warehouseNoticeItem').length>=2"),'Notification panel must display real pending records')
 await screenshot('04-bell-panel.png')
 // The header remains stationary while only the right workspace scrolls.
 assert(await run("getComputedStyle(document.querySelector('.luxeDesktopTopbar')).position==='relative'"),'Topbar must not stick over business content')
 assert(await run("getComputedStyle(document.querySelector('.luxePageScene')).overflowY==='auto'"),'Workspace must scroll independently')
 assert(await run("(()=>{const top=document.querySelector('.luxeDesktopTopbar').getBoundingClientRect().top;document.querySelector('.luxePageScene').scrollTop=240;return Math.abs(document.querySelector('.luxeDesktopTopbar').getBoundingClientRect().top-top)<2})()"),'Scrolling workspace must not move or overlay the topbar')
 await run("document.querySelector('.luxeSideItem[title=\\\"Cài đặt\\\"]').click()")
 await until("!!document.querySelector('select[aria-label=\\\"Hiệu ứng chuyển trang\\\"]')",'real settings page transition selector')
 await screenshot('06-settings-travel-luxe.png')
 await run("(()=>{const sel=document.querySelector('select[aria-label=\\\"Hiệu ứng chuyển trang\\\"]');sel.value='slide';sel.dispatchEvent(new Event('change',{bubbles:true}))})()")
 await run("document.querySelector('.luxeSideItem[title=\\\"Tổng quan\\\"]').click()")
 await until("!!document.querySelector('.luxePageContent.luxeAppear-slide')",'slide transition from settings to dashboard')
 await screenshot('07-dashboard-slide-transition.png')
 await run("document.querySelector('.luxeTopLogout').click()")
 await until("!!document.querySelector('.luxeSplashScreen')",'splash after logout')
 await run("document.querySelector('.luxeSplashContinue').click()")
 await until("!!document.querySelector('.luxeStartupSavedPassword')",'remembered login')
 assert(await run("!!document.querySelector('.cacaoDemoVisual')&&!!document.querySelector('.cacaoDemoBrandRow')"),'Remembered sign-in must preserve approved scenic demo layout')
 await screenshot('05-remembered-login.png')
 await run("document.querySelector('.luxeStartupForm button[type=submit]').click()")
 await until("!!document.querySelector('.luxeDesktopSidebar')",'one-click login')
 await command('Page.reload',{ignoreCache:true})
 await until("!!document.querySelector('.luxeSplashScreen')",'welcome every reload')
 assert(await run("!document.querySelector('.shell')"),'Page reload must require explicit login click again')
 await until("!!document.querySelector('.luxeStartupForm')",'splash must advance automatically without any click')
 assert(await run("!document.querySelector('.shell')"),'Automatic splash advance must never bypass Windows authentication')
 console.log('WINDOWS_STARTUP_BROWSER PASS: welcome -> owner setup -> dashboard, one toast after new warehouse change/no modal, bell pending/history panel, logout, remembered one-click login, welcome on every reload')
}finally{
 try{ws?.close()}catch{}
 if(browser&&browser.exitCode===null){browser.kill();await sleep(300)}
 await new Promise<void>(resolve=>server.close(()=>resolve()))
 fs.rmSync(tmp,{recursive:true,force:true,maxRetries:3,retryDelay:100})
}
