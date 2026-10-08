import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import {createHash} from 'node:crypto'
import {spawn} from 'node:child_process'
import {setTimeout as sleep} from 'node:timers/promises'
import sharp from 'sharp'

const home=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-http-acceptance-'))
const dbPath=path.join(home,'data','test-shop.db')
const storeRoot=path.join(home,'warehouse'),sourceRoot=path.join(home,'incoming')
fs.mkdirSync(path.dirname(dbPath),{recursive:true})
fs.mkdirSync(storeRoot,{recursive:true})
fs.mkdirSync(sourceRoot,{recursive:true})
const productDir=path.join(storeRoot,'Test Flower Set'),sizeDir=path.join(productDir,'Size 1')
fs.mkdirSync(sizeDir,{recursive:true})
const file1=path.join(sizeDir,'001.png'),file2=path.join(sourceRoot,'new.png'),file3=path.join(sourceRoot,'size-two.png'),file4=path.join(sourceRoot,'new-product.png')
for(const [file,r,g,b] of [[file1,150,20,60],[file2,20,160,60],[file3,25,60,190],[file4,190,130,10]]){
 await sharp({create:{width:56,height:56,channels:3,background:{r,g,b}}}).png().toFile(file)
}
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const sources=[file1,file2,file3,file4].map(file=>({file,sha256:hash(file)}))
async function freePort(){
 const server=net.createServer()
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const n=server.address().port
 await new Promise(resolve=>server.close(resolve))
 return n
}
const port=await freePort(),base='http://127.0.0.1:'+port
let child,logs=''
function start(){
 logs=''
 child=spawn(process.execPath,['apps/api/dist/server.js'],{
  cwd:process.cwd(),env:{...process.env,SHOP_DB_PATH:dbPath,PORT:String(port),SHOP_HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']
 })
 child.stdout.on('data',d=>{logs+=d.toString()})
 child.stderr.on('data',d=>{logs+=d.toString()})
}
async function stop(){
 if(!child||child.exitCode!==null)return
 const proc=child
 const done=new Promise(resolve=>proc.once('exit',resolve))
 proc.kill('SIGTERM')
 await Promise.race([done,sleep(6000)])
 if(proc.exitCode===null){proc.kill('SIGKILL');await done}
 child=undefined
}
async function waitReady(){
 for(let i=0;i<90;i++){
  if(child?.exitCode!==null)throw Error('API exited: '+logs)
  try{const r=await fetch(base+'/api/health');if(r.ok)return await r.json()}catch{}
  await sleep(150)
 }
 throw Error('API readiness timeout: '+logs)
}
async function api(endpoint,{method='GET',body,expected=200}={}){
 const res=await fetch(base+endpoint,{method,headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})
 const data=await res.json()
 assert.equal(res.status,expected,endpoint+' '+method+': '+JSON.stringify(data))
 return data
}
let checks=0
function check(condition,label){assert.ok(condition,label);checks++}
try{
 start()
 const health=await waitReady()
 check(health.schema===110&&health.ok===true,'API health/schema110')
 check((await api('/api/inventory/dashboard')).stock===0,'empty physical dashboard')
 const scan=await api('/api/store/scan',{method:'POST',body:{rootPath:storeRoot}})
 check(scan.mode==='PREVIEW_ONLY'&&scan.productCount===1&&scan.products[0].sizes[0].images.length===1,'read-only warehouse scan')
 const approved={rootPath:storeRoot,name:'Test Flower Set',productCode:'TEST01',variants:[{size:'Size 1',sku:'TEST01-S1',costPrice:13000,salePrice:25000,images:[file1],openingStock:1}]}
 await api('/api/store/import',{method:'POST',body:{confirmed:false,product:approved},expected:400})
 const imported=await api('/api/store/import',{method:'POST',body:{confirmed:true,product:approved},expected:201})
 const pid=imported.product.product.id
 const vid=imported.product.variants[0].id
 check(imported.product.variants[0].stock===1,'initial canonical physical import')
 check((await api('/api/products?stockState=in')).some(x=>x.id===pid&&x.total_stock===1),'catalog physical count')
 check((await api('/api/inventory/explorer')).some(x=>x.product_id===pid&&x.stock===1),'inventory explorer synchronized')
 check((await api('/api/inventory/suggestions?search=TEST01')).some(x=>x.stock===1),'SKU suggestions display physical quantities')
 const receiptBase={storeRoot,productId:pid,sizes:[{size:'Size 1',quantity:1,costPrice:14000,salePrice:26000,images:[file2]}]}
 await api('/api/goods-receipt',{method:'POST',body:{...receiptBase,sizes:[{...receiptBase.sizes[0],quantity:2}]},expected:400})
 const received=await api('/api/goods-receipt',{method:'POST',body:receiptBase,expected:201})
 check(received.result.copiedImages===1&&received.events.at(-1).phase==='DONE','goods receipt copy and terminal progress')
 check(fs.existsSync(path.join(sizeDir,'002.png')),'receipt must not overwrite canonical original')
 check((await api('/api/inventory/dashboard')).stock===2,'existing SKU top-up reflects two images')
 await api('/api/goods-receipt',{method:'POST',body:receiptBase,expected:400})
 check((await api('/api/inventory/dashboard')).stock===2,'duplicate receipt rejected without stock mutation')
 const newSize=await api('/api/goods-receipt',{method:'POST',body:{storeRoot,productId:pid,sizes:[{size:'Size 2',quantity:1,costPrice:14500,salePrice:27000,images:[file3]}]},expected:201})
 check(newSize.result.product.variants.some(x=>x.size==='Size 2'&&x.stock===1),'existing product + new Size flow')
 const newProduct=await api('/api/goods-receipt',{method:'POST',body:{storeRoot,name:'Test Boys Outfit',productCode:'TEST02',sizes:[{size:'Size A',quantity:1,costPrice:15000,salePrice:30000,images:[file4]}]},expected:201})
 check(newProduct.result.product.variants[0].stock===1,'new Product + Size flow')
 const dashboard=await api('/api/inventory/dashboard')
 check(dashboard.stock===4&&dashboard.products===2&&dashboard.skus===3,'stock/product/SKU aggregate synchronized')
 const receipts=await api('/api/goods-receipt/dashboard')
 check(receipts.importedQuantity===3&&receipts.transactions===3,'posted quantity is history, not initial stock')
 const low=await api('/api/products?sort=stock_desc')
 check(low[0].product_code==='TEST01'&&low[0].total_stock===3,'product sort by existing images')
 await api('/api/inventory/import',{method:'POST',body:{variantId:vid,quantity:2,unitCost:12345},expected:201})
 const ledgerOnly=await api('/api/inventory/dashboard')
 check(ledgerOnly.stock===4&&ledgerOnly.mismatches>=1,'ledger-only historical transaction never changes physical stock')
 const fullBackup=await api('/api/backup/lossless',{method:'POST',body:{},expected:201})
 check(fullBackup.backup.verified.dbVerified===true&&fullBackup.backup.verified.imagesVerified===4,'lossless backup validated DB and all original images')
 check(fs.existsSync(path.join(fullBackup.backup.directory,'lossless-manifest.json')),'full backup has recovery manifest')
 for(const entry of sources)check(hash(entry.file)===entry.sha256,'never modify original source '+entry.file)
 await stop()
 start()
 await waitReady()
 const afterRestart=await api('/api/inventory/dashboard')
 check(afterRestart.stock===4&&afterRestart.mismatches>=1,'restart persistence and physical-ledger reconciliation')
 const afterCatalog=await api('/api/products')
 check(afterCatalog.length===2&&afterCatalog.reduce((n,x)=>n+x.total_stock,0)===4,'catalog persistence after restart')
 check((await api('/api/health')).database==='test-shop.db','reopened same isolated SQLite database')
 console.log('HTTP_API_ACCEPTANCE PASS: '+checks+' assertions; 3 receipt flows, scan/import/idempotence, ledger isolation, SHA originals, lossless backup and restart')
}catch(e){console.error(e instanceof Error?e.stack:String(e));console.error('Server logs:',logs.slice(-4000));process.exitCode=1}
finally{
 await stop()
 fs.rmSync(home,{recursive:true,force:true,maxRetries:5,retryDelay:100})
}
