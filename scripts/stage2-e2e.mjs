import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import sharp from 'sharp'
const base=fs.mkdtempSync(path.join(os.tmpdir(),'stage2-http-')),project=path.join(base,'release')
fs.mkdirSync(project);fs.cpSync('apps/api/dist',path.join(project,'apps/api/dist'),{recursive:true});fs.mkdirSync(path.join(project,'apps/api'),{recursive:true});fs.copyFileSync('apps/api/package.json',path.join(project,'apps/api/package.json'));fs.symlinkSync(path.resolve('node_modules'),path.join(project,'node_modules'),'junction')
const source=path.join(base,'shop-source');fs.mkdirSync(source);const photo=path.join(source,'001.png');await sharp({create:{width:200,height:240,channels:3,background:'#fad2e5'}}).png().toFile(photo);const bytes=fs.readFileSync(photo)
const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r))
const url='http://127.0.0.1:'+port,env={...process.env,PORT:String(port),SHOP_FRESH_DEVELOPMENT:'1',SHOP_HOST:'127.0.0.1'};for(const k of ['SHOP_DB_PATH','SHOP_SANDBOX_ROOT','SHOP_LOCAL_V2_CONFIG','SHOP_LOCAL_V2_RESTORE_READY','SHOP_TASK_WORKER'])delete env[k]
let server,logs='',checks=0
const eq=(a,b)=>{assert.deepEqual(a,b);checks++}
function start(){const child=spawn(process.execPath,['apps/api/dist/server.js'],{cwd:project,env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);return child}
async function ready(){for(let n=0;n<100;n++){try{const r=await fetch(url+'/api/health');if(r.ok)return await r.json()}catch{}await new Promise(r=>setTimeout(r,100))}throw Error(logs)}
async function request(route,method='GET',body,key){const r=await fetch(url+route,{method,headers:{Origin:url,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()}}
async function stop(child){if(child.exitCode!==null)return;await new Promise(resolve=>{child.once('exit',resolve);child.kill()})}
try{
 server=start();let h=await ready();eq(h.freshDevelopment,true);eq((await request('/api/products')).data.length,0)
 const second=start();await new Promise(r=>second.once('exit',r));eq(second.exitCode!==0,true)
 const denied=await request('/api/goods-receipt','POST',{storeRoot:source,name:'Không ghi vào nguồn',sizes:[]});eq(denied.status,403)
 eq((await request('/api/goods-receipt/inspect','POST',{path:source})).data.count,1)
 const receipt=await request('/api/goods-receipt','POST',{storeRoot:h.warehouse,name:'Bộ hàng mới',sizes:[{size:'Size 1',quantity:1,costPrice:20000,salePrice:50000,sourcePath:source}]});eq(receipt.status,201);eq(fs.readFileSync(photo),bytes)
 const explorer=(await request('/api/inventory/explorer')).data;const imageId=explorer[0].variants[0].images[0].id
 const customer=(await request('/api/sales/drafts/customers','POST',{name:'Mẹ Cacao',phone:'0901234567',address:'Bạc Liêu',note:''})).data
 const input={items:[{imageId,unitPrice:50000}],discount:5000,note:'Giao chiều',contact:{customerId:customer.id,recipientName:customer.name,phone:customer.phone,address:customer.address,shippingFee:15000}}
 const draft=(await request('/api/sales/drafts','POST',input,'stage2-http-create-001')).data;eq(draft.payableTotal,60000)
 eq((await request('/api/sales/drafts','POST',input,'stage2-http-create-001')).data.id,draft.id)
 const png=await fetch(url+'/api/sales/drafts/'+draft.id+'/slip.png?version=1&page=1');eq(png.status,200);eq((await sharp(Buffer.from(await png.arrayBuffer())).metadata()).format,'png')
 const outsidePost=await fetch(url+'/api/sales/drafts/customers',{method:'POST',headers:{Origin:'https://external.invalid','Content-Type':'application/json'},body:JSON.stringify({name:'X'})});eq(outsidePost.status,403)
 await stop(server);server=start();h=await ready();eq((await request('/api/sales/drafts/'+draft.id)).data.contact.shippingFee,15000)
 eq((await request('/api/products')).data.length,1)
 const checked=(await request('/api/sales/drafts/'+draft.id+'/preflight','POST',{version:1})).data
 const sold=await request('/api/sales/drafts/'+draft.id+'/confirm','POST',{version:1,token:checked.token,confirmed:true,acknowledgeZeroPrice:false},'stage2-http-sale-001');eq(sold.status,200);eq(sold.data.status,'SOLD')
 eq((await request('/api/sales/drafts/'+draft.id)).data.payableTotal,60000)
 const backup=await request('/api/backup/lossless','POST',{});eq(backup.status,201)
 const soldPng=await fetch(url+'/api/sales/drafts/'+draft.id+'/slip.png?version=1');eq(soldPng.status,200)
 console.log('STAGE2_HTTP PASS: '+checks+' checks; fresh empty database, one server, external source COPY, customer/order/PNG, origin guard, restart')
}finally{if(server)await stop(server);fs.rmSync(base,{recursive:true,force:true})}
