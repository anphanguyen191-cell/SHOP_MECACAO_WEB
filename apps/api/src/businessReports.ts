import {DatabaseSync} from 'node:sqlite'
import {financeService} from './orderFinance.js'
import {SalesError} from './salesDrafts.js'

export function reportRange(from:unknown,to:unknown){
 const valid=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number(v.slice(0,4))>=2000&&Number(v.slice(0,4))<=2100&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v
 if(!valid(from)||!valid(to)||String(from)>String(to))throw new SalesError('Chọn ngày hợp lệ từ năm 2000 đến 2100; ngày bắt đầu không sau ngày kết thúc')
 const start=new Date(String(from)+'T00:00:00+07:00'),end=new Date(String(to)+'T00:00:00+07:00');end.setUTCDate(end.getUTCDate()+1)
 return {from:String(from),to:String(to),start:start.toISOString().slice(0,19).replace('T',' '),end:end.toISOString().slice(0,19).replace('T',' '),timezone:'Asia/Ho_Chi_Minh'}
}
const big=(v:unknown)=>BigInt(Number(v??0))
export function businessReports(db:DatabaseSync){return {summary(from:unknown,to:unknown){
 const range=reportRange(from,to),finance=financeService(db)
 db.exec('BEGIN')
 try{
 const sold=db.prepare('SELECT * FROM sales_confirmations WHERE created_at>=? AND created_at<? ORDER BY created_at DESC,order_id').all(range.start,range.end)
 const orders=sold.map(o=>{
  const units=db.prepare('SELECT snapshot FROM sales_units WHERE order_id=? ORDER BY image_id').all(o.order_id!),contact=db.prepare('SELECT recipient_name,phone,shipping_fee FROM order_contacts WHERE order_id=?').get(o.order_id!),s=finance.summary(String(o.order_id))
  const snapshots=units.map(u=>JSON.parse(String(u.snapshot))),unknownCosts=snapshots.filter(u=>u.unit_cost===null||u.unit_cost===undefined).length,cost=snapshots.reduce((n,u)=>n+big(u.unit_cost),0n),shipping=big(contact?.shipping_fee)
  return {id:String(o.order_id),soldAt:String(o.created_at),recipientName:String(contact?.recipient_name??''),phone:String(contact?.phone??''),quantity:units.length,subtotal:String(o.subtotal),discount:String(o.discount),goodsTotal:String(o.total),shipping:String(shipping),payableTotal:String(big(o.total)+shipping),knownCost:String(cost),unknownCosts,grossMargin:unknownCosts?null:String(big(o.total)-cost),creditToDate:String(s.credit),adjustedToDate:String(s.adjustedTotal),dueNow:String(s.due),refundDueNow:String(s.refundDue)}
 })
 const entries=db.prepare('SELECT e.*,c.recipient_name FROM finance_entries e LEFT JOIN order_contacts c ON c.order_id=e.order_id WHERE e.created_at>=? AND e.created_at<? ORDER BY e.created_at DESC,e.id').all(range.start,range.end).map(e=>({id:String(e.id),orderId:String(e.order_id),kind:String(e.kind),method:String(e.method),amount:String(e.amount),note:String(e.note),createdAt:String(e.created_at),recipientName:String(e.recipient_name??'')}))
 const sum=(key:keyof typeof orders[number])=>orders.reduce((n,o)=>n+BigInt(String(o[key])),0n).toString()
 const entrySum=(kind:string)=>entries.filter(e=>e.kind===kind).reduce((n,e)=>n+BigInt(e.amount),0n)
 const debts=finance.debts(),unknownCosts=orders.reduce((n,o)=>n+o.unknownCosts,0),receipts=entrySum('RECEIPT'),refunds=entrySum('REFUND')
 const productMap=new Map<string,{name:string;code:string;size:string;quantity:number;grossSales:bigint}>()
 for(const o of sold)for(const u of db.prepare('SELECT snapshot FROM sales_units WHERE order_id=?').all(o.order_id!)){const s=JSON.parse(String(u.snapshot)),key=String(s.variant_id),p=productMap.get(key)??{name:s.product_name,code:s.product_code,size:s.size,quantity:0,grossSales:0n};p.quantity++;p.grossSales+=big(s.unit_price);productMap.set(key,p)}
 const result={range,generatedAt:new Date().toISOString(),totals:{orders:orders.length,quantity:orders.reduce((n,o)=>n+o.quantity,0),subtotal:sum('subtotal'),discount:sum('discount'),goodsTotal:sum('goodsTotal'),shipping:sum('shipping'),payableTotal:sum('payableTotal'),knownCost:sum('knownCost'),unknownCosts,grossMargin:unknownCosts?null:orders.reduce((n,o)=>n+BigInt(o.grossMargin!),0n).toString(),receipts:receipts.toString(),refunds:refunds.toString(),netCash:(receipts-refunds).toString(),credits:entrySum('CREDIT').toString(),dueNow:debts.reduce((n,o)=>n+BigInt(o.due),0n).toString(),refundDueNow:debts.reduce((n,o)=>n+BigInt(o.refundDue),0n).toString(),debtOrders:debts.length},orders,entries,products:[...productMap.values()].map(p=>({...p,grossSales:p.grossSales.toString()})).sort((a,b)=>b.quantity-a.quantity||a.code.localeCompare(b.code))}
 db.exec('COMMIT');return result
 }catch(e){db.exec('ROLLBACK');throw e}
}}}
export function csvText(rows:unknown[][]){
 const cell=(v:unknown)=>{let s=String(v??'');if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}
 return '\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n'
}
