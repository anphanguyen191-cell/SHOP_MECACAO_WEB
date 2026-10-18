import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {spawnSync,spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import net from 'node:net'
import {setTimeout as delay} from 'node:timers/promises'
import sharp from 'sharp'
import express from 'express'
import {DatabaseSync} from 'node:sqlite'
import {bootstrapSalesDrafts} from '../apps/api/src/salesSchema.js'
import {bootstrapSalesExecution,salesExecutionService,digest,salesActivity} from '../apps/api/src/salesExecution.js'
import {salesDraftService} from '../apps/api/src/salesDrafts.js'
import {salesPreflightService} from '../apps/api/src/salesPreflight.js'
import {stockReturnService} from '../apps/api/src/stockReturns.js'
import {STOCK_RETURN_LOCK} from '../apps/api/src/stockReturnState.js'
import {createSalesBackup,verifySalesBackup,restoreSalesBackup} from '../apps/api/src/salesBackup.js'
import {rejectSoldSource} from '../apps/api/src/soldSource.js'
import {salesDraftRouter} from '../apps/api/src/salesRoutes.js'
import {cloudRouter} from '../apps/api/src/cloudRoutes.js'
import {bootstrapPriceBulk} from '../apps/api/src/priceBulk.js'

const here=fileURLToPath(import.meta.url),input={imageIds:[1,2],reason:'Khách hủy, đã nhận đủ hàng tại shop',received:true},key='return-test-request-0001'
const scalar=(db:DatabaseSync,sql:string)=>Number(db.prepare(sql).get()!.n)
if(process.argv[2]==='worker'){
 const root=process.argv[3],point=process.argv[4],db=new DatabaseSync(path.join(root,'database','shop.db')),orderId=fs.readFileSync(path.join(root,'order-id'),'utf8')
 await stockReturnService(db,root).receive(orderId,input,key,p=>{if(p===point)process.exit(78)})
 db.close();process.exit(0)
}
const base=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-return-'))
let checks=0
function eq(a:unknown,b:unknown){assert.deepEqual(a,b);checks++}
async function rejects(f:()=>Promise<unknown>){await assert.rejects(f);checks++}
async function fixture(name:string){
 const root=path.join(base,name);fs.mkdirSync(path.join(root,'database'),{recursive:true});const file=path.join(root,'database','shop.db'),db=new DatabaseSync(file)
 bootstrapSalesDrafts(db)
 db.exec("INSERT INTO products(id,product_code,name) VALUES(1,'P1','Bộ test');INSERT INTO product_variants(id,product_id,sku,size,cost_price,sale_price) VALUES(1,1,'P1-S','Size S',12000,50000);INSERT INTO inventory_transactions(variant_id,transaction_type,quantity) VALUES(1,'OPENING',3)")
 const originals:string[]=[]
 for(let i=1;i<=3;i++){const target=path.join(root,'warehouse','Bộ test','Size S','ShopMeCaCao_Tole_Bo_test_Size_S_'+String(i).padStart(4,'0')+'.png');fs.mkdirSync(path.dirname(target),{recursive:true});await sharp({create:{width:90,height:120,channels:3,background:{r:30*i,g:70,b:100}}}).png().toFile(target);db.prepare('INSERT INTO product_images(id,product_id,variant_id,file_path) VALUES(?,1,1,?)').run(i,target);originals.push(digest(fs.readFileSync(target)))}
 const draft=salesDraftService(db,root).create({items:[{imageId:1,unitPrice:50000},{imageId:2,unitPrice:50000}],discount:1000,note:'Giữ nguyên đơn'},'draft-return-test-0001')
 bootstrapSalesExecution(db,root);const token=(await salesPreflightService(db,root).check(draft.id,1)).token
 await salesExecutionService(db,root).confirm(draft.id,{version:1,token,confirmed:true,acknowledgeZeroPrice:false},'sale-return-test-0001')
 fs.writeFileSync(path.join(root,'order-id'),draft.id)
 return {root,file,db,orderId:draft.id,originals,service:stockReturnService(db,root)}
}
try{
 const f=await fixture('happy'),before=JSON.stringify(f.db.prepare('SELECT * FROM sales_confirmations').all())
 const one={...input,imageIds:[1]}
 await rejects(()=>f.service.receive(f.orderId,{...one,received:false},key));await rejects(()=>f.service.receive(f.orderId,{...one,imageIds:[1,1]},key));await rejects(()=>f.service.receive(f.orderId,{...one,imageIds:[3]},key));await rejects(()=>f.service.receive(f.orderId,{...one,reason:''},key))
 eq(f.service.pending(),false)
 const r=await f.service.receive(f.orderId,one,key);eq(r.status,'RETURNED');eq(r.quantity,1)
 const image=f.db.prepare('SELECT * FROM product_images WHERE id=?').get(r.items[0].newImageId)!,newId=Number(image.id)
 assert(newId>3);assert.match(path.basename(String(image.file_path)),/_0004\.png$/);eq(digest(fs.readFileSync(String(image.file_path))),f.originals[0]);eq(scalar(f.db,'SELECT stock n FROM inventory_stock WHERE variant_id=1'),2)
 eq(JSON.stringify(f.db.prepare('SELECT * FROM sales_confirmations').all()),before);eq(scalar(f.db,"SELECT COUNT(*) n FROM inventory_transactions WHERE transaction_type='IMPORT'"),1)
 eq((await f.service.receive(f.orderId,one,key)).items,r.items)
 await rejects(()=>f.service.receive(f.orderId,{...one,reason:'Khác'},key));await rejects(()=>f.service.receive(f.orderId,one,'return-duplicate-test-0002'))
 assert.throws(()=>rejectSoldSource(f.db,f.originals[0]));eq((await salesExecutionService(f.db,f.root).status('sale-return-test-0001')).sold,true)
 const backup=createSalesBackup(f.db,f.file,f.root);eq(backup.verified.ok,true)
 const restored=restoreSalesBackup(backup.directory,path.join(base,'restored'),path.join(f.root,'warehouse')),copy=new DatabaseSync(restored.database),returns=stockReturnService(copy,path.join(base,'restored'))
 eq(returns.list(f.orderId).items[0].newImageId,newId);await rejects(()=>returns.receive(f.orderId,one,'return-restored-duplicate-01'));copy.close()
 // The returned unit may be sold and legitimately received again with its NEW sold ID.
 const draft=salesDraftService(f.db,f.root).create({items:[{imageId:newId,unitPrice:52000}],discount:0,note:''},'draft-return-resale-0001'),token=(await salesPreflightService(f.db,f.root).check(draft.id,1)).token
 await salesExecutionService(f.db,f.root).confirm(draft.id,{version:1,token,confirmed:true,acknowledgeZeroPrice:false},'sale-return-resale-0001')
 eq(createSalesBackup(f.db,f.file,f.root).verified.ok,true)
 const again=await f.service.receive(draft.id,{...one,imageIds:[newId]},'return-second-sale-0001');assert(Number(again.items[0].newImageId)>newId)
 eq(createSalesBackup(f.db,f.file,f.root).verified.ok,true);eq((await salesExecutionService(f.db,f.root).status('sale-return-test-0001')).sold,true)
 // Restore preserves lineage AND the second return's sellable stock.
 const chain=createSalesBackup(f.db,f.file,f.root),chainRestore=restoreSalesBackup(chain.directory,path.join(base,'chain-restored'),path.join(f.root,'warehouse')),chainDb=new DatabaseSync(chainRestore.database)
 eq(verifySalesBackup(createSalesBackup(chainDb,chainRestore.database,path.join(base,'chain-restored')).directory).ok,true);chainDb.close()
 f.db.close()
 for(const point of ['lock','journal','prepared','copied:0','published:0','copied:1','published:1','unit:0','unit:1','before-commit','after-commit','released']){
  const x=await fixture('exit-'+point.replace(':','-'));x.db.close()
  const child=spawnSync(process.execPath,['--import','tsx',here,'worker',x.root,point],{encoding:'utf8',timeout:30000});assert.equal(child.status,78,child.stderr)
  const db=new DatabaseSync(x.file),service=stockReturnService(db,x.root),committed=['after-commit','released'].includes(point)
  if(service.pending())assert.throws(()=>createSalesBackup(db,x.file,x.root))
  const recovery=service.recover();eq(recovery.status,point==='released'?'CLEAR':committed?'RETURNED':'ROLLED_BACK');eq(service.pending(),false)
  eq(scalar(db,'SELECT COUNT(*) n FROM stock_return_units'),committed?2:0);eq(scalar(db,'SELECT stock n FROM inventory_stock WHERE variant_id=1'),committed?3:1)
  eq(scalar(db,'SELECT COUNT(*) n FROM sales_units'),2);eq((await salesExecutionService(db,x.root).status('sale-return-test-0001')).sold,true)
  eq(createSalesBackup(db,x.file,x.root).verified.ok,true)
  if(!committed)eq((await service.receive(x.orderId,input,'return-after-recovery-001')).status,'RETURNED')
  db.close()
 }
 // Validate ALL destinations before rollback touches ANY file. A conflicting external file stays intact.
 const c=await fixture('changed-file');await rejects(()=>c.service.receive(c.orderId,input,key,p=>{if(p==='published:1')throw Error('Lost response')}))
 const plan=JSON.parse(String(c.db.prepare('SELECT payload FROM stock_return_operations').get()!.payload)),dest=path.join(c.root,plan.units[1].destination),original=fs.readFileSync(dest)
 fs.writeFileSync(dest,'external edit');assert.throws(()=>c.service.recover());eq(fs.existsSync(path.join(c.root,plan.units[0].destination)),true);eq(fs.readFileSync(dest,'utf8'),'external edit')
 fs.writeFileSync(dest,original);eq(c.service.recover().status,'ROLLED_BACK');c.db.close()
 // A matching-content collision is NOT our inode: recovery must preserve it.
 const collision=await fixture('collision');let collisionPath=''
 await rejects(()=>collision.service.receive(collision.orderId,input,key,p=>{if(p==='copied:0'){const p=JSON.parse(String(collision.db.prepare('SELECT payload FROM stock_return_operations').get()!.payload));collisionPath=path.join(collision.root,p.units[0].destination);fs.copyFileSync(path.join(collision.root,p.units[0].source),collisionPath)}}))
 assert.throws(()=>collision.service.recover());eq(digest(fs.readFileSync(collisionPath)),collision.originals[0]);fs.unlinkSync(collisionPath);eq(collision.service.recover().status,'ROLLED_BACK');collision.db.close()
 // Partial staging writes never become inventory and can be cleaned safely.
 const partial=await fixture('partial');await rejects(()=>partial.service.receive(partial.orderId,input,key,p=>{if(p==='prepared'){const plan=JSON.parse(String(partial.db.prepare('SELECT payload FROM stock_return_operations').get()!.payload));fs.writeFileSync(path.join(partial.root,plan.units[0].staging),'partial');throw Error('Power loss')}}));eq(partial.service.recover().status,'ROLLED_BACK');partial.db.close()
 // Concurrency: two OS processes, only one stock receipt.
 const race=await fixture('race');race.db.close()
 const worker=()=>new Promise<number|null>(resolve=>{const child=spawn(process.execPath,['--import','tsx',here,'worker',race.root,'never'],{stdio:'ignore'});child.on('exit',resolve)})
 const codes=await Promise.all([worker(),worker()]);assert(codes.includes(0));const raceDb=new DatabaseSync(race.file);eq(scalar(raceDb,'SELECT COUNT(*) n FROM stock_return_units'),2);raceDb.close()
 // HTTP origin and LAN isolation, plus actual endpoint idempotency.
 const http=await fixture('http'),app=express();app.use(express.json());app.use((req,res,next)=>{if(req.headers['x-test-lan'])res.locals.lanUser={role:req.headers['x-test-lan']};next()})
 const server=app.listen(0,'127.0.0.1'),port=await new Promise<number>(resolve=>server.on('listening',()=>resolve((server.address() as any).port)))
 bootstrapPriceBulk(http.db)
 app.use('/api/sales/drafts',salesDraftRouter(http.db,http.root,port));app.use('/api/cloud',cloudRouter(http.db,http.root))
 try{
  const url='http://127.0.0.1:'+port+'/api/sales/drafts/'+http.orderId+'/returns'
  for(const role of ['owner','cashier','inventory','viewer'])eq((await fetch(url,{headers:{'x-test-lan':role}})).status,403)
  eq((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(one)})).status,403)
  const options={method:'POST',headers:{Origin:'http://localhost:'+port,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(one)}
  eq((await fetch(url,options)).status,200);eq((await fetch(url,options)).status,200);eq(scalar(http.db,'SELECT COUNT(*) n FROM stock_return_units'),1)
  const catalog=await (await fetch('http://127.0.0.1:'+port+'/api/cloud/catalog')).json(),newImage=Number(http.db.prepare('SELECT new_image_id FROM stock_return_units').get()!.new_image_id)
  eq(catalog.images.map((i:any)=>i.id),[3,newImage]);eq(catalog.transactions.filter((i:any)=>i.transaction_type==='IMPORT').length,1)
  const asset=await fetch('http://127.0.0.1:'+port+'/api/cloud/images/'+newImage),bytes=Buffer.from(await asset.arrayBuffer())
  eq(asset.status,200);assert(bytes.length<=150000);eq(digest(bytes),asset.headers.get('X-Image-Sha256'))
  eq((await fetch('http://127.0.0.1:'+port+'/api/cloud/images/1')).status,400)
  eq((await fetch('http://127.0.0.1:'+port+'/api/cloud/images/'+newImage+'?knownSha='+digest(bytes))).status,204)
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));http.db.close()}
 // Full production middleware: Cloud authority permits this laptop-only operation,
 // pending receipts fence inventory/tasks and remain recoverable after restart.
 const production=await fixture('production');production.db.prepare("INSERT INTO app_metadata(key,value) VALUES('cloud-authority','enabled')").run();production.db.close()
 const crashed=spawnSync(process.execPath,['--import','tsx',here,'worker',production.root,'published:0'],{encoding:'utf8',timeout:30000});eq(crashed.status,78)
 const socket=net.createServer();await new Promise<void>(resolve=>socket.listen(0,'127.0.0.1',resolve));const actualPort=(socket.address() as any).port;await new Promise<void>(resolve=>socket.close(()=>resolve()))
 const baseUrl='http://127.0.0.1:'+actualPort
 let logs=''
 const processServer=spawn(process.execPath,['apps/api/dist/server.js'],{env:{...process.env,PORT:String(actualPort),SHOP_HOST:'127.0.0.1',SHOP_DB_PATH:production.file,SHOP_SANDBOX_ROOT:production.root,SHOP_ENABLE_V2_DRAFTS:'1',SHOP_ENABLE_V2_SALES:'1'},stdio:['ignore','pipe','pipe']});processServer.stdout.on('data',b=>logs+=b);processServer.stderr.on('data',b=>logs+=b)
 async function api(route:string,method='GET',body?:any,expected=200){const r=await fetch(baseUrl+'/api'+route,{method,headers:{Origin:baseUrl,'Content-Type':'application/json','Idempotency-Key':'return-production-test-0002'},body:body===undefined?undefined:JSON.stringify(body)}),j=await r.json();assert.equal(r.status,expected,route+': '+JSON.stringify(j));checks++;return j}
 try{
  let health:any
  for(let i=0;i<100;i++){if(processServer.exitCode!==null)throw Error(logs);try{health=await api('/health');break}catch{}await delay(100)}
  assert(health,logs);eq(health.stockReturnRecoveryRequired,true)
  await api('/inventory/dashboard','GET',undefined,409);await api('/tasks','GET',undefined,409)
  await api('/sales/drafts/'+production.orderId);await api('/sales/drafts/'+production.orderId+'/returns')
  eq((await api('/sales/drafts/returns/recover','POST',{confirmed:true})).status,'ROLLED_BACK')
  eq((await api('/health')).stockReturnRecoveryRequired,false)
  eq((await api('/sales/drafts/'+production.orderId+'/returns','POST',{...input,imageIds:[1]})).status,'RETURNED')
  eq((await api('/inventory/dashboard')).stock,2)
  const catalog=await api('/cloud/catalog');eq(catalog.images.length,2);eq(catalog.transactions.filter((t:any)=>t.transaction_type==='IMPORT').length,1)
  await api('/sales/drafts','POST',{items:[]},409)
 }finally{if(processServer.exitCode===null)await new Promise<void>(resolve=>{processServer.once('exit',()=>resolve());processServer.kill()})}
 console.log('STOCK_RETURN PASS: '+checks+' checks; partial returns, immutable SOLD/finance, idempotency, twelve hard exits, rollback collisions, partial staging, resale chains, portable backup/restore, process contention and localhost/LAN HTTP authorization')
}finally{salesActivity.busy=false;salesActivity.readers=0;fs.rmSync(base,{recursive:true,force:true})}
