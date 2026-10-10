import {ARCHIVE_FOLDER} from './salesArchive.js'
import {restoreTestRouter} from './restoreRoutes.js'
import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { db,dbPath,salesDraftsEnabled } from './db.js'
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
const receiptRecovery=recoverPendingGoodsReceipts()
recoverImageRenames()
if(receiptRecovery.journals)console.log('Receipt recovery:',JSON.stringify(receiptRecovery))

const app = express()
const PORT = Number(process.env.PORT ?? 3000)
const sandboxRoot=process.env.SHOP_SANDBOX_ROOT?fs.realpathSync(path.resolve(process.env.SHOP_SANDBOX_ROOT)):null
function sandboxPathAllowed(value:unknown){
 if(!sandboxRoot)return true
 if(typeof value!=='string'||!value.trim())return false
 try{
  const real=fs.realpathSync(path.resolve(value))
  if(real.split(path.sep).includes(ARCHIVE_FOLDER))return false
  const rel=path.relative(sandboxRoot,real)
  return rel===''||(!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep))
 }catch{return false}
}
app.use(express.json({ limit: '2mb' }))
// Test mode enforces isolation at the API, not merely via a yellow UI banner.
app.use('/api',(req,res,next)=>{
 if(!sandboxRoot)return next()
 const paths:unknown[]=[]
 if(req.path==='/fs/list')paths.push(req.query.path)
 if(req.path==='/store/scan')paths.push(req.body.rootPath)
 if(req.path==='/warehouse/file')paths.push(req.query.rootPath,req.query.path)
 if((req.path==='/warehouse/settings'&&req.method==='PUT')||req.path==='/warehouse/rename/preview'||req.path==='/warehouse/rename/commit')paths.push(req.body.rootPath)
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

app.get('/api/health', (_req, res) => res.json({
  ok: true, app: 'SHOP_MECACAO_WEB', version: salesDraftsEnabled?'2.0.0-draft-sandbox':'1.0.0-dev', schema: readSchemaVersion(db), database: path.basename(dbPath),sandbox:!!sandboxRoot,salesDrafts:salesDraftsEnabled
}))
if(salesDraftsEnabled&&sandboxRoot)app.use('/api/sales/drafts',salesDraftRouter(db,sandboxRoot,PORT))
else app.use('/api/sales/drafts',(_req,res)=>res.status(404).json({error:'V2 đơn nháp chưa bật; chỉ thử bằng sandbox V2 riêng.'}))

if(sandboxRoot)app.use('/api/backup/restore-test',restoreTestRouter(sandboxRoot,PORT))
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
  if(sandboxRoot)return res.json([sandboxRoot])
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
app.post('/api/goods-receipt', (req,res)=>{try{const events:any[]=[];const result=receiveGoods(req.body,p=>events.push(p));res.status(201).json({result,events})}catch(e){res.status(400).json({error:e instanceof Error?e.message:'Không thể nhập hàng'})}})
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
 try{res.status(201).json({ok:true,backup:createLosslessBackup()})}
 catch(e){res.status(500).json({error:e instanceof Error?e.message:'Không thể tạo bản sao lưu đầy đủ'})}
})
app.post('/api/backup/images-optimized', async (_req,res) => {
 try{res.status(201).json({ok:true,backup:await createOptimizedImageBackup()})}
 catch(e){res.status(500).json({error:e instanceof Error?e.message:'Không thể sao lưu ảnh tối ưu'})}
})

app.post('/api/store/scan', (req, res) => {
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

app.listen(PORT, process.env.SHOP_HOST ?? '127.0.0.1', () => {
  startWarehouseWatcher()
  console.log(`Shop Mẹ CaCao đang chạy: http://localhost:${PORT}`)
  console.log(`Database: ${dbPath}`)
})
