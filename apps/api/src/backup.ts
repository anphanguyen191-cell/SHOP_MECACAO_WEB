import fs from 'node:fs'
import path from 'node:path'
import { db, dbPath } from './db.js'

type BackupMode='manifest'|'full'
export function createBackup(mode:BackupMode='manifest'){
 const root=path.dirname(dbPath),dir=path.join(root,'backups')
 fs.mkdirSync(dir,{recursive:true})
 const stamp=new Date().toISOString().replace(/[:.]/g,'-'),backupDir=path.join(dir,'backup-'+stamp)
 fs.mkdirSync(backupDir,{recursive:true})
 const target=path.join(backupDir,'shop.db')
 db.exec('PRAGMA wal_checkpoint(FULL)')
 db.exec("VACUUM INTO '"+target.replace(/'/g,"''")+"'")
 const rows=db.prepare('SELECT id,product_id,variant_id,file_path FROM product_images ORDER BY id').all() as Array<{id:number;product_id:number;variant_id:number|null;file_path:string}>
 const imagesDir=path.join(backupDir,'images')
 let copied=0,missing=0,failed=0
 const manifest=rows.map(r=>{
  const exists=fs.existsSync(r.file_path)
  let backupPath:string|undefined,error:string|undefined
  if(!exists) missing++
  else if(mode==='full'){
   try{
    const ext=path.extname(r.file_path).toLowerCase(),productDir=path.join(imagesDir,String(r.product_id),String(r.variant_id??'product'))
    fs.mkdirSync(productDir,{recursive:true})
    const name=String(r.id).padStart(8,'0')+ext
    const dest=path.join(productDir,name)
    fs.copyFileSync(r.file_path,dest);copied++;backupPath=path.relative(backupDir,dest)
   }catch(e){failed++;error=e instanceof Error?e.message:'copy failed'}
  }
  return {...r,exists,backup_path:backupPath,error}
 })
 fs.writeFileSync(path.join(backupDir,'images-manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),mode,images:manifest},null,2),'utf8')
 if(mode==='full'&&failed>0) throw new Error('Backup ảnh chưa hoàn chỉnh: '+failed+' file copy thất bại')
 return {file:path.basename(target),path:target,directory:backupDir,manifest:'images-manifest.json',mode,imageCount:rows.length,copiedImageCount:copied,missingImageCount:missing,failedImageCount:failed,createdAt:new Date().toISOString()}
}
