import CustomersView from './CustomersView'
import {cloudCommand} from './cloudClient'
export default function CloudCustomers({rows,editable,onChanged}:{rows:any[];editable:boolean;onChanged:()=>Promise<void>}){
 return <CustomersView sourceRows={rows} editable={editable} onSave={async(customer,allowDuplicate)=>{const saved=await cloudCommand('customer.save',{...customer,id:customer.id||crypto.randomUUID(),version:customer.version||0,allowDuplicate});await onChanged();return saved}}/>
}
