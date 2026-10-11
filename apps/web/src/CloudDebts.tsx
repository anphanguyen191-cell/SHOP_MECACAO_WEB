import {useEffect,useRef,useState} from 'react'
import {cloudRpc} from './cloudClient'
export default function CloudDebts({onOpen,refresh}:{refresh?:unknown;onOpen:(id:string)=>void}){
 const [rows,setRows]=useState<any[]>([]),[error,setError]=useState('')
 const revision=useRef(0)
 async function read(){const request=++revision.current;try{const rows=await cloudRpc('mc_v7_debts');if(request===revision.current){setRows(rows);setError('')}}catch(e){if(request===revision.current)setError((e as Error).message)}}
 useEffect(()=>{void read();return()=>{revision.current++}},[refresh])
 return <section className="panel"><h2>Công nợ hiện tại</h2><p role="status">{error}</p><button disabled={!navigator.onLine} onClick={()=>void read()}>Đọc lại công nợ</button>{rows.map(o=><article className="cloudOrder" key={o.orderId}><strong>{o.orderId.slice(0,8)} · {o.orderStatus}</strong><p>Còn thu {Number(o.due).toLocaleString('vi-VN')} ₫ · cần hoàn {Number(o.refundDue).toLocaleString('vi-VN')} ₫</p><button onClick={()=>onOpen(o.orderId)}>Mở tiền / giao hàng</button></article>)}</section>
}
