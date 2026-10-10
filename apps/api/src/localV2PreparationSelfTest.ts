import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {DatabaseSync} from 'node:sqlite'
import sharp from 'sharp'
import {bootstrapV100,readSchemaVersion} from './schema.js'
import {businessSnapshot,prepareLocalV2} from './localV2Preparation.js'
import {digest} from './salesExecution.js'
import {salesDraftService} from './salesDrafts.js'
import {verifyLosslessBackup} from './losslessVerify.js'

const [mode,bundleArg,oldArg,targetArg,point]=process.argv.slice(2)
if(mode==='worker'){await prepareLocalV2(bundleArg,oldArg,targetArg,p=>{if(p===point)process.exit(79)});process.exit(0)}
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
  console.log(`LOCAL_V2_PREPARATION PASS: ${checks} assertions; V1→130 isolated copy, complete business rows/sequences/settings, byte-exact photos, ledger mismatch retained, V2 backup/restore proof, V1 rollback proof, ten hard exits, offline source, corruption/decode/path guards; source untouched`)
}finally{fs.rmSync(root,{recursive:true,force:true})}
