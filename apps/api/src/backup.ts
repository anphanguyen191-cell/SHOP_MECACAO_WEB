import fs from 'node:fs'
import path from 'node:path'
import { db, dbPath } from './db.js'

export function createBackup() {
 const root=path.dirname(dbPath),dir=path.join(root,'backups')
 fs.mkdirSync(dir,{recursive:true})
 const stamp=new Date().toISOString().replace(/[:.]/g,'-')
 const backupDir=path.join(dir,'backup-'+stamp)
 fs.mkdirSync(backupDir,{recursive:true})
 const target=path.join(backupDir,'shop.db')
 db.exec('PRAGMA wal_checkpoint(FULL)')
 db.exec("VACUUM INTO '"+target.replace(/'/g,"''")+"'")
 const rows=db.prepare('SELECT id,product_id,variant_id,file_path FROM product_images ORDER BY id').all() as Array<{id:number;product_id:number;variant_id:number|null;file_path:string}>
 const manifest=rows.map(r=>({...r,exists:fs.existsSync(r.file_path)}))
 fs.writeFileSync(path.join(backupDir,'images-manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),images:manifest},null,2),'utf8')
 return {file:path.basename(target),path:target,directory:backupDir,manifest:'images-manifest.json',imageCount:rows.length,missingImageCount:manifest.filter(x=>!x.exists).length,createdAt:new Date().toISOString()}
}
