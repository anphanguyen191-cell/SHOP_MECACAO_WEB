import { db } from './db.js'
import { createProduct } from './products.js'
import { addInventory, history } from './inventory.js'
import { isPathInsideRoot } from './storeScanner.js'
import { createBackup } from './backup.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { commitStoreImport } from './storeImport.js'

function assert(ok: unknown, message: string): asserts ok { if (!ok) throw new Error('SELF_TEST FAIL: '+message) }
const suffix=Date.now().toString(36).toUpperCase()
const product=createProduct({name:'SELF TEST '+suffix,productCode:'T'+suffix,costPrice:10000,salePrice:20000,variants:[{size:'Size Test',sku:'SKU-'+suffix,openingStock:5}]})
assert(product,'create product')
const variant=(product.variants as Array<{id:number;stock:number}>)[0]
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
let rollbackBlocked=false
try{commitStoreImport({rootPath:importRoot,name:'BAD '+suffix,productCode:'B'+suffix,variants:[{size:'Size X',sku:'BSKU-'+suffix,openingStock:1,images:[path.join(importRoot,'missing.jpg')]}]})}catch{rollbackBlocked=true}
assert(rollbackBlocked,'bad image import must fail')
const badCount=(db.prepare('SELECT COUNT(*) AS n FROM products WHERE product_code=?').get('B'+suffix) as {n:number}).n
assert(badCount===0,'failed import must rollback product')
const backup=createBackup()
assert(fs.existsSync(backup.path),'backup file must exist')
assert(fs.statSync(backup.path).size>0,'backup file must not be empty')
db.prepare('DELETE FROM product_images WHERE product_id=?').run(importedId)
db.prepare('DELETE FROM inventory_transactions WHERE variant_id=?').run(importedVariant.id)
db.prepare('DELETE FROM product_variants WHERE id=?').run(importedVariant.id)
db.prepare('DELETE FROM products WHERE id=?').run(importedId)
fs.rmSync(importRoot,{recursive:true,force:true})
db.exec('BEGIN IMMEDIATE')
try{
 db.prepare('DELETE FROM inventory_transactions WHERE variant_id=?').run(variant.id)
 db.prepare('DELETE FROM product_variants WHERE id=?').run(variant.id)
 db.prepare('DELETE FROM products WHERE id=?').run((product.product as {id:number}).id)
 db.exec('COMMIT')
}catch(e){db.exec('ROLLBACK');throw e}
console.log('SELF_TEST_V1 PASS: product, opening, import, adjustments, negative guard, integer guard, history, path guard, store import rollback, backup, cleanup')
