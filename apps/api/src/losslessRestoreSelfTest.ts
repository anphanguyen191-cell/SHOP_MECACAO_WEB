import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import sharp from 'sharp'
import {DatabaseSync} from 'node:sqlite'
import {bootstrapV100} from './schema.js'
import {bootstrapSalesDrafts} from './salesSchema.js'
import {salesDraftService} from './salesDrafts.js'
import {salesPreviewService} from './salesPreview.js'
import {salesArchiveService,ARCHIVE_FOLDER} from './salesArchive.js'
import {archiveSnapshot} from './archiveSnapshot.js'
import {restoreLosslessBackup} from './losslessRestore.js'
import {verifyLosslessBackup} from './losslessVerify.js'
const [mode,bundle,target,warehouse,point]=process.argv.slice(2)
if(mode==='worker'){restoreLosslessBackup(bundle,target,warehouse,p=>{if(p===point)process.exit(77)});process.exit(0)}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-restore-')),old=path.join(root,'source','warehouse'),sourceRoot=path.dirname(old),file=path.join(old,'Mẫu thử','Size tự do','001.png'),dbPath=path.join(sourceRoot,'shop.db'),backup=path.join(root,'backup'),hash=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
let checks=0;const check=(ok:unknown)=>{assert.ok(ok);checks++}
fs.mkdirSync(path.dirname(file),{recursive:true});fs.mkdirSync(backup)
await sharp({create:{width:1500,height:1900,channels:3,background:'#b5dccc'}}).png().toFile(file)
const original=hash(file),db=new DatabaseSync(dbPath)
try{
 bootstrapV100(db);db.exec("INSERT INTO products(product_code,name) VALUES('P1','Mẫu thử');INSERT INTO product_variants(product_id,sku,size) VALUES(1,'P1-S1','Size tự do');INSERT INTO inventory_transactions(variant_id,transaction_type,quantity) VALUES(1,'OPENING',8)")
 db.prepare('INSERT INTO product_images(product_id,variant_id,file_path) VALUES(1,1,?)').run(file)
 db.prepare("INSERT INTO app_settings(key,value) VALUES('warehouse-watch',?)").run(JSON.stringify({rootPath:old,startup:true,periodic:true,autoRename:true,intervalSeconds:300,popup:true}))
 bootstrapSalesDrafts(db);const draft=salesDraftService(db,sourceRoot).create({items:[{imageId:1,unitPrice:50000}],discount:1000,note:'giữ lịch sử'},'restore-draft-key-0001'),preview=await salesPreviewService(db,sourceRoot).preview(draft.id,1),archive=await salesArchiveService(db,sourceRoot).prepare(draft.id,{version:1,images:preview.items.map(i=>({imageId:i.imageId,sourceHash:i.sourceHash}))},'restore-archive-key-0001')
 db.exec("VACUUM INTO '"+path.join(backup,'shop.db').replace(/'/g,"''")+"'");fs.mkdirSync(path.join(backup,'lossless-images'));fs.copyFileSync(file,path.join(backup,'lossless-images','1.png'))
 const archives=archiveSnapshot(sourceRoot).map(e=>{const p=path.join(backup,'trial-archives',e.relative_path);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(e.source,p);return {relative_path:e.relative_path,backup_path:path.relative(backup,p),size:e.size,sha256:e.sha256}}),manifest={version:2,database:'shop.db',database_sha256:hash(path.join(backup,'shop.db')),mode:'lossless-recovery',files:[{id:1,source_path:file,backup_path:path.join('lossless-images','1.png'),size:fs.statSync(file).size,sha256:original}],archives}
 fs.writeFileSync(path.join(backup,'lossless-manifest.json'),JSON.stringify(manifest));const backupHash=hash(path.join(backup,'shop.db'));check(verifyLosslessBackup(backup).archiveFilesVerified===3)
 assert.throws(()=>restoreLosslessBackup(backup,path.join(backup,'nested-restore'),old));checks++
 assert.throws(()=>restoreLosslessBackup(backup,path.join(old,'nested-restore'),old));checks++
 const pendingSave=salesArchiveService(db,sourceRoot).prepare(draft.id,{version:1,images:preview.items.map(i=>({imageId:i.imageId,sourceHash:i.sourceHash}))},'restore-archive-key-0001');assert.throws(()=>archiveSnapshot(sourceRoot),/Đang xử lý/);checks++;await pendingSave
 const dest=path.join(root,'restored'),result=restoreLosslessBackup(backup,dest,old);check(result.status==='READY'&&!result.activated&&result.imagesVerified===1&&result.archiveFilesVerified===3)
 check(hash(path.join(result.warehouse,'Mẫu thử','Size tự do','001.png'))===original&&hash(file)===original&&hash(path.join(backup,'shop.db'))===backupHash)
 const restored=new DatabaseSync(result.database);try{
  const row=restored.prepare('SELECT id,file_path FROM product_images').get()!;check(row.id===1&&row.file_path===path.join(result.warehouse,'Mẫu thử','Size tự do','001.png'))
  check((restored.prepare('SELECT stock FROM inventory_stock').get() as any).stock===8)
  check(salesDraftService(restored,dest).get(draft.id).total===49000&&salesDraftService(restored,dest).get(draft.id).available)
  check((await salesArchiveService(restored,dest).verify(draft.id,archive.archiveId)).status==='READY')
  const watch=JSON.parse(String(restored.prepare("SELECT value FROM app_settings WHERE key='warehouse-watch'").get()!.value));check(watch.rootPath===result.warehouse&&!watch.startup&&!watch.periodic&&!watch.autoRename)
 }finally{restored.close()}
 assert.throws(()=>restoreLosslessBackup(backup,dest,old),/không ghi đè/);checks++
 assert.throws(()=>restoreLosslessBackup(backup,path.join(root,'wrong-root'),sourceRoot));checks++;check(!fs.existsSync(path.join(root,'wrong-root')))
 // Source warehouse can disappear entirely; restore only needs backup plus the original path mapping.
 fs.renameSync(old,old+'.unavailable');const offline=restoreLosslessBackup(backup,path.join(root,'offline'),old);check(offline.status==='READY');fs.renameSync(old+'.unavailable',old)
 for(const point of ['plan','image:0','archives','database-copy','before-db-commit','db-commit','ready']){
  const dest=path.join(root,'crash-'+point.replace(':','-')),p=spawnSync(process.execPath,['--import','tsx',fileURLToPath(import.meta.url),'worker',backup,dest,old,point],{encoding:'utf8'});assert.equal(p.status,77,p.stderr);checks++
  check(fs.existsSync(path.join(dest,'restore-ready.json'))===(point==='ready'));check(hash(file)===original&&hash(path.join(backup,'shop.db'))===backupHash)
  assert.throws(()=>restoreLosslessBackup(backup,dest,old));checks++
 }
 const copy=path.join(backup,'lossless-images','1.png'),bytes=fs.readFileSync(copy);fs.writeFileSync(copy,'changed');assert.throws(()=>restoreLosslessBackup(backup,path.join(root,'corrupt'),old));checks++;check(!fs.existsSync(path.join(root,'corrupt')));fs.writeFileSync(copy,bytes)
 const jpg=path.join(backup,archives.find(a=>a.relative_path.endsWith('.jpg'))!.backup_path),jpeg=fs.readFileSync(jpg);fs.writeFileSync(jpg,'changed');assert.throws(()=>verifyLosslessBackup(backup));checks++;fs.writeFileSync(jpg,jpeg)
 // Manifest path traversal is rejected before any target write.
 const mf=path.join(backup,'lossless-manifest.json'),oldMf=fs.readFileSync(mf);fs.writeFileSync(mf,JSON.stringify({...manifest,files:[{...manifest.files[0],backup_path:'../outside.png'}]}));assert.throws(()=>restoreLosslessBackup(backup,path.join(root,'unsafe'),old));checks++;check(!fs.existsSync(path.join(root,'unsafe')));fs.writeFileSync(mf,oldMf)
 // A pending archive cannot silently be omitted from a full recovery bundle.
 const pending=path.join(sourceRoot,ARCHIVE_FOLDER,'a'.repeat(64));fs.mkdirSync(pending);assert.throws(()=>archiveSnapshot(sourceRoot));checks++
 // Legacy V1 bundle remains restorable, without automatic migration.
 const v1dir=path.join(root,'v1');fs.mkdirSync(v1dir);const v1db=new DatabaseSync(path.join(v1dir,'shop.db'));bootstrapV100(v1db);v1db.close();fs.writeFileSync(path.join(v1dir,'lossless-manifest.json'),JSON.stringify({version:1,mode:'lossless-recovery',database:'shop.db',database_sha256:hash(path.join(v1dir,'shop.db')),files:[]}));check(restoreLosslessBackup(v1dir,path.join(root,'v1-restored'),old).schema===110)
 console.log('LOSSLESS_RESTORE_SELF_TEST PASS: '+checks+' assertions; V1/V2 new-directory restore, IDs/history/physical bytes/archive preserved, seven hard-exit points, paths/version/watch guards, corruption and pending-archive rejection')
}finally{db.close();fs.rmSync(root,{recursive:true,force:true})}
