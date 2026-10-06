import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dbPath } from './db.js'
import { createProduct, getProduct, listProducts, suggestProductCode, suggestSku } from './products.js'
import { addInventory, history } from './inventory.js'
import { scanStore } from './storeScanner.js'

const app = express()
const PORT = Number(process.env.PORT ?? 3000)
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) => res.json({
  ok: true, app: 'SHOP_MECACAO_WEB', version: '1.0.0-dev', schema: 100, database: path.basename(dbPath)
}))

app.get('/api/products', (req, res) => res.json(listProducts(String(req.query.search ?? ''))))
app.get('/api/products/suggest-code', (req, res) => res.json({ productCode: suggestProductCode(String(req.query.name ?? '')) }))
app.get('/api/products/suggest-sku', (req, res) => res.json({ sku: suggestSku(String(req.query.productCode ?? 'SP0001'), String(req.query.size ?? 'SIZE')) }))
app.get('/api/products/:id', (req, res) => {
  const data = getProduct(Number(req.params.id))
  if (!data) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' })
  res.json(data)
})
app.post('/api/products', (req, res) => {
  try { res.status(201).json(createProduct(req.body)) }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : 'Không thể tạo sản phẩm' }) }
})
app.post('/api/inventory/import', (req, res) => {
  try { const r = addInventory(Number(req.body.variantId), 'IMPORT', Number(req.body.quantity), req.body.unitCost, req.body.note); res.status(201).json({ ok: true, id: Number(r.lastInsertRowid) }) }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : 'Không thể nhập kho' }) }
})
app.post('/api/inventory/adjust', (req, res) => {
  try {
    const type = req.body.direction === 'minus' ? 'ADJUST_MINUS' : 'ADJUST_PLUS'
    const r = addInventory(Number(req.body.variantId), type, Number(req.body.quantity), undefined, req.body.note)
    res.status(201).json({ ok: true, id: Number(r.lastInsertRowid) })
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : 'Không thể điều chỉnh kho' }) }
})
app.get('/api/inventory/history/:variantId', (req, res) => res.json(history(Number(req.params.variantId))))

app.post('/api/store/scan', (req, res) => {
  try {
    const rootPath = String(req.body.rootPath ?? '').trim()
    if (!rootPath) return res.status(400).json({ error: 'Cần chọn thư mục 1-Me CaCao Store' })
    const products = scanStore(rootPath)
    res.json({
      mode: 'PREVIEW_ONLY',
      rootPath: path.resolve(rootPath),
      productCount: products.length,
      products
    })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Không thể quét kho' })
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Shop Mẹ CaCao đang chạy: http://localhost:${PORT}`)
  console.log(`Database: ${dbPath}`)
})
