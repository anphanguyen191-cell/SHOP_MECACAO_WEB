import { useEffect, useMemo, useState } from 'react'
import InventoryOps from './InventoryOps'
import AddProduct from './AddProduct'
import BatchImport from './BatchImport'

type Health={ok:boolean;version:string;schema:number;database:string}
type ScanSize={size:string;images:string[];suggestedSku:string}
type ScanProduct={name:string;suggestedProductCode:string;sizes:ScanSize[];warnings:string[]}
type ScanResult={mode:string;rootPath:string;productCount:number;products:ScanProduct[]}
type DraftSize=ScanSize&{openingStock:number;sku:string}
type DraftProduct={name:string;productCode:string;category:string;costPrice:number;salePrice:number;variants:DraftSize[]}
type ProductRow={id:number;product_code:string;name:string;category?:string;variant_count:number;total_stock:number}
const demo:ProductRow[]=[
{id:1,product_code:'LG0001',name:'Lửng gái T5',category:'Đồ tole bé gái',variant_count:3,total_stock:12},
{id:2,product_code:'BG0001',name:'Bộ gái hoa',category:'Đồ tole bé gái',variant_count:4,total_stock:7}
]
const nav=['Tổng quan','Sản phẩm','Import kho','Tồn kho']

export default function App(){
 const isDemo=useMemo(()=>location.hostname.endsWith('github.io'),[])
 const [health,setHealth]=useState<Health|null>(null),[active,setActive]=useState('Tổng quan')
 const [products,setProducts]=useState<ProductRow[]>(isDemo?demo:[]),[search,setSearch]=useState('')
 const [root,setRoot]=useState(''),[scan,setScan]=useState<ScanResult|null>(null),[busy,setBusy]=useState(false),[msg,setMsg]=useState('')
 const [draft,setDraft]=useState<DraftProduct|null>(null)
 const [opsProductId,setOpsProductId]=useState<number|null>(null)
 const [showAdd,setShowAdd]=useState(false),[batchProductId,setBatchProductId]=useState<number|null>(null)
 useEffect(()=>{if(isDemo)return;fetch('/api/health').then(r=>r.json()).then(setHealth).catch(()=>setHealth(null))},[isDemo])
 useEffect(()=>{if(isDemo)return;if(active==='Sản phẩm'||active==='Tồn kho')fetch('/api/products?search='+encodeURIComponent(search)).then(r=>r.json()).then(setProducts).catch(()=>setProducts([]))},[active,search,isDemo])
 const mode=isDemo?'DEMO':health?.ok?'LOCAL':'LOCAL / API OFFLINE'
 async function doScan(){if(isDemo){setMsg('DEMO chỉ xem giao diện; quét folder chỉ chạy ở LOCAL.');return}setBusy(true);setMsg('');try{const r=await fetch('/api/store/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rootPath:root})});const j=await r.json();if(!r.ok)throw new Error(j.error);setScan(j)}catch(e){setMsg(e instanceof Error?e.message:'Không thể quét kho')}finally{setBusy(false)}}
 function editProduct(p:ScanProduct){setDraft({name:p.name,productCode:p.suggestedProductCode,category:'',costPrice:0,salePrice:0,variants:p.sizes.map(s=>({...s,sku:s.suggestedSku,openingStock:0}))});setMsg('')}
 function updateVariant(i:number,key:'size'|'sku'|'openingStock',value:string){if(!draft)return;const variants=[...draft.variants];variants[i]={...variants[i],[key]:key==='openingStock'?Math.max(0,Number(value)||0):value};setDraft({...draft,variants})}
 async function commitDraft(){if(!draft||!scan)return;if(isDemo){setMsg('DEMO không ghi dữ liệu.');return}setBusy(true);setMsg('');try{const payload={confirmed:true,product:{rootPath:scan.rootPath,name:draft.name,productCode:draft.productCode,category:draft.category,costPrice:draft.costPrice,salePrice:draft.salePrice,variants:draft.variants.map(v=>({size:v.size,sku:v.sku,openingStock:v.openingStock,images:v.images}))}};const r=await fetch('/api/store/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const j=await r.json();if(!r.ok)throw new Error(j.error);setMsg('Đã import sản phẩm thành công.');setDraft(null)}catch(e){setMsg(e instanceof Error?e.message:'Import thất bại')}finally{setBusy(false)}}
 return <div className="shell">
  <header className="topbar"><div><p className="eyebrow">SHOP MẸ CACAO</p><h1>Quản lý kho</h1></div><span className={'badge '+(mode==='LOCAL'?'local':mode==='DEMO'?'demo':'offline')}>{mode}</span></header>
  <div className="layout"><nav className="sidebar">{nav.map(n=><button key={n} className={active===n?'active':''} onClick={()=>setActive(n)}><strong>{n}</strong></button>)}</nav>
  <main><section className="hero"><p className="eyebrow">V1.0 DEVELOPMENT</p><h2>{active}</h2><p>Product + SKU + Inventory Ledger. Dữ liệu thật chỉ hoạt động ở LOCAL.</p></section>
  {active==='Tổng quan'&&<section className="grid"><article className="card"><span>Schema</span><strong>{health?.schema??100}</strong><p>Inventory v1</p></article><article className="card"><span>Chế độ</span><strong>{mode}</strong><p>{isDemo?'GitHub preview':health?.database??'API offline'}</p></article><article className="card"><span>Nguyên tắc</span><strong>Ledger</strong><p>Không sửa tồn trực tiếp</p></article></section>}
  {(active==='Sản phẩm'||active==='Tồn kho')&&<section className="panel"><div className="row"><h3>{active}</h3><div className="row"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm tên / mã / SKU"/>{active==='Sản phẩm'&&!isDemo&&<button className="primary" onClick={()=>setShowAdd(!showAdd)}>+ SẢN PHẨM</button>}</div></div>{showAdd&&active==='Sản phẩm'&&<AddProduct onDone={()=>{setShowAdd(false);setSearch(' ')}}/>}<div className="productList">{products.map(p=><article className="product clickable" key={p.id} onClick={()=>{if(!isDemo)setOpsProductId(p.id)}}><div><b>{p.product_code}</b><h3>{p.name}</h3><small>{p.category||'Chưa phân loại'} · {p.variant_count} size</small></div><strong>{p.total_stock}<small> tồn</small></strong></article>)}{!products.length&&<p>Chưa có sản phẩm.</p>}</div>{active==='Tồn kho'&&opsProductId&&<button className="primary" onClick={()=>setBatchProductId(opsProductId)}>NHẬP NHIỀU SIZE</button>}{batchProductId&&<BatchImport productId={batchProductId} onDone={()=>{setBatchProductId(null);setSearch(' ')}}/>}{opsProductId&&<InventoryOps productId={opsProductId} onClose={()=>setOpsProductId(null)}/>}</section>}
  {active==='Import kho'&&<section className="panel"><h3>Quét kho hiện hữu</h3><p>Chỉ đọc folder. Không ghi database cho đến khi duyệt.</p><div className="row"><input className="grow" value={root} onChange={e=>setRoot(e.target.value)} placeholder={'Ví dụ: D:\\1-Me CaCao Store'}/><button className="primary" onClick={doScan} disabled={busy}>{busy?'Đang quét...':'QUÉT KHO'}</button></div>{msg&&<p className="notice">{msg}</p>}{scan&&!draft&&<><p><b>{scan.productCount}</b> sản phẩm được phát hiện.</p><div className="productList">{scan.products.map((p,i)=><article className="scanCard" key={p.name+i}><div className="row"><div><b>{p.suggestedProductCode}</b><h3>{p.name}</h3></div><button className="primary" onClick={()=>editProduct(p)}>DUYỆT</button></div>{p.sizes.map(s=><div className="sizeRow" key={s.size}><span>{s.size}</span><small>{s.suggestedSku} · {s.images.length} ảnh</small></div>)}{p.warnings.map(w=><p className="warning" key={w}>{w}</p>)}</article>)}</div></>}
  {draft&&<div className="approval"><h3>Duyệt trước khi lưu</h3><div className="formGrid"><label>Tên sản phẩm<input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label><label>Mã sản phẩm<input value={draft.productCode} onChange={e=>setDraft({...draft,productCode:e.target.value})}/></label><label>Danh mục<input value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value})}/></label><label>Giá nhập<input type="number" min="0" value={draft.costPrice} onChange={e=>setDraft({...draft,costPrice:Number(e.target.value)||0})}/></label><label>Giá bán<input type="number" min="0" value={draft.salePrice} onChange={e=>setDraft({...draft,salePrice:Number(e.target.value)||0})}/></label></div><h4>Size / SKU / tồn đầu</h4>{draft.variants.map((v,i)=><div className="variantEdit" key={i}><input value={v.size} onChange={e=>updateVariant(i,'size',e.target.value)}/><input value={v.sku} onChange={e=>updateVariant(i,'sku',e.target.value)}/><input type="number" min="0" value={v.openingStock} onChange={e=>updateVariant(i,'openingStock',e.target.value)}/><small>{v.images.length} ảnh</small></div>)}<div className="row actions"><button onClick={()=>setDraft(null)}>QUAY LẠI</button><button className="primary" disabled={busy} onClick={commitDraft}>{busy?'ĐANG LƯU...':'XÁC NHẬN & LƯU'}</button></div></div>}</section>}
  </main></div></div>
}
