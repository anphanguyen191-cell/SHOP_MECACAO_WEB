import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync,spawn} from 'node:child_process'
import {createServer} from 'node:net'
import {fileURLToPath} from 'node:url'
import {DatabaseSync} from 'node:sqlite'
import sharp from 'sharp'
import {bootstrapV100,readSchemaVersion} from './schema.js'
import {businessSnapshot,prepareLocalV2} from './localV2Preparation.js'
import {digest} from './salesExecution.js'
import {salesDraftService} from './salesDrafts.js'
import {verifyLosslessBackup} from './losslessVerify.js'
import {checkLocalV2Release} from './localV2ReleaseCheck.js'
import {activateLocalV2,rollbackUnusedLocalV2,ACTIVATE_PHRASE,ROLLBACK_PHRASE} from './localV2Activation.js'
import {ACTIVE_MARKER,RUNTIME_LOCK,readLocalConfig,legacyWarehouseActive} from './localRuntime.js'
import {createSalesBackup,restoreSalesBackup} from './salesBackup.js'
import {salesExecutionService} from './salesExecution.js'
import {salesPreflightService} from './salesPreflight.js'

const [mode,bundleArg,oldArg,targetArg,point]=process.argv.slice(2)
if(mode==='worker'){await prepareLocalV2(bundleArg,oldArg,targetArg,p=>{if(p===point)process.exit(79)});process.exit(0)}
if(mode==='activate-worker'){activateLocalV2(bundleArg,oldArg,targetArg,ACTIVATE_PHRASE,p=>{if(p===point)process.exit(79)});process.exit(0)}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-local-prep-')),old=path.join(root,'source','warehouse'),dbPath=path.join(root,'source','shop.db'),bundle=path.join(root,'backup')
let checks=0
const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++}
const reject=async(fn:()=>unknown)=>{await assert.rejects(async()=>fn());checks++}
try{
  fs.mkdirSync(path.join(old,'Lửng gái','Size tự do'),{recursive:true});fs.mkdirSync(bundle)
  const file=path.join(old,'Lửng gái','Size tự do','001.png')
  await sharp({create:{width:40,height:50,channels:3,background:'#efbbdd'}}).png().toFile(file)
  const bytes=fs.readFileSync(file),db=new DatabaseSync(dbPath)
  bootstrapV100(db)
  db.exec("INSERT INTO categories(id,name) VALUES(7,'Đồ tole');INSERT INTO products(id,product_code,name,category_id) VALUES(11,'P001','Lửng gái',7);INSERT INTO product_variants(id,product_id,sku,size,cost_price,sale_price) VALUES(23,11,'P001-S1','Size tự do',12000,50000);INSERT INTO inventory_transactions(id,variant_id,transaction_type,quantity,unit_cost,note) VALUES(31,23,'OPENING',8,12000,'Giữ ledger8; tồn ảnh1')")
  db.prepare('INSERT INTO product_images(id,product_id,variant_id,file_path) VALUES(41,11,23,?)').run(file)
  db.prepare("INSERT INTO app_settings(key,value) VALUES('warehouse-watch',?)").run(JSON.stringify({rootPath:old,startup:true,periodic:true,autoRename:true,popup:true}))
  db.exec("VACUUM INTO '"+path.join(bundle,'shop.db').replace(/'/g,"''")+"'")
  const baseline=businessSnapshot(db,old);db.close()
  fs.copyFileSync(file,path.join(bundle,'41.png'))
  const mf={version:1,mode:'lossless-recovery',database:'shop.db',database_sha256:digest(fs.readFileSync(path.join(bundle,'shop.db'))),files:[{id:41,source_path:file,backup_path:'41.png',size:bytes.length,sha256:digest(bytes)}]}
  const manifest=path.join(bundle,'lossless-manifest.json');fs.writeFileSync(manifest,JSON.stringify(mf))
  const sourceHash=digest(fs.readFileSync(dbPath)),backupHash=digest(fs.readFileSync(path.join(bundle,'shop.db')))
  const result=await prepareLocalV2(bundle,old,path.join(root,'prepared'))
  eq(result.status,'READY_FOR_REVIEW');eq(result.activated,false);eq(result.businessActivationAllowed,false);eq(result.candidate.schema,130);eq(result.imagesVerified,1)
  for(const [copy,schema] of [[result.candidate,130],[result.restoreProof,130],[result.rollbackProof,110]] as const){const handle=new DatabaseSync(copy.database,{readOnly:true});try{eq(readSchemaVersion(handle),schema);eq(businessSnapshot(handle,copy.warehouse).sha256,baseline.sha256);eq(handle.prepare('SELECT stock FROM inventory_stock WHERE variant_id=23').get()!.stock,8);eq(digest(fs.readFileSync(path.join(copy.warehouse,'Lửng gái','Size tự do','001.png'))),digest(bytes));if(schema===130){eq(handle.prepare('SELECT COUNT(*) n FROM sales_ledger').get()!.n,0);eq(salesDraftService(handle,copy.targetRoot).list().length,0)}}finally{handle.close()}}
  eq(verifyLosslessBackup(result.postMigrationBackup).ok,true);eq(digest(fs.readFileSync(dbPath)),sourceHash);eq(digest(fs.readFileSync(file)),digest(bytes));eq(digest(fs.readFileSync(path.join(bundle,'shop.db'))),backupHash)
  const pristine=checkLocalV2Release(path.join(root,'prepared'),bundle)
  eq(pristine.status,'TECHNICALLY_READY_FOR_REVIEW');eq(pristine.businessActivationAllowed,false);eq(pristine.requiresRecheckAtActivation,true);eq(pristine.counts?.product_images,1)
  eq(checkLocalV2Release(path.join(root,'prepared')).status,'BLOCKED')
  await reject(()=>activateLocalV2(path.join(root,'prepared'),dbPath,path.join(root,'no-consent'),'wrong'))
  eq(fs.existsSync(path.join(root,'no-consent')),false)
  const live=activateLocalV2(path.join(root,'prepared'),dbPath,path.join(root,'live'),ACTIVATE_PHRASE)
  eq(readLocalConfig(live.configPath).warehouse,old);eq(digest(fs.readFileSync(dbPath)),sourceHash);eq(digest(fs.readFileSync(file)),digest(bytes))
  const originalDb=new DatabaseSync(dbPath,{readOnly:true});eq(legacyWarehouseActive(originalDb),true);originalDb.close()
  await reject(()=>activateLocalV2(path.join(root,'prepared'),dbPath,path.join(root,'second-live'),ACTIVATE_PHRASE))
  const liveDb=new DatabaseSync(live.database);eq(businessSnapshot(liveDb,old).sha256,baseline.sha256)
  const full=createSalesBackup(liveDb,live.database,old);eq(JSON.parse(fs.readFileSync(path.join(full.directory,'lossless-manifest.json'),'utf8')).version,4)
  const recovered=restoreSalesBackup(full.directory,path.join(root,'live-restored'),old);eq(recovered.backupVersion,4);eq(digest(fs.readFileSync(path.join(recovered.warehouse,'Lửng gái','Size tự do','001.png'))),digest(bytes))
  liveDb.close()
  // Exercise the actual server in direct-layout mode twice (restart), not only services.
  const probe=createServer();await new Promise<void>(r=>probe.listen(0,'127.0.0.1',r));const port=(probe.address() as {port:number}).port;await new Promise<void>(r=>probe.close(()=>r()))
  for(let restart=0;restart<2;restart++){
    const env={...process.env,PORT:String(port),SHOP_LOCAL_V2_CONFIG:live.configPath,SHOP_LOCAL_V2_RESTORE_READY:'',SHOP_DB_PATH:'',SHOP_SANDBOX_ROOT:'',SHOP_LOCAL_V2_REVIEW:''}
    const child=spawn(process.execPath,['--import','tsx',fileURLToPath(new URL('./server.ts',import.meta.url))],{env,stdio:['ignore','pipe','pipe','ipc']});let output='';child.stdout!.on('data',b=>{output+=b});child.stderr!.on('data',b=>{output+=b})
    try{let health:any;for(let i=0;i<120;i++){try{health=await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();break}catch{await new Promise(r=>setTimeout(r,100))}}if(!health)throw Error('LOCAL server did not start: '+output)
      eq(health.localV2Business,true);eq(health.sandbox,false);eq(health.warehouse,old);eq(health.databasePath,live.database)
      const origin=`http://127.0.0.1:${port}`,headers={'Content-Type':'application/json',Origin:origin}
      eq(await (await fetch(origin+'/api/fs/roots')).json(),[old,live.incoming])
      eq((await fetch(origin+'/api/store/scan',{method:'POST',headers,body:JSON.stringify({rootPath:root})})).status,403)
      eq((await fetch(origin+'/api/store/scan',{method:'POST',headers:{...headers,Origin:'https://untrusted.example'},body:JSON.stringify({rootPath:old})})).status,403)
      eq((await fetch(origin+'/api/store/scan',{method:'POST',headers,body:JSON.stringify({rootPath:old})})).status,200)
      const duplicate=spawnSync(process.execPath,['--import','tsx',fileURLToPath(new URL('./server.ts',import.meta.url))],{env:{...env,PORT:String(port+1)},encoding:'utf8',timeout:15000});eq(duplicate.status,1);eq(duplicate.stderr.includes('đã có tiến trình'),true)
    }finally{if(child.exitCode===null){const exited=new Promise(r=>child.once('exit',r));child.send('SHOP_LOCAL_CLOSE');await exited}}
    eq(fs.existsSync(path.join(old,RUNTIME_LOCK)),false)
  }
  eq(rollbackUnusedLocalV2(live.configPath,ROLLBACK_PHRASE).status,'ROLLED_BACK_WITHOUT_BUSINESS_CHANGES');eq(fs.existsSync(path.join(old,ACTIVE_MARKER)),false);eq(fs.existsSync(live.database),true)
  await reject(()=>readLocalConfig(live.configPath))
  for(const p of ['plan','database-copy','database-ready','backup','restore-proof','before-active','active']){
    const target=path.join(root,'activate-crash-'+p),child=spawnSync(process.execPath,['--import','tsx',fileURLToPath(import.meta.url),'activate-worker',path.join(root,'prepared'),dbPath,target,p],{encoding:'utf8',timeout:30000})
    eq(child.status,79);eq(fs.existsSync(path.join(old,ACTIVE_MARKER)),p==='active');eq(digest(fs.readFileSync(dbPath)),sourceHash);eq(digest(fs.readFileSync(file)),digest(bytes))
    if(p==='active')eq(rollbackUnusedLocalV2(path.join(target,'local-v2-config.json'),ROLLBACK_PHRASE).status,'ROLLED_BACK_WITHOUT_BUSINESS_CHANGES')
  }
  const soldConfig=activateLocalV2(path.join(root,'prepared'),dbPath,path.join(root,'live-sale'),ACTIVATE_PHRASE),soldDb=new DatabaseSync(soldConfig.database)
  const soldDraft=salesDraftService(soldDb,old).create({items:[{imageId:41,unitPrice:50000}],discount:0,note:'live layout fixture'},'direct-live-draft-key-001')
  await reject(()=>rollbackUnusedLocalV2(soldConfig.configPath,ROLLBACK_PHRASE))
  const token=(await salesPreflightService(soldDb,old).check(soldDraft.id,1)).token
  eq((await salesExecutionService(soldDb,old).confirm(soldDraft.id,{version:1,token,confirmed:true,acknowledgeZeroPrice:false},'direct-live-sale-key-001')).status,'SOLD');eq(fs.existsSync(file),false)
  const soldBackup=createSalesBackup(soldDb,soldConfig.database,old),soldRestore=restoreSalesBackup(soldBackup.directory,path.join(root,'direct-sold-restore'),old)
  eq(soldRestore.soldImagesVerified,1);eq(fs.existsSync(path.join(soldRestore.warehouse,'Lửng gái','Size tự do','001.png')),false);eq(verifyLosslessBackup(soldBackup.directory).ok,true);soldDb.close()
  // Restore only the disposable fixture, never business files, to continue the existing V1 tests.
  fs.writeFileSync(file,bytes);fs.unlinkSync(path.join(old,ACTIVE_MARKER))
  // Drafts, even cancelled ones, must not be promoted from a rehearsal copy.
  const candidateDb=new DatabaseSync(result.candidate.database),drafts=salesDraftService(candidateDb,result.candidate.targetRoot)
  const draft= drafts.create({items:[{imageId:41,unitPrice:50000}],discount:0,note:'test'},'release-check-draft-key-001')
  eq(checkLocalV2Release(path.join(root,'prepared'),bundle).checks.find(c=>c.id==='candidate')?.ok,false)
  drafts.cancel(draft.id,1);candidateDb.close()
  eq(checkLocalV2Release(path.join(root,'prepared'),bundle).status,'BLOCKED')
  const changed=await prepareLocalV2(bundle,old,path.join(root,'changed'))
  const changedDb=new DatabaseSync(changed.candidate.database);changedDb.exec('UPDATE product_variants SET sale_price=51000 WHERE id=23');changedDb.close()
  eq(checkLocalV2Release(path.join(root,'changed'),bundle).checks.find(c=>c.id==='candidate')?.ok,false)
  const imageChanged=await prepareLocalV2(bundle,old,path.join(root,'image-changed'))
  fs.writeFileSync(path.join(imageChanged.candidate.warehouse,'Lửng gái','Size tự do','001.png'),'bad')
  eq(checkLocalV2Release(path.join(root,'image-changed'),bundle).checks.find(c=>c.id==='candidate')?.ok,false)
  const liveChanged=path.join(root,'latest-changed');fs.mkdirSync(liveChanged);fs.copyFileSync(path.join(bundle,'shop.db'),path.join(liveChanged,'shop.db'));fs.copyFileSync(path.join(bundle,'41.png'),path.join(liveChanged,'41.png'))
  const changedLiveDb=new DatabaseSync(path.join(liveChanged,'shop.db'));changedLiveDb.exec('UPDATE product_variants SET cost_price=13000 WHERE id=23');changedLiveDb.close()
  fs.writeFileSync(path.join(liveChanged,'lossless-manifest.json'),JSON.stringify({...mf,database_sha256:digest(fs.readFileSync(path.join(liveChanged,'shop.db')))}))
  eq(checkLocalV2Release(path.join(root,'prepared'),liveChanged).checks.find(c=>c.id==='latestV1')?.ok,false)
  const markerPath=path.join(root,'image-changed','local-v2-ready.json'),originalMarker=fs.readFileSync(markerPath)
  fs.writeFileSync(markerPath,JSON.stringify({...JSON.parse(originalMarker.toString()),rollbackProof:{...imageChanged.rollbackProof,database:dbPath}}))
  eq(checkLocalV2Release(path.join(root,'image-changed'),bundle).checks.find(c=>c.id==='rollbackProof')?.ok,false)
  fs.writeFileSync(markerPath,originalMarker)
  eq(digest(fs.readFileSync(dbPath)),sourceHash);eq(digest(fs.readFileSync(path.join(bundle,'shop.db'))),backupHash)
  await reject(()=>prepareLocalV2(bundle,old,path.join(root,'prepared')))
  await reject(()=>prepareLocalV2(bundle,old,path.join(old,'bad')))
  await reject(()=>prepareLocalV2(bundle,old,path.join(bundle,'bad')))
  await reject(()=>prepareLocalV2(bundle,path.join(root,'source'),path.join(root,'wrong-root')))
  eq(fs.existsSync(path.join(root,'wrong-root')),false)
  // A source warehouse can be offline: only the byte-exact recovery bundle is consumed.
  fs.renameSync(old,old+'.offline');eq((await prepareLocalV2(bundle,old,path.join(root,'offline'))).status,'READY_FOR_REVIEW');fs.renameSync(old+'.offline',old)
  for(const p of ['plan','restored-v1','decoded:41','schema120','schema130','backup130','restore-proof','rollback-proof','before-ready','ready']){
    const target=path.join(root,'crash-'+p.replace(':','-'))
    const child=spawnSync(process.execPath,['--import','tsx',fileURLToPath(import.meta.url),'worker',bundle,old,target,p],{encoding:'utf8',timeout:30000})
    eq(child.status,79);eq(fs.existsSync(path.join(target,'local-v2-ready.json')),p==='ready');eq(digest(fs.readFileSync(dbPath)),sourceHash);eq(digest(fs.readFileSync(file)),digest(bytes));eq(verifyLosslessBackup(bundle).ok,true)
    await reject(()=>prepareLocalV2(bundle,old,target))
  }
  // Hash-valid but undecodable source images must not produce a READY package.
  fs.writeFileSync(path.join(bundle,'41.png'),'not-an-image');fs.writeFileSync(manifest,JSON.stringify({...mf,files:[{...mf.files[0],size:12,sha256:digest('not-an-image')}]}))
  await reject(()=>prepareLocalV2(bundle,old,path.join(root,'invalid-image')));eq(fs.existsSync(path.join(root,'invalid-image','local-v2-ready.json')),false)
  fs.writeFileSync(path.join(bundle,'41.png'),bytes);fs.writeFileSync(manifest,JSON.stringify(mf))
  // Corrupt backup rejected before target creation.
  fs.writeFileSync(path.join(bundle,'41.png'),'corrupt');await reject(()=>prepareLocalV2(bundle,old,path.join(root,'corrupt')));eq(fs.existsSync(path.join(root,'corrupt')),false)
  console.log(`LOCAL_V2_PREPARATION PASS: ${checks} assertions; V1→130 isolated copy, complete business rows/sequences/settings, byte-exact photos, ledger mismatch retained, V2 backup/restore and V1 rollback proof, ten hard exits, release check blocks draft/cancelled orders, changed price/photo/latest V1 and redirected marker; source untouched`)
}finally{fs.rmSync(root,{recursive:true,force:true})}
