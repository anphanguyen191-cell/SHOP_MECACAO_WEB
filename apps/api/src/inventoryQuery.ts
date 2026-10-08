import fs from 'node:fs'
import { db } from './db.js'

export type InventoryFilters={search?:string;category?:string;size?:string;status?:'all'|'active'|'inactive';state?:'all'|'out'|'low'|'ok';threshold?:number}

export function inventoryRows(filters:InventoryFilters={}){
 const q='%'+(filters.search??'').trim()+'%',category=(filters.category??'').trim(),size=(filters.size??'').trim()
 const state=filters.state??'all',status=filters.status??'all'
 if(!['all','out','low','ok'].includes(state))throw new Error('Trạng thái tồn không hợp lệ')
 if(!['all','active','inactive'].includes(status))throw new Error('Trạng thái sản phẩm không hợp lệ')
 const threshold=Number.isInteger(filters.threshold)&&Number(filters.threshold)>=0?Number(filters.threshold):2
 const sql=`SELECT v.id AS variant_id,v.sku,v.size,v.status AS variant_status,p.id AS product_id,p.product_code,p.name AS product_name,p.status AS product_status,c.name AS category,v.cost_price,v.sale_price,COALESCE(s.stock,0) AS stock,(SELECT pi.id FROM product_images pi WHERE pi.product_id=p.id AND (pi.variant_id=v.id OR pi.variant_id IS NULL) ORDER BY pi.variant_id DESC,pi.is_primary DESC,pi.sort_order,pi.id LIMIT 1) AS image_id
 FROM product_variants v
 JOIN products p ON p.id=v.product_id
 LEFT JOIN categories c ON c.id=p.category_id
 LEFT JOIN inventory_stock s ON s.variant_id=v.id
 WHERE (?='%%' OR p.name LIKE ? OR p.product_code LIKE ? OR v.sku LIKE ? OR v.size LIKE ?)
 AND (?='' OR c.name=?)
 AND (?='' OR v.size=?)
 AND (?='all' OR p.status=?)

 ORDER BY p.name,v.id`
 const rows=db.prepare(sql).all(q,q,q,q,q,category,category,size,size,status,status) as Array<any>
 const actual=rows.map(r=>({...r,ledger_stock:Number(r.stock||0),stock:physicalImageCount(r.variant_id,r.product_id)}))
 return actual.filter(r=>state==='all'||(state==='out'&&r.stock===0)||(state==='low'&&r.stock>0&&r.stock<=threshold)||(state==='ok'&&r.stock>threshold))
}

type ExplorerImage={id:number;file_name:string;file_path:string;exists:boolean}
type ExplorerVariant={variant_id:number;sku:string;size:string;cost_price:number;sale_price:number;ledger_stock:number;stock:number;images:ExplorerImage[]}
type ExplorerProduct={product_id:number;product_code:string;product_name:string;category:string|null;product_status:string;stock:number;variants:ExplorerVariant[]}

function physicalImageCount(variantId:number,productId:number){return actualImages(variantId,productId).filter(x=>x.exists).length}
function actualImages(variantId:number,productId:number):ExplorerImage[]{
 const rows=db.prepare(`SELECT id,file_path FROM product_images WHERE product_id=? AND variant_id=? ORDER BY sort_order,id`).all(productId,variantId) as Array<{id:number;file_path:string}>
 return rows.map(x=>({...x,file_name:x.file_path.split(/[\\/]/).pop()||x.file_path,exists:fs.existsSync(x.file_path)}))
}

export function inventoryExplorer(filters:Pick<InventoryFilters,'search'|'category'|'size'|'status'>={}){
 const rows=inventoryRows({...filters,state:'all'}) as Array<any>
 const products=new Map<number,ExplorerProduct>()
 for(const r of rows){
  const images=actualImages(r.variant_id,r.product_id)
  const registered=images.filter(x=>x.exists)
  const stock=registered.length
  let product=products.get(r.product_id)
  if(!product){product={product_id:r.product_id,product_code:r.product_code,product_name:r.product_name,category:r.category??null,product_status:r.product_status,stock:0,variants:[]};products.set(r.product_id,product)}
  product.variants.push({variant_id:r.variant_id,sku:r.sku,size:r.size,cost_price:Number(r.cost_price||0),sale_price:Number(r.sale_price||0),ledger_stock:Number(r.ledger_stock||0),stock,images:registered})
  product.stock+=stock
 }
 return [...products.values()]
}

export function inventoryDashboard(){
 const products=inventoryExplorer({status:'active'})
 const variants=products.flatMap(p=>p.variants)
 const positive=products.filter(p=>p.stock>0)
 const sizeMap=new Map<string,number>()
 for(const v of variants)sizeMap.set(v.size,(sizeMap.get(v.size)??0)+v.stock)
 const byStockDesc=[...positive].sort((a,b)=>b.stock-a.stock||a.product_name.localeCompare(b.product_name,'vi')).slice(0,5).map(p=>({product_id:p.product_id,product_name:p.product_name,product_code:p.product_code,stock:p.stock}))
 const byStockAsc=[...positive].sort((a,b)=>a.stock-b.stock||a.product_name.localeCompare(b.product_name,'vi')).slice(0,5).map(p=>({product_id:p.product_id,product_name:p.product_name,product_code:p.product_code,stock:p.stock}))
 const sizes=[...sizeMap.entries()].map(([size,stock])=>({size,stock})).sort((a,b)=>b.stock-a.stock||a.size.localeCompare(b.size,'vi'))
 const mismatches=variants.filter(v=>v.ledger_stock!==v.stock).length
 return {stock:variants.reduce((n,v)=>n+v.stock,0),products:products.length,productsInStock:positive.length,skus:variants.length,sizes:sizes.length,outOfStock:variants.filter(v=>v.stock===0).length,topProducts:byStockDesc,lowProducts:byStockAsc,sizeStock:sizes,mismatches,source:'PHYSICAL_IMAGES'}
}

export function inventorySuggestions(search=''){
 const q='%'+search.trim()+'%'
 const rows=db.prepare(`SELECT p.id AS product_id,p.product_code,p.name AS product_name,v.id AS variant_id,v.sku,v.size FROM product_variants v JOIN products p ON p.id=v.product_id WHERE p.status='active' AND v.status='active' AND (?='%%' OR p.name LIKE ? OR p.product_code LIKE ? OR v.sku LIKE ? OR v.size LIKE ?) ORDER BY CASE WHEN p.name LIKE ? OR p.product_code LIKE ? THEN 0 ELSE 1 END,p.name,v.size LIMIT 20`).all(q,q,q,q,q,search.trim()+'%',search.trim()+'%') as Array<{product_id:number;product_code:string;product_name:string;variant_id:number;sku:string;size:string}>
 return rows.map(row=>({...row,stock:physicalImageCount(row.variant_id,row.product_id)}))
}

export function inventoryHistory(limit=200){
 const safe=Number.isInteger(limit)?Math.min(Math.max(limit,1),1000):200
 return db.prepare(`SELECT t.id,t.transaction_type,t.quantity,t.unit_cost,t.note,t.created_at,v.id AS variant_id,v.sku,v.size,p.id AS product_id,p.product_code,p.name AS product_name FROM inventory_transactions t JOIN product_variants v ON v.id=t.variant_id JOIN products p ON p.id=v.product_id ORDER BY t.id DESC LIMIT ?`).all(safe)
}
export function inventoryFilterOptions(){
 return {categories:(db.prepare("SELECT DISTINCT c.name FROM categories c JOIN products p ON p.category_id=c.id ORDER BY c.name").all() as Array<{name:string}>).map(x=>x.name),sizes:(db.prepare("SELECT DISTINCT size FROM product_variants ORDER BY size").all() as Array<{size:string}>).map(x=>x.size)}
}


export function catalogDashboard(){
 const products=inventoryExplorer({status:'active'})
 const variants=products.flatMap(p=>p.variants)
 const categories=new Map<string,number>()
 for(const p of products){const k=p.category||'Chưa phân loại';categories.set(k,(categories.get(k)??0)+1)}
 const missingImages=variants.filter(v=>v.images.length===0).length
 const missingPrices=variants.filter(v=>v.cost_price<=0||v.sale_price<=0).length
 const sizeMap=new Map<string,number>()
 for(const v of variants)sizeMap.set(v.size,(sizeMap.get(v.size)??0)+1)
 return {
  products:products.length,
  skus:variants.length,
  categories:categories.size,
  missingImages,
  missingPrices,
  categoryBreakdown:[...categories.entries()].map(([category,count])=>({category,count})).sort((a,b)=>b.count-a.count||a.category.localeCompare(b.category,'vi')),
  sizeBreakdown:[...sizeMap.entries()].map(([size,count])=>({size,count})).sort((a,b)=>b.count-a.count||a.size.localeCompare(b.size,'vi')),
  mostVariants:[...products].sort((a,b)=>b.variants.length-a.variants.length||a.product_name.localeCompare(b.product_name,'vi')).slice(0,8).map(p=>({product_id:p.product_id,product_name:p.product_name,count:p.variants.length}))
 }
}
