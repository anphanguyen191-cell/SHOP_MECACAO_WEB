import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {spawn,spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {setTimeout as sleep} from 'node:timers/promises'
import sharp from 'sharp'
import {DatabaseSync} from 'node:sqlite'
import {bootstrapSalesDrafts} from './salesSchema.js'
import {bootstrapV100,readSchemaVersion,assertDatabaseIntegrity} from './schema.js'
import {salesDraftService} from './salesDrafts.js'
import {salesStagingLab,STAGING_LAB} from './salesStagingLab.js'
import {bootstrapCommitLab,salesCommitLab,type CommitLabInput} from './salesCommitLab.js'

const digest=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex')
const [mode,workerRoot,point,operationId]=process.argv.slice(2)
if(mode==='worker'){
 const db=new DatabaseSync(path.join(workerRoot,STAGING_LAB,'commit-lab.db')),service=salesCommitLab(db,workerRoot)
 const input=JSON.parse(fs.readFileSync(path.join(workerRoot,operationId+'.input.json'),'utf8')) as CommitLabInput
 if(point==='race'){
  try{
   await service.commit(input.operationId,service.payloadHash(input.operationId),p=>{
    if(p==='before-db'){
     fs.writeFileSync(path.join(workerRoot,operationId+'.ready'),'ready')
     // Test-only cross-process barrier; do not add waiting to production transactions.
     const timeout=Date.now()+10000
     while(!fs.existsSync(path.join(workerRoot,'race.go'))){if(Date.now()>timeout)throw Error('Race barrier timeout');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10)}
    }
   })
   process.exit(0)
  }catch(e){console.error(e instanceof Error?e.message:e);process.exit(2)}
 }
 const plan=JSON.parse(fs.readFileSync(path.join(workerRoot,STAGING_LAB,input.operationId+'.json'),'utf8'))
 if(point==='prepared')process.exit(75)
 salesStagingLab(workerRoot).stage(plan,p=>{if(p===point)process.exit(75)})
 await service.commit(input.operationId,service.payloadHash(input.operationId),p=>{if(p===point)process.exit(75)})
 process.exit(0)
}

const base=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-commit-lab-'));let checks=0
const ok=(v:unknown)=>{assert.ok(v);checks++}
const throws=(fn:()=>unknown)=>{assert.throws(fn);checks++}
const rejects=async(fn:()=>Promise<unknown>)=>{await assert.rejects(fn);checks++}
const connections:DatabaseSync[]=[]
async function fixture(name:string){
 const root=path.join(base,name),lab=path.join(root,STAGING_LAB),warehouse=path.join(lab,'warehouse','Mẫu','Size 1'),archive=path.join(lab,'archive')
 fs.mkdirSync(warehouse,{recursive:true});fs.mkdirSync(archive)
 const source=path.join(root,'source.db'),originals=path.join(root,'source-photos');fs.mkdirSync(originals)
 const sourceDb=new DatabaseSync(source);bootstrapSalesDrafts(sourceDb)
 sourceDb.exec("INSERT INTO products(product_code,name) VALUES('P','Mẫu');INSERT INTO product_variants(product_id,sku,size) VALUES(1,'P-S','Size 1');INSERT INTO inventory_transactions(variant_id,transaction_type,quantity) VALUES(1,'OPENING',8)")
 const files:string[]=[],sourceFiles:string[]=[],archives:string[]=[]
 for(let n=0;n<2;n++){
  const original=path.join(originals,n+'.png'),clone=path.join(warehouse,n+'.png'),light=path.join(archive,n+'.jpg')
  await sharp({create:{width:120,height:160,channels:3,background:n?'#a4ccfa':'#c4dfac'}}).png().toFile(original)
  fs.copyFileSync(original,clone);await sharp(original).jpeg({quality:82}).toFile(light)
  sourceDb.prepare('INSERT INTO product_images(product_id,variant_id,file_path) VALUES(1,1,?)').run(original)
  files.push(clone);sourceFiles.push(original);archives.push(light)
 }
 const drafts=salesDraftService(sourceDb,root),raw={items:[{imageId:1,unitPrice:50000},{imageId:2,unitPrice:60000}],discount:10000,note:'Giữ snapshot'}
 const first=drafts.create(raw,'commit-lab-source-key-001')
 let token='';try{drafts.create(raw,'commit-lab-source-key-002')}catch(e:any){token=e.details.conflictToken}
 const second=drafts.create({...raw,conflictToken:token},'commit-lab-source-key-002')
 const copied=path.join(lab,'commit-lab.db');sourceDb.exec("VACUUM INTO '"+copied.replace(/'/g,"''")+"'");sourceDb.close()
 const sourceHash=digest(fs.readFileSync(source)),photoHashes=sourceFiles.map(p=>digest(fs.readFileSync(p)))
 const db=new DatabaseSync(copied);connections.push(db)
 files.forEach((p,n)=>db.prepare('UPDATE product_images SET file_path=? WHERE id=?').run(p,n+1))
 const before=JSON.stringify(['sales_orders','sales_order_images','inventory_transactions'].map(t=>db.prepare('SELECT * FROM '+t).all()))
 bootstrapCommitLab(db,root)
 ok(before===JSON.stringify(['sales_orders','sales_order_images','inventory_transactions'].map(t=>db.prepare('SELECT * FROM '+t).all())))
 const rollback=new DatabaseSync(copied+'.pre-v129.bak',{readOnly:true});try{ok(readSchemaVersion(rollback)===120);assertDatabaseIntegrity(rollback)}finally{rollback.close()}
 const staging=salesStagingLab(root),service=salesCommitLab(db,root)
 function prepare(orderId=first.id,existingPlan?:ReturnType<typeof staging.plan>,acknowledgeZeroPrice=false){
  const plan=existingPlan??staging.plan(files)
  if(existingPlan){plan.id=randomUUID();fs.writeFileSync(path.join(lab,plan.id+'.json'),JSON.stringify(plan))}
  const input:CommitLabInput={operationId:plan.id,requestKey:'request-'+plan.id,orderId,version:1,acknowledgeZeroPrice,planHash:digest(fs.readFileSync(path.join(lab,plan.id+'.json'))),items:files.map((p,n)=>({imageId:n+1,sourceHash:digest(fs.readFileSync(p)),archivePath:archives[n],archiveHash:digest(fs.readFileSync(archives[n]))}))}
  const result=service.prepare(input);fs.writeFileSync(path.join(root,plan.id+'.input.json'),JSON.stringify(input));return {plan,input,result}
 }
 const unchanged=()=>digest(fs.readFileSync(source))===sourceHash&&sourceFiles.every((p,n)=>digest(fs.readFileSync(p))===photoHashes[n])
 return {root,lab,db,files,archives,source,first,second,staging,service,prepare,unchanged}
}
try{
 const f=await fixture('success');f.db.exec('UPDATE product_variants SET cost_price=12000');const p=f.prepare(),payloadHash=f.service.payloadHash(p.input.operationId)
 ok(p.result.status==='PREPARED'&&f.service.decision(p.input.operationId,p.input.planHash)==='UNCOMMITTED')
 ok(f.service.prepare(p.input).operationId===p.input.operationId)
 throws(()=>f.service.prepare({...p.input,version:2}));throws(()=>f.service.prepare({...p.input,requestKey:'request-conflicting-key'}))
 f.staging.stage(p.plan)
 const sale=await f.service.commit(p.input.operationId,payloadHash)
 ok(sale.status==='SOLD'&&sale.labOnly&&sale.originalsRetained&&sale.sale!.total===100000)
 ok((await f.service.commit(p.input.operationId,payloadHash)).operationId===sale.operationId)
 ok(f.db.prepare('SELECT COUNT(*) n FROM lab_sale_claims').get()!.n===2&&f.db.prepare('SELECT COUNT(*) n FROM lab_sale_ledger').get()!.n===2)
 ok(f.db.prepare('SELECT SUM(unit_cost) cost FROM lab_sale_ledger').get()!.cost===24000)
 ok(f.db.prepare('SELECT stock FROM lab_reconciled_ledger WHERE variant_id=1').get()!.stock===6)
 ok(f.db.prepare('SELECT stock FROM inventory_stock WHERE variant_id=1').get()!.stock===8)
 ok(f.service.decision(p.input.operationId,p.input.planHash)==='COMMITTED'&&f.service.recover(p.input.operationId).status==='COMMITTED_RETAINED')
 ok(f.files.every(x=>!fs.existsSync(x))&&p.plan.files.every(x=>fs.existsSync(x.staged))&&f.unchanged())
 throws(()=>f.db.exec("UPDATE lab_sales SET total=0"));throws(()=>f.db.exec('DELETE FROM lab_sale_claims'));throws(()=>f.db.exec("UPDATE lab_sale_operations SET status='PREPARED'"))
 f.db.exec("UPDATE products SET name='Đổi tên';UPDATE product_variants SET sale_price=99999")
 ok(JSON.parse(String(f.db.prepare('SELECT snapshot FROM lab_sale_images LIMIT 1').get()!.snapshot)).product_name==='Mẫu')
 ok(f.service.decision(p.input.operationId,'a'.repeat(64))==='AMBIGUOUS')
 const outside=new DatabaseSync(f.source);try{throws(()=>bootstrapCommitLab(outside,f.root));ok(readSchemaVersion(outside)===120)}finally{outside.close()}
 throws(()=>bootstrapV100(f.db));throws(()=>bootstrapSalesDrafts(f.db))

 for(const point of ['prepared','linked:0','staged:0','linked:1','staged:1','before-db','sale-row','image:0','image:1','before-commit','after-commit']){
  const f=await fixture('crash-'+point.replace(':','-')),p=f.prepare()
  const worker=spawnSync(process.execPath,['--import','tsx',fileURLToPath(import.meta.url),'worker',f.root,point,p.input.operationId],{encoding:'utf8',timeout:20000});assert.equal(worker.status,75,worker.stderr);checks++
  const sold=point==='after-commit'
  ok(f.service.decision(p.input.operationId,p.input.planHash)===(sold?'COMMITTED':'UNCOMMITTED'))
  const recovered=f.service.recover(p.input.operationId);ok(recovered.status===(sold?'COMMITTED_RETAINED':'RESTORED'))
  ok(f.service.recover(p.input.operationId).status===recovered.status)
  ok(Number(f.db.prepare('SELECT COUNT(*) n FROM lab_sale_ledger').get()!.n)===(sold?2:0))
  ok(sold?f.files.every(x=>!fs.existsSync(x)):f.files.every((x,n)=>digest(fs.readFileSync(x))===p.input.items[n].sourceHash))
  ok(f.unchanged());assertDatabaseIntegrity(f.db)
 }

 const stale=await fixture('stale'),sp=stale.prepare();stale.staging.stage(sp.plan);stale.db.exec('UPDATE sales_orders SET version=version+1');await rejects(()=>stale.service.commit(sp.input.operationId,stale.service.payloadHash(sp.input.operationId)));ok(stale.service.recover(sp.input.operationId).status==='RESTORED')
 const broken=await fixture('broken'),bp=broken.prepare();broken.staging.stage(bp.plan);fs.writeFileSync(broken.archives[0],'broken-jpeg');await rejects(()=>broken.service.commit(bp.input.operationId,broken.service.payloadHash(bp.input.operationId)));ok(broken.service.recover(bp.input.operationId).status==='RESTORED')
 const inject=await fixture('exception'),ip=inject.prepare();inject.staging.stage(ip.plan);await rejects(()=>inject.service.commit(ip.input.operationId,inject.service.payloadHash(ip.input.operationId),p=>{if(p==='image:0')throw Error('Injected failure')}));ok(inject.db.prepare('SELECT COUNT(*) n FROM lab_sale_claims').get()!.n===0&&inject.service.recover(ip.input.operationId).status==='RESTORED')
 const zero=await fixture('zero');zero.db.exec('UPDATE sales_order_images SET unit_price=0;UPDATE sales_orders SET discount=0');throws(()=>zero.prepare());const zp=zero.prepare(zero.first.id,undefined,true);zero.staging.stage(zp.plan);ok((await zero.service.commit(zp.input.operationId,zero.service.payloadHash(zp.input.operationId))).sale!.total===0)

 // Two real processes, same physical cloned units, different saved orders/keys. SQLite serializes; UNIQUE claims allow exactly one complete order.
 const race=await fixture('race'),one=race.prepare(),two=race.prepare(race.second.id,JSON.parse(JSON.stringify(one.plan)))
 race.staging.stage(one.plan)
 const children=[one,two].map(p=>spawn(process.execPath,['--import','tsx',fileURLToPath(import.meta.url),'worker',race.root,'race',p.input.operationId],{stdio:['ignore','ignore','pipe']}))
 const outcomes=children.map(c=>new Promise<number|null>(resolve=>c.once('exit',resolve)))
 for(let n=0;n<500&&!([one,two].every(p=>fs.existsSync(path.join(race.root,p.input.operationId+'.ready'))));n++)await sleep(20)
 ok([one,two].every(p=>fs.existsSync(path.join(race.root,p.input.operationId+'.ready'))))
 fs.writeFileSync(path.join(race.root,'race.go'),'go')
 const results=await Promise.all(outcomes);ok(results.filter(x=>x===0).length===1&&results.filter(x=>x===2).length===1)
 ok(race.db.prepare('SELECT COUNT(*) n FROM lab_sales').get()!.n===1&&race.db.prepare('SELECT COUNT(*) n FROM lab_sale_claims').get()!.n===2&&race.db.prepare('SELECT COUNT(*) n FROM lab_sale_ledger').get()!.n===2)
 const loser=[one,two].find(p=>race.service.status(p.input.operationId).status!=='SOLD')!;ok(race.service.status(loser.input.operationId).status==='RECOVERY_REQUIRED');ok(race.service.decision(loser.input.operationId,loser.input.planHash)==='AMBIGUOUS');throws(()=>race.service.recover(loser.input.operationId));ok(race.files.every(p=>!fs.existsSync(p))&&race.unchanged())

 // Incomplete DB evidence or a changed journal never authorizes filesystem rollback.
 const tampered=await fixture('tamper'),tp=tampered.prepare();tampered.staging.stage(tp.plan);await tampered.service.commit(tp.input.operationId,tampered.service.payloadHash(tp.input.operationId));tampered.db.exec('DROP TRIGGER lab_sale_ledger_delete_immutable;DELETE FROM lab_sale_ledger WHERE image_id=1');ok(tampered.service.decision(tp.input.operationId,tp.input.planHash)==='AMBIGUOUS');throws(()=>tampered.service.recover(tp.input.operationId));ok(tampered.files.every(p=>!fs.existsSync(p)))
 const changed=await fixture('journal'),jp=changed.prepare();changed.staging.stage(jp.plan);fs.appendFileSync(path.join(changed.lab,jp.input.operationId+'.json'),' ');throws(()=>changed.service.recover(jp.input.operationId));ok(changed.files.every(p=>!fs.existsSync(p))&&changed.unchanged())
 console.log('V2_COMMIT_LAB PASS: '+checks+' assertions; copied-DB migration/backup, atomic SALE/claims/snapshots, idempotency, two-process contention, eleven hard-exit points, DB-derived recovery, ambiguity/tamper fail-closed; no live sale or original deletion')
}finally{for(const db of connections)db.close();fs.rmSync(base,{recursive:true,force:true})}
