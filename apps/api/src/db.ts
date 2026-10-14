import {freshDevelopment,freshWarehouse,freshRoot,customWarehouse,release,v8Home} from './freshDevelopment.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { bootstrapV100,readSchemaVersion } from './schema.js'
import {bootstrapSalesExecution} from './salesExecution.js'
import {bootstrapSalesDrafts} from './salesSchema.js'
import {bootstrapPriceBulk} from './priceBulk.js'
import {localRuntime,claimRuntime,legacyWarehouseActive} from './localRuntime.js'

export const salesExecutionEnabled=process.env.SHOP_ENABLE_V2_SALES==='1'
export const salesDraftsEnabled=process.env.SHOP_ENABLE_V2_DRAFTS==='1'
if(salesExecutionEnabled&&(!salesDraftsEnabled||!process.env.SHOP_SANDBOX_ROOT||!process.env.SHOP_DB_PATH))throw Error('Bán V2 chỉ bật riêng trong sandbox')
if(salesDraftsEnabled&&!process.env.SHOP_SANDBOX_ROOT)throw new Error('V2 đơn nháp chỉ bật trong sandbox riêng; không được mở database thật')

const here=path.dirname(fileURLToPath(import.meta.url))
const projectRoot=path.resolve(here,'../../..')
const dataDir=v8Home?path.join(v8Home,'data','shop-v8'):path.join(projectRoot,'data')
fs.mkdirSync(dataDir,{recursive:true})
const dbPath=process.env.SHOP_DB_PATH?path.resolve(process.env.SHOP_DB_PATH):path.join(dataDir,'shop.db')
fs.mkdirSync(path.dirname(dbPath),{recursive:true})
// A missing database after first successful V8 bootstrap is a failure, not a new shop.
const v8Guard=v8Home?path.join(path.dirname(dbPath),'.initialized.json'):null
if(v8Guard&&fs.existsSync(v8Guard)&&!fs.existsSync(dbPath))throw Error('Database V8 không còn hiện hữu. Đã chặn tạo database rỗng thay thế.')
if(process.env.SHOP_SANDBOX_ROOT&&!localRuntime&&!freshDevelopment){
 const root=fs.realpathSync(path.resolve(process.env.SHOP_SANDBOX_ROOT))
 const parent=fs.realpathSync(path.dirname(dbPath))
 const rel=path.relative(root,parent)
 if(path.isAbsolute(rel)||rel==='..'||rel.startsWith('..'+path.sep))throw new Error('Sandbox database phải nằm trong vùng thử riêng')
}

if(process.env.SHOP_SANDBOX_ROOT&&fs.existsSync(dbPath)&&(fs.realpathSync(dbPath)!==dbPath||!fs.lstatSync(dbPath).isFile()))throw Error('Sandbox DB không được là symlink hoặc file ngoài vùng thử')
if(fs.existsSync(dbPath)&&!localRuntime&&!v8Home){const precheck=new DatabaseSync(dbPath,{readOnly:true});try{if(legacyWarehouseActive(precheck))throw Error('Kho đã kích hoạt LOCAL V2. Không mở V1/sandbox trên cùng kho. Dùng START_SHOP_V2_LOCAL.bat.')}finally{precheck.close()}}
if((localRuntime||freshDevelopment)&&!(process.env.SHOP_TASK_WORKER==='1'&&process.send))claimRuntime(localRuntime??{format:1,mode:'LOCAL_V2_BUSINESS',dataRoot:freshRoot,warehouse:customWarehouse?freshWarehouse:freshRoot,incoming:'',database:dbPath,sourceV1Database:'',sourceBackup:'',baselineHash:'',imageHashes:[],activatedAt:'',configPath:'',configSha:'stage4-fresh',review:true})
export const db=new DatabaseSync(dbPath)
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;')
try{
 if(localRuntime){if(readSchemaVersion(db)!==130)throw Error('LOCAL không tự migration DB')}else if(salesExecutionEnabled){if(readSchemaVersion(db)!==130)bootstrapSalesDrafts(db);bootstrapSalesExecution(db,freshDevelopment?freshRoot:process.env.SHOP_SANDBOX_ROOT!)}else if(salesDraftsEnabled)bootstrapSalesDrafts(db);else bootstrapV100(db)
 bootstrapPriceBulk(db)
 if(freshDevelopment){
  if(customWarehouse){
   db.prepare("INSERT INTO app_metadata(key,value,updated_at) VALUES('warehouse_layout','DIRECT',datetime('now')) ON CONFLICT(key) DO UPDATE SET value='DIRECT'").run()
   const saved=db.prepare("SELECT value FROM app_settings WHERE key='warehouse-watch'").get()
   if(saved){const c=JSON.parse(String(saved.value));if(c.rootPath!==freshWarehouse)db.prepare("UPDATE app_settings SET value=? WHERE key='warehouse-watch'").run(JSON.stringify({...c,rootPath:freshWarehouse}))}
  }
  db.prepare("INSERT INTO app_settings(key,value) VALUES('warehouse-watch',?) ON CONFLICT(key) DO NOTHING").run(JSON.stringify({rootPath:v8Home&&!customWarehouse?'':freshWarehouse,startup:false,periodic:false,intervalSeconds:300,autoRename:false,popup:true}))
 }
 db.prepare("INSERT INTO app_metadata(key,value,updated_at) VALUES('app_version',?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=datetime('now')").run(freshDevelopment?release.version:localRuntime?'2.0.0-local':salesExecutionEnabled?'2.0.0-sales-sandbox':salesDraftsEnabled?'2.0.0-draft-sandbox':'1.0.0-dev')
 db.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES('low_stock_threshold','2',datetime('now')) ON CONFLICT(key) DO NOTHING").run()
 if(v8Guard&&!fs.existsSync(v8Guard)){
  const marker={format:8,database:dbPath,schema:130,createdAt:new Date().toISOString()}
  fs.writeFileSync(v8Guard,JSON.stringify(marker,null,2),{flag:'wx'})
 }
}catch(error){
 try{db.close()}catch{}
 throw error
}
export {dbPath}
