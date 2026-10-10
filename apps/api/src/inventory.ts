import { db } from './db.js'

export type InventoryType = 'IMPORT' | 'ADJUST_PLUS' | 'ADJUST_MINUS'
export type BatchImportItem = { variantId:number; quantity:number; unitCost?:number; note?:string }

function validate(variantId:number,type:InventoryType,quantity:number,unitCost?:number){
 if(!Number.isInteger(variantId)||variantId<=0) throw new Error('Variant không hợp lệ')
 if(!['IMPORT','ADJUST_PLUS','ADJUST_MINUS'].includes(type)) throw new Error('Loại giao dịch kho không hợp lệ')
 if(!Number.isFinite(quantity)||!Number.isInteger(quantity)||quantity<=0) throw new Error('Số lượng phải là số nguyên lớn hơn 0')
 if(unitCost!==undefined&&(!Number.isFinite(unitCost)||unitCost<0)) throw new Error('Giá nhập không hợp lệ')
 const variant=db.prepare('SELECT v.id,v.status AS variant_status,p.status AS product_status FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=?').get(variantId) as {id:number;variant_status:string;product_status:string}|undefined
 if(!variant) throw new Error('Không tìm thấy SKU')
 if(variant.variant_status!=='active'||variant.product_status!=='active') throw new Error('SKU hoặc sản phẩm đang ngưng hoạt động')
 if(type==='ADJUST_MINUS'){
  const row=db.prepare('SELECT COALESCE(stock,0) AS stock FROM inventory_stock WHERE variant_id=?').get(variantId) as {stock:number}|undefined
  if(quantity>Number(row?.stock??0)) throw new Error('Điều chỉnh âm vượt quá tồn hiện tại')
 }
}

export function addInventory(variantId:number,type:InventoryType,quantity:number,unitCost?:number,note?:string){
 validate(variantId,type,quantity,unitCost)
 return db.prepare('INSERT INTO inventory_transactions(variant_id,transaction_type,quantity,unit_cost,note) VALUES(?,?,?,?,?)')
  .run(variantId,type,quantity,unitCost??null,note??null)
}

export function batchImport(items:BatchImportItem[]){
 if(!Array.isArray(items)||items.length===0) throw new Error('Cần ít nhất một SKU để nhập kho')
 db.exec('BEGIN IMMEDIATE')
 try{
  const insert=db.prepare("INSERT INTO inventory_transactions(variant_id,transaction_type,quantity,unit_cost,note) VALUES(?,'IMPORT',?,?,?)")
  const ids:number[]=[]
  for(const item of items){validate(item.variantId,'IMPORT',item.quantity,item.unitCost);const r=insert.run(item.variantId,item.quantity,item.unitCost??null,item.note??null);ids.push(Number(r.lastInsertRowid))}
  db.exec('COMMIT');return ids
 }catch(e){db.exec('ROLLBACK');throw e}
}

export function history(variantId:number){
 if(!Number.isInteger(variantId)||variantId<=0) throw new Error('Variant không hợp lệ')
 const table=db.prepare("SELECT 1 FROM sqlite_master WHERE name='sales_ledger'").get()?"(SELECT id,variant_id,transaction_type,quantity,unit_cost,note,created_at FROM inventory_transactions UNION ALL SELECT -image_id id,variant_id,transaction_type,quantity,unit_cost,'Đơn '||substr(order_id,1,8) note,created_at FROM sales_ledger)":'inventory_transactions'
 return db.prepare(`SELECT id,transaction_type,quantity,unit_cost,note,created_at FROM ${table} WHERE variant_id=? ORDER BY created_at DESC,id DESC`).all(variantId)
}
