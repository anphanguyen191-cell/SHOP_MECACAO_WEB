import {configureLan} from './lanRuntime.js'
import {installLanGuard,listenLan} from './lanServer.js'
import {freshDevelopment,freshWarehouse,freshRoot,customWarehouse,warehouseConfig,validateNewWarehouse,release} from './freshDevelopment.js'
import {taskManager} from './tasks.js'
import {taskActivity} from './taskActivity.js'
import {salesActivity,SALES_AREA} from './salesExecution.js'
import {localRuntime,inside,legacyWarehouseActive} from './localRuntime.js'
import {isInternalWarehousePath} from './warehouseAreas.js'
import {restoreTestRouter} from './restoreRoutes.js'
import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import {randomUUID} from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { db,dbPath,salesDraftsEnabled,salesExecutionEnabled } from './db.js'
import {readSchemaVersion} from './schema.js'
import {salesDraftRouter} from './salesRoutes.js'
import { createProduct, getProduct, listProducts, suggestProductCode, suggestSku, listCategories, setProductStatus, updateVariantPricing } from './products.js'
import { addInventory, batchImport, history } from './inventory.js'
import { scanStore } from './storeScanner.js'
import { commitStoreImport } from './storeImport.js'
import { createBackup, createOptimizedImageBackup, createLosslessBackup } from './backup.js'
import { getLowStockThreshold, updateLowStockThreshold } from './settings.js'
import { inventoryRows, inventoryHistory, inventoryFilterOptions, inventoryExplorer, inventoryDashboard, inventorySuggestions, catalogDashboard } from './inventoryQuery.js'
import { getImageRecord, imageMime } from './images.js'
import { receiveGoods, goodsReceiptDashboard, inspectImageFolder } from './goodsReceipt.js'
import { dashboardSummary } from './dashboard.js'
import { recoverPendingGoodsReceipts } from './receiptRecovery.js'
import {checkWarehouse,getWatchSettings,saveWatchSettings,getWarehouseNotices,markWarehouseNotice,startWarehouseWatcher} from './warehouseWatch.js'
import {previewImageRename,commitImageRename,recoverImageRenames,getRenameLogs} from './imageRename.js'
import {clipboardCapabilities,selectedStockImages,sharedJpeg,copyStockImages} from './inventoryShare.js'

// Fail closed before accepting writes if an interrupted goods receipt is unresolved.
const tasks=taskManager(dbPath)
const receiptRecovery=recoverPendingGoodsReceipts()
recoverImageRenames()
if(receiptRecovery.journals)console.log('Receipt recovery:',JSON.stringify(receiptRecovery))

const app = express()
const lan=configureLan()
const PORT = Number(process.env.PORT ?? 3000)
const sandboxRoot=process.env.SHOP_SANDBOX_ROOT?fs.realpathSync(path.resolve(process.env.SHOP_SANDBOX_ROOT)):null
function sandboxPathAllowed(value:unknown){
 if(!sandboxRoot)return true
 if(typeof value!=='string'||!value.trim())return false
 try{
  const real=fs.realpathSync(path.resolve(value))
  if(isInternalWarehousePath(real))return false
  const rel=path.relative(sandboxRoot,real)
  return rel===''||(!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep))
 }catch{return false}
}
app.use(express.json({ limit: '2mb' }))
installLanGuard(app,lan)
app.use('/api',(req,res,next)=>{
 if(localRuntime||freshDevelopment){
  if(res.locals.lanUser)return next()
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||''))return res.status(403).json({error:'LOCAL chỉ truy cập trên máy Windows này'})
  if(req.method!=='GET'&&req.method!=='HEAD'){let same=false;try{const u=new URL(req.get('origin')||'');same=u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&Number(u.port||80)===PORT}catch{}if(!same)return res.status(403).json({error:'Thao tác LOCAL phải từ giao diện cùng máy/cùng cổng'})}
 }else if(req.path!=='/health'&&legacyWarehouseActive(db))return res.status(409).json({error:'Kho đã chuyển LOCAL V2; dừng V1 và mở START_SHOP_V2_LOCAL.bat.'})
 next()
})
// Tasks run in a separate process; fence stock reads/mutations during any task.
app.use('/api',(req,res,next)=>{
 if(req.path==='/health'||req.path.startsWith('/tasks')||req.path==='/store/import-batch-task'||(req.get('Prefer')==='respond-async'&&['/store/scan','/goods-receipt','/backup/lossless'].includes(req.path)))return next()
 if((taskActivity.busy&&!(taskActivity.readOnly&&['GET','HEAD'].includes(req.method)))||(tasks.pendingReview()&&!['GET','HEAD'].includes(req.method)))return res.status(409).json({error:'Có tác vụ đang chạy hoặc cần đối soát. Mở Tiến độ tác vụ để kiểm tra.',code:'TASK_BUSY_OR_REVIEW'})
 next()
})
// Coordinate all HTTP reads/writes while async sale preparation/staging runs.
app.use('/api',(req,res,next)=>{
 if(!salesExecutionEnabled||!sandboxRoot||req.path==='/health'||req.path.startsWith('/tasks')||req.path==='/sales/drafts/recover'||/^\/sales\/drafts\/operations\//.test(req.path)||/\/confirm$/.test(req.path))return next()
 if(salesActivity.busy||fs.existsSync(path.join(sandboxRoot,SALES_AREA+'-pending.json'))||db.prepare("SELECT 1 FROM sales_operations WHERE status='PREPARED'").get())return res.status(409).json({error:'Giao dịch bán đang xử lý hoặc cần phục hồi. Vào Bán hàng kiểm tra trạng thái.',code:'SALE_RECOVERY_REQUIRED'})
 salesActivity.readers++;let done=false;const release=()=>{if(!done){done=true;salesActivity.readers--}};res.once('finish',release);res.once('close',release);next()
})
// Test mode enforces isolation at the API, not merely via a yellow UI banner.
app.use('/api',(req,res,next)=>{
 if(!sandboxRoot)return next()
 if(freshDevelopment){
  const target=(v:unknown)=>typeof v==='string'&&path.resolve(v)===freshWarehouse&&sandboxPathAllowed(v)
  const source=(v:unknown)=>{try{if(typeof v!=='string')return false;const real=fs.realpathSync(path.resolve(v));return real===path.resolve(v)&&!isInternalWarehousePath(real)}catch{return false}}
  let ok=true
  if(req.path==='/store/scan'||req.path.startsWith('/warehouse/rename/')||(req.path==='/warehouse/settings'&&req.method==='PUT'))ok=target(req.body.rootPath)
  if(req.path==='/warehouse/file')ok=target(req.query.rootPath)&&sandboxPathAllowed(req.query.path)
  if(req.path==='/store/import')ok=target(req.body.product?.rootPath)&&(req.body.product?.variants??[]).every((v:any)=>(v.images??[]).every(sandboxPathAllowed))
  if(req.path==='/store/import-batch-task')ok=Array.isArray(req.body.products)&&req.body.products.every((p:any)=>target(p.rootPath)&&(p.variants??[]).every((v:any)=>(v.images??[]).every(sandboxPathAllowed)))
  if(req.path==='/goods-receipt/inspect')ok=source(req.body.path)
  if(req.path==='/goods-receipt')ok=target(req.body.storeRoot)&&(req.body.sizes??[]).every((v:any)=>(!v.sourcePath||source(v.sourcePath))&&(v.images??[]).every(source))
  if(!ok)return res.status(403).json({error:'Kho đích phải là kho của bản cài này. Chọn kho trên thanh phiên bản trước khi nhập dữ liệu.'})
  return next()
 }
 if(localRuntime){
  const context=localRuntime
  const target=(v:unknown)=>typeof v==='string'&&path.resolve(v)===context.warehouse&&sandboxPathAllowed(v)
  const source=(v:unknown)=>{try{return typeof v==='string'&&inside(context.incoming,fs.realpathSync(path.resolve(v)))&&fs.realpathSync(path.resolve(v))===path.resolve(v)}catch{return false}}
  let ok=true
  if(req.path==='/fs/list')ok=sandboxPathAllowed(req.query.path)||source(req.query.path)
  if(req.path==='/store/scan'||req.path==='/warehouse/rename/preview'||req.path==='/warehouse/rename/commit'||(req.path==='/warehouse/settings'&&req.method==='PUT'))ok=target(req.body.rootPath)
  if(req.path==='/warehouse/file')ok=target(req.query.rootPath)&&sandboxPathAllowed(req.query.path)
  if(req.path==='/store/import-batch-task')ok=Array.isArray(req.body.products)&&req.body.products.every((p:any)=>target(p.rootPath)&&(p.variants??[]).every((v:any)=>(v.images??[]).every(sandboxPathAllowed)))
  if(req.path==='/store/import')ok=target(req.body.product?.rootPath)&&(req.body.product?.variants??[]).every((v:any)=>(v.images??[]).every(sandboxPathAllowed))
  if(req.path==='/goods-receipt/inspect')ok=source(req.body.path)
  if(req.path==='/goods-receipt')ok=target(req.body.storeRoot)&&(req.body.sizes??[]).every((v:any)=>(!v.sourcePath||source(v.sourcePath))&&(v.images??[]).every(source))
  if(!ok)return res.status(403).json({error:'LOCAL: kho đích phải là kho đã kích hoạt; ảnh nhập chỉ đọc từ thư mục nguồn đã cấu hình.'})
  return next()
 }
 const paths:unknown[]=[]
 if(req.path==='/fs/list')paths.push(req.query.path)
 if(req.path==='/store/scan')paths.push(req.body.rootPath)
 if(req.path==='/warehouse/file')paths.push(req.query.rootPath,req.query.path)
 if((req.path==='/warehouse/settings'&&req.method==='PUT')||req.path==='/warehouse/rename/preview'||req.path==='/warehouse/rename/commit')paths.push(req.body.rootPath)
 if(req.path==='/store/import-batch-task')for(const p of req.body.products??[]){paths.push(p.rootPath);for(const v of p.variants??[])paths.push(...(v.images??[]))}
 if(req.path==='/store/import'){
  paths.push(req.body.product?.rootPath)
  for(const v of req.body.product?.variants??[])paths.push(...(v.images??[]))
 }
 if(req.path==='/goods-receipt/inspect')paths.push(req.body.path)
 if(req.path==='/goods-receipt'){
  paths.push(req.body.storeRoot)
  for(const v of req.body.sizes??[]){if(v.sourcePath)paths.push(v.sourcePath);paths.push(...(v.images??[]))}
 }
 if(paths.some(p=>!sandboxPathAllowed(p)))return res.status(403).json({error:'CHẾ ĐỘ THỬ WINDOWS: chỉ được dùng thư mục bên trong sandbox, không truy cập kho thật.'})
 next()
})


function taskOrigin(req:express.Request){let ok=false;try{const u=new URL(req.get('origin')||'');ok=u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&Number(u.port||80)===PORT}catch{}return ok&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||'')}
function asyncTask(req:express.Request,res:express.Response,kind:'SCAN'|'RECEIPT'|'BACKUP'|'REGISTER_BATCH',payload:unknown){
 if(!taskOrigin(req))return res.status(403).json({error:'Tác vụ chỉ tạo từ giao diện cùng máy/cùng cổng'})
 try{return res.status(202).json({task:tasks.start(kind,payload,req.get('Idempotency-Key')||'')})}catch(e){return res.status(409).json({error:e instanceof Error?e.message:String(e),notAccepted:!tasks.list().some(t=>t.key===req.get('Idempotency-Key'))})}
}
app.get('/api/tasks',(_req,res)=>res.json(tasks.list().slice(0,30)))
app.get('/api/tasks/:id',(req,res)=>{try{res.json(tasks.read(req.params.id))}catch(e){res.status(404).json({error:String(e)})}})
app.get('/api/tasks/:id/events',(req,res)=>{
 try{tasks.read(req.params.id)}catch(e){res.status(404).json({error:String(e)});return}
 res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-cache');res.setHeader('Connection','keep-alive');res.flushHeaders()
 const send=(t:any)=>res.write('data: '+JSON.stringify(t)+'\n\n');send(tasks.read(req.params.id))
 tasks.events.on(req.params.id,send);const timer=setInterval(()=>res.write(': keepalive\n\n'),15000)
 req.on('close',()=>{clearInterval(timer);tasks.events.off(req.params.id,send)})
})
app.post('/api/tasks/:id/acknowledge',(req,res)=>{if(!taskOrigin(req)||req.body.confirmed!==true)return res.status(403).json({error:'Cần xác nhận đã kiểm tra kho và nhật ký'})
 try{recoverPendingGoodsReceipts();recoverImageRenames();res.json(tasks.acknowledge(req.params.id))}catch(e){res.status(409).json({error:String(e)})}
})
app.post('/api/store/import-batch-task',(req,res)=>{if(req.body.confirmed!==true||!Array.isArray(req.body.products)||!req.body.products.length||req.body.products.length>500)return res.status(400).json({error:'Cần duyệt lô từ 1–500 Product'});return asyncTask(req,res,'REGISTER_BATCH',req.body)})

app.get('/api/health', (_req, res) => res.json({
  lanClient:!!res.locals.lanUser,lanRole:res.locals.lanUser?.role,
  ok: true, app: 'SHOP_MECACAO_WEB', freshDevelopment,customWarehouse,release: freshDevelopment?release:undefined,version: freshDevelopment?release.version:localRuntime?'2.0.0-local':salesExecutionEnabled?'2.0.0-sales-sandbox':salesDraftsEnabled?'2.0.0-draft-sandbox':'1.0.0-dev', schema: readSchemaVersion(db), database: path.basename(dbPath),sandbox:!!sandboxRoot&&(!localRuntime||localRuntime.review),localV2Business:!!localRuntime&&!localRuntime.review,localV2RestoreReview:!!localRuntime?.review,warehouse:freshDevelopment?freshWarehouse:localRuntime?.warehouse,incoming:localRuntime?.incoming,databasePath:localRuntime?.database,localV2Review:!!sandboxRoot&&salesExecutionEnabled&&process.env.SHOP_LOCAL_V2_REVIEW==='1',salesDrafts:salesDraftsEnabled,salesExecution:salesExecutionEnabled,saleRecoveryRequired:!!(salesExecutionEnabled&&sandboxRoot&&fs.existsSync(path.join(sandboxRoot,SALES_AREA+'-pending.json')))
}))
app.post('/api/local/warehouse',(req,res)=>{
 if(!freshDevelopment)return res.status(404).json({error:'Chọn kho áp dụng cho bản main mới'})
 try{
  if(customWarehouse||fs.existsSync(warehouseConfig))throw Error('Kho của bản cài này đã được chọn. Bản cài mới có thể chọn kho mới.')
  if(['products','sales_orders','shop_customers','inventory_transactions'].some(t=>db.prepare('SELECT 1 FROM '+t+' LIMIT 1').get()))throw Error('Chỉ chọn kho trước khi nhập dữ liệu. Giữ kho hiện tại hoặc giải nén bản main vào thư mục mới.')
  const warehouse=validateNewWarehouse(req.body.warehouse)
  const fd=fs.openSync(warehouseConfig,'wx',0o600)
  try{fs.writeFileSync(fd,JSON.stringify({format:1,warehouse}));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
  res.json({warehouse,restarting:true})
  res.once('finish',()=>setTimeout(()=>process.exit(75),250))
 }catch(e){res.status(409).json({error:e instanceof Error?e.message:String(e)})}
})
if(salesDraftsEnabled&&sandboxRoot)app.use('/api/sales/drafts',salesDraftRouter(db,sandboxRoot,PORT))
else app.use('/api/sales/drafts',(_req,res)=>res.status(404).json({error:'V2 đơn nháp chưa bật; chỉ thử bằng sandbox V2 riêng.'}))

if(sandboxRoot)app.use('/api/backup/restore-test',restoreTestRouter(sandboxRoot,PORT,localRuntime?.dataRoot??(freshDevelopment&&customWarehouse?freshRoot:undefined)))
else app.post('/api/backup/restore-test',(_req,res)=>res.status(403).json({error:'Restore thử chỉ bật trong sandbox, không thay database đang dùng.'}))

app.get('/api/inventory/share/capabilities',(_req,res)=>res.json(clipboardCapabilities()))
app.post('/api/inventory/share/prepare',(req,res)=>{
 try{const images=selectedStockImages(req.body.ids,p=>sandboxPathAllowed(p));res.json({images:images.map(i=>({id:i.id,name:i.file_name,product:i.product,size:i.size,url:'/api/inventory/share/image/'+i.id}))})}catch(e){res.status(400).json({error:e instanceof Error?e.message:'Không kiểm tra được ảnh'})}
})
app.get('/api/inventory/share/image/:id',async(req,res)=>{
 try{res.setHeader('Cache-Control','no-store');res.type('image/jpeg').send(await sharedJpeg(Number(req.params.id),p=>sandboxPathAllowed(p)))}catch(e){res.status(400).json({error:e instanceof Error?e.message:'Không đọc được ảnh'})}
})
app.post('/api/inventory/share/copy',async(req,res)=>{
 // Only the browser on this Windows machine may replace its clipboard.
 const remote=req.socket.remoteAddress,origin=req.get('origin')
 let sameOrigin=false;try{const u=new URL(origin||'');sameOrigin=u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&Number(u.port||80)===PORT}catch{}
 if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote||'')||!sameOrigin)return res.status(403).json({error:'Copy chỉ dùng từ trang Windows LOCAL trên cùng máy.'})
 try{return res.json(await copyStockImages(req.body.ids,p=>sandboxPathAllowed(p)))}catch(e){return res.status(400).json({error:e instanceof Error?e.message:'Copy thất bại'})}
})

app.get('/api/images/:id', (req,res) => {
  try {
    const image=getImageRecord(Number(req.params.id))
    if(!image) return res.status(404).json({error:'Không tìm thấy ảnh'})
    if(image.missing) return res.status(410).json({error:'File ảnh không còn trên ổ đĩa'})
    res.type(imageMime(image.file_path))
    res.setHeader('Cache-Control','private, max-age=300')
    return res.sendFile(image.file_path)
  } catch(e) { return res.status(400).json({error:e instanceof Error?e.message:'Không thể đọc ảnh'}) }
})

app.get('/api/fs/roots', (_req,res)=>{
 try{
  if(localRuntime)return res.json([localRuntime.warehouse,localRuntime.incoming])
  if(sandboxRoot&&!freshDevelopment)return res.json([sandboxRoot])
  if(process.platform==='win32'){const roots:string[]=[];for(let code=65;code<=90;code++){const drive=String.fromCharCode(code)+':\\\\';try{if(fs.existsSync(drive)&&fs.statSync(drive).isDirectory())roots.push(drive)}catch{}}return res.json(roots)}
  return res.json([process.cwd()])
 }catch(e){return res.status(500).json({error:e instanceof Error?e.message:'Không thể đọc ổ đĩa'})}
})
app.get('/api/fs/list', (req,res)=>{
 try{
  const raw=String(req.query.path??'').trim();if(!raw)return res.status(400).json({error:'Thiếu đường dẫn'})
  const target=path.resolve(raw);const entries=fs.readdirSync(target,{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>({name:x.name,path:path.join(target,x.name)})).sort((a,b)=>a.name.localeCompare(b.name,'vi'))
  return res.json({path:target,parent:path.dirname(target)===target?null:path.dirname(target),directories:entries})
 }catch(e){return res.status(400).json({error:e instanceof Error?e.message:'Không thể mở thư mục'})}
})
app.get('/api/dashboard', (_req,res) => res.json(dashboardSummary()))
app.get('/api/products', (req,res)=>{
  try{
    res.json(listProducts(String(req.query.search??''),{
      size:String(req.query.size??''),
      stockState:String(req.query.stockState??'all') as 'all'|'in'|'out',
      sort:String(req.query.sort??'newest') as 'newest'|'name'|'stock_desc'|'stock_asc'
    }))
  }catch(e){res.status(400).json({error:e instanceof Error?e.message:'Bộ lọc danh mục không hợp lệ'})}
})
app.get('/api/categories', (_req,res) => res.json(listCategories()))
app.get('/api/settings', (_req,res) => res.json({ lowStockThreshold:getLowStockThreshold() }))
app.get('/api/warehouse/settings',(_req,res)=>res.json(getWatchSettings()))
app.get('/api/warehouse/file',(req,res)=>{try{const root=fs.realpathSync(path.resolve(String(req.query.rootPath??''))),file=fs.realpathSync(path.resolve(String(req.query.path??''))),rel=path.relative(root,file);if(!rel||path.isAbsolute(rel)||rel==='..'||rel.startsWith('..'+path.sep)||!fs.statSync(file).isFile()||!['.jpg','.jpeg','.png','.webp','.heic'].includes(path.extname(file).toLowerCase()))throw Error('Ảnh xem trước không nằm trong kho hợp lệ');res.type(imageMime(file));res.setHeader('Cache-Control','no-store');res.sendFile(file)}catch(e){res.status(400).json({error:e instanceof Error?e.message:'Không đọc được ảnh'})}})
app.put('/api/warehouse/settings',(req,res)=>{try{res.json(saveWatchSettings(req.body))}catch(e){res.status(400).json({error:e instanceof Error?e.message:'Không lưu được cấu hình kho'})}})
app.get('/api/warehouse/notices',(_req,res)=>{try{res.json(getWarehouseNotices())}catch(e){res.status(400).json({error:String(e)})}})
app.patch('/api/warehouse/notices/:id',(req,res)=>{try{res.json(markWarehouseNotice(req.params.id,req.body.state))}catch(e){res.status(400).json({error:e instanceof Error?e.message:'Không cập nhật được thông báo'})}})
app.post('/api/warehouse/rename/preview',(req,res)=>{try{res.json(previewImageRename(req.body.rootPath,req.body.ids))}catch(e){res.status(400).json({error:e instanceof Error?e.message:'Không xem trước được tên ảnh'})}})
app.post('/api/warehouse/rename/commit',(req,res)=>{try{res.json(commitImageRename(req.body.rootPath,req.body.ids,req.body.token,req.body.confirmed))}catch(e){res.status(400).json({error:e instanceof Error?e.message:'Rename thất bại'})}})
app.get('/api/warehouse/rename/logs',(_req,res)=>{try{res.json(getRenameLogs())}catch(e){res.status(400).json({error:String(e)})}})
app.put('/api/settings/low-stock-threshold', (req,res) => {
  try { res.json({ lowStockThreshold:updateLowStockThreshold(Number(req.body.value)) }) }
  catch(e){ res.status(400).json({ error:e instanceof Error?e.message:'Không thể cập nhật cài đặt' }) }
})
app.get('/api/inventory', (req,res) => {
 try { const threshold=getLowStockThreshold(); res.json(inventoryRows({search:String(req.query.search??''),category:String(req.query.category??''),size:String(req.query.size??''),status:String(req.query.status??'all') as 'all'|'active'|'inactive',state:String(req.query.state??'all') as 'all'|'out'|'low'|'ok',threshold})) }
 catch(e){res.status(400).json({error:e instanceof Error?e.message:'Bộ lọc tồn kho không hợp lệ'})}
})
app.get('/api/catalog/dashboard', (_req,res)=>{try{res.json(catalogDashboard())}catch(e){res.status(500).json({error:e instanceof Error?e.message:'Không thể tổng hợp danh mục'})}})
app.get('/api/inventory/filter-options', (_req,res)=>res.json(inventoryFilterOptions()))
app.get('/api/inventory/dashboard', (_req,res)=>{try{res.json(inventoryDashboard())}catch(e){res.status(500).json({error:e instanceof Error?e.message:'Không thể tổng hợp tồn kho'})}})
app.get('/api/inventory/explorer', (req,res)=>{try{res.json(inventoryExplorer({search:String(req.query.search??''),category:String(req.query.category??''),size:String(req.query.size??''),status:String(req.query.status??'active') as 'all'|'active'|'inactive'}))}catch(e){res.status(400).json({error:e instanceof Error?e.message:'Không thể đọc cây tồn kho'})}})
app.get('/api/inventory/suggestions', (req,res)=>{try{res.json(inventorySuggestions(String(req.query.search??'')))}catch(e){res.status(400).json({error:e instanceof Error?e.message:'Không thể gợi ý sản phẩm'})}})
app.get('/api/inventory/history', (req,res) => res.json(inventoryHistory(Number(req.query.limit??200))))
app.patch('/api/products/:id/status', (req,res) => {
  try { res.json(setProductStatus(Number(req.params.id), req.body.status)) }
  catch(e){ res.status(400).json({ error:e instanceof Error?e.message:'Không thể đổi trạng thái sản phẩm' }) }
})
app.get('/api/products/suggest-code', (req, res) => res.json({ productCode: suggestProductCode(String(req.query.name ?? '')) }))
app.get('/api/products/suggest-sku', (req, res) => res.json({ sku: suggestSku(String(req.query.productCode ?? 'SP0001'), String(req.query.size ?? 'SIZE')) }))
app.get('/api/products/:id', (req, res) => {
  const data = getProduct(Number(req.params.id))
  if (!data) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' })
  res.json(data)
})
app.patch('/api/variants/:id/pricing', (req,res)=>{try{res.json(updateVariantPricing(Number(req.params.id),Number(req.body.costPrice),Number(req.body.salePrice)))}catch(e){res.status(400).json({error:e instanceof Error?e.message:'Không thể cập nhật giá'})}})
app.post('/api/products', (req, res) => {
  try { res.status(201).json(createProduct(req.body)) }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : 'Không thể tạo sản phẩm' }) }
})
app.get('/api/goods-receipt/dashboard',(_req,res)=>{try{res.json(goodsReceiptDashboard())}catch(e){res.status(500).json({error:e instanceof Error?e.message:'Không thể tổng hợp nhập hàng'})}})
app.post('/api/goods-receipt/inspect',(req,res)=>{try{res.json(inspectImageFolder(String(req.body.path??'')))}catch(e){res.status(400).json({error:e instanceof Error?e.message:'Không thể đọc folder ảnh'})}})
app.post('/api/goods-receipt', (req,res)=>{if(req.get('Prefer')==='respond-async')return asyncTask(req,res,'RECEIPT',req.body);try{const events:any[]=[];const result=receiveGoods(req.body,p=>events.push(p));res.status(201).json({result,events})}catch(e){res.status(400).json({error:e instanceof Error?e.message:'Không thể nhập hàng'})}})
app.post('/api/inventory/import', (req, res) => {
  try { const r = addInventory(Number(req.body.variantId), 'IMPORT', Number(req.body.quantity), req.body.unitCost, req.body.note); res.status(201).json({ ok: true, id: Number(r.lastInsertRowid) }) }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : 'Không thể nhập kho' }) }
})
app.post('/api/inventory/import-batch', (req, res) => {
  try { res.status(201).json({ ok:true, ids:batchImport(req.body.items) }) }
  catch(e){ res.status(400).json({ error:e instanceof Error?e.message:'Không thể nhập kho nhiều size' }) }
})
app.post('/api/inventory/adjust', (req, res) => {
  try {
    if(req.body.direction!=='plus'&&req.body.direction!=='minus') return res.status(400).json({error:'Hướng điều chỉnh kho không hợp lệ'})
    const type = req.body.direction === 'minus' ? 'ADJUST_MINUS' : 'ADJUST_PLUS'
    const r = addInventory(Number(req.body.variantId), type, Number(req.body.quantity), undefined, req.body.note)
    res.status(201).json({ ok: true, id: Number(r.lastInsertRowid) })
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : 'Không thể điều chỉnh kho' }) }
})
app.get('/api/inventory/history/:variantId', (req,res) => { try{res.json(history(Number(req.params.variantId)))}catch(e){res.status(400).json({error:e instanceof Error?e.message:'Không thể đọc lịch sử kho'})} })

app.post('/api/backup', (_req, res) => {
  try { res.status(201).json({ ok:true, backup:createBackup() }) }
  catch(e){res.status(500).json({error:e instanceof Error?e.message:'Không thể backup database'})}
})
app.post('/api/backup/lossless', (_req,res) => {
 if(_req.get('Prefer')==='respond-async')return asyncTask(_req,res,'BACKUP',{})
 try{res.status(201).json({ok:true,backup:createLosslessBackup()})}
 catch(e){res.status(500).json({error:e instanceof Error?e.message:'Không thể tạo bản sao lưu đầy đủ'})}
})
app.post('/api/backup/images-optimized', async (_req,res) => {
 try{res.status(201).json({ok:true,backup:await createOptimizedImageBackup()})}
 catch(e){res.status(500).json({error:e instanceof Error?e.message:'Không thể sao lưu ảnh tối ưu'})}
})

app.post('/api/store/scan', (req, res) => {
  if(req.get('Prefer')==='respond-async')return asyncTask(req,res,'SCAN',req.body)
  try {
    const rootPath = String(req.body.rootPath ?? '').trim()
    if (!rootPath) return res.status(400).json({ error: 'Cần chọn thư mục 1-Me CaCao Store' })
    res.json(checkWarehouse(rootPath))
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Không thể quét kho' })
  }
})

app.post('/api/store/import', (req, res) => {
  try {
    recoverPendingGoodsReceipts();recoverImageRenames()
    if (req.body.confirmed !== true) return res.status(400).json({ error: 'Import chưa được người dùng xác nhận' })
    const totals=()=>db.prepare('SELECT (SELECT COUNT(*) FROM products) AS products,(SELECT COUNT(*) FROM product_variants) AS sizes,(SELECT COUNT(*) FROM product_images) AS images').get() as {products:number;sizes:number;images:number}
    const before=totals(),product = commitStoreImport(req.body.product),after=totals()
    res.status(201).json({ ok: true, mode: 'COMMITTED', product,registration:{products:after.products-before.products,sizes:after.sizes-before.sizes,images:after.images-before.images} })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Không thể import sản phẩm' })
  }
})

const here = path.dirname(fileURLToPath(import.meta.url))
const webDist = path.resolve(here, '../../web/dist')
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist))
  app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')))
} else {
  app.get('/', (_req, res) => res.status(503).send('Frontend chưa build. Chạy npm run build trước.'))
}

listenLan(app,lan)
app.listen(PORT, process.env.SHOP_HOST ?? '127.0.0.1', () => {
  startWarehouseWatcher(rootPath=>{if(!tasks.pendingReview())tasks.start('SCAN',{rootPath,background:true},'watch-'+randomUUID())})
  console.log(`Shop Mẹ CaCao đang chạy: http://localhost:${PORT}`)
  console.log(`Database: ${dbPath}`)
})
