import { inventoryDashboard, inventoryExplorer } from './inventoryQuery.js'
import { getLowStockThreshold } from './settings.js'
export function dashboardSummary(){
 const threshold=getLowStockThreshold()
 const products=inventoryExplorer({status:'active'})
 const summary=inventoryDashboard(products)
 const rows=products.flatMap(p=>p.variants.map(v=>({...v,product_id:p.product_id,product_name:p.product_name,product_code:p.product_code})))
 const attention=rows.filter(v=>v.stock<=threshold).sort((a,b)=>a.stock-b.stock).slice(0,12)
 const lowStock=rows.filter(v=>v.stock>0&&v.stock<=threshold).length
 return {products:summary.products,skus:summary.skus,stock:summary.stock,outOfStock:summary.outOfStock,lowStock,lowStockThreshold:threshold,attention,source:'PHYSICAL_IMAGES',mismatches:summary.mismatches}
}
