import type {DatabaseSync} from 'node:sqlite'
import {financeService} from './orderFinance.js'
import {SalesError} from './salesDrafts.js'
const registered=new WeakSet<DatabaseSync>()

/** Queries the entire history before paging. Customer identity is an explicit FK,
 * never inferred from a recipient name or a phone number. */
export function salesHistory(db:DatabaseSync,raw:{offset?:unknown;limit?:unknown;q?:unknown;status?:unknown;customerId?:unknown}={}){
 if(!registered.has(db)){db.function('mc_vi_lower',{deterministic:true},value=>String(value??'').toLocaleLowerCase('vi'));registered.add(db)}
 const offset=Number(raw.offset??0),limit=Number(raw.limit??50),q=String(raw.q??'').trim().toLocaleLowerCase('vi'),status=String(raw.status??'all'),customerId=String(raw.customerId??'')
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100||q.length>100||customerId.length>100||!['all','DRAFT','SOLD','CANCELLED_DRAFT'].includes(status))throw new SalesError('Bộ lọc hoặc trang lịch sử không hợp lệ')
 const hasSales=!!db.prepare("SELECT 1 FROM sqlite_master WHERE name='sales_confirmations'").get()
 const effective=hasSales?"CASE WHEN EXISTS(SELECT 1 FROM sales_confirmations sc WHERE sc.order_id=o.id) THEN 'SOLD' ELSE o.status END":'o.status'
 const where=`(?='' OR c.customer_id=?) AND (?='all' OR ${effective}=?) AND (?='' OR instr(mc_vi_lower(o.id||' '||COALESCE(c.recipient_name,'')||' '||COALESCE(c.phone,'')),?)>0)`
 const params=[customerId,customerId,status,status,q,q]
 db.exec('BEGIN')
 try{
  const total=Number(db.prepare(`SELECT count(*) n FROM sales_orders o LEFT JOIN order_contacts c ON c.order_id=o.id WHERE ${where}`).get(...params)!.n)
  const rows=db.prepare(`SELECT o.id,${effective} status,o.version,o.discount,o.note,o.created_at,o.updated_at,COUNT(i.image_id) quantity,COALESCE(SUM(i.unit_price),0) subtotal,COALESCE(SUM(i.unit_price),0)-o.discount total,COALESCE(SUM(i.unit_price),0)-o.discount+COALESCE(c.shipping_fee,0) payableTotal,COALESCE(c.recipient_name,'') recipientName,COALESCE(c.phone,'') phone FROM sales_orders o LEFT JOIN order_contacts c ON c.order_id=o.id LEFT JOIN sales_order_images i ON i.order_id=o.id WHERE ${where} GROUP BY o.id ORDER BY o.created_at DESC,o.id DESC LIMIT ? OFFSET ?`).all(...params,limit,offset)
  const ids=customerId&&hasSales?db.prepare('SELECT o.id FROM sales_orders o JOIN order_contacts c ON c.order_id=o.id JOIN sales_confirmations sc ON sc.order_id=o.id WHERE c.customer_id=?').all(customerId):[]
  const finance=financeService(db),summaries=ids.map(r=>finance.summary(String(r.id)))
  const sum=(key:'receipts'|'refunds'|'due'|'refundDue')=>{const n=summaries.reduce((n,s)=>n+BigInt(s[key]),0n);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw new SalesError('Tổng tiền vượt giới hạn an toàn');return Number(n)}
  const summary={soldOrders:ids.length,receipts:sum('receipts'),refunds:sum('refunds'),due:sum('due'),refundDue:sum('refundDue')}
  db.exec('COMMIT');return {rows,total,offset,limit,summary}
 }catch(e){if(db.isTransaction)db.exec('ROLLBACK');throw e}
}
