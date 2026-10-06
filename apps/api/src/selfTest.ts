import { db } from './db.js'
import { createProduct, suggestProductCode, suggestSku } from './products.js'
import { addInventory, batchImport, history } from './inventory.js'
import { isPathInsideRoot } from './storeScanner.js'
import { createBackup } from './backup.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { commitStoreImport } from './storeImport.js'
import { getLowStockThreshold, updateLowStockThreshold } from './settings.js'
import { inventoryRows, inventoryHistory, inventoryFilterOptions } from './inventoryQuery.js'
import { setProductStatus } from './products.js'
import { getImageRecord, imageMime } from './images.js'
import { DatabaseSync } from 'node:sqlite'
import { dbPath } from './db.js'

function assert(ok: unknown, message: string): asserts ok { if (!ok) throw new Error('SELF_TEST FAIL: '+message) }
const suffix=Date.now().toString(36).toUpperCase()
const product=createProduct({name:'SELF TEST '+suffix,productCode:'T'+suffix,costPrice:10000,salePrice:20000,variants:[{size:'Size Test',sku:'SKU-'+suffix,openingStock:5}]})
assert(product,'create product')
const variant=(product.variants as Array<{id:number;stock:number}>)[0]
const suggestedBase=suggestSku('COLLIDE'+suffix,'Size X')
const collision=createProduct({name:'COLLISION '+suffix,productCode:'C'+suffix,variants:[{size:'Size X',sku:suggestedBase}]})
assert(collision,'collision fixture must be created')
const suggestedAfterCollision=suggestSku('COLLIDE'+suffix,'Size X')
assert(suggestedAfterCollision!==suggestedBase,'SKU suggestion must avoid an existing normalized-base collision')
const collisionVariant=(collision.variants as Array<{id:number}>)[0]
let badOpening=false
try{createProduct({name:'BAD OPEN '+suffix,productCode:'O'+suffix,variants:[{size:'X',sku:'OSKU-'+suffix,openingStock:1.5}]})}catch{badOpening=true}
assert(badOpening,'fractional opening stock must be rejected')
assert(!(db.prepare('SELECT 1 FROM products WHERE product_code=?').get('O'+suffix)),'bad opening product must rollback')
let badPrice=false
try{createProduct({name:'BAD PRICE '+suffix,productCode:'P'+suffix,costPrice:-1,variants:[{size:'X',sku:'PSKU-'+suffix}]})}catch{badPrice=true}
assert(badPrice,'negative price must be rejected')
assert(variant.stock===5,'opening stock must be 5')
addInventory(variant.id,'IMPORT',3,11000,'self test import')
addInventory(variant.id,'ADJUST_PLUS',2,undefined,'self test plus')
addInventory(variant.id,'ADJUST_MINUS',4,undefined,'self test minus')
const stock=db.prepare('SELECT COALESCE(stock,0) AS stock FROM inventory_stock WHERE variant_id=?').get(variant.id) as {stock:number}
assert(stock.stock===6,'ledger stock must be 6')
let blocked=false
try{addInventory(variant.id,'ADJUST_MINUS',7)}catch{blocked=true}
assert(blocked,'negative stock guard')
let fractionBlocked=false
try{addInventory(variant.id,'IMPORT',1.5)}catch{fractionBlocked=true}
assert(fractionBlocked,'fractional quantity guard')
assert(history(variant.id).length===4,'history must contain 4 transactions')
batchImport([{variantId:variant.id,quantity:2,unitCost:11500,note:'batch test'}])
const afterBatch=(db.prepare('SELECT stock FROM inventory_stock WHERE variant_id=?').get(variant.id) as {stock:number}).stock
assert(afterBatch===8,'batch import must increase stock atomically')
const beforeFailedBatch=history(variant.id).length
let batchRollback=false
try{batchImport([{variantId:variant.id,quantity:1},{variantId:999999999,quantity:1}])}catch{batchRollback=true}
assert(batchRollback,'invalid batch must fail')
assert(history(variant.id).length===beforeFailedBatch,'failed batch must rollback all rows')
const originalThreshold=getLowStockThreshold()
updateLowStockThreshold(8)
assert(getLowStockThreshold()===8,'low stock setting must persist in DB')
assert((inventoryRows({state:'low',threshold:getLowStockThreshold()}) as Array<{variant_id:number}>).some(r=>r.variant_id===variant.id),'threshold must affect low-stock query')
assert((inventoryHistory(50) as Array<{variant_id:number}>).some(r=>r.variant_id===variant.id),'global history must include ledger transaction')
assert((inventoryRows({size:'Size Test',status:'active'}) as Array<{variant_id:number}>).some(r=>r.variant_id===variant.id),'size/status filter must find active SKU')
assert(inventoryFilterOptions().sizes.includes('Size Test'),'filter options must include SKU size')
let invalidFilter=false
try{inventoryRows({state:'broken' as 'all'})}catch{invalidFilter=true}
assert(invalidFilter,'invalid inventory state must be rejected')
setProductStatus((product.product as {id:number}).id,'inactive')
assert((inventoryRows({status:'inactive'}) as Array<{variant_id:number}>).some(r=>r.variant_id===variant.id),'inactive filter must expose inactive SKU')
let inactiveBlocked=false
try{addInventory(variant.id,'IMPORT',1)}catch{inactiveBlocked=true}
assert(inactiveBlocked,'inactive product must block inventory writes')
setProductStatus((product.product as {id:number}).id,'active')
addInventory(variant.id,'IMPORT',1,undefined,'reactivated write')
assert((db.prepare('SELECT stock FROM inventory_stock WHERE variant_id=?').get(variant.id) as {stock:number}).stock===9,'reactivated product must accept inventory write')
updateLowStockThreshold(originalThreshold)
const root=process.cwd()
assert(isPathInsideRoot(root,root+'/child/file.jpg'),'child path must be accepted')
assert(!isPathInsideRoot(root,root),'root itself is not an image child')
assert(!isPathInsideRoot(root,root+'/../outside.jpg'),'parent traversal must be rejected')
const importRoot=fs.mkdtempSync(path.join(os.tmpdir(),'shop-import-'))
const sizeDir=path.join(importRoot,'Test Product','Size 8')
fs.mkdirSync(sizeDir,{recursive:true})
const goodImage=path.join(sizeDir,'001.jpg'); fs.writeFileSync(goodImage,'test-image')
const imported=commitStoreImport({rootPath:importRoot,name:'IMPORT '+suffix,productCode:'I'+suffix,costPrice:12000,salePrice:22000,variants:[{size:'Size 8',sku:'ISKU-'+suffix,openingStock:3,images:[goodImage]}]})
assert(imported,'store import must commit')
const importedId=(imported!.product as {id:number}).id
const importedVariant=(imported!.variants as Array<{id:number;stock:number}>)[0]
assert(importedVariant.stock===3,'store import opening stock must persist')
const importedImage=(db.prepare('SELECT id FROM product_images WHERE product_id=? ORDER BY id LIMIT 1').get(importedId) as {id:number})
const imageRecord=getImageRecord(importedImage.id)
assert(imageRecord&&!imageRecord.missing,'registered image must resolve by database id')
assert(imageMime(imageRecord.file_path)==='image/jpeg','jpg MIME must be correct')
fs.unlinkSync(goodImage)
const missingImage=getImageRecord(importedImage.id)
assert(missingImage?.missing===true,'missing image file must not corrupt product metadata')
fs.writeFileSync(goodImage,'test-image')
let rollbackBlocked=false
try{commitStoreImport({rootPath:importRoot,name:'BAD '+suffix,productCode:'B'+suffix,variants:[{size:'Size X',sku:'BSKU-'+suffix,openingStock:1,images:[path.join(importRoot,'missing.jpg')]}]})}catch{rollbackBlocked=true}
assert(rollbackBlocked,'bad image import must fail')
const badCount=(db.prepare('SELECT COUNT(*) AS n FROM products WHERE product_code=?').get('B'+suffix) as {n:number}).n
assert(badCount===0,'failed import must rollback product')
const secondConnection=new DatabaseSync(dbPath)
const persistedStock=(secondConnection.prepare('SELECT stock FROM inventory_stock WHERE variant_id=?').get(variant.id) as {stock:number}).stock
const persistedThreshold=Number((secondConnection.prepare("SELECT value FROM app_settings WHERE key='low_stock_threshold'").get() as {value:string}).value)
const integrity=(secondConnection.prepare('PRAGMA integrity_check').get() as {integrity_check:string}).integrity_check
const foreignKeys=secondConnection.prepare('PRAGMA foreign_key_check').all()
assert(persistedStock===9,'second connection must see persisted ledger stock')
assert(persistedThreshold===originalThreshold,'restored setting must persist across connection reopen')
assert(integrity==='ok','SQLite integrity_check must be ok')
assert(foreignKeys.length===0,'foreign_key_check must have no violations')
secondConnection.close()
const backup=createBackup()
assert(fs.existsSync(backup.path),'backup file must exist')
assert(fs.statSync(backup.path).size>0,'backup file must not be empty')
assert(fs.existsSync(path.join(backup.directory,backup.manifest)),'backup image manifest must exist')
const backupManifest=JSON.parse(fs.readFileSync(path.join(backup.directory,backup.manifest),'utf8')) as {images:Array<{product_id:number;exists:boolean}>}
assert(backupManifest.images.some(x=>x.product_id===importedId&&x.exists),'backup manifest must include existing imported image')
db.prepare('DELETE FROM product_images WHERE product_id=?').run(importedId)
db.prepare('DELETE FROM inventory_transactions WHERE variant_id=?').run(importedVariant.id)
db.prepare('DELETE FROM product_variants WHERE id=?').run(importedVariant.id)
db.prepare('DELETE FROM products WHERE id=?').run(importedId)
fs.rmSync(importRoot,{recursive:true,force:true})
db.prepare('DELETE FROM inventory_transactions WHERE variant_id=?').run(collisionVariant.id)
db.prepare('DELETE FROM product_variants WHERE id=?').run(collisionVariant.id)
db.prepare('DELETE FROM products WHERE id=?').run((collision.product as {id:number}).id)
db.exec('BEGIN IMMEDIATE')
try{
 db.prepare('DELETE FROM inventory_transactions WHERE variant_id=?').run(variant.id)
 db.prepare('DELETE FROM product_variants WHERE id=?').run(variant.id)
 db.prepare('DELETE FROM products WHERE id=?').run((product.product as {id:number}).id)
 db.exec('COMMIT')
}catch(e){db.exec('ROLLBACK');throw e}
console.log('SELF_TEST_V1 PASS: product, validation rollback, opening, import, adjustments, negative guard, integer guard, history, batch rollback, settings/filter/history/inactive integration, path guard, image resolve/missing-file, persistence/integrity/foreign-key, store import rollback, backup, cleanup')
