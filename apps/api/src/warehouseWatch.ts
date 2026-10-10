import {salesActivity,SALES_AREA} from './salesExecution.js'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {db} from './db.js'
import {scanStore} from './storeScanner.js'

export type WatchSettings={rootPath:string;startup:boolean;periodic:boolean;intervalSeconds:number;popup:boolean;autoRename:boolean}
export type WarehouseNotice={id:string;kind:'changes'|'error';message:string;createdAt:string;state:'unseen'|'seen'|'resolved';rootPath:string}
export function readSetting<T>(key:string,fallback:T):T{
 const row=db.prepare('SELECT value FROM app_settings WHERE key=?').get(key) as {value:string}|undefined
 if(!row)return fallback
 try{return JSON.parse(row.value)}catch{throw Error('Cấu hình kho bị lỗi: '+key)}
}
export function writeSetting(key:string,value:unknown){db.prepare("INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=datetime('now')").run(key,JSON.stringify(value))}
const defaults:WatchSettings={rootPath:'',startup:false,periodic:false,intervalSeconds:300,popup:false,autoRename:false}
export function getWatchSettings(){return {...defaults,...readSetting<Partial<WatchSettings>>('warehouse-watch',{})}}
export function validateWarehouseRoot(value:string){
 if(!value?.trim())throw Error('Chọn kho gốc trước khi lưu cấu hình')
 const root=fs.realpathSync(path.resolve(value.trim()))
 if(!fs.statSync(root).isDirectory())throw Error('Kho gốc không phải thư mục')
 const sandbox=process.env.SHOP_SANDBOX_ROOT
 if(sandbox){const base=fs.realpathSync(sandbox),rel=path.relative(base,root);if(path.isAbsolute(rel)||rel==='..'||rel.startsWith('..'+path.sep))throw Error('Kho phải nằm trong sandbox thử nghiệm')}
 return root
}
export function saveWatchSettings(input:WatchSettings){
 const rootPath=validateWarehouseRoot(input.rootPath)
 const intervalSeconds=Number(input.intervalSeconds)
 if(!Number.isInteger(intervalSeconds)||intervalSeconds<60||intervalSeconds>86400)throw Error('Chu kỳ quét phải từ 60 đến 86400 giây')
 for(const key of ['startup','periodic','popup','autoRename'] as const)if(typeof input[key]!=='boolean')throw Error('Cấu hình bật/tắt không hợp lệ')
 const config={rootPath,intervalSeconds,startup:input.startup,periodic:input.periodic,popup:input.popup,autoRename:input.autoRename}
 writeSetting('warehouse-watch',config);return config
}
function inside(root:string,file:string){const rel=path.relative(root,file);return !!rel&&!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep)}
export function warehouseSnapshot(inputRoot:string){
 const rootPath=validateWarehouseRoot(inputRoot),products=scanStore(rootPath)
 const registered=db.prepare('SELECT id,file_path FROM product_images').all() as {id:number;file_path:string}[]
 const registeredPaths=new Set(registered.map(r=>path.resolve(r.file_path)))
 const files=products.flatMap(p=>p.sizes.flatMap(s=>s.images))
 const sold=new Set(db.prepare("SELECT 1 FROM sqlite_master WHERE name='sales_units'").get()?db.prepare('SELECT image_id FROM sales_units').all().map(r=>Number(r.image_id)):[])
 const missing=registered.filter(r=>!sold.has(r.id)&&inside(rootPath,path.resolve(r.file_path))&&!fs.existsSync(r.file_path))
 const rows=products.map(p=>({...p,sizes:p.sizes.map(s=>({...s,registeredImages:s.images.filter(f=>registeredPaths.has(f)),pendingImages:s.images.filter(f=>!registeredPaths.has(f))}))}))
 const sizes=rows.flatMap(p=>p.sizes)
 return {mode:'PREVIEW_ONLY',rootPath,productCount:rows.length,products:rows,missing,
  summary:{products:rows.length,sizes:sizes.length,images:files.length,registeredImages:files.filter(f=>registeredPaths.has(f)).length,pendingImages:files.filter(f=>!registeredPaths.has(f)).length,missingImages:missing.length,registeredProducts:rows.filter(p=>p.existingProductId).length,newProducts:rows.filter(p=>!p.existingProductId).length,registeredSizes:sizes.filter(s=>s.existingVariantId).length,newSizes:sizes.filter(s=>!s.existingVariantId).length},scannedAt:new Date().toISOString()}
}
export function getWarehouseNotices(){return readSetting<WarehouseNotice[]>('warehouse-notices',[])}
function recordNotice(kind:WarehouseNotice['kind'],rootPath:string,message:string,signature:string){
 const id=createHash('sha256').update(rootPath+'\n'+kind+'\n'+signature).digest('hex')
 const notices=getWarehouseNotices()
 // Resolve superseded alerts for this root, even when the next scan is clean.
 for(const n of notices)if(n.rootPath===rootPath&&n.id!==id)n.state='resolved'
 if(!notices.some(n=>n.id===id))notices.unshift({id,kind,rootPath,message,createdAt:new Date().toISOString(),state:'unseen'})
 writeSetting('warehouse-notices',notices.slice(0,100));return notices
}
export function markWarehouseNotice(id:string,state:'seen'|'resolved'){
 if(state!=='seen'&&state!=='resolved')throw Error('Trạng thái thông báo không hợp lệ')
 const notices=getWarehouseNotices(),n=notices.find(n=>n.id===id);if(!n)throw Error('Không tìm thấy thông báo')
 n.state=state;writeSetting('warehouse-notices',notices);return notices
}
export function checkWarehouse(rootPath=getWatchSettings().rootPath){
 try{
  const snapshot=warehouseSnapshot(rootPath),s=snapshot.summary
  const signature=JSON.stringify({pending:snapshot.products.flatMap(p=>p.sizes.flatMap(s=>s.pendingImages)).sort(),missing:snapshot.missing.map(r=>r.id).sort()})
  if(s.pendingImages||s.missingImages)recordNotice('changes',snapshot.rootPath,`${s.newProducts} mẫu mới · ${s.newSizes} Size mới · ${s.pendingImages} ảnh chờ duyệt · ${s.missingImages} ảnh đã đăng ký bị thiếu`,signature)
  else{const notices=getWarehouseNotices();for(const n of notices)if(n.rootPath===snapshot.rootPath)n.state='resolved';writeSetting('warehouse-notices',notices)}
  writeSetting('warehouse-last-scan',{at:snapshot.scannedAt,rootPath:snapshot.rootPath,summary:s});return snapshot
 }catch(e){const message=e instanceof Error?e.message:'Không đọc được kho';recordNotice('error',rootPath,message,message);throw e}
}
export function startWarehouseWatcher(){
 let last=Date.now()
 const run=()=>{if(salesActivity.busy||salesActivity.readers||(process.env.SHOP_SANDBOX_ROOT&&fs.existsSync(path.join(process.env.SHOP_SANDBOX_ROOT,SALES_AREA+'-pending.json'))))return;const c=getWatchSettings();if(c.rootPath)try{checkWarehouse(c.rootPath)}catch(e){console.error('Warehouse scan:',e instanceof Error?e.message:e)}}
 if(getWatchSettings().startup)setTimeout(run,0).unref()
 const timer=setInterval(()=>{const c=getWatchSettings();if(c.periodic&&Date.now()-last>=c.intervalSeconds*1000){last=Date.now();run()}},10000)
 timer.unref();return timer
}
