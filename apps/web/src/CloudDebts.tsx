import {useEffect,useState} from 'react'
import {cloudRpc} from './cloudClient'
export default function CloudDebts({onOpen}:{onOpen:(id:string)=>void}){
 const [rows,setRows]=useState<any[]>([]),[error,setError]=useState('')
 async function read(){try{setRows(await cloudRpc('mc_v7_debts'));setError('')}catch(e){setError((e as Error).message)}}
 useEffect(()=>{void read()},[])
 return <section className="panel"><h2>Công nợ hiện tại</h2><p role="status">{error}</p><button disabled={!navigator.onLine} onClick={()=>void read()}>Đọc lại công nợ</button>{rows.map(o=><article className="cloudOrder" key={o.orderId}><strong>{o.orderId.slice(0,8)} · {o.orderStatus}</strong><p>Còn thu {Number(o.due).toLocaleString('vi-VN')} ₫ · cần hoàn {Number(o.refundDue).toLocaleString('vi-VN')} ₫</p><button onClick={()=>onOpen(o.orderId)}>Mở tiền / giao hàng</button></article>)}</section>
}
