import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {DatabaseSync} from 'node:sqlite'
import {bootstrapSalesDrafts} from './salesSchema.js'
import {bootstrapSalesExecution,salesExecutionService,digest} from './salesExecution.js'
import {optimizeCloudImage} from './cloudImages.js'
import {reconcileCloudSale} from './cloudReconcile.js'
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-cloud-reconcile-')),db=new DatabaseSync(path.join(root,'test.db'))
try{
 bootstrapSalesDrafts(db);bootstrapSalesExecution(db,root)
 db.exec("INSERT INTO app_metadata(key,value) VALUES('cloud-instance','fake-instance');INSERT INTO products(id,product_code,name) VALUES(1,'FAKE','FAKE product');INSERT INTO product_variants(id,product_id,sku,size,cost_price,sale_price) VALUES(1,1,'FAKE-S1','S1',10000,50000);INSERT INTO inventory_transactions(variant_id,transaction_type,quantity) VALUES(1,'OPENING',1)")
 const file=path.join(root,'fake.png');await sharp({create:{width:100,height:120,channels:3,background:'#a23874'}}).png().toFile(file)
 const sourceHash=digest(fs.readFileSync(file)),optimized=await optimizeCloudImage(file)
 db.prepare('INSERT INTO product_images(id,product_id,variant_id,file_path) VALUES(1,1,1,?)').run(file)
 const proof={instance:'fake-instance',order:{id:'fake-cloud-order',version:1,discount:1000,note:'FAKE'},confirmation:{order_id:'fake-cloud-order',subtotal:50000,discount:1000,total:49000},contact:{recipient_name:'FAKE',shipping_fee:10000},items:[{image_id:1,product_id:1,variant_id:1,product_name:'FAKE product',product_code:'FAKE',size:'S1',sku:'FAKE-S1',unit_price:50000,unit_cost:10000}],assets:[{image_id:1,ready:true,sha256:optimized.sha256}]}
 await assert.rejects(()=>reconcileCloudSale(db,root,{...proof,instance:'other'}))
 await assert.rejects(()=>reconcileCloudSale(db,root,{...proof,assets:[{image_id:1,ready:true,sha256:'0'.repeat(64)}]}))
 assert.equal(fs.existsSync(file),true);assert.equal(db.prepare('SELECT count(*) n FROM sales_units').get()?.n,0)
 // Cloud already SOLD while laptop was off; a later price/status edit must not
 // rewrite the historical cost or prevent retaining the original evidence.
 db.exec("UPDATE product_variants SET cost_price=20000,status='inactive';UPDATE products SET status='inactive'")
 const first=await reconcileCloudSale(db,root,proof);assert.equal(first.sold,true)
 const second=await reconcileCloudSale(db,root,proof);assert.equal(second.operationId,first.operationId)
 assert.equal(fs.existsSync(file),false);assert.equal(db.prepare('SELECT count(*) n FROM sales_units').get()?.n,1)
 const op=db.prepare('SELECT payload FROM sales_operations WHERE request_key=?').get('cloud-sale-fake-cloud-order')!
 const plan=JSON.parse(String(op.payload));assert.equal(plan.format,1);assert.equal(digest(fs.readFileSync(path.join(root,plan.units[0].staged))),sourceHash)
 assert.equal(plan.units[0].snapshot.unit_cost,10000);assert.equal(db.prepare('SELECT cost_price FROM product_variants WHERE id=1').get()?.cost_price,20000)
 assert.equal((await salesExecutionService(db,root).status('cloud-sale-fake-cloud-order')).sold,true)
 await assert.rejects(()=>reconcileCloudSale(db,root,{...proof,order:{...proof.order,note:'changed'}}))
 console.log('PASS Cloud SOLD reconciliation: original evidence, atomic core archive, retry, instance and source guards')
}finally{db.close();fs.rmSync(root,{recursive:true,force:true})}
