import { useEffect,useState } from 'react'
type Row={variant_id:number;sku:string;size:string;product_code:string;product_name:string;category?:string;stock:number;product_status:string}
type Hist={id:number;transaction_type:string;quantity:number;created_at:string;product_name:string;sku:string;size:string;note?:string}
import BatchImport from './BatchImport'

export default function InventoryView(){
 const [search,setSearch]=useState(''),[state,setState]=useState('all'),[category,setCategory]=useState(''),[size,setSize]=useState(''),[status,setStatus]=useState('all'),[rows,setRows]=useState<Row[]>([]),[history,setHistory]=useState<Hist[]>([]),[showHistory,setShowHistory]=useState(false),[batchProductId,setBatchProductId]=useState<number|null>(null),[categories,setCategories]=useState<string[]>([]),[sizes,setSizes]=useState<string[]>([])
 async function load(){const q=new URLSearchParams({search,state,category,size,status});const r=await fetch('/api/inventory?'+q);if(r.ok)setRows(await r.json())}
 useEffect(()=>{void load()},[search,state,category,size,status])
 useEffect(()=>{fetch('/api/inventory/filter-options').then(r=>r.json()).then(j=>{setCategories(j.categories??[]);setSizes(j.sizes??[])})},[])
 async function toggleHistory(){const next=!showHistory;setShowHistory(next);if(next){const r=await fetch('/api/inventory/history?limit=300');if(r.ok)setHistory(await r.json())}}
 return <section className="panel"><div className="row"><h3>Tồn kho theo SKU</h3><button onClick={toggleHistory}>{showHistory?'ĐÓNG LỊCH SỬ':'LỊCH SỬ TOÀN KHO'}</button></div>
 <div className="filterBar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tên / mã / SKU"/><select value={state} onChange={e=>setState(e.target.value)}><option value="all">Tất cả tồn</option><option value="out">Hết hàng</option><option value="low">Tồn thấp</option><option value="ok">Tồn ổn</option></select><select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Tất cả danh mục</option>{categories.map(x=><option key={x}>{x}</option>)}</select><select value={size} onChange={e=>setSize(e.target.value)}><option value="">Tất cả size</option>{sizes.map(x=><option key={x}>{x}</option>)}</select><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Mọi trạng thái</option><option value="active">Đang bán</option><option value="inactive">Ngưng</option></select></div>
 {!showHistory&&<div className="inventoryTable">{rows.map(r=><div key={r.variant_id}><div><b>{r.product_code} · {r.product_name}</b><small>{r.category||'Chưa phân loại'} · {r.size} · {r.sku}</small></div><div className="inventoryCell"><strong>{r.stock}</strong>{r.product_status==='active'&&<button onClick={()=>setBatchProductId(r.product_id)}>NHẬP</button>}</div></div>)}</div>}{batchProductId&&<BatchImport productId={batchProductId} onDone={()=>{setBatchProductId(null);void load()}}/>}
 {showHistory&&<div className="history">{history.map(h=><div key={h.id}><b>{h.product_name} · {h.size}</b><span>{h.transaction_type==='ADJUST_MINUS'?'-':'+'}{h.quantity}</span><small>{h.created_at} · {h.sku} · {h.transaction_type} · {h.note||'Không ghi chú'}</small></div>)}</div>}
 </section>
}
