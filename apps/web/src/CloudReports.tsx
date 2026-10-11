import BusinessReports from './BusinessReports'
import {cloudRpc} from './cloudClient'
const source={read:({from,to}:{from:string;to:string})=>cloudRpc('mc_v7_report',{p_from:from,p_to:to})}
export default function CloudReports({onOrder=()=>{}}:{onOrder?:(id:string)=>void}){return <BusinessReports source={source} onOrder={onOrder}/>}
