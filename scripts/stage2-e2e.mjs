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
 eq(h.release.version,'3.2.0-stage4');eq(h.release.stage,4)
 eq((await request('/api/local/warehouse','POST',{warehouse:path.parse(base).root})).status,409)
 const own=path.join(base,'my-warehouse'),size=path.join(own,'Bộ tự tạo','Size 1');fs.mkdirSync(size,{recursive:true});const ownPhoto=path.join(size,'001.png');fs.copyFileSync(photo,ownPhoto)
 const selection=await request('/api/local/warehouse','POST',{warehouse:own});eq(selection.status,200)
 await new Promise(r=>server.once('exit',r));eq(server.exitCode,75)
 server=start();h=await ready();eq(h.customWarehouse,true);eq(h.warehouse,own)
 const scan=await request('/api/store/scan','POST',{rootPath:own});eq(scan.status,200);eq(scan.data.productCount,1)
 const imported=await request('/api/store/import','POST',{confirmed:true,product:{rootPath:own,name:'Bộ tự tạo',productCode:'OWN01',variants:[{size:'Size 1',sku:'OWN01-S1',costPrice:20000,salePrice:50000,images:[ownPhoto],openingStock:1}]}});eq(imported.status,201);eq(fs.readFileSync(ownPhoto),bytes)
 eq((await request('/api/local/warehouse','POST',{warehouse:source})).status,409)
 const denied=await request('/api/goods-receipt','POST',{storeRoot:source,name:'Không ghi vào nguồn',sizes:[]});eq(denied.status,403)
 eq((await request('/api/goods-receipt/inspect','POST',{path:source})).data.count,1)
 const receipt=await request('/api/goods-receipt','POST',{storeRoot:h.warehouse,name:'Bộ hàng mới',sizes:[{size:'Size 1',quantity:1,costPrice:20000,salePrice:50000,sourcePath:source}]});eq(receipt.status,201);eq(fs.readFileSync(photo),bytes)
 let explorer=(await request('/api/inventory/explorer')).data;const imageId=explorer[0].variants[0].images[0].id
 const renameBefore=await request('/api/warehouse/rename/preview','POST',{rootPath:h.warehouse});eq(renameBefore.status,200)
 const renameFirst=await request('/api/warehouse/rename/commit','POST',{rootPath:h.warehouse,ids:renameBefore.data.files.map(f=>f.id),token:renameBefore.data.token,confirmed:true});eq(renameFirst.status,200)
 explorer=(await request('/api/inventory/explorer')).data
 const customer=(await request('/api/sales/drafts/customers','POST',{name:'Mẹ Cacao',phone:'0901234567',address:'Bạc Liêu',note:''})).data
 const input={items:[{imageId,unitPrice:50000}],discount:5000,note:'Giao chiều',contact:{customerId:customer.id,recipientName:customer.name,phone:customer.phone,address:customer.address,shippingFee:15000}}
 const draft=(await request('/api/sales/drafts','POST',input,'stage2-http-create-001')).data;eq(draft.payableTotal,60000)
 eq((await request('/api/sales/drafts','POST',input,'stage2-http-create-001')).data.id,draft.id)
 const png=await fetch(url+'/api/sales/drafts/'+draft.id+'/slip.png?version=1&page=1');eq(png.status,200);eq((await sharp(Buffer.from(await png.arrayBuffer())).metadata()).format,'png')
 const outsidePost=await fetch(url+'/api/sales/drafts/customers',{method:'POST',headers:{Origin:'https://external.invalid','Content-Type':'application/json'},body:JSON.stringify({name:'X'})});eq(outsidePost.status,403)
 await stop(server);server=start();h=await ready();eq((await request('/api/sales/drafts/'+draft.id)).data.contact.shippingFee,15000)
 eq((await request('/api/products')).data.length,2)
 const locked=start();await new Promise(r=>locked.once('exit',r));eq(locked.exitCode!==0,true)
 const checked=(await request('/api/sales/drafts/'+draft.id+'/preflight','POST',{version:1})).data
 const sold=await request('/api/sales/drafts/'+draft.id+'/confirm','POST',{version:1,token:checked.token,confirmed:true,acknowledgeZeroPrice:false},'stage2-http-sale-001');eq(sold.status,200);eq(sold.data.status,'SOLD')
 eq((await request('/api/sales/drafts/'+draft.id)).data.payableTotal,60000)
 // Stage3 HTTP acceptance runs against the same fresh main release on Linux and Windows.
 let f=(await request('/api/sales/drafts/'+draft.id+'/finance')).data
 eq(f.due,60000)
 const receiptBody={version:f.version,orderVersion:1,kind:'RECEIPT',amount:20000,method:'TRANSFER',note:'Cọc/thu lần 1'}
 const receiptMoney=await request('/api/sales/drafts/'+draft.id+'/finance/entries','POST',receiptBody,'stage3-http-payment-001');eq(receiptMoney.status,201);eq(receiptMoney.data.due,40000)
 eq((await request('/api/sales/drafts/'+draft.id+'/finance/entries','POST',receiptBody,'stage3-http-payment-001')).data.replayed,true)
 eq((await request('/api/sales/drafts/'+draft.id+'/finance/entries','POST',receiptBody,'stage3-http-stale-001')).status,409)
 eq((await request('/api/sales/drafts/finance/debts')).data[0].due,40000)
 f=receiptMoney.data
 const aftercare=await request('/api/sales/drafts/'+draft.id+'/aftercare','POST',{version:f.version,orderVersion:1,kind:'SUPPORT',note:'Hỗ trợ sau giao'},'stage3-http-case-001');eq(aftercare.status,201)
 f=aftercare.data;const caseId=f.cases[0].id
 const closed=await request('/api/sales/drafts/'+draft.id+'/aftercare/'+caseId,'PUT',{version:f.version,orderVersion:1,caseVersion:1,resolution:'Đã gọi khách và xử lý'});eq(closed.status,200);eq(closed.data.cases[0].status,'RESOLVED')
 f=closed.data
 const paidPng=await fetch(url+'/api/sales/drafts/'+draft.id+'/slip.png?version=1&financeVersion='+f.version);eq(paidPng.status,200)
 const stalePng=await fetch(url+'/api/sales/drafts/'+draft.id+'/slip.png?version=1&financeVersion=0');eq(stalePng.status,409)
 // A new physical receipt must not reuse a removed SOLD canonical filename.
 const beforeSoldFile=explorer[0].variants[0].images[0].file_path
 const freshPhoto=path.join(source,'new.png');await sharp({create:{width:200,height:240,channels:3,background:'#137baf'}}).png().toFile(freshPhoto)
 const restock=await request('/api/goods-receipt','POST',{storeRoot:h.warehouse,productId:explorer[0].product_id,sizes:[{size:'Size 1',quantity:1,costPrice:20000,salePrice:50000,images:[freshPhoto]}]});eq(restock.status,201);eq(fs.existsSync(beforeSoldFile),false)
 const renameAfter=await request('/api/warehouse/rename/preview','POST',{rootPath:h.warehouse});eq(renameAfter.status,200);eq(renameAfter.data.files.every(f=>f.newPath!==beforeSoldFile),true)
 const renamedAfter=await request('/api/warehouse/rename/commit','POST',{rootPath:h.warehouse,ids:[...renameAfter.data.files.map(f=>f.id),...renameAfter.data.unchanged],token:renameAfter.data.token,confirmed:true});eq(renamedAfter.status,200);eq(fs.existsSync(beforeSoldFile),false)
 // Stage4 acceptance: read-only reports and durable stocktake against a fresh selected warehouse.
 const period='from=2000-01-01&to=2100-12-31'
 const report=await request('/api/sales/drafts/reports/summary?'+period);eq(report.status,200);eq(report.data.totals.orders,1);eq(report.data.totals.goodsTotal,'45000');eq(report.data.totals.receipts,'20000');eq(report.data.totals.grossMargin,'25000');eq(report.data.totals.dueNow,'40000')
 eq((await request('/api/sales/drafts/reports/summary?from=2026-99-10&to=2026-10-10')).status,400)
 const exportCSV=await fetch(url+'/api/sales/drafts/reports/export.csv?'+period);eq(exportCSV.status,200);eq((await exportCSV.text()).includes(draft.id),true)
 const createdCount=await request('/api/sales/drafts/stocktakes','POST',{title:'Kiểm kê HTTP'},'stage4-http-count-001');eq(createdCount.status,201);let session=createdCount.data
 eq((await request('/api/sales/drafts/stocktakes','POST',{title:'Kiểm kê HTTP'},'stage4-http-count-001')).data.id,session.id)
 const counts=session.rows.map(r=>({variantId:r.variantId,counted:r.physical,note:''}))
 eq((await request('/api/sales/drafts/stocktakes/'+session.id,'PUT',{version:0,rows:counts})).status,409)
 session=(await request('/api/sales/drafts/stocktakes/'+session.id,'PUT',{version:1,rows:counts})).data;eq(session.version,2)
 const finished=await request('/api/sales/drafts/stocktakes/'+session.id+'/finish','POST',{version:2,confirmed:true,conclusion:'Số đếm khớp ảnh'});eq(finished.status,200);eq(finished.data.status,'CLOSED')
 eq((await request('/api/sales/drafts/stocktakes/'+session.id,'PUT',{version:3,rows:counts})).status,409)
 const countCSV=await fetch(url+'/api/sales/drafts/stocktakes/'+session.id+'/export.csv');eq(countCSV.status,200);eq((await countCSV.text()).includes('Kiểm kê HTTP'),true)
 const countForbidden=await fetch(url+'/api/sales/drafts/stocktakes',{method:'POST',headers:{Origin:'https://external.invalid','Content-Type':'application/json','Idempotency-Key':'stage4-bad-origin-001'},body:JSON.stringify({title:'Không được ghi'})});eq(countForbidden.status,403)
 const backup=await request('/api/backup/lossless','POST',{});eq(backup.status,201)
 eq(JSON.parse(fs.readFileSync(path.join(backup.data.backup.directory,'lossless-manifest.json'),'utf8')).version,4)
 const restored=await request('/api/backup/restore-test','POST',{directory:backup.data.backup.directory,warehouseRoot:h.warehouse,confirmed:true});assert.equal(restored.status,200,JSON.stringify(restored.data));checks++;eq(restored.data.status,'READY');eq(restored.data.counts.finance_entries,1);eq(restored.data.counts.aftercare_cases,1);eq(restored.data.counts.stocktake_sessions,1);eq(restored.data.counts.stocktake_rows,counts.length)
 const soldPng=await fetch(url+'/api/sales/drafts/'+draft.id+'/slip.png?version=1');eq(soldPng.status,200)
 console.log('STAGE2_HTTP PASS: '+checks+' checks; fresh empty database, main release metadata, UI-selected own warehouse, scan/import, one server, external source COPY, customer/order/PNG, origin guard, restart')
}finally{if(server)await stop(server);fs.rmSync(base,{recursive:true,force:true})}
