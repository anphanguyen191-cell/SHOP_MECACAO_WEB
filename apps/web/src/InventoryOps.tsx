import { useEffect, useState } from 'react'

type Variant={id:number;sku:string;size:string;stock:number}
type Detail={product:{id:number;product_code:string;name:string};variants:Variant[]}
type History={id:number;transaction_type:string;quantity:number;note?:string;created_at:string}

export default function InventoryOps({productId,onClose}:{productId:number;onClose:()=>void}){
 const [detail,setDetail]=useState<Detail|null>(null),[variantId,setVariantId]=useState(0),[qty,setQty]=useState(1)
 const [cost,setCost]=useState(0),[note,setNote]=useState(''),[rows,setRows]=useState<History[]>([]),[msg,setMsg]=useState('')
 async function load(){const r=await fetch('/api/products/'+productId);const j=await r.json();if(r.ok){setDetail(j);setVariantId((v)=>v||j.variants?.[0]?.id||0)}}
 useEffect(()=>{void load()},[productId])
 async function mutate(kind:'import'|'plus'|'minus'){
  const url=kind==='import'?'/api/inventory/import':'/api/inventory/adjust'
  const body=kind==='import'?{variantId,quantity:qty,unitCost:cost,note}:{variantId,quantity:qty,direction:kind==='minus'?'minus':'plus',note}
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json()
  setMsg(r.ok?'Đã ghi nhận biến động kho.':j.error||'Không thể cập nhật kho');if(r.ok)await load()
 }
 async function loadHistory(){const r=await fetch('/api/inventory/history/'+variantId);if(r.ok)setRows(await r.json())}
 if(!detail)return <div className="approval">Đang tải...</div>
 return <div className="approval"><div className="row"><div><b>{detail.product.product_code}</b><h3>{detail.product.name}</h3></div><button onClick={onClose}>ĐÓNG</button></div>
 <label>Size / SKU<select value={variantId} onChange={e=>setVariantId(Number(e.target.value))}>{detail.variants.map(v=><option key={v.id} value={v.id}>{v.size} · {v.sku} · tồn {v.stock}</option>)}</select></label>
 <div className="formGrid"><label>Số lượng<input type="number" min="1" value={qty} onChange={e=>setQty(Math.max(1,Number(e.target.value)||1))}/></label><label>Giá nhập<input type="number" min="0" value={cost} onChange={e=>setCost(Math.max(0,Number(e.target.value)||0))}/></label><label>Ghi chú<input value={note} onChange={e=>setNote(e.target.value)}/></label></div>
 <div className="inventoryActions"><button className="primary" onClick={()=>mutate('import')}>NHẬP KHO +</button><button onClick={()=>mutate('plus')}>ĐIỀU CHỈNH +</button><button onClick={()=>mutate('minus')}>ĐIỀU CHỈNH -</button><button onClick={loadHistory}>LỊCH SỬ</button></div>{msg&&<p className="notice">{msg}</p>}
 {rows.length>0&&<div className="history">{rows.map(h=><div key={h.id}><b>{h.transaction_type}</b><span>{h.transaction_type==='ADJUST_MINUS'?'-':'+'}{h.quantity}</span><small>{h.created_at} · {h.note||'Không ghi chú'}</small></div>)}</div>}</div>
}
