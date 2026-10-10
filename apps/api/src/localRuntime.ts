import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'

export const ACTIVE_MARKER='.mecacao-local-active.json'
export const RUNTIME_LOCK='.mecacao-local-runtime.lock'
export const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex')
export const inside=(base:string,p:string)=>{const r=path.relative(base,p);return r===''||(!path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep))}
export function physical(p:string,directory=false){if(!path.isAbsolute(p)||path.resolve(p)!==p||fs.realpathSync(p)!==p||fs.lstatSync(p).isSymbolicLink()||!(directory?fs.statSync(p).isDirectory():fs.statSync(p).isFile()))throw Error('Đường dẫn LOCAL không phải file/folder vật lý an toàn: '+p);return p}
export type LocalConfig={format:1;mode:'LOCAL_V2_BUSINESS';dataRoot:string;warehouse:string;incoming:string;database:string;sourceV1Database:string;sourceBackup:string;baselineHash:string;imageHashes:Array<{id:number;relative:string;sha256:string}>;activatedAt:string}
export function readLocalConfig(file:string,requireActive=true){
  const bytes=fs.readFileSync(physical(path.resolve(file))),config=JSON.parse(bytes.toString()) as LocalConfig
  if(config.format!==1||config.mode!=='LOCAL_V2_BUSINESS'||file!==path.join(config.dataRoot,'local-v2-config.json')||config.database!==path.join(config.dataRoot,'database','shop-business.db'))throw Error('Cấu hình LOCAL không hợp lệ')
  physical(config.dataRoot,true);physical(config.warehouse,true);physical(config.incoming,true);physical(config.database)
  if(config.warehouse===path.parse(config.warehouse).root||inside(config.warehouse,config.dataRoot)||inside(config.dataRoot,config.warehouse)||inside(config.warehouse,config.incoming)||inside(config.incoming,config.warehouse))throw Error('Kho/nguồn nhập/DB LOCAL phải tách riêng, không chọn cả ổ đĩa')
  const db=new DatabaseSync(config.database,{readOnly:true})
  try{if(db.prepare("SELECT value FROM app_metadata WHERE key='schema_version'").get()?.value!=='130'||db.prepare("SELECT value FROM app_metadata WHERE key='warehouse_layout'").get()?.value!=='DIRECT'||db.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('DB LOCAL chưa chuẩn bị đúng schema130/DIRECT')}finally{db.close()}
  if(requireActive){const marker=JSON.parse(fs.readFileSync(physical(path.join(config.warehouse,ACTIVE_MARKER)),'utf8'));if(marker.format!==1||marker.configPath!==file||marker.configSha!==sha(bytes)||marker.database!==config.database||marker.warehouse!==config.warehouse)throw Error('Kho chưa được kích hoạt hoặc marker không khớp cấu hình')}
  if(fs.existsSync(path.join(config.dataRoot,'rollback-completed.json')))throw Error('Gói đã quay lui; không dùng lại cấu hình LOCAL cũ')
  return {...config,configPath:file,configSha:sha(bytes),review:false}
}
function restoreReview(file:string){
  const ready=JSON.parse(fs.readFileSync(physical(file),'utf8')),dataRoot=path.dirname(file),warehouse=path.join(dataRoot,'warehouse'),database=path.join(dataRoot,'database','shop-restored.db')
  if(ready.status!=='READY'||ready.schema!==130||ready.backupVersion!==4||ready.database!==database||ready.warehouse!==warehouse)throw Error('Kho restore LOCAL chưa READY')
  physical(warehouse,true);physical(database)
  const db=new DatabaseSync(database,{readOnly:true});try{if(db.prepare("SELECT value FROM app_metadata WHERE key='schema_version'").get()?.value!=='130'||db.prepare("SELECT value FROM app_metadata WHERE key='warehouse_layout'").get()?.value!=='DIRECT'||db.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('DB restore LOCAL không hợp lệ')}finally{db.close()}
  const incoming=path.join(dataRoot,'incoming');if(!fs.existsSync(incoming))fs.mkdirSync(incoming);physical(incoming,true)
  return {format:1 as const,mode:'LOCAL_V2_BUSINESS' as const,dataRoot,warehouse,incoming,database,sourceV1Database:'',sourceBackup:'',baselineHash:'',imageHashes:[],activatedAt:'',configPath:file,configSha:sha(fs.readFileSync(file)),review:true}
}
if(process.env.SHOP_LOCAL_V2_CONFIG&&process.env.SHOP_LOCAL_V2_RESTORE_READY)throw Error('Không bật đồng thời LOCAL và kho restore thử')
export const localRuntime=process.env.SHOP_LOCAL_V2_CONFIG?readLocalConfig(path.resolve(process.env.SHOP_LOCAL_V2_CONFIG)):process.env.SHOP_LOCAL_V2_RESTORE_READY?restoreReview(path.resolve(process.env.SHOP_LOCAL_V2_RESTORE_READY)):null
if(localRuntime){process.env.SHOP_SANDBOX_ROOT=localRuntime.warehouse;process.env.SHOP_DB_PATH=localRuntime.database;process.env.SHOP_ENABLE_V2_DRAFTS='1';process.env.SHOP_ENABLE_V2_SALES='1';process.env.SHOP_HOST='127.0.0.1'}

export function claimRuntime(config:NonNullable<typeof localRuntime>){
  const lock=path.join(config.warehouse,RUNTIME_LOCK),payload=JSON.stringify({format:1,pid:process.pid,database:config.database,configSha:config.configSha})
  if(fs.existsSync(lock)){
    const previous=JSON.parse(fs.readFileSync(physical(lock),'utf8'))
    if(previous.format!==1||!Number.isSafeInteger(previous.pid)||previous.pid<=0||previous.database!==config.database||previous.configSha!==config.configSha)throw Error('Khóa LOCAL không rõ; giữ nguyên để kiểm tra')
    try{process.kill(previous.pid,0);throw Error('LOCAL V2 đã có tiến trình chạy. Không mở hai server cùng kho.')}catch(e){if((e as NodeJS.ErrnoException).code!=='ESRCH')throw e}
    fs.unlinkSync(lock) // Only a verified lock belonging to an absent process is removed.
  }
  const fd=fs.openSync(lock,'wx',0o600);try{fs.writeFileSync(fd,payload);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
  process.once('exit',()=>{try{if(fs.readFileSync(lock,'utf8')===payload)fs.unlinkSync(lock)}catch{}})
  process.once('SIGINT',()=>process.exit(0));process.once('SIGTERM',()=>process.exit(0))
  if(process.send)process.on('message',message=>{if(message==='SHOP_LOCAL_CLOSE')process.exit(0)})
}
export function legacyWarehouseActive(db:DatabaseSync){
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='product_images'").get())return false
  const roots=new Set(db.prepare('SELECT file_path FROM product_images').all().map(row=>path.dirname(path.dirname(path.dirname(String(row.file_path))))))
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='app_settings'").get()){
    const watch=db.prepare("SELECT value FROM app_settings WHERE key='warehouse-watch'").get()
    if(watch){const root=JSON.parse(String(watch.value)).rootPath;if(typeof root==='string'&&path.isAbsolute(root))roots.add(root)}
  }
  return [...roots].some(root=>fs.existsSync(path.join(root,ACTIVE_MARKER)))
}
