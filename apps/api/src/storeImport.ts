import fs from 'node:fs'
import path from 'node:path'
import { db } from './db.js'
import { getProduct, suggestSku } from './products.js'
import { isPathInsideRoot } from './storeScanner.js'
type ImportVariant={size:string;sku?:string;openingStock?:number;images?:string[];costPrice?:number;salePrice?:number}
export type ApprovedStoreImport={rootPath:string;name:string;productCode:string;category?:string;costPrice?:number;salePrice?:number;variants:ImportVariant[]}
function validateImages(root:string,images:string[]){
 for(const file of images){if(!isPathInsideRoot(root,file))throw new Error('Ảnh nằm ngoài thư mục kho đã duyệt');const resolved=path.resolve(file);if(!fs.existsSync(resolved)||!fs.statSync(resolved).isFile())throw new Error('Không tìm thấy ảnh: '+file)}
}
export function commitStoreImport(input:ApprovedStoreImport){
 if(!input.rootPath?.trim())throw new Error('Thiếu thư mục kho')
 if(!input.name?.trim())throw new Error('Tên sản phẩm là bắt buộc')
 if(!input.productCode?.trim())throw new Error('Mã sản phẩm phải được duyệt trước khi lưu')
 if(!Array.isArray(input.variants)||input.variants.length===0)throw new Error('Cần ít nhất một size')
 const root=path.resolve(input.rootPath);if(!fs.existsSync(root)||!fs.statSync(root).isDirectory())throw new Error('Thư mục kho không còn tồn tại')
 const sizes=input.variants.map(v=>v.size.trim());if(sizes.some(s=>!s))throw new Error('Size không được để trống')
 if(new Set(sizes.map(s=>s.toLowerCase())).size!==sizes.length)throw new Error('Size bị trùng')
 const code=input.productCode.trim().toUpperCase()
 db.exec('BEGIN IMMEDIATE')
 try{
  let product=db.prepare('SELECT id,product_code FROM products WHERE product_code=?').get(code) as {id:number;product_code:string}|undefined
  if(product){
   const named=db.prepare('SELECT id FROM products WHERE id=? AND lower(name)=lower(?)').get(product.id,input.name.trim())
   if(!named)throw new Error('Mã sản phẩm "'+code+'" đã thuộc sản phẩm khác')
  }
  let categoryId:number|null=null
  if(input.category?.trim()){db.prepare('INSERT INTO categories(name) VALUES(?) ON CONFLICT(name) DO NOTHING').run(input.category.trim());categoryId=Number((db.prepare('SELECT id FROM categories WHERE name=?').get(input.category.trim()) as {id:number}).id)}
  if(!product){const pr=db.prepare('INSERT INTO products(product_code,name,category_id,cost_price,sale_price) VALUES(?,?,?,?,?)').run(code,input.name.trim(),categoryId,input.costPrice??0,input.salePrice??0);product={id:Number(pr.lastInsertRowid),product_code:code}}
  const productId=product.id
  const insertVariant=db.prepare('INSERT INTO product_variants(product_id,sku,size,cost_price,sale_price) VALUES(?,?,?,?,?)')
  const insertImage=db.prepare('INSERT INTO product_images(product_id,variant_id,file_path,sort_order,is_primary) VALUES(?,?,?,?,?)')
  const opening=db.prepare("INSERT INTO inventory_transactions(variant_id,transaction_type,quantity,unit_cost,note) VALUES(?,'OPENING',?,?,?)")
  const existingBySize=db.prepare('SELECT id,sku FROM product_variants WHERE product_id=? AND lower(size)=lower(?)')
  const skuOwner=db.prepare('SELECT id,product_id FROM product_variants WHERE sku=?')
  for(const variant of input.variants){
   const size=variant.size.trim(),variantCost=variant.costPrice??input.costPrice??0,variantSale=variant.salePrice??input.salePrice??0
   if(!Number.isFinite(variantCost)||variantCost<0||!Number.isFinite(variantSale)||variantSale<0)throw new Error('Giá theo size không hợp lệ')
   const existing=existingBySize.get(productId,size) as {id:number;sku:string}|undefined
   if(existing){db.prepare("UPDATE product_variants SET cost_price=?,sale_price=?,updated_at=datetime('now') WHERE id=?").run(variantCost,variantSale,existing.id);continue}
   const sku=(variant.sku?.trim()||suggestSku(code,size)).toUpperCase(),owner=skuOwner.get(sku) as {id:number;product_id:number}|undefined
   if(owner)throw new Error('SKU "'+sku+'" đã tồn tại ở sản phẩm khác')
   validateImages(root,variant.images??[])
   const vr=insertVariant.run(productId,sku,size,variantCost,variantSale),variantId=Number(vr.lastInsertRowid)
   ;(variant.images??[]).forEach((file,index)=>insertImage.run(productId,variantId,path.resolve(file),index,index===0?1:0))
   const qty=variant.openingStock??0;if(!Number.isFinite(qty)||!Number.isInteger(qty)||qty<0)throw new Error('Tồn đầu phải là số nguyên không âm')
   if(qty>0)opening.run(variantId,qty,variantCost,'Tồn đầu từ kho hiện hữu')
  }
  db.exec('COMMIT');return getProduct(productId)
 }catch(e){db.exec('ROLLBACK');throw e}
}
