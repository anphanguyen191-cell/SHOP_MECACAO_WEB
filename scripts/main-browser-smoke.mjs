import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {setTimeout as sleep} from 'node:timers/promises'
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'main-ui-')),project=path.join(tmp,'release')
fs.mkdirSync(project);fs.cpSync('apps/api/dist',path.join(project,'apps/api/dist'),{recursive:true});fs.cpSync('apps/web/dist',path.join(project,'apps/web/dist'),{recursive:true});fs.copyFileSync('apps/api/package.json',path.join(project,'apps/api/package.json'));fs.symlinkSync(path.resolve('node_modules'),path.join(project,'node_modules'),'junction')
const env={...process.env,SHOP_FRESH_DEVELOPMENT:'1',PORT:'0',SHOP_LAN_ENABLED:'1',SHOP_LAN_BIND:'invalid-inherited-address',SHOP_LAN_PORT:'3443'};for(const k of ['SHOP_DB_PATH','SHOP_SANDBOX_ROOT','SHOP_LOCAL_V2_CONFIG','SHOP_LOCAL_V2_RESTORE_READY','SHOP_TASK_WORKER'])delete env[k]
// Launch the same canonical entry point as Windows, on its own temporary installation.
fs.cpSync('scripts/start-stage2.mjs',path.join(project,'scripts/start-stage2.mjs'),{recursive:true})
const app=spawn(process.execPath,['scripts/start-stage2.mjs'],{cwd:project,env,stdio:['ignore','pipe','pipe']});let logs='';app.stdout.on('data',b=>logs+=b);app.stderr.on('data',b=>logs+=b)
const chrome=process.env.CHROME_BIN||['/usr/bin/google-chrome','/usr/bin/chromium'].find(fs.existsSync);assert(chrome,'Linux CI Chromium is required')
const profile=path.join(tmp,'profile'),browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-proxy-server','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'})
let ws,n=0;const pending=new Map()
function cmd(method,params={}){return new Promise((resolve,reject)=>{const id=++n,t=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'))},15000);pending.set(id,{resolve:r=>{clearTimeout(t);resolve(r)},reject});ws.send(JSON.stringify({id,method,params}))})}
async function run(expression){const r=await cmd('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
async function until(expression){for(let i=0;i<100;i++){if(await run(expression))return;await sleep(100)}throw Error(expression)}
async function stop(p){if(p.exitCode!==null)return;await new Promise(r=>{p.once('exit',r);p.kill()})}
try{
 for(let i=0;i<120;i++){if(app.exitCode!==null)throw Error(logs);try{const h=await fetch('http://127.0.0.1:3000/api/health').then(r=>r.json());if(h.freshDevelopment)break}catch{}await sleep(100)}
 for(let i=0;i<150&&!fs.existsSync(path.join(profile,'DevToolsActivePort'));i++)await sleep(100)
 const port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]),targets=await fetch('http://127.0.0.1:'+port+'/json/list').then(r=>r.json())
 ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})});ws.addEventListener('message',e=>{const m=JSON.parse(e.data),cb=pending.get(m.id);if(cb){pending.delete(m.id);m.error?cb.reject(Error(JSON.stringify(m.error))):cb.resolve(m.result)}})
 await cmd('Page.enable');await cmd('Runtime.enable');await cmd('Page.navigate',{url:'http://127.0.0.1:3000'});await until("!!document.querySelector('.releaseWarehouse button')")
 assert(await run("document.querySelector('.releaseStatus').textContent.includes('3.4.0-stage6-main-test')"))
 assert.equal((await fetch('http://127.0.0.1:3000/api/local/lan').then(r=>r.json())).enabled,false)
 await run("document.querySelector('.releaseWarehouse button').click()");await until("!!document.querySelector('.folderModal')");await run("document.querySelector('[aria-label=\"Đóng chọn thư mục\"]').click()")
 // Real folder selection, automatic launcher restart, and UI reload without manual scripts.
 const own=path.join(tmp,'my-test-warehouse');fs.mkdirSync(own)
 await run("fetch('/api/local/warehouse',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({warehouse:"+JSON.stringify(own)+"})}).then(r=>r.json())")
 for(let i=0;i<100;i++){try{const h=await fetch('http://127.0.0.1:3000/api/health').then(r=>r.json());if(h.customWarehouse)break}catch{}await sleep(100)}
 await cmd('Page.reload');await until("document.querySelector('.releaseWarehouse')?.textContent.includes("+JSON.stringify(own)+")")
 assert(await run("!Array.from(document.querySelectorAll('.releaseWarehouse button')).some(b=>b.textContent.includes('CHỌN KHO'))"))
 const out=path.resolve('artifacts/main-release');fs.mkdirSync(out,{recursive:true})
 for(const width of [1366,390])for(const dark of [false,true]){
  await cmd('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:900,deviceScaleFactor:1,mobile:width===390});await run("document.querySelector('.shell').classList.toggle('themeDark',"+dark+")");await sleep(100)
  assert(await run('document.documentElement.scrollWidth<=innerWidth+2'))
  if(!dark)assert(await run("new Set(Array.from(document.querySelectorAll('.overviewStat')).map(e=>getComputedStyle(e).backgroundColor)).size>=3"))
  const pic=await cmd('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,width+'-'+(dark?'dark':'light')+'.png'),Buffer.from(pic.data,'base64'))
 }
 console.log('MAIN_BROWSER PASS: canonical launcher, version/progress, picker, own warehouse, automatic restart, 1366/390px light/dark')
}finally{ws?.close();await stop(browser);await stop(app);fs.rmSync(tmp,{recursive:true,force:true})}
