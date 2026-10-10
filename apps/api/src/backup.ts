import {createSalesBackup} from './salesBackup.js'
import {archiveSnapshot,type ExtraFile} from './archiveSnapshot.js'
import {readSchemaVersion} from './schema.js'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import sharp from 'sharp'
import {verifyLosslessBackup} from './losslessVerify.js'
export {verifyLosslessBackup} from './losslessVerify.js'
import { db, dbPath } from './db.js'
import {isInternalWarehousePath} from './warehouseAreas.js'

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
export function createLosslessBackup(onProgress?:(p:any)=>void){
 onProgress?.({phase:'BACKUP_VALIDATE',completed:0})
 if(readSchemaVersion(db)===130){if(!process.env.SHOP_SANDBOX_ROOT)throw Error('Sale backup cần sandbox');return createSalesBackup(db,dbPath,process.env.SHOP_SANDBOX_ROOT,onProgress)}
 const schema=readSchemaVersion(db),archiveSources=schema===120&&process.env.SHOP_SANDBOX_ROOT?archiveSnapshot(process.env.SHOP_SANDBOX_ROOT):[]
 const records=db.prepare('SELECT id,product_id,variant_id,file_path FROM product_images ORDER BY id').all() as Array<{id:number;product_id:number;variant_id:number|null;file_path:string}>
 if(records.some(r=>isInternalWarehousePath(r.file_path)||(fs.existsSync(r.file_path)&&isInternalWarehousePath(fs.realpathSync(r.file_path)))))throw Error('Ảnh thư mục thử/staging đã bị đăng ký như hàng tồn. Dừng backup đầy đủ để kiểm tra metadata, không bỏ qua âm thầm.')
 const base=createBackup()
 const imageDir=path.join(base.directory,'lossless-images')
 fs.mkdirSync(imageDir,{recursive:true})
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
  onProgress?.({phase:'BACKUP_COPY',completed:files.length+1,total:records.length,current:rec.file_path})
  files.push({id:rec.id,product_id:rec.product_id,variant_id:rec.variant_id,source_path:rec.file_path,backup_path:path.relative(base.directory,backupPath),size:fs.statSync(backupPath).size,sha256:copyHash})
 }
 onProgress?.({phase:'BACKUP_VERIFY',completed:files.length,total:records.length})
 const snapshot=path.join(base.directory,'shop.db')
 const archives:ExtraFile[]=[]
 for(const file of archiveSources){
  const target=path.join(base.directory,'trial-archives',file.relative_path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file.source,target,fs.constants.COPYFILE_EXCL)
  if(hash(target)!==file.sha256||hash(file.source)!==file.sha256)throw Error('Ảnh nhẹ thay đổi trong lúc backup')
  archives.push({relative_path:file.relative_path,backup_path:path.relative(base.directory,target),sha256:file.sha256,size:file.size})
 }
 const manifest={version:archives.length?2:1,archives,createdAt:new Date().toISOString(),mode:'lossless-recovery',database:'shop.db',database_sha256:hash(snapshot),files}
 const tmp=path.join(base.directory,'lossless-manifest.json.tmp')
 fs.writeFileSync(tmp,JSON.stringify(manifest,null,2),'utf8')
 fs.renameSync(tmp,path.join(base.directory,'lossless-manifest.json'))
 const verified=verifyLosslessBackup(base.directory)
 return {directory:base.directory,mode:'lossless-recovery',imageCount:files.length,archiveFileCount:archives.length,totalBytes:files.reduce((n,f)=>n+f.size,0),database:base.path,manifest:'lossless-manifest.json',verified}
}
