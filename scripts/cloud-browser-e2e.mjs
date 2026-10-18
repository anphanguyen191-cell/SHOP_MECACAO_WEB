// Browser/UI integration with an isolated fake Supabase transport. This does not
// replace the transactional SQL tests or physical Windows/iPhone acceptance.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import {spawn} from 'node:child_process'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate'
import {createHash} from 'node:crypto'
import {setTimeout as delay} from 'node:timers/promises'
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mc-cloud-browser-')),profile=path.join(temp,'profile'),image=await sharp({create:{width:100,height:140,channels:3,background:'#923e71'}}).jpeg().toBuffer()
const imageSha=createHash('sha256').update(image).digest('hex')
const state={proofPath:null,proofUploaded:false,loginPassword:'fake-correct-password',autoEnabled:false,archiveValid:true,filePresent:true,deletedAt:null,prepared:false,allowCleanupRetry:true,sequence:0,orders:[],items:[],confirmations:[],reconciled:[],requests:new Map(),lost:false,customers:[{id:'fake-customer',name:'FAKE Khách',phone:'0900000000',address:'FAKE địa chỉ',note:'',version:1}],counts:[{session_id:'fake-count',variant_id:1,counted:null,note:'',snapshot:JSON.stringify({productCode:'FAKE1',productName:'FAKE áo thử',size:'S1',sku:'FAKE1-S1',physical:1,ledger:1})}],countVersion:1}
const product={id:1,product_code:'FAKE1',name:'FAKE áo thử',status:'active',cloud_revision:1},variant={id:1,product_id:1,sku:'FAKE1-S1',size:'S1',status:'active',sale_price:50000,cost_price:10000,cloud_revision:1}
function rows(table){return ({inventory_transactions:[{variant_id:1,transaction_type:'OPENING',quantity:1}],shop_customers:state.customers,stocktake_sessions:[{id:'fake-count',status:'OPEN',title:'FAKE Kiểm kê',version:state.countVersion}],stocktake_rows:state.counts,products:[product],product_variants:[variant],product_images:[{id:1,product_id:1,variant_id:1}],cloud_image_assets:[{image_id:1,object_path:'fake1.jpg',ready:!state.deletedAt,cleanup_requested:state.prepared,deleted_at:state.deletedAt,sha256:'a'.repeat(64),proof_path:state.proofPath,proof_sha256:state.proofPath?imageSha:null}],sales_orders:state.orders,sales_order_images:state.items,sales_confirmations:state.confirmations,sales_units:state.confirmations.length?[{image_id:1,order_id:state.orders[0].id,variant_id:1,snapshot:JSON.stringify(state.items[0])}]:[]})[table]||[]}
function finance(id){return {orderId:id,orderVersion:state.orders.find(o=>o.id===id)?.version||1,recipientName:'FAKE Khách',phone:'0900000000',customerId:'fake-customer',orderStatus:state.confirmations.length?'SOLD':'DRAFT',version:0,method:'COD',delivery:'NEW',tracking:'',adjustedTotal:50000,netCollected:0,due:50000,originalTotal:50000,refundDue:0}}
const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'fake@example.invalid',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString()}
const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),token=enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',aud:'authenticated'})+'.fake'
const session={access_token:token,refresh_token:'fake-only-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user}
const root=path.resolve('apps/web/dist'),server=http.createServer((req,res)=>{
 if(req.url.startsWith('/api/')){let body='';req.on('data',b=>body+=b);req.on('end',()=>{res.setHeader('Content-Type','application/json');if(req.url.startsWith('/api/cloud/proof-images/')){assert(state.archiveValid&&state.reconciled.includes(state.orders[0].id));res.setHeader('Content-Type','image/jpeg');res.setHeader('X-Proof-Sha256',imageSha);res.setHeader('X-Warehouse-Instance','fake');res.end(image)}else if(req.url==='/api/cloud/state')res.end(JSON.stringify({instance:'fake',enabled:state.autoEnabled,reconciled:state.reconciled}));else if(req.url==='/api/cloud/reconcile'){if(!state.archiveValid){res.statusCode=409;res.end('{"error":"FAKE archive corrupt"}');return}state.reconciled.push(...JSON.parse(body).orders);res.end('{"results":[]}')}else res.end('{}')});return}
 const name=new URL(req.url,'http://fake').pathname,file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.jpg')?'image/jpeg':file.endsWith('.svg')?'image/svg+xml':'text/html');res.end(fs.readFileSync(file))}catch{res.writeHead(404);res.end()}
})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/?cloud=1'
const chrome=process.env.CHROME_BIN||['/usr/bin/google-chrome','/usr/bin/chromium'].find(fs.existsSync);assert(chrome,'Chromium required')
const browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-proxy-server','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']})
let browserLog='';browser.stderr.on('data',b=>browserLog+=b)
let ws,next=0;const pending=new Map(),failures=[],trace=[],interceptionErrors=[],cancelledRequests=new Set(),activeInterceptions=new Set(),inflightNetwork=new Map()
// A navigation/React cleanup can cancel a paused request before fulfilment.
// Ignore only the exact stale CDP id error AND a matching browser cancellation;
// fixture assertions, unconfirmed protocol errors and real failures still fail.
function cancelledInterception(error,networkId){
 if(!networkId||!cancelledRequests.has(networkId))return false
 try{const protocol=JSON.parse(error.message);return protocol.code===-32602&&protocol.message==='Invalid InterceptionId.'}catch{return false}
}
async function transportIdle(){let stable=0;for(let n=0;n<300;n++){if(!inflightNetwork.size&&!activeInterceptions.size){if(++stable>=5)return}else stable=0;await delay(40)}throw Error('Fake transport did not settle before deliberate navigation/offline: '+JSON.stringify([...inflightNetwork.values()]))}
async function cmd(method,params={}){if(['Page.navigate','Page.reload','Network.emulateNetworkConditions'].includes(method))await transportIdle();return new Promise((resolve,reject)=>{const id=++next,t=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'))},20000);pending.set(id,{resolve:r=>{clearTimeout(t);resolve(r)},reject});ws.send(JSON.stringify({id,method,params}))})}
async function run(expression){const r=await cmd('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
async function until(expression){for(let n=0;n<150;n++){if(await run("Boolean("+expression+")"))return;await delay(100)}throw Error(expression+'\n'+await run('document.body.innerText'))}
async function click(label){if(label==='Đăng xuất')await transportIdle();await until("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==="+JSON.stringify(label)+"&&!b.disabled)");await run(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Button unavailable');b.click()})()`)}
async function intercept(p){trace.push({url:p.request.url,method:p.request.method,body:p.request.postData});
 if(p.request.method==='OPTIONS'){await cmd('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:200,responseHeaders:[{name:'Access-Control-Allow-Origin',value:'*'},{name:'Access-Control-Allow-Headers',value:Object.entries(p.request.headers).find(([key])=>key.toLowerCase()==='access-control-request-headers')?.[1]||'authorization,apikey,x-client-info,content-type,x-supabase-api-version'},{name:'Access-Control-Allow-Methods',value:'GET,POST,PUT,DELETE,OPTIONS'}],body:'e30='});return}
 const u=new URL(p.request.url),body=p.request.postData&&!u.pathname.startsWith('/storage/v1/object/shop-mobile-images/proof/')?JSON.parse(p.request.postData):{},endpoint=u.pathname.split('/').pop();let response={},status=200,mime='application/json',binary
 if(u.pathname==='/auth/v1/user'){if(p.request.method==='PUT'){assert.equal(body.password,'fake-new-cloud-password');state.loginPassword=body.password}response=user}
 else if(u.pathname==='/auth/v1/logout')response={}
 else if(u.pathname==='/auth/v1/token'&&u.searchParams.get('grant_type')==='password'){assert.equal(body.email,user.email);if(body.password===state.loginPassword)response=session;else {status=400;response={code:'invalid_credentials',msg:'Invalid login credentials'}}}
 else if(u.pathname==='/auth/v1/recover'){assert.equal(body.email,user.email);assert.equal(u.searchParams.get('redirect_to'),'https://anphanguyen191-cell.github.io/SHOP_MECACAO_WEB/?cloud=1');response={}}
 else if(u.pathname==='/auth/v1/otp'){assert.equal(body.email,user.email);assert.equal(u.searchParams.get('redirect_to'),'https://anphanguyen191-cell.github.io/SHOP_MECACAO_WEB/?cloud=1');response={}}
 else if(u.pathname==='/auth/v1/verify'){assert.equal(body.token_hash,'fake-unopened-link');assert.equal(body.type,'email');response=session}
 else if(u.pathname.includes('/rest/v1/rpc/')){
  if(endpoint==='mc_v7_health')response={contract:1,schema:130,role:'owner',status:'CLOUD_TEST_READY',instance:'fake',sequence:state.sequence}
  else if(endpoint==='mc_v7_rows'){const all=rows(body.p_table),offset=Number(body.p_after||0);response={rows:all.slice(offset,offset+body.p_limit),nextOffset:Math.min(offset+Number(body.p_limit||500),all.length)}}
  else if(endpoint==='mc_v7_price_snapshot')response={scope:'CLOUD',instance:'fake',exportedAt:new Date().toISOString(),rows:[{id:1,productCode:product.product_code,sku:variant.sku,name:product.name,size:variant.size,stock:1,cost:variant.cost_price,sale:variant.sale_price,costSet:variant.cost_price>0||!!variant.cost_price_set,saleSet:true,version:variant.cloud_revision}],history:[]}
  else if(endpoint==='mc_v7_prices'){assert.equal(body.p_payload.instance,'fake');assert.equal(body.p_payload.rows[0].cost,10000);const apply=variant.cost_price===0&&!variant.cost_price_set?10000:null;response={costCount:apply===null?0:1,saleCount:0,rows:[{id:1,sku:variant.sku,name:product.name,size:variant.size,applyCost:apply,applySale:null,status:body.p_action==='prices.commit'?'Đã bổ sung':'Sẽ bổ sung'}]};if(body.p_action==='prices.commit'){variant.cost_price=10000;variant.cost_price_set=true;variant.cloud_revision++;state.sequence++;}}
  else if(endpoint==='mc_v7_finance')response=finance(body.p_id)
  else if(endpoint==='mc_v7_debts')response=state.orders.map(o=>finance(o.id))
  else if(endpoint==='mc_v7_proof_register'){assert(state.proofUploaded&&state.archiveValid);assert.equal(body.p_sha,imageSha);assert.equal(body.p_path,'proof/v7/fake/1-'+imageSha+'.jpg');state.proofPath=body.p_path;state.sequence++;response={imageId:1,path:body.p_path}}
  else if(endpoint==='mc_v7_sold_cleanup'){assert(state.proofPath,'Small proof must be registered before original deletion');
   assert.deepEqual(body.p_images,[1]);assert(state.archiveValid&&state.reconciled.includes(state.orders[0].id),'Fresh laptop proof must precede cleanup');
   if(body.p_action==='prepare')state.prepared=true;
   else {assert.equal(body.p_action,'finalize');assert(state.prepared&&!state.filePresent);state.deletedAt='FAKE verified';state.sequence++}
   response={images:[{imageId:1,path:'fake1.jpg',deletedAt:state.deletedAt}]}
  }
  else if(endpoint==='mc_v7_storage_usage')response={objects:1,bytes:10000,readyStock:state.confirmations.length?0:1,soldKept:state.confirmations.length}
  else if(endpoint==='mc_v7_report')response={range:{from:body.p_from,to:body.p_to},generatedAt:new Date().toISOString(),totals:{orders:state.confirmations.length,quantity:state.confirmations.length,goodsTotal:'50000',shipping:'0',receipts:'0',refunds:'0',netCash:'0',dueNow:'50000',refundDueNow:'0',knownCost:'10000',grossMargin:'40000',unknownCosts:0,subtotal:'50000',discount:'0',payableTotal:'50000',credits:'0'},orders:state.confirmations.length?[{id:state.orders[0].id,recipientName:'FAKE Khách',soldAt:new Date().toISOString(),quantity:1,goodsTotal:'50000',shipping:'0',knownCost:'10000',grossMargin:'40000',unknownCosts:0,dueNow:'50000',refundDueNow:'0'}]:[],entries:[],products:[]}
  else if(endpoint==='mc_v7_stocktake'){if(body.p_action!=='stocktake.row')throw Error('FAKE unsupported stocktake action');assert.equal(body.p_payload.version,state.countVersion);state.counts[0].counted=body.p_payload.counted;state.counts[0].note=body.p_payload.note;state.countVersion++;state.sequence++;response={id:'fake-count',version:state.countVersion}}

  else if(endpoint==='mc_v7_command'){
   const old=state.requests.get(body.p_request)
   if(old){if(!state.allowRetry&&body.p_action==='draft.save'){await cmd('Fetch.failRequest',{requestId:p.requestId,errorReason:'ConnectionClosed'});return}response=old}
   else if(body.p_action==='draft.save'){const o=body.p_payload;state.orders.push({id:o.id,status:'DRAFT',version:1,discount:o.discount||0,note:''});state.items.push({order_id:o.id,image_id:1,product_id:1,variant_id:1,product_name:product.name,product_code:product.product_code,size:variant.size,sku:variant.sku,unit_price:50000,unit_cost:10000});response={id:o.id,version:1};state.requests.set(body.p_request,response);state.sequence++;if(!state.lost){state.lost=true;await cmd('Fetch.failRequest',{requestId:p.requestId,errorReason:'ConnectionClosed'});return}}
   else if(body.p_action==='sale.confirm'){state.orders.find(o=>o.id===body.p_payload.id).status='SOLD';state.orders.find(o=>o.id===body.p_payload.id).version++;state.confirmations.push({order_id:body.p_payload.id,version:1});response={id:body.p_payload.id,status:'SOLD',version:1};state.requests.set(body.p_request,response);state.sequence++}
   else {status=400;response={code:'P0001',message:'FAKE unsupported action'}}
  }
 }else if(u.pathname.startsWith('/storage/v1/object/shop-mobile-images/proof/')&&p.request.method==='POST'){state.proofUploaded=true;response={Key:'FAKE proof'}}else if(u.pathname==='/storage/v1/object/shop-mobile-images'&&p.request.method==='DELETE'){
  assert.deepEqual(body.prefixes,['fake1.jpg']);assert(state.prepared&&state.archiveValid&&state.proofPath);state.filePresent=false;
  if(!state.allowCleanupRetry){await cmd('Fetch.failRequest',{requestId:p.requestId,errorReason:'ConnectionClosed'});return}
  response=[{name:'fake1.jpg'}]
 }else if(u.pathname==='/storage/v1/object/sign/shop-mobile-images')response=body.paths.map(p=>({path:p,signedURL:'/object/sign/shop-mobile-images/'+p+'?token=fake'}))
 else if(u.pathname.startsWith('/storage/v1/object/sign/')){binary=image;mime='image/jpeg'}
 else {status=400;response={message:'FAKE unsupported endpoint'}}
 await cmd('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:mime},{name:'Access-Control-Allow-Origin',value:'*'},{name:'Access-Control-Allow-Headers',value:'*'}],body:(binary||Buffer.from(JSON.stringify(response))).toString('base64')})
}
try{
 for(let n=0;n<450&&!fs.existsSync(path.join(profile,'DevToolsActivePort'));n++){if(browser.exitCode!==null)throw Error('Chromium exited '+browser.exitCode+' '+browserLog);await delay(100)}
 assert(fs.existsSync(path.join(profile,'DevToolsActivePort')),'Chromium startup timed out: '+browserLog)
 const port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]),targets=await fetch('http://127.0.0.1:'+port+'/json/list').then(r=>r.json());ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl)
 await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})})
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data),cb=pending.get(m.id);if(cb){pending.delete(m.id);m.error?cb.reject(Error(JSON.stringify(m.error))):cb.resolve(m.result)}else if(m.method==='Fetch.requestPaused'){const task=intercept(m.params).catch(error=>interceptionErrors.push({error,networkId:m.params.networkId,url:m.params.request.url}));activeInterceptions.add(task);void task.finally(()=>activeInterceptions.delete(task))}else if(m.method==='Network.requestWillBeSent'&&m.params.request.url.startsWith('https://eyckwoewpomssjjggslr.supabase.co/'))inflightNetwork.set(m.params.requestId,m.params.request.url);else if(m.method==='Network.loadingFinished'||m.method==='Network.loadingFailed'){inflightNetwork.delete(m.params.requestId);if(m.params.canceled)cancelledRequests.add(m.params.requestId);}else if(m.method==='Page.javascriptDialogOpening')void cmd('Page.handleJavaScriptDialog',{accept:true})})
 await cmd('Page.enable');await cmd('Runtime.enable');await cmd('Network.enable');await cmd('Network.setBypassServiceWorker',{bypass:true});await cmd('Network.setBlockedURLs',{urls:['wss://eyckwoewpomssjjggslr.supabase.co/*']});await cmd('Fetch.enable',{patterns:[{urlPattern:'https://eyckwoewpomssjjggslr.supabase.co/*'}]})
 const authInit=await cmd('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('mecacao-v7-auth',${JSON.stringify(JSON.stringify(session))});localStorage.setItem('mecacao-ui-cloud-auto-sync','false')`})
 await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await cmd('Page.navigate',{url});await until("!!document.querySelector('.mobileStockCard img')&&document.querySelector('.mobileStockCard img').complete&&document.querySelector('.mobileStockCard img').naturalWidth>0")
 fs.mkdirSync('artifacts/cloud-browser',{recursive:true})
 for(const width of [375,390,430,768]){
  await cmd('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});await delay(120)
  assert(await run("document.documentElement.scrollWidth<=innerWidth+2&&getComputedStyle(document.querySelector('.mobileStockGrid')).gridTemplateColumns.split(' ').length===(innerWidth>=600?3:2)"),'Dedicated mobile gallery must fit '+width)
  assert(await run("document.querySelector('.mobileLuxeSectionHeader').getBoundingClientRect().height<80&&!document.body.innerText.includes('· M2')"),'Mobile title must be compact and free of implementation labels')
  fs.writeFileSync('artifacts/cloud-browser/reform-gallery-'+width+'.png',Buffer.from((await cmd('Page.captureScreenshot',{format:'png'})).data,'base64'))
 }
 await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
 await run("document.querySelector('.mobileOpenProduct').click()");await until("!!document.querySelector('.mobileLuxeSheet.isFull')")
 assert(await run("document.activeElement.getAttribute('aria-label')==='Đóng Chi tiết sản phẩm'"),'Product detail must receive focus')
 await delay(220)
 fs.writeFileSync('artifacts/cloud-browser/reform-product-detail.png',Buffer.from((await cmd('Page.captureScreenshot',{format:'png'})).data,'base64'))
 await run("document.querySelector('.mobilePhotoCheck').click()");assert(await run("document.querySelector('.mobilePhotoCheck').getAttribute('aria-pressed')==='true'"))
 await run("document.querySelector('[aria-label=\\\"Đóng Chi tiết sản phẩm\\\"]').click()");await until("!document.querySelector('.mobileLuxeSheet')")
 assert(await run("document.querySelector('.mobileSelectVariant').getAttribute('aria-pressed')==='true'"),'Closing product detail must retain the exact photo selection')
 await run("document.querySelector('.imageSendActions>button:last-child').click()");await until("!document.querySelector('.imageSendBar')")
 await run("document.querySelector('.mobileFilterButton').click()");await until("!!document.querySelector('.mobileInventoryFilterFields')")
 await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}))")
 assert(await run("document.activeElement.textContent==='Xem kết quả'"),'Filter sheet must trap reverse keyboard focus')
 fs.writeFileSync('artifacts/cloud-browser/reform-filters.png',Buffer.from((await cmd('Page.captureScreenshot',{format:'png'})).data,'base64'))
 await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");await until("!document.querySelector('.mobileLuxeSheet')")
 assert.equal(state.orders.length,0,'Browsing and selecting photos must not create a draft')
 await run("document.querySelector('.mobileInventoryAdvanced').click()");await until("!!document.querySelector('.treeProductHead')");await run("document.querySelector('.treeProductHead').click()");await until("!!document.querySelector('.treeVariantHead')");await run("document.querySelector('.treeVariantHead').click()");await until("!!document.querySelector('.stockImageSelect img')");await run("document.querySelector('.stockImageSelect img').scrollIntoView({block:'center'})");await until("document.querySelector('.stockImageSelect img').complete&&document.querySelector('.stockImageSelect img').naturalWidth>0")
 assert.equal(await run('document.documentElement.scrollWidth<=innerWidth+2'),true)
 assert(await run("!!document.querySelector('.topbar .brandLogo')&&!!document.querySelector('.sidebar')&&!!document.querySelector('.mobileQuickNav')"))
 await run("document.querySelector('[aria-label=\"Mở thêm chức năng\"]').click()");await until("!!document.querySelector('.featureDrawer')")
 assert(await run("document.querySelector('.featureDrawer').innerText.includes('Danh mục sản phẩm')&&document.querySelector('.featureDrawer').innerText.includes('Import kho')"))
 await delay(260)
 assert(await run("(()=>{const r=document.querySelector('.featureDrawer').getBoundingClientRect();return Math.abs(r.left)<2&&r.width>=innerWidth-2})()"),'Mobile More must fill the phone')
 fs.writeFileSync('artifacts/cloud-browser/reform-more.png',Buffer.from((await cmd('Page.captureScreenshot',{format:'png'})).data,'base64'))
 await run("document.querySelector('[aria-label=\"Đóng danh mục\"]').click()")
 await run("Array.from(document.querySelectorAll('.sidebar button')).find(b=>b.textContent==='Tổng quan').click()")
 await until("!!document.querySelector('.overviewStats')")
 await run("Array.from(document.querySelectorAll('.sidebar button')).find(b=>b.textContent==='Tồn kho').click()")
 await until("!!document.querySelector('.mobileInventoryAdvanced')");await run("document.querySelector('.mobileInventoryAdvanced').click()")
 await until("!!document.querySelector('.treeProductHead')");await run("document.querySelector('.treeProductHead').click()");await until("!!document.querySelector('.treeVariantHead')");await run("document.querySelector('.treeVariantHead').click()");await until("!!document.querySelector('.stockImageSelect')")
 fs.mkdirSync('artifacts/cloud-browser',{recursive:true});fs.writeFileSync('artifacts/cloud-browser/shared-mobile.png',Buffer.from((await cmd('Page.captureScreenshot',{format:'png'})).data,'base64'))

 // Real mobile Chromium: exported OOXML edited in G, file upload, preview-only and confirmation.
 variant.cost_price=0;variant.cost_price_set=false;
 await click('▸ Excel tồn kho & bổ sung giá');assert(await run('document.documentElement.scrollWidth<=innerWidth+2'));
 await run("window.oldPriceDownload=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download.endsWith('.xlsx'))window.priceBlob=this.href;else return window.oldPriceDownload.call(this)}");await click('Xuất tồn kho Excel');await until('!!window.priceBlob');
 const exported=await run("fetch(window.priceBlob).then(r=>r.blob()).then(b=>new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(b)}))");const z=unzipSync(Buffer.from(exported,'base64'));const original=strFromU8(z['xl/worksheets/sheet1.xml']);assert(original.includes('<c r=\"G2\" s=\"3\" t=\"inlineStr\">'));z['xl/worksheets/sheet1.xml']=strToU8(original.replace(/<c r="G2"[^>]*>.*?<\/c>/,'<c r="G2" s="3"><v>10000</v></c>'));const priceFile=path.join(temp,'prices.xlsx');fs.writeFileSync(priceFile,zipSync(z));
 const priceDoc=await cmd('DOM.getDocument'),priceNode=await cmd('DOM.querySelector',{nodeId:priceDoc.root.nodeId,selector:'.priceWorkbook input[type=file]'});await cmd('DOM.setFileInputFiles',{nodeId:priceNode.nodeId,files:[priceFile]});await until("document.body.innerText.includes('Xem trước — chưa ghi giá')");assert.equal(variant.cost_price,0);assert(await run('document.documentElement.scrollWidth<=innerWidth+2'));
 await run("document.querySelector('.priceWorkbook').scrollIntoView({block:'start'});window.scrollBy(0,-90)");
 fs.writeFileSync('artifacts/cloud-browser/price-excel-mobile-preview.png',Buffer.from((await cmd('Page.captureScreenshot',{format:'png'})).data,'base64'));await click('Xác nhận bổ sung giá');await until("document.body.innerText.includes('Kết quả lần nhập')");assert.equal(variant.cost_price,10000);assert.equal(variant.sale_price,50000);await run('HTMLAnchorElement.prototype.click=window.oldPriceDownload');await click('▾ Excel tồn kho & bổ sung giá');
 await run("document.querySelector('.stockImageSelect').click()");assert(await run("(()=>{const r=document.querySelector('.floatingActions').getBoundingClientRect();const dock=document.querySelector('.mobileQuickNav').getBoundingClientRect();return r.right<=innerWidth&&r.bottom<dock.top&&r.left>0})()"))
 await click('Chuẩn bị chia sẻ');await until("!!document.querySelector('a[download$=\".jpg\"]')")
 const shared=await run("(()=>{const a=document.querySelector('a[download$=\".jpg\"]');return fetch(a.href).then(r=>r.blob()).then(b=>({name:a.download,bytes:b.size}))})()")
 assert(shared.name.includes('S1-1'));assert(shared.bytes>0&&shared.bytes<=150000)
 await run("(()=>{window.fakeLockHeld=false;void navigator.locks.request('mecacao-v7-command',async()=>{window.fakeLockHeld=true;await new Promise(r=>window.fakeReleaseLock=r);window.fakeLockHeld=false});return true})()");await until('window.fakeLockHeld')
 await click('TẠO ĐƠN NHÁP');await until("document.body.innerText.includes('Tab khác đang gửi thao tác Cloud')");assert.equal(state.orders.length,0);assert.equal(await run("localStorage.getItem('mecacao-v7-pending-command')"),null)
 await run('window.fakeReleaseLock();true');await until('!window.fakeLockHeld')
 await run("(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='TẠO ĐƠN NHÁP');b.click();b.click()})()");await until("!!localStorage.getItem('mecacao-v7-pending-command')")
 await run("document.querySelector('.mobileStatusBell').click()");await until("Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Kiểm tra thao tác trước'&&!b.disabled)");state.allowRetry=true;await click('Kiểm tra thao tác trước');await until("document.body.innerText.includes('bản 1')&&!!document.querySelector('.cloudOrder')")
 assert.equal(state.orders.length,1);assert.equal(await run("localStorage.getItem('mecacao-v7-pending-command')"),null)

 await run("document.querySelectorAll('.mobileOrderSteps button')[1].click()")
 const recipient=await run("Array.from(document.querySelectorAll('.contactCard .formGrid label')).find(l=>l.textContent.startsWith('Người nhận')).querySelector('input').focus();true")
 await cmd('Input.insertText',{text:'FAKE chưa lưu'});await until("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Lưu thay đổi'&&!b.disabled)")
 assert(await run("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Chốt SOLD').disabled&&Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Tạo phiếu PNG').disabled"))
 await run("Array.from(document.querySelectorAll('.sidebar button')).find(b=>b.textContent==='Tồn kho').click()")
 assert(await run("!!document.querySelector('.salesEditor')"),'Unsaved draft must block navigation')
 await click('Đọc lại đơn');await until("!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Chốt SOLD').disabled")
 for(const step of [0,1,2,3]){await run("document.querySelectorAll('.mobileOrderSteps button')["+step+"].click()");await delay(220);assert(await run("document.documentElement.scrollWidth<=innerWidth+2"));fs.writeFileSync('artifacts/cloud-browser/reform-order-step-'+step+'.png',Buffer.from((await cmd('Page.captureScreenshot',{format:'png'})).data,'base64'))}
 await run("window.slipText=[];window.slipImages=[];window.originalSlipText=CanvasRenderingContext2D.prototype.fillText;window.originalSlipImage=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.fillText=function(...a){window.slipText.push(a[0]);return window.originalSlipText.apply(this,a)};CanvasRenderingContext2D.prototype.drawImage=function(...a){window.slipImages.push({width:a[0].width,height:a[0].height,dw:a[3],dh:a[4]});return window.originalSlipImage.apply(this,a)}")
 await click('Tạo phiếu PNG');await until("!!document.querySelector('a[download$=\".png\"]')")
 const png=await run("fetch(document.querySelector('a[download$=\".png\"]').href).then(r=>r.blob()).then(b=>createImageBitmap(b)).then(b=>({width:b.width,height:b.height}))");assert.equal(png.width,1080);assert(png.height>1000);assert.equal(state.confirmations.length,0)
 const slipText=await run('window.slipText'),slipImages=await run('window.slipImages');
 for(const label of ['Tên khách hàng:','Số điện thoại:','Địa chỉ:','Ngày chốt đơn:','Tổng đơn:','Phí ship:','Giảm giá:','Đã thu/cọc:','CÒN PHẢI THU:','1'])assert(slipText.includes(label),'Missing slip field: '+label)
 assert(!slipText.some(t=>/tạo phiếu không trừ tồn|Size Size|MẪU THIẾT KẾ/.test(t)))
 assert(slipText.join(' ').includes('Chúc Quý khách hàng vạn sự may mắn!'))
 for(const image of slipImages)assert(Math.abs(image.dw/image.dh-image.width/image.height)<0.01,'Banner and product images must preserve aspect ratio')
 const slipBase64=await run("fetch(document.querySelector('a[download$=\".png\"]').href).then(r=>r.blob()).then(b=>new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(b)}))");fs.writeFileSync('artifacts/cloud-browser/order-slip.png',Buffer.from(slipBase64,'base64'))
 await run('CanvasRenderingContext2D.prototype.fillText=window.originalSlipText;CanvasRenderingContext2D.prototype.drawImage=window.originalSlipImage')
 await click('Chốt SOLD');await until("document.body.innerText.includes('SOLD')&&!Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Chốt SOLD')")
 assert.equal(state.confirmations.length,1)
 await click('Tồn kho');await until("!!document.querySelector('.mobileInventoryAdvanced')");await run("document.querySelector('.mobileInventoryAdvanced').click()");await until("document.querySelector('.inventoryMetrics article strong')?.textContent==='0'")

 // Automatic cleanup works away from SOLD/Settings and independently of auto-sync.
 state.autoEnabled=true;state.archiveValid=false;
 await run("window.dispatchEvent(new Event('mecacao-cloud-sold-check'))")
 await until("document.body.innerText.includes('FAKE archive corrupt')")
 assert(state.filePresent);assert(!trace.some(t=>t.method==='DELETE'),'Corrupt local proof must block all Storage deletion')
 state.archiveValid=true;state.allowCleanupRetry=false;
 await run("window.dispatchEvent(new Event('mecacao-cloud-sold-check'))")
 await until("document.body.innerText.includes('Tự dọn ảnh SOLD đang chờ')&&!document.body.innerText.includes('FAKE archive corrupt')")
 assert(!state.filePresent&&!state.deletedAt,'Lost delete response leaves finalization pending')
 state.allowCleanupRetry=true;
 await run("window.dispatchEvent(new Event('mecacao-cloud-sold-check'))")
 for(let attempt=0;attempt<150&&!state.deletedAt;attempt++)await delay(100)
 assert(state.deletedAt,'SOLD cleanup must finalize after a lost Storage response; UI status may be transient')
 assert(state.deletedAt);assert.equal(state.orders[0].status,'SOLD');assert.equal(state.confirmations.length,1,'History must remain')
 const deletes=trace.filter(t=>t.method==='DELETE').length;
 await run("window.dispatchEvent(new Event('mecacao-cloud-sold-check'))");await delay(500);
 assert.equal(trace.filter(t=>t.method==='DELETE').length,deletes,'Completed cleanup must not repeat deletion')

 const pages=[['Tổng quan','.overviewStats'],['Kết nối Cloud','.cloudSettings'],['Tồn kho','.inventoryPage'],['Danh mục sản phẩm','.catalogPage'],['Bán hàng','.salesWorkspace'],['Khách hàng','.contactCard'],['Công nợ','.financeMetrics'],['Báo cáo','.stage4Metrics'],['Kiểm kê','.stocktakePanel'],['Ảnh SOLD','.soldRetentionPage'],['Ảnh iPhone','.phoneInbox'],['Cài đặt','.displayPreferences']]
 for(const width of [1366,390])for(const dark of [false,true]){
  await cmd('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:900,deviceScaleFactor:1,mobile:width===390})
  await run("document.querySelector('.shell').classList.toggle('themeDark',"+dark+")")
  for(const [label,selector] of pages){
   await run("Array.from(document.querySelectorAll('.sidebar button')).find(b=>b.textContent==="+JSON.stringify(label)+").click();window.scrollTo(0,0)")
   await until("!!document.querySelector("+JSON.stringify(selector)+")")
   await delay(100);assert(await run('document.documentElement.scrollWidth<=innerWidth+2'),'Cloud overflow: '+label+' '+width+' '+dark)
   if(width===390&&label==='Tổng quan')assert(await run("(()=>{const cards=[...document.querySelectorAll('.mobileOverview .mobileMetric')];const a=cards[0].getBoundingClientRect(),b=cards[1].getBoundingClientRect(),c=cards[2].getBoundingClientRect();return cards.length===4&&Math.abs(a.top-b.top)<2&&c.top>a.bottom-2&&Math.abs(a.width-b.width)<2})()"),'Phone overview must have four equal cards in a 2 by 2 grid')
   fs.writeFileSync('artifacts/cloud-browser/'+width+'-'+(dark?'dark':'light')+'-'+pages.findIndex(p=>p[0]===label)+'.png',Buffer.from((await cmd('Page.captureScreenshot',{format:'png'})).data,'base64'))
   if(width===390&&label==='Khách hàng'){
    await run("document.querySelector('.mobileCustomersPage .salesOrderRow').click()");await until("!!document.querySelector('.mobileCustomersPage.mobileDetailOpen')");await delay(120)
    fs.writeFileSync('artifacts/cloud-browser/reform-customer-'+(dark?'dark':'light')+'.png',Buffer.from((await cmd('Page.captureScreenshot',{format:'png'})).data,'base64'))
    await run("document.querySelector('.mobileCustomersPage .mobileDetailBack').click()");assert(await run("!document.querySelector('.mobileCustomersPage.mobileDetailOpen')"))
   }
  }
 }
 await run("document.querySelector('.shell').classList.remove('themeDark');Array.from(document.querySelectorAll('.sidebar button')).find(b=>b.textContent==='Kiểm kê').click()")
 await until("!!document.querySelector('.stocktakePanel input[aria-label^=\"Số đếm\"]')")
 await run("document.querySelector('.stocktakePanel input[aria-label^=\"Số đếm\"]').focus()")
 await cmd('Input.insertText',{text:'1'});await until("document.body.innerText.includes('Có số đếm chưa lưu')")
 await run("Array.from(document.querySelectorAll('.sidebar button')).find(b=>b.textContent==='Tồn kho').click()")
 assert(await run("!!document.querySelector('.stocktakePanel')"),'Unsaved count must block navigation')
 await click('Lưu số đếm');await until("Array.from(document.querySelectorAll('.stage4Metrics article')).find(a=>a.textContent.includes('Chưa đếm')).querySelector('b').textContent==='0'")
 await run("Array.from(document.querySelectorAll('.sidebar button')).find(b=>b.textContent==='Tồn kho').click()")
 await until("!!document.querySelector('.inventoryPage')")
 for(const label of ['Nhỏ','Vừa','Lớn']){await click(label);assert(await run('document.documentElement.scrollWidth<=innerWidth+2'))}
 await run("document.querySelector('[aria-label=\"Bật giao diện tối\"]').click()");assert(await run("document.querySelector('.cloudWorkspace').classList.contains('themeDark')"))
 await cmd('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await until("document.body.innerText.includes('Mất mạng')");assert(await run("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Đọc lại').disabled"))
 await cmd('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 await run("Array.from(document.querySelectorAll('.sidebar button')).find(b=>b.textContent==='Cài đặt').click()");await until("!!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Đăng xuất')")
 await cmd('Page.removeScriptToEvaluateOnNewDocument',{identifier:authInit.identifier});await click('Đăng xuất');await until("!!document.querySelector('.cloudDirectLogin input')")
 assert(await run("document.querySelector('input[type=password]').getBoundingClientRect().height>0"),'Password login must be visible first');assert(await run("!document.querySelector('.cloudEmailLogin').open"),'Email flow is secondary');await run("document.querySelector('.cloudEmailLogin').open=true")
 await run("document.querySelector('input[type=email]').focus();document.querySelector('input[type=email]').select()");await cmd('Input.insertText',{text:user.email});await click('Gửi email đăng nhập');await until("document.body.textContent.includes('Đã yêu cầu email đăng nhập')")
 await run("document.querySelector('.cloudDirectLogin input').focus()");await cmd('Input.insertText',{text:'https://evil.example/auth/v1/verify?token=fake-unopened-link&type=magiclink'});await click('Đăng nhập trên thiết bị này');await until("document.body.textContent.includes('Dán liên kết đăng nhập Supabase')")
 assert(!trace.some(t=>t.url.includes('/auth/v1/verify')),'Foreign link must not reach auth')
 await run("document.querySelector('.cloudDirectLogin input').focus();document.querySelector('.cloudDirectLogin input').select()");await cmd('Input.insertText',{text:'https://eyckwoewpomssjjggslr.supabase.co/auth/v1/verify?token=fake-unopened-link&type=magiclink&redirect_to=http%3A%2F%2Flocalhost%3A3000'});await click('Đăng nhập trên thiết bị này')
 await until("!!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Đăng xuất')")
 assert(trace.some(t=>t.url.includes('/auth/v1/verify')&&t.method==='POST'),'Login verifies in app instead of following localhost redirect')
 assert.equal(await run('location.href'),url)
 assert.equal(await run('document.documentElement.scrollWidth<=innerWidth+2'),true)
 await click('Đăng xuất');await until("!!document.querySelector('input[autocomplete=current-password]')")
 const authStart=trace.length;
 await run("document.querySelector('input[type=email]').focus();document.querySelector('input[type=email]').select()");await cmd('Input.insertText',{text:user.email});await run("document.querySelector('input[type=password]').focus()");await cmd('Input.insertText',{text:'fake-wrong-password'});await click('Đăng nhập');await until("document.body.textContent.includes('Email hoặc mật khẩu tài khoản shop chưa đúng')")
 assert(!await run("!!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Đăng xuất')"),'Wrong password must not sign in')
 await run("document.querySelector('input[type=password]').focus();document.querySelector('input[type=password]').select()");await cmd('Input.insertText',{text:'fake-correct-password'});await click('Đăng nhập');await until("!!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Đăng xuất')")
 assert(!trace.slice(authStart).some(t=>t.url.includes('/auth/v1/otp')||t.url.includes('/auth/v1/verify')),'Password login must not send emails or use links');assert.equal(await run('location.href'),url)
 assert(!await run("JSON.stringify(localStorage).includes('fake-correct-password')"),'Do not store raw password')
 await cmd('Page.reload');await until("!!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Đăng xuất')")
 await run("Array.from(document.querySelectorAll('.sidebar button')).find(b=>b.textContent==='Cài đặt').click()");await until("!!document.querySelector('.cloudPasswordSetup input')");await run("document.querySelector('.mobileAccountSettings').open=true")
 const changeStart=trace.length;
 await run("document.querySelectorAll('.cloudPasswordSetup input')[0].focus()");await cmd('Input.insertText',{text:'fake-new-cloud-password'});await run("document.querySelectorAll('.cloudPasswordSetup input')[1].focus()");await cmd('Input.insertText',{text:'fake-password-mismatch'});await click('Lưu mật khẩu Cloud');await until("document.body.textContent.includes('Hai ô mật khẩu chưa giống nhau')")
 assert(!trace.slice(changeStart).some(t=>t.url.includes('/auth/v1/user')&&t.method==='PUT'),'Mismatch must not update password')
 await run("document.querySelectorAll('.cloudPasswordSetup input')[1].focus();document.querySelectorAll('.cloudPasswordSetup input')[1].select()");await cmd('Input.insertText',{text:'fake-new-cloud-password'});await click('Lưu mật khẩu Cloud');await until("document.body.textContent.includes('Đã lưu mật khẩu Cloud')")
 assert.equal(await run("Array.from(document.querySelectorAll('.cloudPasswordSetup input')).every(i=>i.value==='')"),true)
 assert(!await run("JSON.stringify(localStorage).includes('fake-new-cloud-password')"),'Do not persist raw new password')
 await click('Đăng xuất');await until("!!document.querySelector('input[autocomplete=current-password]')")
 await run("document.querySelector('input[type=email]').focus();document.querySelector('input[type=email]').select()");await cmd('Input.insertText',{text:user.email});await run("document.querySelector('input[autocomplete=current-password]').focus()");await cmd('Input.insertText',{text:'fake-new-cloud-password'});await click('Đăng nhập');await until("!!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Đăng xuất')")
 // Recovery callback must persist a session before opening password settings.
 await click('Đăng xuất');await until("!!document.querySelector('input[autocomplete=current-password]')")
 const recoveryStart=trace.length;
 await click('Quên mật khẩu Cloud? Gửi email đặt lại');await until("document.body.textContent.includes('Supabase đã tiếp nhận yêu cầu khôi phục mật khẩu')");
 assert(trace.slice(recoveryStart).some(t=>t.url.includes('/auth/v1/recover')&&t.method==='POST'),'Reset must use the supported recovery endpoint');
 const recoveryHash=new URLSearchParams({access_token:token,refresh_token:session.refresh_token,expires_in:'3600',expires_at:String(session.expires_at),token_type:'bearer',type:'recovery'});
 // A link opened from email loads a fresh document, not a hash-only navigation.
 await cmd('Page.navigate',{url:'about:blank'});await until("location.href==='about:blank'");
 await cmd('Page.navigate',{url:url+'#'+recoveryHash});await until("!!document.querySelector('.cloudPasswordSetup input')&&document.querySelector('.cloudPasswordSetup input').getBoundingClientRect().height>0")
 assert.equal(await run("document.querySelector('.cloudSettings [role=status]').textContent"),'Đã đăng nhập Cloud','Recovery session must not be labeled signed out');
 await run("localStorage.removeItem('mecacao-v7-auth');document.querySelectorAll('.cloudPasswordSetup input')[0].focus()");await cmd('Input.insertText',{text:'fake-new-cloud-password'});await run("document.querySelectorAll('.cloudPasswordSetup input')[1].focus()");await cmd('Input.insertText',{text:'fake-new-cloud-password'});await click('Lưu mật khẩu Cloud');await until("document.body.textContent.includes('Đã lưu mật khẩu Cloud')")
 assert(trace.slice(recoveryStart).some(t=>t.url.includes('/auth/v1/user')&&t.method==='PUT'),'Recovery must permit authenticated password update');
 await click('Đăng xuất');await until("!!document.querySelector('input[autocomplete=current-password]')");
 await run("document.querySelector('input[type=email]').focus();document.querySelector('input[type=email]').select()");await cmd('Input.insertText',{text:user.email});await run("document.querySelector('input[autocomplete=current-password]').focus()");await cmd('Input.insertText',{text:'fake-new-cloud-password'});await click('Đăng nhập');await until("!!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Đăng xuất')");
 await cmd('Page.reload');await until("!!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Đăng xuất')");
 await Promise.all([...activeInterceptions]);await delay(100)
 failures.push(...interceptionErrors.filter(({error,networkId})=>!cancelledInterception(error,networkId)).map(({error})=>error))
 console.log('Confirmed cancelled stale interceptions:',interceptionErrors.length-failures.length)
 assert.deepEqual(failures,[]);console.log('PASS Cloud browser fake transport: recovery email/callback, visible password setup, recovery storage restoration, password re-login and reload, mobile layout/density/theme, lost-response durable retry, single draft, real banner PNG without stock mutation, SOLD removal, automatic verified cleanup away from Settings, corrupt archive refusal, lost Storage response retry and offline guard')
}catch(error){console.error('Cloud browser failure:',error);console.error('Transport failures:',failures);console.error('Interception errors:',interceptionErrors.map(e=>({message:e.error.message,url:e.url})));console.error('Transport trace:',trace);try{console.error(await run('document.body.innerText'));const shot=await cmd('Page.captureScreenshot',{format:'png'});fs.mkdirSync('artifacts/cloud-browser',{recursive:true});fs.writeFileSync('artifacts/cloud-browser/failure.png',Buffer.from(shot.data,'base64'))}catch{}throw error}finally{if(ws?.readyState===1)try{await cmd('Browser.close')}catch{}ws?.close();if(browser.exitCode===null){browser.kill();await new Promise(r=>browser.once('exit',r))}await new Promise(r=>server.close(r));try{fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}catch(error){console.warn('Browser temporary cleanup:',error.code)}}
