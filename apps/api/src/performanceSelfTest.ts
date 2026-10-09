import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {performance} from 'node:perf_hooks'
import sharp from 'sharp'
import {db,dbPath} from './db.js'
import {listProducts} from './products.js'
import {inventoryExplorer,inventoryDashboard} from './inventoryQuery.js'
import {dashboardSummary} from './dashboard.js'

// Disposable DB supplied by run-self-test. Never use a shop database.
assert(path.basename(dbPath)==='self-test.db','Performance test requires isolated runner')
const root=path.join(path.dirname(dbPath),'performance-images')
fs.mkdirSync(root)
const jpeg=await sharp({create:{width:24,height:24,channels:3,background:'#ffb0cf'}}).jpeg().toBuffer()
const product=db.prepare('INSERT INTO products(product_code,name) VALUES(?,?)')
const variant=db.prepare('INSERT INTO product_variants(product_id,sku,size) VALUES(?,?,?)')
const image=db.prepare('INSERT INTO product_images(product_id,variant_id,file_path) VALUES(?,?,?)')
db.exec('BEGIN IMMEDIATE')
for(let p=0;p<250;p++){
 const pid=Number(product.run('PERF'+p,'Performance '+p).lastInsertRowid)
 for(let s=0;s<4;s++){
  const vid=Number(variant.run(pid,'PERF'+p+'-'+s,'Size '+s).lastInsertRowid)
  for(let n=0;n<3;n++){
   const target=path.join(root,vid+'-'+n+'.jpg');fs.writeFileSync(target,jpeg)
   image.run(pid,vid,target)
  }
 }
}
db.exec('COMMIT')
const prepare=db.prepare.bind(db)
let queries=0
db.prepare=((...args:Parameters<typeof db.prepare>)=>{queries++;return prepare(...args)}) as typeof db.prepare
const metrics=[]
for(const [name,read] of [
 ['catalog',()=>listProducts()],
 ['explorer',()=>inventoryExplorer()],
 ['inventory-dashboard',()=>inventoryDashboard()],
 ['overview-summary',()=>dashboardSummary()]
] as const){
 queries=0;const start=performance.now();const result=read();const ms=performance.now()-start
 assert(queries<=8,name+' must use bounded batch SQL, not per-Size N+1 queries: '+queries)
 if(Array.isArray(result))assert.equal(result.reduce((sum,p)=>sum+Number(p.total_stock??p.stock),0),3000)
 else assert.equal(result.stock,3000)
 metrics.push({name,sqlPreparations:queries,elapsedMs:Math.round(ms*100)/100})
}
db.prepare=prepare
console.log('PERFORMANCE_SELF_TEST PASS: 250 products, 1000 Size/SKUs, 3000 real JPEG files; no time threshold; '+JSON.stringify(metrics))
db.close()
