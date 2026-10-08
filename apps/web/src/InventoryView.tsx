import { useEffect,useMemo,useState } from 'react'
import ProductDetail from './ProductDetail'

type Img={id:number;file_name:string;file_path:string;exists:boolean}
type Variant={variant_id:number;sku:string;size:string;cost_price:number;sale_price:number;ledger_stock:number;stock:number;images:Img[]}
type Product={product_id:number;product_code:string;product_name:string;category?:string|null;product_status:string;stock:number;variants:Variant[]}
type Dash={stock:number;products:number;productsInStock:number;skus:number;sizes:number;outOfStock:number;mismatches:number;topProducts:Array<{product_id:number;product_name:string;stock:number}>;lowProducts:Array<{product_id:number;product_name:string;stock:number}>;sizeStock:Array<{size:string;stock:number}>}
type Suggestion={product_id:number;product_code:string;product_name:string;variant_id:number;sku:string;size:string}

export default function InventoryView(){
 const [search,setSearch]=useState(''),[category,setCategory]=useState(''),[size,setSize]=useState(''),[products,setProducts]=useState<Product[]>([]),[dashboard,setDashboard]=useState<Dash|null>(null),[categories,setCategories]=useState<string[]>([]),[sizes,setSizes]=useState<string[]>([]),[expandedProducts,setExpandedProducts]=useState<Set<number>>(new Set()),[expandedVariants,setExpandedVariants]=useState<Set<number>>(new Set()),[selectedImages,setSelectedImages]=useState<Set<number>>(new Set()),[suggestions,setSuggestions]=useState<Suggestion[]>([]),[detailProductId,setDetailProductId]=useState<number|null>(null)
 async function load(){
  const q=new URLSearchParams({search,category,size,status:'active'})
  const [tree,dash]=await Promise.all([fetch('/api/inventory/explorer?'+q).then(r=>r.json()),fetch('/api/inventory/dashboard').then(r=>r.json())])
  setProducts(Array.isArray(tree)?tree:[]);setDashboard(dash)
 }
 useEffect(()=>{void load()},[search,category,size])
 useEffect(()=>{fetch('/api/inventory/filter-options').then(r=>r.json()).then(j=>{setCategories(j.categories??[]);setSizes(j.sizes??[])})},[])
 useEffect(()=>{if(search.trim().length<1){setSuggestions([]);return}const t=setTimeout(()=>fetch('/api/inventory/suggestions?search='+encodeURIComponent(search)).then(r=>r.json()).then(j=>setSuggestions(Array.isArray(j)?j:[])),180);return()=>clearTimeout(t)},[search])
 const maxProduct=useMemo(()=>Math.max(1,...(dashboard?.topProducts??[]).map(x=>x.stock)),[dashboard])
 function toggle(set:Set<number>,id:number,setter:(v:Set<number>)=>void){const n=new Set(set);n.has(id)?n.delete(id):n.add(id);setter(n)}
 function chooseSuggestion(s:Suggestion){setSearch(s.product_name);setExpandedProducts(new Set([s.product_id]));setExpandedVariants(new Set([s.variant_id]));setSuggestions([])}
 function chooseImage(id:number){toggle(selectedImages,id,setSelectedImages)}
 return <section className="inventoryPage">
  <div className="inventoryHeading"><div><p className="eyebrow">KHO HÀNG THỰC TẾ</p><h2>Tồn kho</h2><p>Tồn được đối chiếu theo ảnh vật lý của từng Size. Mở cây kho để xem và chọn từng sản phẩm.</p></div>{dashboard?.mismatches? <span className="reconcileAlert">⚠ {dashboard.mismatches} Size lệch ledger/ảnh</span>:<span className="okPill">✓ Ảnh kho đã đối chiếu</span>}</div>
  <div className="inventoryMetrics">
   <article><span>TỔNG TỒN</span><strong>{dashboard?.stock??'—'}</strong><small>sản phẩm theo ảnh thực tế</small></article>
   <article><span>SẢN PHẨM</span><strong>{dashboard?.products??'—'}</strong><small>{dashboard?.productsInStock??0} mẫu còn hàng</small></article>
   <article><span>SIZE / SKU</span><strong>{dashboard?.skus??'—'}</strong><small>{dashboard?.sizes??0} tên Size</small></article>
   <article><span>HẾT HÀNG</span><strong>{dashboard?.outOfStock??'—'}</strong><small>Size không còn ảnh hàng</small></article>
  </div>
  <div className="inventoryInsights">
   <article className="insightCard"><h3>Tồn nhiều nhất</h3>{dashboard?.topProducts?.map((x,i)=><button key={x.product_id} onClick={()=>{setSearch(x.product_name);setExpandedProducts(new Set([x.product_id]))}}><b>{i+1}. {x.product_name}</b><strong>{x.stock}</strong></button>)}</article>
   <article className="insightCard"><h3>Tồn thấp còn hàng</h3>{dashboard?.lowProducts?.map((x,i)=><button key={x.product_id} onClick={()=>{setSearch(x.product_name);setExpandedProducts(new Set([x.product_id]))}}><b>{i+1}. {x.product_name}</b><strong>{x.stock}</strong></button>)}</article>
   <article className="insightCard sizesInsight"><h3>Tồn thực tế theo sản phẩm</h3><p className="chartCaption">Số ảnh vật lý còn tồn của mỗi mẫu, cộng tất cả Size.</p>{dashboard?.topProducts?.length?dashboard.topProducts.map(x=><button className="productStockBar" key={x.product_id} onClick={()=>{setSearch(x.product_name);setExpandedProducts(new Set([x.product_id]))}}><span className="productStockBarLabel"><b title={x.product_name}>{x.product_name}</b><strong>{x.stock} bộ</strong></span><span className="overviewTrack"><span style={{width:(x.stock/maxProduct*100)+'%'}}/></span></button>):<p className="overviewEmpty">Chưa có sản phẩm tồn ảnh vật lý để hiển thị biểu đồ.</p>}</article>
  </div>
  <div className="inventoryFilters">
   <div className="smartSearch"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm tên sản phẩm, mã, SKU hoặc Size..."/>{suggestions.length>0&&<div className="suggestions">{suggestions.map(s=><button key={s.variant_id} onClick={()=>chooseSuggestion(s)}><b>{s.product_name}</b><span>{s.product_code} · Size {s.size} · {s.sku}</span></button>)}</div>}</div>
   <select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Tất cả danh mục</option>{categories.map(x=><option key={x}>{x}</option>)}</select>
   <select value={size} onChange={e=>setSize(e.target.value)}><option value="">Tất cả Size</option>{sizes.map(x=><option key={x}>{x}</option>)}</select>
   {(search||category||size)&&<button className="clearFilter" onClick={()=>{setSearch('');setCategory('');setSize('')}}>XÓA LỌC</button>}
  </div>
  {selectedImages.size>0&&<div className="selectionBar"><b>Đã chọn {selectedImages.size} sản phẩm</b><span>Nền tảng cho gửi khách · đưa vào đơn · chốt đơn</span><button onClick={()=>setSelectedImages(new Set())}>BỎ CHỌN</button></div>}
  <div className="inventoryTree">{products.map(p=>{const open=expandedProducts.has(p.product_id);return <article className="treeProduct" key={p.product_id}>
   <button className="treeProductHead" onClick={()=>toggle(expandedProducts,p.product_id,setExpandedProducts)}><span className="chev">{open?'▼':'▶'}</span><span className="folderIcon">●</span><span className="treeName"><b>{p.product_name}</b><small>{p.product_code} · {p.category||'Chưa phân loại'} · {p.variants.length} Size</small></span><strong>{p.stock}<small> tồn</small></strong></button>
   {open&&<div className="treeSizes">{p.variants.map(v=>{const vOpen=expandedVariants.has(v.variant_id);return <div className="treeVariant" key={v.variant_id}><button className="treeVariantHead" onClick={()=>toggle(expandedVariants,v.variant_id,setExpandedVariants)}><span className="chev">{vOpen?'▼':'▶'}</span><span className="sizeFolder">Size {v.size}</span><small>{v.sku}</small><span className={v.stock===0?'stockZero':'stockGood'}>{v.stock} sản phẩm</span></button>
    {vOpen&&<div className="variantGallery"><div className="galleryMeta"><span><b>{v.stock}</b> ảnh hàng thực tế</span>{v.ledger_stock!==v.stock&&<span className="warning">Ledger {v.ledger_stock} · Ảnh {v.stock}</span>}<button onClick={()=>setDetailProductId(p.product_id)}>CHI TIẾT SẢN PHẨM</button></div><div className="selectableGallery">{v.images.filter(img=>img.exists).map(img=><button key={img.id} className={selectedImages.has(img.id)?'selected':''} onClick={()=>chooseImage(img.id)}><img src={'/api/images/'+img.id} alt={p.product_name+' Size '+v.size}/><span className="imageCheck">{selectedImages.has(img.id)?'✓':''}</span><small>{img.file_name}</small></button>)}{v.stock===0&&<div className="emptySize">Size này hiện không còn ảnh hàng trong kho.</div>}</div></div>}
   </div>})}</div>}
  </article>})}{products.length===0&&<div className="emptyTree">Không tìm thấy sản phẩm phù hợp bộ lọc.</div>}</div>
  {detailProductId&&<ProductDetail productId={detailProductId} onClose={()=>setDetailProductId(null)}/>}
 </section>
}
