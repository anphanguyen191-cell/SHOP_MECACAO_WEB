/** sales_orders intentionally stays DRAFT after a sale so SOLD evidence and the
 * mutable order row are distinct. The confirmation table is authoritative for
 * the user-facing state; never count or enable a confirmed order as a draft. */
export function effectiveCloudOrders(orders:any[],confirmations:any[]){
 const sold=new Set(confirmations.map(c=>String(c.order_id)))
 return orders.map(order=>sold.has(String(order.id))?{...order,status:'SOLD'}:order)
}
export function cloudOrderCounts(orders:any[]){
 return {
  drafts:orders.filter(order=>order.status==='DRAFT').length,
  sold:orders.filter(order=>order.status==='SOLD').length,
  cancelled:orders.filter(order=>order.status==='CANCELLED_DRAFT').length
 }
}
