import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dbPath } from './db.js'

const app = express()
const PORT = Number(process.env.PORT ?? 3000)

app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ok: true, app: 'SHOP_MECACAO_WEB', version: '0.1.0', database: path.basename(dbPath)})
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
