import fs from 'node:fs'
import path from 'node:path'
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
