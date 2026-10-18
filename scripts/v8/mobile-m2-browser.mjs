// M2 browser visual contract: isolated static Cloud build; NO real Supabase credentials.
// Chromium is CI-only. Captures baseline screenshots across Mobile widths.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {setTimeout as delay} from 'node:timers/promises'

const root=path.resolve('apps/web/dist')
assert(fs.existsSync(path.join(root,'index.html')),'Run npm run build first')
const artifacts=path.resolve('artifacts/mobile-m2')
fs.mkdirSync(artifacts,{recursive:true})
const types={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.html':'text/html'}
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname
 if(pathname.startsWith('/api/')){res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');return}
 const full=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname))
 const file=full.startsWith(root+path.sep)&&fs.existsSync(full)&&fs.statSync(full).isFile()?full:path.join(root,'index.html')
 res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream')
 fs.createReadStream(file).pipe(res)
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const port=server.address().port
const chrome=process.env.CHROME_BIN||['/usr/bin/google-chrome','/usr/bin/chromium'].find(fs.existsSync)
assert(chrome,'Chromium binary required')
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-m2-'))
const browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-proxy-server','--remote-debugging-port=0','--user-data-dir='+tmp,'about:blank'],{stdio:['ignore','ignore','pipe']})
let errors=''
browser.stderr.on('data',b=>errors+=String(b).slice(-1000))
let ws
let nextId=0
const pending=new Map()
const cmd=(method,params={})=>new Promise((resolve,reject)=>{
 const id=++nextId,timeout=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'))},16000)
 pending.set(id,{resolve:value=>{clearTimeout(timeout);resolve(value)},reject:e=>{clearTimeout(timeout);reject(e)}})
 ws.send(JSON.stringify({id,method,params}))
})
const evaluate=async expression=>{
 const result=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})
 if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails))
 return result.result.value
}
try{
 let activePort
 for(let i=0;i<150;i++){if(fs.existsSync(path.join(tmp,'DevToolsActivePort'))){activePort=Number(fs.readFileSync(path.join(tmp,'DevToolsActivePort'),'utf8').split('\n')[0]);break}await delay(100)}
 assert(activePort,'Chromium did not start: '+errors.slice(-1000))
 const targets=await fetch('http://127.0.0.1:'+activePort+'/json/list').then(r=>r.json())
 ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl)
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})})
 ws.addEventListener('message',e=>{const r=JSON.parse(String(e.data)),cb=pending.get(r.id);if(cb){pending.delete(r.id);r.error?cb.reject(Error(JSON.stringify(r.error))):cb.resolve(r.result)}})
 await cmd('Page.enable')
 await cmd('Runtime.enable')
 for(const width of [375,390,430,768]){
  await cmd('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true})
  await cmd('Page.navigate',{url:'http://127.0.0.1:'+port+'/?cloud=1'})
  let found=false
  for(let i=0;i<85;i++){await delay(100);if(await evaluate("!!document.querySelector('.cloudWorkspace .mobileLuxeNav')")){found=true;break}}
  assert(found,'Cloud Mobile nav absent at '+width+'px; body: '+String(await evaluate('document.body.innerText.slice(0,400)')))
  if(width===390){
   assert(await evaluate("!!document.querySelector('.mobileLuxeSplash button')"),'Mobile splash must appear before login')
   const splashShot=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
   fs.writeFileSync(path.join(artifacts,'splash-390.png'),Buffer.from(splashShot.data,'base64'))
  }
  let dismissed=false
  for(let i=0;i<40;i++){if(await evaluate("!document.querySelector('.mobileLuxeSplash')")){dismissed=true;break}await delay(100)}
  assert(dismissed,'Splash should dismiss automatically and reveal actual Cloud login without changing session')

  await delay(250)
  const state=await evaluate(`(()=>{
   const nav=document.querySelector('.mobileLuxeNav'),box=nav.getBoundingClientRect()
   const shell=document.querySelector('.mobileLuxeWorkspace')
   return {viewport:innerWidth,scroll:document.documentElement.scrollWidth,navButtons:nav.querySelectorAll('button').length,
    navBottom:box.bottom,screenHeight:innerHeight,navDisplay:getComputedStyle(nav).display,
    header:!!shell.querySelector('[data-mobile-luxe-version="M2-V2.0"]'),
    login:!!shell.querySelector('.mobileLoginIntro h1')&&shell.querySelector('.cloudSettings input[type=email]').getBoundingClientRect().height>=44,
    loginWidth:shell.querySelector('.cloudSettings form').getBoundingClientRect().width,
    style:getComputedStyle(shell).getPropertyValue('--mobile-luxe-rose').trim()}
  })()`)
  assert(state.header&&state.login,'Mobile login missing at '+width+'px')
  assert(state.navDisplay==='none','Signed-out mobile must show login rather than application navigation')
  assert(state.loginWidth>220&&state.loginWidth<=width,'Login form must fit the phone')
  assert(state.style,'Mobile scoped tokens not applied at '+width+'px')
  assert(state.navButtons>=3&&state.navButtons<=5,'Wrong number of nav buttons at '+width+'px: '+state.navButtons)
  assert(state.scroll<=state.viewport+3,'Unexpected horizontal overflow at '+width+'px: '+JSON.stringify(state))
  assert(state.navBottom<=state.screenHeight+3,'Navigation below viewport at '+width+'px')
  const shot=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
  fs.writeFileSync(path.join(artifacts,'cloud-'+width+'.png'),Buffer.from(shot.data,'base64'))
  console.log('M2 CLOUD viewport PASS',width,JSON.stringify(state))
 }
}finally{
 try{ws?.close()}catch{}
 if(browser.exitCode===null&&browser.signalCode===null)browser.kill('SIGTERM')
 if(browser.exitCode===null&&browser.signalCode===null)await Promise.race([new Promise(resolve=>browser.once('exit',resolve)),delay(3000)])
 if(browser.exitCode===null&&browser.signalCode===null){
  browser.kill('SIGKILL')
  await Promise.race([new Promise(resolve=>browser.once('exit',resolve)),delay(3000)])
 }
 server.close()
 try{fs.rmSync(tmp,{recursive:true,force:true,maxRetries:12,retryDelay:150})}
 catch(error){
  if(!['ENOTEMPTY','EBUSY','EPERM'].includes(error?.code))throw error
  console.warn('Browser profile cleanup deferred to runner teardown:',error.code)
 }
}
