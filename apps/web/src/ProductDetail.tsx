import { useEffect,useState } from 'react'
type Data={product:any;variants:any[];images:any[]}
export default function ProductDetail({productId,onClose}:{productId:number,onClose:()=>void}){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState('')
 useEffect(()=>{fetch('/api/products/'+productId).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error);setData(j)}).catch(e=>setError(e.message))},[productId])
 if(error)return <section className="approval"><button onClick={onClose}>QUAY LẠI</button><p className="warning">{error}</p></section>
 if(!data)return <section className="approval">Đang tải sản phẩm...</section>
 const p=data.product
 return <section className="approval productDetail"><div className="row"><div><b>{p.product_code}</b><h2>{p.name}</h2><small>{p.category||'Chưa phân loại'} · {p.status}</small></div><button onClick={onClose}>ĐÓNG</button></div>
 <div className="productGallery">{data.images.length?data.images.map((im:any)=><a key={im.id} href={'/api/images/'+im.id} target="_blank" rel="noreferrer"><img src={'/api/images/'+im.id} alt={p.name}/></a>):<div className="emptyGallery">Sản phẩm này chưa có ảnh trong database.</div>}</div>
 <h3>Tồn & giá theo Size</h3><div className="detailTable">{data.variants.map((v:any)=><div key={v.id}><div><b>{v.size}</b><small>{v.sku}</small></div><span>Giá nhập <b>{Number(v.cost_price).toLocaleString('vi-VN')}đ</b></span><span>Giá bán <b>{Number(v.sale_price).toLocaleString('vi-VN')}đ</b></span><strong>{v.stock} ảnh tồn thực tế</strong>{v.ledger_stock!==v.stock&&<small className="warning">Sổ sách: {v.ledger_stock} · lệch {Math.abs(v.ledger_stock-v.stock)}</small>}</div>)}</div></section>
}
