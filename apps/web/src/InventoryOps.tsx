import { useEffect, useState } from 'react'

type Variant={id:number;sku:string;size:string;stock:number}
type ImageRow={id:number;variant_id?:number|null;is_primary:number}
type Detail={product:{id:number;product_code:string;name:string;status:'active'|'inactive'};variants:Variant[];images:ImageRow[]}
type History={id:number;transaction_type:string;quantity:number;note?:string;created_at:string}

export default function InventoryOps({productId,onClose}:{productId:number;onClose:()=>void}){
 const [detail,setDetail]=useState<Detail|null>(null),[variantId,setVariantId]=useState(0),[qty,setQty]=useState(1)
 const [cost,setCost]=useState(0),[note,setNote]=useState(''),[rows,setRows]=useState<History[]>([]),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false)
 async function load(preserveVariant=false){const r=await fetch('/api/products/'+productId);const j=await r.json();if(r.ok){setDetail(j);setVariantId(current=>preserveVariant&&j.variants?.some((v:Variant)=>v.id===current)?current:(j.variants?.[0]?.id||0))}}
 useEffect(()=>{void load()},[productId])
 async function mutate(kind:'import'|'plus'|'minus'){
  if(busy)return;setBusy(true);setMsg('')
  try{const url=kind==='import'?'/api/inventory/import':'/api/inventory/adjust'
  const body=kind==='import'?{variantId,quantity:qty,unitCost:cost,note}:{variantId,quantity:qty,direction:kind==='minus'?'minus':'plus',note}
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json()
  setMsg(r.ok?'Đã ghi nhận biến động kho.':j.error||'Không thể cập nhật kho');if(r.ok){await load(true);if(rows.length)await loadHistory()}}catch(e){setMsg(e instanceof Error?e.message:'Không thể cập nhật kho')}finally{setBusy(false)}
 }
 async function toggleStatus(){const next=detail?.product.status==='active'?'inactive':'active';const r=await fetch('/api/products/'+productId+'/status',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:next})});const j=await r.json();setMsg(r.ok?(next==='inactive'?'Đã ngưng sản phẩm.':'Đã kích hoạt sản phẩm.'):j.error||'Không thể đổi trạng thái');if(r.ok)await load(true)}
 async function loadHistory(){const r=await fetch('/api/inventory/history/'+variantId);if(r.ok)setRows(await r.json())}
 if(!detail)return <div className="approval">Đang tải...</div>
 return <div className="approval"><div className="row"><div><b>{detail.product.product_code}</b><h3>{detail.product.name}</h3></div><div className="inventoryCell"><button onClick={toggleStatus}>{detail.product.status==='active'?'NGƯNG SẢN PHẨM':'KÍCH HOẠT'}</button><button onClick={onClose}>ĐÓNG</button></div></div>
 {detail.images?.length>0&&<div className="imageStrip">{detail.images.slice(0,6).map(img=><img key={img.id} src={'/api/images/'+img.id} alt={detail.product.name} onError={e=>{e.currentTarget.style.display='none'}}/>)}</div>}
 <label>Size / SKU<select value={variantId} onChange={e=>setVariantId(Number(e.target.value))}>{detail.variants.map(v=><option key={v.id} value={v.id}>{v.size} · {v.sku} · tồn {v.stock}</option>)}</select></label>
 <div className="formGrid"><label>Số lượng<input type="number" min="1" value={qty} onChange={e=>setQty(Math.max(1,Math.trunc(Number(e.target.value)||1)))}/></label><label>Giá nhập<input type="number" min="0" value={cost} onChange={e=>setCost(Math.max(0,Number(e.target.value)||0))}/></label><label>Ghi chú<input value={note} onChange={e=>setNote(e.target.value)}/></label></div>
 <div className="inventoryActions"><button className="primary" disabled={busy||detail.product.status!=='active'} onClick={()=>mutate('import')}>NHẬP KHO +</button><button disabled={busy||detail.product.status!=='active'} onClick={()=>mutate('plus')}>ĐIỀU CHỈNH +</button><button disabled={busy||detail.product.status!=='active'} onClick={()=>mutate('minus')}>ĐIỀU CHỈNH -</button><button onClick={loadHistory}>LỊCH SỬ</button></div>{msg&&<p className="notice">{msg}</p>}
 {rows.length>0&&<div className="history">{rows.map(h=><div key={h.id}><b>{h.transaction_type}</b><span>{h.transaction_type==='ADJUST_MINUS'?'-':'+'}{h.quantity}</span><small>{h.created_at} · {h.note||'Không ghi chú'}</small></div>)}</div>}</div>
}
