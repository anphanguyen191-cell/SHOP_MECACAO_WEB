import fs from 'node:fs'
import path from 'node:path'
import { db, dbPath } from './db.js'

export function createBackup() {
  const root=path.dirname(dbPath)
  const dir=path.join(root,'backups')
  fs.mkdirSync(dir,{recursive:true})
  const stamp=new Date().toISOString().replace(/[:.]/g,'-')
  const target=path.join(dir,'shop-'+stamp+'.db')
  db.exec('PRAGMA wal_checkpoint(FULL)')
  db.exec("VACUUM INTO '"+target.replace(/'/g,"''")+"'")
  return {file:path.basename(target),path:target,createdAt:new Date().toISOString()}
}
