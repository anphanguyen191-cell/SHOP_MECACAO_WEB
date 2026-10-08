import { inventoryDashboard, inventoryRows } from './inventoryQuery.js'
import { getLowStockThreshold } from './settings.js'
export function dashboardSummary(){
 const threshold=getLowStockThreshold()
 const summary=inventoryDashboard()
 const attention=inventoryRows({status:'active',state:'low',threshold}).concat(inventoryRows({status:'active',state:'out',threshold})).sort((a:any,b:any)=>a.stock-b.stock).slice(0,12)
 const lowStock=inventoryRows({status:'active',state:'low',threshold}).length
 return {products:summary.products,skus:summary.skus,stock:summary.stock,outOfStock:summary.outOfStock,lowStock,lowStockThreshold:threshold,attention,source:'PHYSICAL_IMAGES',mismatches:summary.mismatches}
}
