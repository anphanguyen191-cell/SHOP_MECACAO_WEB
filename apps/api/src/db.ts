import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { bootstrapV100,readSchemaVersion } from './schema.js'
import {bootstrapSalesExecution} from './salesExecution.js'
import {bootstrapSalesDrafts} from './salesSchema.js'

export const salesExecutionEnabled=process.env.SHOP_ENABLE_V2_SALES==='1'
export const salesDraftsEnabled=process.env.SHOP_ENABLE_V2_DRAFTS==='1'
if(salesExecutionEnabled&&(!salesDraftsEnabled||!process.env.SHOP_SANDBOX_ROOT||!process.env.SHOP_DB_PATH))throw Error('Bán V2 chỉ bật riêng trong sandbox')
if(salesDraftsEnabled&&!process.env.SHOP_SANDBOX_ROOT)throw new Error('V2 đơn nháp chỉ bật trong sandbox riêng; không được mở database thật')

const here=path.dirname(fileURLToPath(import.meta.url))
const projectRoot=path.resolve(here,'../../..')
const dataDir=path.join(projectRoot,'data')
fs.mkdirSync(dataDir,{recursive:true})
const dbPath=process.env.SHOP_DB_PATH?path.resolve(process.env.SHOP_DB_PATH):path.join(dataDir,'shop.db')
fs.mkdirSync(path.dirname(dbPath),{recursive:true})
if(process.env.SHOP_SANDBOX_ROOT){
 const root=fs.realpathSync(path.resolve(process.env.SHOP_SANDBOX_ROOT))
 const parent=fs.realpathSync(path.dirname(dbPath))
 const rel=path.relative(root,parent)
 if(path.isAbsolute(rel)||rel==='..'||rel.startsWith('..'+path.sep))throw new Error('Sandbox database phải nằm trong vùng thử riêng')
}

if(process.env.SHOP_SANDBOX_ROOT&&fs.existsSync(dbPath)&&(fs.realpathSync(dbPath)!==dbPath||!fs.lstatSync(dbPath).isFile()))throw Error('Sandbox DB không được là symlink hoặc file ngoài vùng thử')
export const db=new DatabaseSync(dbPath)
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;')
try{
 if(salesExecutionEnabled){if(readSchemaVersion(db)!==130)bootstrapSalesDrafts(db);bootstrapSalesExecution(db,process.env.SHOP_SANDBOX_ROOT!)}else if(salesDraftsEnabled)bootstrapSalesDrafts(db);else bootstrapV100(db)
 db.prepare("INSERT INTO app_metadata(key,value,updated_at) VALUES('app_version',?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=datetime('now')").run(salesExecutionEnabled?'2.0.0-sales-sandbox':salesDraftsEnabled?'2.0.0-draft-sandbox':'1.0.0-dev')
 db.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES('low_stock_threshold','2',datetime('now')) ON CONFLICT(key) DO NOTHING").run()
}catch(error){
 try{db.close()}catch{}
 throw error
}
export {dbPath}
