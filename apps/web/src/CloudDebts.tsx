import {DebtsView} from './OrderFinance'
import {cloudRpc} from './cloudClient'
const read=()=>cloudRpc<any[]>('mc_v7_debts')
export default function CloudDebts({onOpen,refresh}:{refresh?:unknown;onOpen:(id:string)=>void}){return <DebtsView onOrder={onOpen} source={read} refresh={refresh}/>}
