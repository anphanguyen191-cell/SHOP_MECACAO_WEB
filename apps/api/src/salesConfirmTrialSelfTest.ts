import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import sharp from 'sharp'
import {DatabaseSync} from 'node:sqlite'
import {bootstrapSalesDrafts} from './salesSchema.js'
import {salesDraftService} from './salesDrafts.js'
import {salesPreflightService} from './salesPreflight.js'
import {salesConfirmTrialService} from './salesConfirmTrial.js'
import {STAGING_LAB} from './salesStagingLab.js'
import {isInternalWarehousePath} from './warehouseAreas.js'
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex')
const [mode,workerRoot,point]=process.argv.slice(2)
if(mode==='worker'){
 const db=new DatabaseSync(path.join(workerRoot,'source.db')),job=JSON.parse(fs.readFileSync(path.join(workerRoot,'job.json'),'utf8'))
 await salesConfirmTrialService(db,workerRoot).confirm(job.id,job.input,job.key,p=>{if(p===point)process.exit(78)})
 process.exit(0)
}
const base=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-confirm-trial-')),connections:DatabaseSync[]=[];let checks=0
const ok=(v:unknown)=>{assert.ok(v);checks++}
const rejects=async(fn:()=>Promise<unknown>,status?:number)=>{await assert.rejects(fn,(e:any)=>status===undefined||e.status===status);checks++}
async function fixture(name:string,price=50000){
 const root=path.join(base,name);fs.mkdirSync(root)
 const db=new DatabaseSync(path.join(root,'source.db'));connections.push(db);bootstrapSalesDrafts(db)
 const dir=path.join(root,'warehouse','Mẫu','Size 1');fs.mkdirSync(dir,{recursive:true})
 db.exec("INSERT INTO products(product_code,name) VALUES('P','Mẫu');INSERT INTO product_variants(product_id,sku,size,cost_price) VALUES(1,'P-S','Size 1',10000);INSERT INTO inventory_transactions(variant_id,transaction_type,quantity) VALUES(1,'OPENING',8)")
 const files:string[]=[]
 for(let n=0;n<2;n++){const file=path.join(dir,n+'.png');await sharp({create:{width:180,height:240,channels:3,background:n?'#afd8ca':'#facde4'}}).png().toFile(file);db.prepare('INSERT INTO product_images(product_id,variant_id,file_path) VALUES(1,1,?)').run(file);files.push(file)}
 const drafts=salesDraftService(db,root),d=drafts.create({items:[{imageId:1,unitPrice:price},{imageId:2,unitPrice:price}],discount:0,note:'Bản thử'},'source-draft-request-001')
 const report=await salesPreflightService(db,root).check(d.id,1),input={version:1,token:report.token,confirmed:true,acknowledgeZeroPrice:price===0},key='trial-request-key-0001'
 const baseline=hash(fs.readFileSync(path.join(root,'source.db'))),photos=files.map(p=>hash(fs.readFileSync(p)))
 const unchanged=()=>hash(fs.readFileSync(path.join(root,'source.db')))===baseline&&files.every((p,n)=>hash(fs.readFileSync(p))===photos[n])
 const service=salesConfirmTrialService(db,root)
 fs.writeFileSync(path.join(root,'job.json'),JSON.stringify({id:d.id,input,key}))
 return {root,db,files,d,drafts,input,key,service,unchanged,run:path.join(root,STAGING_LAB,'confirm-runs',hash(key))}
}
try{
 const f=await fixture('success')
 await rejects(()=>f.service.confirm(f.d.id,{...f.input,confirmed:false},f.key),400)
 await rejects(()=>f.service.confirm(f.d.id,f.input,'bad'),400)
 await rejects(()=>f.service.confirm(f.d.id,{...f.input,token:'a'.repeat(64)},f.key),409)
 ok(!fs.existsSync(f.run))
 const result=await f.service.confirm(f.d.id,f.input,f.key)
 ok(result.status==='SOLD_TRIAL'&&result.quantity===2&&result.total===100000&&result.sourceUnchanged&&!result.canConfirmSale)
 ok(f.unchanged()&&f.drafts.get(f.d.id).status==='DRAFT'&&f.db.prepare('SELECT stock FROM inventory_stock WHERE variant_id=1').get()!.stock===8)
 ok((await f.service.confirm(f.d.id,f.input,f.key)).status==='SOLD_TRIAL')
 ok((await salesConfirmTrialService(f.db,f.root).status(f.d.id,f.key)).status==='SOLD_TRIAL')
 await rejects(()=>f.service.confirm(f.d.id,{...f.input,acknowledgeZeroPrice:true},f.key),409)
 await rejects(()=>f.service.status('another-order',f.key),409)
 const cloned=new DatabaseSync(path.join(f.run,STAGING_LAB,'commit-lab.db'))
 try{ok(cloned.prepare('SELECT COUNT(*) n FROM lab_sale_claims').get()!.n===2&&cloned.prepare('SELECT COUNT(*) n FROM lab_sale_ledger').get()!.n===2);ok(cloned.prepare('SELECT stock FROM lab_reconciled_ledger WHERE variant_id=1').get()!.stock===6)}finally{cloned.close()}
 ok(isInternalWarehousePath(f.run)&&isInternalWarehousePath(path.join(f.root,'.MECACAO-V2-ARCHIVE','a.jpg'))&&!isInternalWarehousePath(f.files[0]))

 const zero=await fixture('zero',0);await rejects(()=>zero.service.confirm(zero.d.id,{...zero.input,acknowledgeZeroPrice:false},zero.key),409);ok(!fs.existsSync(zero.run));ok((await zero.service.confirm(zero.d.id,zero.input,zero.key)).status==='SOLD_TRIAL'&&zero.unchanged())
 const changed=await fixture('changed');changed.drafts.update(changed.d.id,{version:1,items:[{imageId:1,unitPrice:50000},{imageId:2,unitPrice:50000}],discount:0,note:'Đã đổi'});await rejects(()=>changed.service.confirm(changed.d.id,changed.input,changed.key),409);ok(!fs.existsSync(changed.run))
 const during=await fixture('during');await rejects(()=>during.service.confirm(during.d.id,during.input,during.key,p=>{if(p==='archive:0')during.drafts.update(during.d.id,{version:1,items:[{imageId:1,unitPrice:50000},{imageId:2,unitPrice:50000}],discount:0,note:'Đổi khi copy'})}),409);ok((await during.service.status(during.d.id,during.key)).status==='INCOMPLETE')
 const busy=await fixture('busy'),pending=busy.service.confirm(busy.d.id,busy.input,busy.key);await rejects(()=>busy.service.confirm(busy.d.id,busy.input,busy.key),409);await rejects(()=>busy.service.confirm(busy.d.id,busy.input,'trial-another-key-0001'),429);ok((await pending).status==='SOLD_TRIAL')

 for(const point of ['intent','database','clone:0','archive:0','clone:1','archive:1','prepared','linked:0','staged:0','linked:1','staged:1','before-db','sale-row','image:0','image:1','before-commit','after-commit','ready']){
  const f=await fixture('crash-'+point.replace(':','-'))
  const c=spawnSync(process.execPath,['--import','tsx',fileURLToPath(import.meta.url),'worker',f.root,point],{encoding:'utf8',timeout:30000});assert.equal(c.status,78,c.stderr);checks++
  const state=await f.service.status(f.d.id,f.key),sold=['after-commit','ready'].includes(point),prepared=['prepared','linked:0','staged:0','linked:1','staged:1','before-db','sale-row','image:0','image:1','before-commit'].includes(point)
  ok(sold?state.status==='SOLD_TRIAL':prepared?state.status==='PREPARED':['INCOMPLETE','RECOVERY_REQUIRED'].includes(state.status))
  if(prepared){const restored=await f.service.recover(f.d.id,f.key,true);ok(restored.status==='RESTORED_TRIAL');ok((await f.service.status(f.d.id,f.key)).status==='RESTORED_TRIAL');ok((await f.service.confirm(f.d.id,f.input,f.key)).status==='RESTORED_TRIAL')}
  else if(sold)ok((await f.service.confirm(f.d.id,f.input,f.key)).status==='SOLD_TRIAL')
  ok(f.unchanged()&&f.drafts.get(f.d.id).status==='DRAFT'&&f.db.prepare('SELECT COUNT(*) n FROM inventory_transactions').get()!.n===1)
 }

 const corrupt=await fixture('corrupt');await corrupt.service.confirm(corrupt.d.id,corrupt.input,corrupt.key);fs.writeFileSync(path.join(corrupt.run,STAGING_LAB,'archive','1.jpg'),'unknown-file');ok((await corrupt.service.status(corrupt.d.id,corrupt.key)).status==='RECOVERY_REQUIRED'&&corrupt.unchanged())
 const duringVerify=await fixture('during-verify');await duringVerify.service.confirm(duringVerify.d.id,duringVerify.input,duringVerify.key);const verifying=duringVerify.service.status(duringVerify.d.id,duringVerify.key);fs.writeFileSync(path.join(duringVerify.run,STAGING_LAB,'archive','1.jpg'),'changed-during-decode');ok((await verifying).status==='RECOVERY_REQUIRED'&&duringVerify.unchanged())
 if(process.platform!=='win32'){
  const escaped=await fixture('escaped'),external=path.join(base,'external');fs.mkdirSync(external);fs.symlinkSync(external,path.join(escaped.root,STAGING_LAB));await rejects(()=>escaped.service.confirm(escaped.d.id,escaped.input,escaped.key));ok(fs.readdirSync(external).length===0&&escaped.unchanged())
 }
 // Defensively reject an internal image even if bad metadata registered it or an alias points to it.
 const roles=await fixture('stock-roles'),savedEnv={root:process.env.SHOP_SANDBOX_ROOT,file:process.env.SHOP_DB_PATH,flag:process.env.SHOP_ENABLE_V2_DRAFTS}
 process.env.SHOP_SANDBOX_ROOT=roles.root;process.env.SHOP_DB_PATH=path.join(roles.root,'source.db');process.env.SHOP_ENABLE_V2_DRAFTS='1'
 const globalDb=(await import('./db.js')).db
 try{
  const {physicalImagesByVariant}=await import('./physicalInventory.js'),{getImageRecord}=await import('./images.js'),{selectedStockImages}=await import('./inventoryShare.js'),{scanStore}=await import('./storeScanner.js'),{createLosslessBackup}=await import('./backup.js')
  const internal=path.join(roles.root,STAGING_LAB,'warehouse','Size 1');fs.mkdirSync(internal,{recursive:true});const clone=path.join(internal,'1.png');fs.copyFileSync(roles.files[0],clone)
  roles.db.prepare('UPDATE product_images SET file_path=? WHERE id=1').run(clone)
  ok(physicalImagesByVariant([1]).get(1)!.filter(i=>i.exists).length===1&&getImageRecord(1)?.missing)
  assert.throws(()=>selectedStockImages([1]));checks++
  assert.throws(()=>scanStore(path.join(roles.root,STAGING_LAB)));checks++
  assert.throws(()=>createLosslessBackup());checks++;ok(!fs.existsSync(path.join(roles.root,'backups')))
  ok(scanStore(roles.root).every(p=>!p.folderPath.includes(STAGING_LAB)))
  if(process.platform!=='win32'){const alias=path.join(roles.root,'alias.png');fs.symlinkSync(clone,alias);roles.db.prepare('UPDATE product_images SET file_path=? WHERE id=1').run(alias);ok(physicalImagesByVariant([1]).get(1)!.filter(i=>i.exists).length===1&&getImageRecord(1)?.missing);assert.throws(()=>selectedStockImages([1]));checks++}
  roles.db.prepare('UPDATE product_images SET file_path=? WHERE id=1').run(roles.files[0]);ok(physicalImagesByVariant([1]).get(1)!.filter(i=>i.exists).length===2)
 }finally{globalDb.close();for(const [name,value] of [['SHOP_SANDBOX_ROOT',savedEnv.root],['SHOP_DB_PATH',savedEnv.file],['SHOP_ENABLE_V2_DRAFTS',savedEnv.flag]]){if(value===undefined)delete process.env[name!];else process.env[name!]=value}}
 console.log('V2_CONFIRM_TRIAL PASS: '+checks+' assertions; real copied-DB orchestration, trusted derivative linkage, API-ready status/retry/recovery, eighteen hard-exit points, source rows/ledger/photos preserved, zero/stale/concurrency/path/tamper guards')
}finally{for(const db of connections)db.close();fs.rmSync(base,{recursive:true,force:true})}
