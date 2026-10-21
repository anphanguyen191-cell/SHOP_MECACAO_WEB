import {useCallback} from 'react'
import {DebtsView} from './OrderFinance'
import {cloudRpc} from './cloudClient'
type OrderContact={order_id:string;customer_id?:string|null;recipient_name?:string;phone?:string}
export default function CloudDebts({onOpen,refresh,contacts}:{refresh?:unknown;onOpen:(id:string)=>void;contacts:OrderContact[]}){
 const read=useCallback(async()=>{
  // Finance summaries intentionally contain money, not contact fields. Join the
  // already loaded snapshot by order ID; never infer customer identity by name.
  const rows=await cloudRpc<any[]>('mc_v7_debts')
  const byOrder=new Map(contacts.map(c=>[c.order_id,c]))
  return rows.map(row=>{const contact=byOrder.get(row.orderId);return {...row,customerId:contact?.customer_id??null,recipientName:contact?.recipient_name??'',phone:contact?.phone??''}})
 },[contacts])
 return <DebtsView onOrder={onOpen} source={read} refresh={refresh}/>
}
