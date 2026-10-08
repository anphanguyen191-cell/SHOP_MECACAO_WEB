import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import sharp from 'sharp'
import { db, dbPath } from './db.js'

export function createBackup(){
 const root=path.dirname(dbPath),dir=path.join(root,'backups')
 fs.mkdirSync(dir,{recursive:true})
 const stamp=new Date().toISOString().replace(/[:.]/g,'-'),backupDir=path.join(dir,'backup-'+stamp)
 fs.mkdirSync(backupDir,{recursive:true})
 const target=path.join(backupDir,'shop.db')
 db.exec('PRAGMA wal_checkpoint(FULL)')
 db.exec("VACUUM INTO '"+target.replace(/'/g,"''")+"'")
 const rows=db.prepare('SELECT id,product_id,variant_id,file_path FROM product_images ORDER BY id').all() as Array<{id:number;product_id:number;variant_id:number|null;file_path:string}>
 const manifest=rows.map(r=>({...r,exists:fs.existsSync(r.file_path)}))
 fs.writeFileSync(path.join(backupDir,'images-manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),mode:'database',images:manifest},null,2),'utf8')
 return {file:path.basename(target),path:target,directory:backupDir,manifest:'images-manifest.json',mode:'database',imageCount:rows.length,missingImageCount:manifest.filter(x=>!x.exists).length,createdAt:new Date().toISOString()}
}

export async function createOptimizedImageBackup(){
 const root=path.dirname(dbPath),dir=path.join(root,'backups')
 fs.mkdirSync(dir,{recursive:true})
 const stamp=new Date().toISOString().replace(/[:.]/g,'-'),backupDir=path.join(dir,'images-'+stamp),imagesDir=path.join(backupDir,'images')
 fs.mkdirSync(imagesDir,{recursive:true})
 const rows=db.prepare('SELECT id,product_id,variant_id,file_path FROM product_images ORDER BY id').all() as Array<{id:number;product_id:number;variant_id:number|null;file_path:string}>
 let optimized=0,missing=0,failed=0,totalOriginalBytes=0,totalBackupBytes=0
 const manifest=[]
 for(const r of rows){
  if(!fs.existsSync(r.file_path)){missing++;manifest.push({...r,status:'missing'});continue}
  try{
   const originalBytes=fs.statSync(r.file_path).size
   const productDir=path.join(imagesDir,String(r.product_id),String(r.variant_id??'product'));fs.mkdirSync(productDir,{recursive:true})
   const dest=path.join(productDir,String(r.id).padStart(8,'0')+'.jpg')
   const info=await sharp(r.file_path).rotate().resize({width:1920,height:1920,fit:'inside',withoutEnlargement:true}).jpeg({quality:85,mozjpeg:true}).toFile(dest)
   totalOriginalBytes+=originalBytes;totalBackupBytes+=info.size;optimized++
   manifest.push({...r,status:'optimized',backup_path:path.relative(backupDir,dest),original_bytes:originalBytes,backup_bytes:info.size,width:info.width,height:info.height})
  }catch(e){failed++;manifest.push({...r,status:'failed',error:e instanceof Error?e.message:'optimize failed'})}
 }
 fs.writeFileSync(path.join(backupDir,'images-manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),mode:'optimized-images',maxDimension:1920,jpegQuality:85,images:manifest},null,2),'utf8')
 if(failed)throw new Error('Sao lưu ảnh tối ưu chưa hoàn chỉnh: '+failed+' ảnh xử lý thất bại')
 return {directory:backupDir,manifest:'images-manifest.json',mode:'optimized-images',imageCount:rows.length,optimizedImageCount:optimized,missingImageCount:missing,failedImageCount:failed,totalOriginalBytes,totalBackupBytes,createdAt:new Date().toISOString()}
}

/**
 * Lossless recovery bundle: database snapshot + BYTE-EXACT copies of every
 * registered physical image. Unlike optimized backups these files can be
 * compared by SHA-256 to the original and used for later disaster recovery.
 * Original customer image locations are never modified.
 */
export function createLosslessBackup(){
 const base=createBackup()
 const imageDir=path.join(base.directory,'lossless-images')
 fs.mkdirSync(imageDir,{recursive:true})
 const records=db.prepare('SELECT id,product_id,variant_id,file_path FROM product_images ORDER BY id').all() as Array<{id:number;product_id:number;variant_id:number|null;file_path:string}>
 const hash=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
 const files:Array<{id:number;product_id:number;variant_id:number|null;source_path:string;backup_path:string;size:number;sha256:string}>=[]
 for(const rec of records){
  if(!fs.existsSync(rec.file_path)||!fs.statSync(rec.file_path).isFile())throw new Error('Không thể sao lưu đầy đủ: thiếu ảnh vật lý '+rec.file_path)
  const before=hash(rec.file_path)
  const ext=path.extname(rec.file_path).toLowerCase()
  const backupPath=path.join(imageDir,String(rec.id).padStart(9,'0')+ext)
  fs.copyFileSync(rec.file_path,backupPath,fs.constants.COPYFILE_EXCL)
  const after=hash(rec.file_path),copyHash=hash(backupPath)
  if(after!==before||copyHash!==before)throw new Error('Ảnh nguồn đã thay đổi trong lúc sao lưu: '+rec.file_path)
  files.push({id:rec.id,product_id:rec.product_id,variant_id:rec.variant_id,source_path:rec.file_path,backup_path:path.relative(base.directory,backupPath),size:fs.statSync(backupPath).size,sha256:copyHash})
 }
 const snapshot=path.join(base.directory,'shop.db')
 const manifest={version:1,createdAt:new Date().toISOString(),mode:'lossless-recovery',database:'shop.db',database_sha256:hash(snapshot),files}
 const tmp=path.join(base.directory,'lossless-manifest.json.tmp')
 fs.writeFileSync(tmp,JSON.stringify(manifest,null,2),'utf8')
 fs.renameSync(tmp,path.join(base.directory,'lossless-manifest.json'))
 const verified=verifyLosslessBackup(base.directory)
 return {directory:base.directory,mode:'lossless-recovery',imageCount:files.length,totalBytes:files.reduce((n,f)=>n+f.size,0),database:base.path,manifest:'lossless-manifest.json',verified}
}
/** Safe verification only. Does not restore or overwrite any warehouse file. */
export function verifyLosslessBackup(directory:string){
 const dir=path.resolve(directory),manifestPath=path.join(dir,'lossless-manifest.json')
 const obj=JSON.parse(fs.readFileSync(manifestPath,'utf8')) as {version:number;database:string;database_sha256:string;files:Array<{id:number;backup_path:string;sha256:string;size:number}>}
 if(obj.version!==1||obj.database!=='shop.db'||!Array.isArray(obj.files))throw new Error('Manifest sao lưu không hợp lệ')
 const hash=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
 const snapshot=path.join(dir,'shop.db')
 if(hash(snapshot)!==obj.database_sha256)throw new Error('Backup database sai checksum')
 const checked=new Set<string>()
 for(const rec of obj.files){
  const target=path.resolve(dir,rec.backup_path)
  const rel=path.relative(dir,target)
  if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel)||checked.has(target))throw new Error('Đường dẫn file sao lưu không an toàn')
  checked.add(target)
  if(!fs.existsSync(target)||!fs.statSync(target).isFile()||fs.statSync(target).size!==rec.size||hash(target)!==rec.sha256)throw new Error('Ảnh sao lưu bị thiếu hoặc sai checksum: '+rec.backup_path)
 }
 const restored=new DatabaseSync(snapshot,{readOnly:true})
 try{
  const integrity=(restored.prepare('PRAGMA integrity_check').get() as {integrity_check:string}).integrity_check
  if(integrity!=='ok'||restored.prepare('PRAGMA foreign_key_check').all().length)throw new Error('SQLite backup không toàn vẹn')
 }finally{restored.close()}
 return {ok:true,imagesVerified:obj.files.length,dbVerified:true}
}
