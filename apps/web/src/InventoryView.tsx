import { useEffect,useState } from 'react'
type Row={variant_id:number;sku:string;size:string;product_code:string;product_name:string;category?:string;stock:number;product_status:string}
type Hist={id:number;transaction_type:string;quantity:number;created_at:string;product_name:string;sku:string;size:string;note?:string}
export default function InventoryView(){
 const [search,setSearch]=useState(''),[state,setState]=useState('all'),[rows,setRows]=useState<Row[]>([]),[history,setHistory]=useState<Hist[]>([]),[showHistory,setShowHistory]=useState(false)
 async function load(){const r=await fetch('/api/inventory?search='+encodeURIComponent(search)+'&state='+state);if(r.ok)setRows(await r.json())}
 useEffect(()=>{void load()},[search,state])
 async function toggleHistory(){const next=!showHistory;setShowHistory(next);if(next){const r=await fetch('/api/inventory/history?limit=300');if(r.ok)setHistory(await r.json())}}
 return <section className="panel"><div className="row"><h3>Tồn kho theo SKU</h3><button onClick={toggleHistory}>{showHistory?'ĐÓNG LỊCH SỬ':'LỊCH SỬ TOÀN KHO'}</button></div>
 <div className="filterBar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tên / mã / SKU"/><select value={state} onChange={e=>setState(e.target.value)}><option value="all">Tất cả tồn</option><option value="out">Hết hàng</option><option value="low">Tồn thấp</option><option value="ok">Tồn ổn</option></select></div>
 {!showHistory&&<div className="inventoryTable">{rows.map(r=><div key={r.variant_id}><div><b>{r.product_code} · {r.product_name}</b><small>{r.category||'Chưa phân loại'} · {r.size} · {r.sku}</small></div><strong>{r.stock}</strong></div>)}</div>}
 {showHistory&&<div className="history">{history.map(h=><div key={h.id}><b>{h.product_name} · {h.size}</b><span>{h.transaction_type==='ADJUST_MINUS'?'-':'+'}{h.quantity}</span><small>{h.created_at} · {h.sku} · {h.transaction_type} · {h.note||'Không ghi chú'}</small></div>)}</div>}
 </section>
}
