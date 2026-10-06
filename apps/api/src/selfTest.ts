import { db } from './db.js'
import { createProduct } from './products.js'
import { addInventory, history } from './inventory.js'

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
db.exec('BEGIN IMMEDIATE')
try{
 db.prepare('DELETE FROM inventory_transactions WHERE variant_id=?').run(variant.id)
 db.prepare('DELETE FROM product_variants WHERE id=?').run(variant.id)
 db.prepare('DELETE FROM products WHERE id=?').run((product.product as {id:number}).id)
 db.exec('COMMIT')
}catch(e){db.exec('ROLLBACK');throw e}
console.log('SELF_TEST_V1 PASS: product, opening, import, adjustments, negative guard, integer guard, history, cleanup')
