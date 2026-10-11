// Browser/UI integration with an isolated fake Supabase transport. This does not
// replace the transactional SQL tests or physical Windows/iPhone acceptance.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import {spawn} from 'node:child_process'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {setTimeout as delay} from 'node:timers/promises'
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mc-cloud-browser-')),profile=path.join(temp,'profile'),image=await sharp({create:{width:100,height:140,channels:3,background:'#923e71'}}).jpeg().toBuffer()
const state={sequence:0,orders:[],items:[],confirmations:[],reconciled:[],requests:new Map(),lost:false}
const product={id:1,product_code:'FAKE1',name:'FAKE áo thử',status:'active',cloud_revision:1},variant={id:1,product_id:1,sku:'FAKE1-S1',size:'S1',status:'active',sale_price:50000,cost_price:10000,cloud_revision:1}
function rows(table){return ({products:[product],product_variants:[variant],product_images:[{id:1,product_id:1,variant_id:1}],cloud_image_assets:[{image_id:1,object_path:'fake1.jpg',ready:true,sha256:'a'.repeat(64)}],sales_orders:state.orders,sales_order_images:state.items,sales_confirmations:state.confirmations,sales_units:state.confirmations.length?[{image_id:1,order_id:state.orders[0].id,variant_id:1,snapshot:JSON.stringify(state.items[0])}]:[]})[table]||[]}
function finance(id){return {orderId:id,orderVersion:1,orderStatus:state.confirmations.length?'SOLD':'DRAFT',version:0,method:'COD',delivery:'NEW',tracking:'',adjustedTotal:50000,netCollected:0,due:50000,originalTotal:50000,refundDue:0}}
const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'fake@example.invalid',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString()}
const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),token=enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',aud:'authenticated'})+'.fake'
const session={access_token:token,refresh_token:'fake-only-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user}
const root=path.resolve('apps/web/dist'),server=http.createServer((req,res)=>{
 if(req.url.startsWith('/api/')){let body='';req.on('data',b=>body+=b);req.on('end',()=>{res.setHeader('Content-Type','application/json');if(req.url==='/api/cloud/state')res.end(JSON.stringify({instance:'fake',enabled:false,reconciled:state.reconciled}));else if(req.url==='/api/cloud/reconcile'){state.reconciled.push(...JSON.parse(body).orders);res.end('{"results":[]}')}else res.end('{}')});return}
 const name=new URL(req.url,'http://fake').pathname,file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.jpg')?'image/jpeg':file.endsWith('.svg')?'image/svg+xml':'text/html');res.end(fs.readFileSync(file))}catch{res.writeHead(404);res.end()}
})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/?cloud=1'
const chrome=process.env.CHROME_BIN||['/usr/bin/google-chrome','/usr/bin/chromium'].find(fs.existsSync);assert(chrome,'Chromium required')
const browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-proxy-server','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'})
let ws,next=0;const pending=new Map(),failures=[],trace=[]
function cmd(method,params={}){return new Promise((resolve,reject)=>{const id=++next,t=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'))},20000);pending.set(id,{resolve:r=>{clearTimeout(t);resolve(r)},reject});ws.send(JSON.stringify({id,method,params}))})}
async function run(expression){const r=await cmd('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
async function until(expression){for(let n=0;n<150;n++){if(await run(expression))return;await delay(100)}throw Error(expression+'\n'+await run('document.body.innerText'))}
async function click(label){await run(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Button unavailable');b.click()})()`)}
async function intercept(p){trace.push({url:p.request.url,method:p.request.method,body:p.request.postData,headers:p.request.headers});
 if(p.request.method==='OPTIONS'){await cmd('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:200,responseHeaders:[{name:'Access-Control-Allow-Origin',value:'*'},{name:'Access-Control-Allow-Headers',value:Object.entries(p.request.headers).find(([key])=>key.toLowerCase()==='access-control-request-headers')?.[1]||'authorization,apikey,x-client-info,content-type,x-supabase-api-version'},{name:'Access-Control-Allow-Methods',value:'GET,POST,PUT,DELETE,OPTIONS'}],body:'e30='});return}
 const u=new URL(p.request.url),body=p.request.postData?JSON.parse(p.request.postData):{},endpoint=u.pathname.split('/').pop();let response={},status=200,mime='application/json',binary
 if(u.pathname==='/auth/v1/user')response=user
 else if(u.pathname.includes('/rest/v1/rpc/')){
  if(endpoint==='mc_v7_health')response={contract:1,schema:130,role:'owner',status:'CLOUD_TEST_READY',instance:'fake',sequence:state.sequence}
  else if(endpoint==='mc_v7_rows'){const all=rows(body.p_table),offset=Number(body.p_after||0);response={rows:all.slice(offset,offset+body.p_limit),nextOffset:offset+body.p_limit}}
  else if(endpoint==='mc_v7_finance')response=finance(body.p_id)
  else if(endpoint==='mc_v7_command'){
   const old=state.requests.get(body.p_request)
   if(old){if(!state.allowRetry&&body.p_action==='draft.save'){await cmd('Fetch.failRequest',{requestId:p.requestId,errorReason:'ConnectionClosed'});return}response=old}
   else if(body.p_action==='draft.save'){const o=body.p_payload;state.orders.push({id:o.id,status:'DRAFT',version:1,discount:o.discount||0,note:''});state.items.push({order_id:o.id,image_id:1,product_id:1,variant_id:1,product_name:product.name,product_code:product.product_code,size:variant.size,sku:variant.sku,unit_price:50000,unit_cost:10000});response={id:o.id,version:1};state.requests.set(body.p_request,response);state.sequence++;if(!state.lost){state.lost=true;await cmd('Fetch.failRequest',{requestId:p.requestId,errorReason:'ConnectionClosed'});return}}
   else if(body.p_action==='sale.confirm'){state.confirmations.push({order_id:body.p_payload.id,version:1});response={id:body.p_payload.id,status:'SOLD',version:1};state.requests.set(body.p_request,response);state.sequence++}
   else {status=400;response={code:'P0001',message:'FAKE unsupported action'}}
  }
 }else if(u.pathname==='/storage/v1/object/sign/shop-mobile-images')response=body.paths.map(p=>({path:p,signedURL:'/object/sign/shop-mobile-images/'+p+'?token=fake'}))
 else if(u.pathname.startsWith('/storage/v1/object/sign/')){binary=image;mime='image/jpeg'}
 else {status=400;response={message:'FAKE unsupported endpoint'}}
 await cmd('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:mime},{name:'Access-Control-Allow-Origin',value:'*'},{name:'Access-Control-Allow-Headers',value:'*'}],body:(binary||Buffer.from(JSON.stringify(response))).toString('base64')})
}
try{
 for(let n=0;n<150&&!fs.existsSync(path.join(profile,'DevToolsActivePort'));n++)await delay(100)
 const port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]),targets=await fetch('http://127.0.0.1:'+port+'/json/list').then(r=>r.json());ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl)
 await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})})
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data),cb=pending.get(m.id);if(cb){pending.delete(m.id);m.error?cb.reject(Error(JSON.stringify(m.error))):cb.resolve(m.result)}else if(m.method==='Fetch.requestPaused')void intercept(m.params).catch(e=>failures.push(e));else if(m.method==='Page.javascriptDialogOpening')void cmd('Page.handleJavaScriptDialog',{accept:true})})
 await cmd('Page.enable');await cmd('Runtime.enable');await cmd('Network.enable');await cmd('Network.setBypassServiceWorker',{bypass:true});await cmd('Network.setBlockedURLs',{urls:['wss://eyckwoewpomssjjggslr.supabase.co/*']});await cmd('Fetch.enable',{patterns:[{urlPattern:'https://eyckwoewpomssjjggslr.supabase.co/*'}]})
 await cmd('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('mecacao-v7-auth',${JSON.stringify(JSON.stringify(session))});localStorage.setItem('mecacao-ui-cloud-auto-sync','false')`})
 await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await cmd('Page.navigate',{url});await until("!!document.querySelector('.cloudCard img')&&document.querySelector('.cloudCard img').complete")
 assert.equal(await run('document.documentElement.scrollWidth<=innerWidth+2'),true)
 await run("document.querySelector('.cloudCard').click()");await click('Mở thao tác');assert(await run("(()=>{const r=document.querySelector('.cloudSelection').getBoundingClientRect();return r.right<=innerWidth&&r.bottom<=innerHeight&&r.left>0})()"))
 await click('Tạo đơn nháp');await until("!!localStorage.getItem('mecacao-v7-pending-command')")
 await until("Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Kiểm tra thao tác trước'&&!b.disabled)");state.allowRetry=true;await click('Kiểm tra thao tác trước');await until("document.body.innerText.includes('FAKE')&&document.body.innerText.includes('bản 1')")
 assert.equal(state.orders.length,1);assert.equal(await run("localStorage.getItem('mecacao-v7-pending-command')"),null)
 await click('Tạo phiếu PNG');await until("!!document.querySelector('a[download$=\".png\"]')")
 const png=await run("fetch(document.querySelector('a[download$=\".png\"]').href).then(r=>r.blob()).then(b=>createImageBitmap(b)).then(b=>({width:b.width,height:b.height}))");assert.equal(png.width,1000);assert(png.height>600);assert.equal(state.confirmations.length,0)
 await click('Chốt SOLD');await until("document.body.innerText.includes('SOLD')&&!Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Chốt SOLD')")
 assert.equal(state.confirmations.length,1)
 await click('Tồn kho');await until("document.body.innerText.includes('0 ảnh tồn sẵn sàng Cloud')")
 for(const label of ['Nhỏ','Vừa','Lớn']){await click(label);assert(await run('document.documentElement.scrollWidth<=innerWidth+2'))}
 await click('Giao diện tối');assert(await run("document.querySelector('.cloudWorkspace').classList.contains('themeDark')"))
 await cmd('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await until("document.body.innerText.includes('Mất mạng')");assert(await run("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Đọc lại').disabled"))
 assert.deepEqual(failures,[]);console.log('PASS Cloud browser fake transport: mobile layout/density/theme, lost-response durable retry, single draft, real banner PNG without stock mutation, SOLD removal and offline guard')
}catch(error){console.error('Cloud browser failure:',error);console.error('Transport failures:',failures);console.error('Transport trace:',trace);try{console.error(await run('document.body.innerText'));const shot=await cmd('Page.captureScreenshot',{format:'png'});fs.mkdirSync('artifacts/cloud-browser',{recursive:true});fs.writeFileSync('artifacts/cloud-browser/failure.png',Buffer.from(shot.data,'base64'))}catch{}throw error}finally{ws?.close();if(browser.exitCode===null){browser.kill();await new Promise(r=>browser.once('exit',r))}await new Promise(r=>server.close(r));try{fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}catch(error){console.warn('Browser temporary cleanup:',error.code)}}
