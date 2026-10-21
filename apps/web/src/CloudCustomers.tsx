import CustomersView,{CustomerQueuedSave,type CustomerRequest} from './CustomersView'
import {cloudCommand} from './cloudClient'
export default function CloudCustomers({rows,requests=[],editable,onChanged,onOrder}:{rows:any[];requests?:CustomerRequest[];editable:boolean;onChanged:()=>Promise<void>;onOrder?:(id:string)=>void}){
 return <CustomersView requests={requests} historyCloud onOpenOrder={onOrder} sourceRows={rows} editable={editable} onSave={async(customer,allowDuplicate)=>{const saved=await cloudCommand('customer.request',{...customer,id:customer.id||crypto.randomUUID(),version:customer.version||0,allowDuplicate});void onChanged().catch(()=>{});throw new CustomerQueuedSave(saved.requestKey,saved.customerId)}}/>
}
