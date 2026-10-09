import { useEffect,useMemo,useRef,useState } from 'react'
import ProductDetail from './ProductDetail'
import {useBooleanPreference} from './uiState'
import InventorySharing,{InventoryImageViewer,type ChosenImage} from './InventorySharing'

type Img={id:number;file_name:string;file_path:string;exists:boolean}
type Variant={variant_id:number;sku:string;size:string;cost_price:number;sale_price:number;ledger_stock:number;stock:number;images:Img[]}
type Product={product_id:number;product_code:string;product_name:string;category?:string|null;product_status:string;stock:number;variants:Variant[]}
type Dash={stock:number;products:number;productsInStock:number;skus:number;sizes:number;outOfStock:number;mismatches:number;topProducts:Array<{product_id:number;product_name:string;stock:number}>;lowProducts:Array<{product_id:number;product_name:string;stock:number}>;sizeStock:Array<{size:string;stock:number}>}
type Suggestion={product_id:number;product_code:string;product_name:string;variant_id:number;sku:string;size:string;stock:number}
const demoVariants=(productId:number,code:string,counts:Array<[string,number]>):Variant[]=>counts.map(([size,stock],i)=>({variant_id:productId*10+i+1,sku:code+'-'+size.replace(' ',''),size,cost_price:0,sale_price:0,ledger_stock:stock,stock,images:[]}))
const DEMO_PRODUCTS:Product[]=[
 {product_id:1,product_code:'LG0001',product_name:'Lửng gái T5',category:'Đồ tole bé gái',product_status:'active',stock:12,variants:demoVariants(1,'LG0001',[['Size 1',5],['Size 2',4],['Size 3',3]])},
 {product_id:2,product_code:'BG0001',product_name:'Bộ gái hoa',category:'Đồ tole bé gái',product_status:'active',stock:7,variants:demoVariants(2,'BG0001',[['Size 1',2],['Size 2',1],['Size 3',1],['Size 4',3]])}
]
const DEMO_DASH:Dash={stock:19,products:2,productsInStock:2,skus:7,sizes:4,outOfStock:0,mismatches:0,topProducts:[{product_id:1,product_name:'Lửng gái T5',stock:12},{product_id:2,product_name:'Bộ gái hoa',stock:7}],lowProducts:[{product_id:2,product_name:'Bộ gái hoa',stock:7},{product_id:1,product_name:'Lửng gái T5',stock:12}],sizeStock:[{size:'Size 1',stock:7},{size:'Size 2',stock:5},{size:'Size 3',stock:4},{size:'Size 4',stock:3}]}

export default function InventoryView({isDemo=false}:{isDemo?:boolean}){
 const [search,setSearch]=useState(''),[category,setCategory]=useState(''),[size,setSize]=useState(''),[products,setProducts]=useState<Product[]>(isDemo?DEMO_PRODUCTS:[]),[dashboard,setDashboard]=useState<Dash|null>(isDemo?DEMO_DASH:null),[categories,setCategories]=useState<string[]>([]),[sizes,setSizes]=useState<string[]>([]),[expandedProducts,setExpandedProducts]=useState<Set<number>>(new Set()),[expandedVariants,setExpandedVariants]=useState<Set<number>>(new Set()),[selectedImages,setSelectedImages]=useState<Set<number>>(new Set()),[suggestions,setSuggestions]=useState<Suggestion[]>([]),[detailProductId,setDetailProductId]=useState<number|null>(null)
 const [stockState,setStockState]=useState<'all'|'in'|'out'|'low'>('all'),[sort,setSort]=useState<'stock_desc'|'stock_asc'|'name'>('stock_desc'),[threshold,setThreshold]=useState(2),[loadError,setLoadError]=useState('')
 const [dashboardExpanded,setDashboardExpanded]=useBooleanPreference('inventory-expanded',true)
 const [loading,setLoading]=useState(!isDemo),[reload,setReload]=useState(0)
 useEffect(()=>{
  if(isDemo){
   const q=search.trim().toLocaleLowerCase('vi')
   const filtered=DEMO_PRODUCTS.map(p=>{
    const matches=p.variants.filter(v=>!size||v.size===size)
    const inProduct=[p.product_name,p.product_code].some(x=>x.toLocaleLowerCase('vi').includes(q))
    const matchingVariants=matches.filter(v=>!q||inProduct||[v.size,v.sku].some(x=>x.toLocaleLowerCase('vi').includes(q)))
    return {...p,variants:matchingVariants,stock:matchingVariants.reduce((n,v)=>n+v.stock,0)}
   }).filter(p=>p.variants.length>0&&(!category||p.category===category))
   setProducts(filtered);setDashboard(DEMO_DASH);setLoadError('')
   return
  }
  let cancelled=false
  const controller=new AbortController()
  setLoading(true);setLoadError('');setProducts([])
  const timer=setTimeout(()=>{
   const q=new URLSearchParams({search,category,size,status:'active'})
   Promise.all([
    fetch('/api/inventory/explorer?'+q,{signal:controller.signal}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error||'Không tải được tồn kho');return j}),
    fetch('/api/inventory/dashboard',{signal:controller.signal}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error||'Không tải được thống kê');return j})
   ]).then(([tree,dash])=>{if(!cancelled){setProducts(Array.isArray(tree)?tree:[]);setDashboard(dash);setLoadError('')}}).catch(e=>{if(!cancelled){setLoadError(e instanceof Error?e.message:'Không đọc được dữ liệu');setProducts([]);setDashboard(null)}}).finally(()=>{if(!cancelled)setLoading(false)})
  },180)
  return()=>{cancelled=true;controller.abort();clearTimeout(timer)}
 },[search,category,size,isDemo,reload])
 useEffect(()=>{
  if(isDemo){setCategories(['Đồ tole bé gái']);setSizes(['Size 1','Size 2','Size 3','Size 4']);return}
  let cancelled=false
  fetch('/api/inventory/filter-options').then(r=>r.json()).then(j=>{if(!cancelled){setCategories(j.categories??[]);setSizes(j.sizes??[])}}).catch(()=>{})
  fetch('/api/settings').then(r=>r.json()).then(j=>{if(!cancelled&&Number.isInteger(j.lowStockThreshold))setThreshold(j.lowStockThreshold)}).catch(()=>{})
  return()=>{cancelled=true}
 },[isDemo])
 useEffect(()=>{
  if(search.trim().length<1){setSuggestions([]);return}
  let cancelled=false
  const t=setTimeout(()=>{
   if(isDemo){
    const q=search.trim().toLocaleLowerCase('vi')
    const options:Suggestion[]=DEMO_PRODUCTS.flatMap(p=>p.variants.map(v=>({product_id:p.product_id,product_code:p.product_code,product_name:p.product_name,variant_id:v.variant_id,sku:v.sku,size:v.size,stock:v.stock})))
    if(!cancelled)setSuggestions(options.filter(v=>[v.product_name,v.product_code,v.sku,v.size].some(x=>x.toLocaleLowerCase('vi').includes(q))).slice(0,12))
   }else{
    fetch('/api/inventory/suggestions?search='+encodeURIComponent(search)).then(r=>r.json()).then(j=>{if(!cancelled)setSuggestions(Array.isArray(j)?j:[])}).catch(()=>{if(!cancelled)setSuggestions([])})
   }
  },220)
  return()=>{cancelled=true;clearTimeout(t)}
 },[search,isDemo])
 const maxProduct=useMemo(()=>Math.max(1,...(dashboard?.topProducts??[]).map(x=>x.stock)),[dashboard])
 const visibleProducts=useMemo(()=>{
  const rows=products.filter(p=>stockState==='all'||(stockState==='in'&&p.stock>0)||(stockState==='out'&&p.stock===0)||(stockState==='low'&&p.stock>0&&p.stock<=threshold))
  if(sort==='stock_desc')rows.sort((a,b)=>b.stock-a.stock||a.product_name.localeCompare(b.product_name,'vi'))
  else if(sort==='stock_asc')rows.sort((a,b)=>a.stock-b.stock||a.product_name.localeCompare(b.product_name,'vi'))
  else rows.sort((a,b)=>a.product_name.localeCompare(b.product_name,'vi'))
  return rows
 },[products,stockState,sort,threshold])
 function toggle(set:Set<number>,id:number,setter:(v:Set<number>)=>void){const n=new Set(set);n.has(id)?n.delete(id):n.add(id);setter(n)}
 function chooseSuggestion(s:Suggestion){setSearch(s.product_name);setSize(s.size);setExpandedProducts(new Set([s.product_id]));setExpandedVariants(new Set([s.variant_id]));setSuggestions([])}
 const chosen=useRef(new Map<number,ChosenImage>()),anchor=useRef<{variant:number;id:number}|null>(null)
 const [sending,setSending]=useState(false),[selectionError,setSelectionError]=useState(''),[viewer,setViewer]=useState<{images:ChosenImage[];index:number}|null>(null)
 const allVisible=visibleProducts.flatMap(p=>p.variants.flatMap(v=>v.images.filter(i=>i.exists).map(i=>({...i,product:p.product_name,size:v.size}))))
 function selectGroup(images:ChosenImage[]){
  const next=new Set(selectedImages);for(const image of images){next.add(image.id);chosen.current.set(image.id,image)}
  if(next.size>100){setSelectionError('Một nhóm copy tối đa 100 ảnh. Chia nhỏ lựa chọn để xử lý ổn định.');return}
  setSelectionError('');setSelectedImages(next)
 }
 function chooseImage(image:ChosenImage,variant:number,list:ChosenImage[],shift:boolean){
  if(sending)return
  if(shift&&anchor.current?.variant===variant){const start=list.findIndex(i=>i.id===anchor.current?.id),end=list.findIndex(i=>i.id===image.id);if(start>=0&&end>=0){selectGroup(list.slice(Math.min(start,end),Math.max(start,end)+1));return}}
  anchor.current={variant,id:image.id};chosen.current.set(image.id,image)
  if(!selectedImages.has(image.id)&&selectedImages.size>=100){setSelectionError('Một nhóm copy tối đa 100 ảnh.');return}
  setSelectionError('');toggle(selectedImages,image.id,setSelectedImages)
 }
 async function selectProduct(p:Product){
  if(sending)return;setSending(true);setSelectionError('')
  try{let product=p
   if(size||search){const r=await fetch('/api/inventory/explorer?'+new URLSearchParams({search:p.product_code,status:'active'}));const rows=await r.json();if(!r.ok)throw Error(rows.error||'Không đọc được ảnh của mẫu');product=rows.find((x:Product)=>x.product_id===p.product_id);if(!product)throw Error('Mẫu không còn tồn hợp lệ.')}
   selectGroup(product.variants.flatMap(v=>v.images.filter(i=>i.exists).map(i=>({...i,product:product.product_name,size:v.size}))))
  }catch(e){setSelectionError(e instanceof Error?e.message:'Không chọn được mẫu')}finally{setSending(false)}
 }
 return <section className={"inventoryPage"+(selectedImages.size?" hasImageSelection":"")}>
  <div className="inventoryHeading"><div><p className="eyebrow">{isDemo?'DỮ LIỆU MINH HỌA · DEMO':'KHO HÀNG THỰC TẾ'}</p><h2>Tồn kho</h2><p>{isDemo?'Số liệu mẫu để kiểm tra giao diện, không phải tồn hàng của Shop. LOCAL mới kết nối kho ảnh.':'Tồn thực tế đếm ảnh hợp lệ theo từng Size. Chọn sản phẩm để xem ảnh và đối soát.'}</p></div>{isDemo?<span className="okPill">BẢN XEM THỬ</span>:!dashboard?<span className="reconcileAlert">Đang tải / không có dữ liệu kho</span>:dashboard.mismatches?<span className="reconcileAlert">⚠ {dashboard.mismatches} Size lệch ledger/ảnh</span>:<span className="okPill">✓ Đã so sánh ảnh và sổ</span>}</div>
  {loadError&&<p className="notice warning" role="alert">{loadError} <button onClick={()=>setReload(x=>x+1)}>THỬ LẠI</button></p>}
  <section className="inventoryDashboardBlock" aria-label="Dashboard tồn kho">
   <div className="dashboardFoldHeader">
    <div><span className="dashboardFoldEyebrow">BÁO CÁO TỒN KHO</span><h3>Dashboard tồn kho</h3><p>{isDemo?'Chỉ số minh họa · không phải tồn kho thật':'Chỉ số tổng theo ảnh vật lý đã đăng ký'}</p></div>
    <button type="button" className="dashboardFoldToggle" aria-expanded={dashboardExpanded} aria-controls="inventory-dashboard-body" onClick={()=>setDashboardExpanded(v=>!v)}>{dashboardExpanded?'Thu gọn':'Xem dashboard'} <span aria-hidden="true">{dashboardExpanded?'⌃':'⌄'}</span></button>
   </div>
   {dashboardExpanded&&<div id="inventory-dashboard-body" className="dashboardFoldBody">
  <div className="inventoryMetrics">
   <article><span>{isDemo?'TỒN MINH HỌA':'TỔNG TỒN'}</span><strong>{dashboard?.stock??'—'}</strong><small>{isDemo?'Số mẫu, không phải kho thật':'Bộ theo ảnh vật lý thực tế'}</small></article>
   <article><span>SẢN PHẨM</span><strong>{dashboard?.products??'—'}</strong><small>{dashboard?.productsInStock??0} mẫu còn hàng</small></article>
   <article><span>SIZE / SKU</span><strong>{dashboard?.skus??'—'}</strong><small>{dashboard?.sizes??0} tên Size</small></article>
   <article><span>HẾT HÀNG</span><strong>{dashboard?.outOfStock??'—'}</strong><small>Size không còn ảnh hàng</small></article>
  </div>
  <div className="inventoryInsights">
   <article className="insightCard"><h3>Tồn nhiều nhất</h3>{dashboard?.topProducts?.map((x,i)=><button key={x.product_id} onClick={()=>{setSearch(x.product_name);setExpandedProducts(new Set([x.product_id]))}}><b>{i+1}. {x.product_name}</b><strong>{x.stock}</strong></button>)}</article>
   <article className="insightCard"><h3>Tồn thấp còn hàng</h3>{dashboard?.lowProducts?.map((x,i)=><button key={x.product_id} onClick={()=>{setSearch(x.product_name);setExpandedProducts(new Set([x.product_id]))}}><b>{i+1}. {x.product_name}</b><strong>{x.stock}</strong></button>)}</article>
   <article className="insightCard sizesInsight"><h3>Tồn thực tế theo sản phẩm</h3><p className="chartCaption">Số ảnh vật lý còn tồn của mỗi mẫu, cộng tất cả Size.</p>{dashboard?.topProducts?.length?dashboard.topProducts.map(x=><button type="button" className="productStockBar" key={x.product_id} title={'Xem tồn kho '+x.product_name} onClick={()=>{setSearch(x.product_name);setExpandedProducts(new Set([x.product_id]))}}><span className="productStockBarLabel"><b title={x.product_name}>{x.product_name}</b><strong>{x.stock} bộ</strong></span><span className="overviewTrack"><span style={{width:(x.stock/maxProduct*100)+'%'}}/></span></button>):<p className="overviewEmpty">Chưa có sản phẩm tồn ảnh vật lý để hiển thị biểu đồ.</p>}</article>
  </div>
   </div>}
  </section>
  <div className="inventoryFilters">
   <div className="smartSearch"><label htmlFor="inventory-search">Tìm sản phẩm / mã / Size / SKU</label><input id="inventory-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nhập tên, mã, Size hoặc SKU..." autoComplete="off"/>{suggestions.length>0&&<div className="suggestions" role="listbox" aria-label="Gợi ý tồn kho">{suggestions.map(s=><button type="button" key={s.variant_id} onClick={()=>chooseSuggestion(s)}><b>{s.product_name}</b><span>{s.product_code} · {s.size} · {s.sku} · {s.stock} bộ {isDemo?'minh họa':'tồn thực tế'}</span></button>)}</div>}</div>
   <select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Tất cả danh mục</option>{categories.map(x=><option key={x}>{x}</option>)}</select>
   <select aria-label="Lọc theo Size" value={size} onChange={e=>setSize(e.target.value)}><option value="">Tất cả Size</option>{sizes.map(x=><option key={x}>{x}</option>)}</select>
   <select aria-label="Lọc theo trạng thái tồn" value={stockState} onChange={e=>setStockState(e.target.value as 'all'|'in'|'out'|'low')}><option value="all">Tất cả tồn</option><option value="in">Còn hàng</option><option value="out">Hết hàng</option><option value="low">Tồn thấp (≤ {threshold})</option></select>
   <select aria-label="Sắp xếp tồn kho" value={sort} onChange={e=>setSort(e.target.value as 'stock_desc'|'stock_asc'|'name')}><option value="stock_desc">Tồn nhiều nhất</option><option value="stock_asc">Tồn ít nhất</option><option value="name">Tên A–Z</option></select>
   {(search||category||size||stockState!=='all'||sort!=='stock_desc')&&<button className="clearFilter" onClick={()=>{setSearch('');setCategory('');setSize('');setStockState('all');setSort('stock_desc');setSuggestions([])}}>XÓA LỌC</button>}
  </div>

  <div className="inventoryToolbar"><button className="refreshInventory" disabled={loading&&!isDemo} onClick={()=>setReload(x=>x+1)}>↻ LÀM MỚI TỒN ẢNH</button></div><p className="inventoryResultCount">{loading&&!isDemo?'Đang đọc kho...':visibleProducts.length+' mẫu'} phù hợp bộ lọc{size?' · '+size:''}{isDemo?' · dữ liệu minh họa':''}</p>
  {!isDemo&&<div className="quickImageSelection"><button disabled={sending||loading||!allVisible.length} onClick={()=>selectGroup(allVisible)}>CHỌN KẾT QUẢ ĐANG LỌC ({allVisible.length} ảnh)</button><span>Chọn ảnh để gửi khách · chưa giữ hàng hay trừ tồn</span></div>}
  {selectionError&&<p role="alert" className="notice warning">{selectionError}</p>}
  <InventorySharing selectionBusy={sending} images={Array.from(selectedImages).map(id=>chosen.current.get(id)!)} hidden={Array.from(selectedImages).filter(id=>!allVisible.some(i=>i.id===id)).length} onBusy={setSending} onClear={()=>{setSelectedImages(new Set());anchor.current=null;setSelectionError('')}}/>
  <div className="inventoryTree">{visibleProducts.map(p=>{const open=expandedProducts.has(p.product_id);return <article className="treeProduct" key={p.product_id}>
   <button className="treeProductHead" onClick={()=>toggle(expandedProducts,p.product_id,setExpandedProducts)}><span className="chev">{open?'▼':'▶'}</span><span className="folderIcon">●</span><span className="treeName"><b>{p.product_name}</b><small>{p.product_code} · {p.category||'Chưa phân loại'} · {p.variants.length} Size</small></span><strong>{p.stock}<small> tồn</small></strong></button>
   {!isDemo&&<div className="productSelectRow"><button disabled={sending||loading} onClick={()=>void selectProduct(p)}>CHỌN TOÀN BỘ MẪU</button></div>}{open&&<div className="treeSizes">{p.variants.map(v=>{const vOpen=expandedVariants.has(v.variant_id);return <div className="treeVariant" key={v.variant_id}><button className="treeVariantHead" onClick={()=>toggle(expandedVariants,v.variant_id,setExpandedVariants)}><span className="chev">{vOpen?'▼':'▶'}</span><span className="sizeFolder">{v.size}</span><small>{v.sku}</small><span className={v.stock===0?'stockZero':'stockGood'}>{v.stock} sản phẩm</span></button>
    {vOpen&&<div className="variantGallery"><div className="galleryMeta"><button className="selectSizeImages" disabled={sending||loading||!v.stock||isDemo} onClick={()=>selectGroup(v.images.filter(i=>i.exists).map(i=>({...i,product:p.product_name,size:v.size})))}>CHỌN NHÓM SIZE</button><span><b>{v.stock}</b> {isDemo?'bộ minh họa':'ảnh hàng thực tế'}</span>{v.ledger_stock!==v.stock&&<span className="warning">Ledger {v.ledger_stock} · Ảnh {v.stock}</span>}<button onClick={()=>setDetailProductId(p.product_id)}>CHI TIẾT SẢN PHẨM</button></div><div className="selectableGallery">{v.images.filter(img=>img.exists).map(img=><article key={img.id} className={'inventoryImage'+(selectedImages.has(img.id)?' selected':'')}><button className="stockImageSelect" type="button" disabled={sending} aria-pressed={selectedImages.has(img.id)} aria-label={'Chọn ảnh '+img.file_name} onClick={e=>chooseImage({...img,product:p.product_name,size:v.size},v.variant_id,v.images.filter(i=>i.exists).map(i=>({...i,product:p.product_name,size:v.size})),e.shiftKey)}><img loading="lazy" decoding="async" src={'/api/images/'+img.id} alt={p.product_name+' '+v.size}/><span className="imageCheck">{selectedImages.has(img.id)?'✓':''}</span><small title={img.file_name}>{img.file_name}</small></button><button type="button" className="viewStockImage" onClick={()=>setViewer({images:v.images.filter(i=>i.exists).map(i=>({...i,product:p.product_name,size:v.size})),index:v.images.filter(i=>i.exists).findIndex(i=>i.id===img.id)})}>XEM LỚN</button></article>)}{(v.stock===0||isDemo)&&<div className="emptySize">{isDemo?'DEMO không có ảnh kho thật.':'Size này hiện không còn ảnh hàng trong kho.'}</div>}</div></div>}
   </div>})}</div>}
  </article>})}{loading&&!isDemo&&<p className="loadingState" role="status">Đang kiểm tra ảnh vật lý...</p>}{!loading&&!loadError&&visibleProducts.length===0&&<div className="emptyTree">Không tìm thấy sản phẩm phù hợp bộ lọc.</div>}</div>
  {viewer&&<InventoryImageViewer images={viewer.images} index={viewer.index} onIndex={index=>setViewer({...viewer,index})} onClose={()=>setViewer(null)}/> }
  {detailProductId&&<ProductDetail productId={detailProductId} onClose={()=>setDetailProductId(null)}/>}
 </section>
}
