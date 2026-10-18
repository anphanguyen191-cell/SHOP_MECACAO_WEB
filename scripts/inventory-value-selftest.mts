import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import {db,dbPath} from '../apps/api/src/db.ts'
import {inventoryDashboard} from '../apps/api/src/inventoryQuery.ts'
import {inventoryValuation} from '../apps/api/src/inventoryValue.ts'
import {cloudInventory} from '../apps/web/src/cloudInventory.ts'
import {bootstrapSalesDrafts} from '../apps/api/src/salesSchema.ts'
import {bootstrapSalesExecution,salesExecutionService} from '../apps/api/src/salesExecution.ts'
import {salesDraftService} from '../apps/api/src/salesDrafts.ts'
import {salesPreflightService} from '../apps/api/src/salesPreflight.ts'
import {financeService} from '../apps/api/src/orderFinance.ts'
import {soldRetentionService} from '../apps/api/src/soldRetention.ts'
assert.equal(path.basename(dbPath),'self-test.db','Only disposable test databases are allowed')
const root=path.dirname(dbPath),warehouse=path.join(root,'warehouse')
try{
 const rows=[{stock:2,cost_price:10000,sale_price:25000},{stock:1,cost_price:0,sale_price:0,cost_price_set:true,sale_price_set:true},{stock:3,cost_price:0,sale_price:30000}]
 const before=JSON.stringify(rows)
 assert.deepEqual(inventoryValuation(rows),{stock:6,costValue:'20000',saleValue:'140000',unpricedCostStock:3,unpricedSaleStock:0})
 assert.equal(JSON.stringify(rows),before)
 assert.equal(inventoryValuation([{stock:2,cost_price:Number.MAX_SAFE_INTEGER,sale_price:0,sale_price_set:true}]).costValue,'18014398509481982','Money totals must not lose integer precision')
 assert.equal(inventoryValuation([{stock:2,cost_price:Number.MAX_SAFE_INTEGER+1,sale_price:NaN}]).unpricedCostStock,2)
 assert.equal(inventoryValuation([]).costValue,'0')
 assert.throws(()=>inventoryValuation([{stock:-1,cost_price:1,sale_price:1}]))
 bootstrapSalesDrafts(db);bootstrapSalesExecution(db,root)
 db.exec("INSERT INTO products(id,product_code,name,status) VALUES(1,'VALUE','Bộ tole','active'),(2,'HIDDEN','Đã ngưng','inactive');INSERT INTO product_variants(id,product_id,sku,size,cost_price,sale_price) VALUES(1,1,'VALUE-S','S',10000,25000),(2,1,'VALUE-M','M',0,0),(3,1,'VALUE-L','L',0,30000),(4,1,'VALUE-XL','XL',90000,90000),(5,2,'HIDDEN-S','S',99999,99999);INSERT INTO variant_price_state(variant_id,cost_set,sale_set) VALUES(2,1,1);INSERT INTO inventory_transactions(variant_id,transaction_type,quantity) VALUES(1,'OPENING',999);")
 const files=new Map<number,string>()
 async function photo(id:number,variant:number,product=1,registered=true){const name=product===1?'Bộ tole':'Đã ngưng',size=String(db.prepare('SELECT size FROM product_variants WHERE id=?').get(variant)!.size),file=path.join(warehouse,name,size,id+'.jpg');fs.mkdirSync(path.dirname(file),{recursive:true});await sharp({create:{width:20,height:24,channels:3,background:{r:20+id*20,g:90,b:150}}}).jpeg().toFile(file);if(registered)db.prepare('INSERT INTO product_images(id,product_id,variant_id,file_path) VALUES(?,?,?,?)').run(id,product,variant,file);files.set(id,file)}
 await photo(1,1);await photo(2,1);await photo(3,2);await photo(4,3);await photo(5,5,2);await photo(6,1,1,false)
 db.prepare('INSERT INTO product_images(id,product_id,variant_id,file_path) VALUES(7,1,4,?)').run(path.join(warehouse,'Bộ tole','XL','missing.jpg'))
 db.prepare("INSERT INTO app_settings(key,value) VALUES('warehouse-watch',?)").run(JSON.stringify({rootPath:warehouse}))
 const initial={stock:5,costValue:'30000',saleValue:'105000',unpricedCostStock:1,unpricedSaleStock:0}
 assert.deepEqual(inventoryDashboard().valuation,initial,'Use existing physical files plus pending known-Size photos, not ledger999, missing files or inactive products')
 const drafts=salesDraftService(db,root),input={items:[{imageId:1,unitPrice:25000}],discount:0,note:''}
 const cancelled=drafts.create(input,'valuation-cancel-draft-01');assert.deepEqual(inventoryDashboard().valuation,initial);drafts.cancel(cancelled.id,1);assert.deepEqual(inventoryDashboard().valuation,initial,'Cancelling a draft never changes physical stock/value')
 const draft=drafts.create(input,'valuation-create-draft-01'),pre=await salesPreflightService(db,root).check(draft.id,1)
 await salesExecutionService(db,root).confirm(draft.id,{version:1,token:pre.token,confirmed:true,acknowledgeZeroPrice:false},'valuation-confirm-sale-01')
 const sold={stock:4,costValue:'20000',saleValue:'80000',unpricedCostStock:1,unpricedSaleStock:0}
 assert.deepEqual(inventoryDashboard().valuation,sold,'SOLD must reduce valuation once, by the sold physical unit')
 assert.equal(fs.existsSync(files.get(1)!),false)
 assert.equal(soldRetentionService(db,root).list(0).deletionEnabled,false)
 assert.equal((await soldRetentionService(db,root).verify('1')).originalPresent,true)
 const finance=financeService(db),summary=finance.summary(draft.id)
 finance.createCase(draft.id,{version:summary.version,orderVersion:summary.orderVersion,kind:'RETURN',note:'Khách muốn trả hàng'},'valuation-return-case-01')
 assert.deepEqual(inventoryDashboard().valuation,sold,'Recording aftercare does not restock SOLD units')
 db.exec('UPDATE product_variants SET cost_price=5000 WHERE id=3')
 assert.deepEqual(inventoryDashboard().valuation,{...sold,costValue:'25000',unpricedCostStock:0},'Refresh uses current Size prices and updates missing-price coverage')
 const snapshot={products:[{id:1,product_code:'VALUE',name:'Bộ tole',status:'active'}],product_variants:[{id:1,product_id:1,status:'active',sku:'S',size:'S',cost_price:10000,sale_price:25000},{id:2,product_id:1,status:'active',sku:'M',size:'M',cost_price:0,sale_price:0,cost_price_set:true,sale_price_set:true},{id:3,product_id:1,status:'active',sku:'L',size:'L',cost_price:0,sale_price:30000}],product_images:[{id:1,product_id:1,variant_id:1},{id:2,product_id:1,variant_id:1},{id:3,product_id:1,variant_id:1},{id:4,product_id:1,variant_id:2},{id:5,product_id:1,variant_id:3},{id:6,product_id:1,variant_id:1}],cloud_image_assets:[{image_id:1,ready:true},{image_id:2,ready:true},{image_id:3,ready:false},{image_id:4,ready:true},{image_id:5,ready:true},{image_id:6,ready:true,source_present:false}],sales_units:[{image_id:1,variant_id:1}]}
 const original=JSON.stringify(snapshot)
 assert.deepEqual(cloudInventory(snapshot).dashboard.valuation,{stock:3,costValue:'10000',saleValue:'55000',unpricedCostStock:1,unpricedSaleStock:0},'Cloud counts only ready, present, unsold photos and preserves explicit zero prices')
 assert.equal(JSON.stringify(snapshot),original)
 console.log('INVENTORY_VALUE PASS: exact VND totals, missing/explicit-zero prices, physical/pending/missing files versus ledger, draft/cancel unchanged, SOLD decrease, retained originals, RETURN case not restocking, current prices and Cloud ready/unsold source parity')
}finally{db.close()}
