import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { bootstrapV100 } from './schema.js'

const here=path.dirname(fileURLToPath(import.meta.url))
const projectRoot=path.resolve(here,'../../..')
const dataDir=path.join(projectRoot,'data')
fs.mkdirSync(dataDir,{recursive:true})
const dbPath=process.env.SHOP_DB_PATH?path.resolve(process.env.SHOP_DB_PATH):path.join(dataDir,'shop.db')
fs.mkdirSync(path.dirname(dbPath),{recursive:true})

export const db=new DatabaseSync(dbPath)
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;')
try{
 bootstrapV100(db)
 db.prepare("INSERT INTO app_metadata(key,value,updated_at) VALUES('app_version','1.0.0-dev',datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=datetime('now')").run()
 db.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES('low_stock_threshold','2',datetime('now')) ON CONFLICT(key) DO NOTHING").run()
}catch(error){
 try{db.close()}catch{}
 throw error
}
export {dbPath}
