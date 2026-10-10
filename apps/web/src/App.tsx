import { useEffect, useMemo, useState } from 'react'
import InventoryOps from './InventoryOps'
import AddProduct from './AddProduct'
import InventoryView from './InventoryView'
import SettingsView from './SettingsView'
import ReceiptDashboard from './ReceiptDashboard'
import ProductDetail from './ProductDetail'
import WarehouseImport from './WarehouseImport'
import WarehouseNotifications from './WarehouseNotifications'
import DisplayDensity from './DisplayDensity'
import SalesDraftView from './SalesDraftView'
import {useDraftConflictChoice} from './DraftConflictChoice'
import {apiJson,useBooleanPreference} from './uiState'

type Health={ok:boolean;version:string;schema:number;database:string;sandbox?:boolean;localV2Review?:boolean;localV2Business?:boolean;localV2RestoreReview?:boolean;warehouse?:string;databasePath?:string;incoming?:string;salesDrafts?:boolean;salesExecution?:boolean}
type ProductRow={id:number;product_code:string;name:string;category?:string;variant_count:number;total_stock:number;image_id?:number|null;filtered_stock?:number;sizes?:string[];stock_by_size?:Array<{size:string;stock:number}>}
type CatalogSuggestion={product_id:number;product_code:string;product_name:string;variant_id:number;sku:string;size:string;stock:number}
const demo:ProductRow[]=[
{id:1,product_code:'LG0001',name:'Lửng gái T5',category:'Đồ tole bé gái',variant_count:3,total_stock:12,sizes:['Size 1','Size 2','Size 3'],stock_by_size:[{size:'Size 1',stock:5},{size:'Size 2',stock:4},{size:'Size 3',stock:3}]},
{id:2,product_code:'BG0001',name:'Bộ gái hoa',category:'Đồ tole bé gái',variant_count:4,total_stock:7,sizes:['Size 1','Size 2','Size 3','Size 4'],stock_by_size:[{size:'Size 1',stock:2},{size:'Size 2',stock:1},{size:'Size 3',stock:1},{size:'Size 4',stock:3}]}
]
const baseNav=['Tổng quan','Danh mục sản phẩm','Nhập hàng','Import kho','Tồn kho','Cài đặt']

export default function App(){
 const isDemo=useMemo(()=>location.hostname.endsWith('github.io')||new URLSearchParams(location.search).get('demo')==='1',[])
 const [health,setHealth]=useState<Health|null>(null),[active,setActive]=useState('Tổng quan')
 const nav=health?.salesDrafts&&!isDemo?[...baseNav.slice(0,-1),'Bán hàng','Cài đặt']:baseNav
 const conflictChoice=useDraftConflictChoice()
 const [salesId,setSalesId]=useState<string|null>(null),[addToDraft,setAddToDraft]=useState<string|null>(null)
 const [menuOpen,setMenuOpen]=useState(false),[menuSearch,setMenuSearch]=useState('')
 const [darkMode,setDarkMode]=useBooleanPreference('dark-mode',false)
 const [compact,setCompact]=useBooleanPreference('compact-mode',true)
 const [overviewExpanded,setOverviewExpanded]=useBooleanPreference('overview-expanded',true),[catalogExpanded,setCatalogExpanded]=useBooleanPreference('catalog-expanded',true)
 const [products,setProducts]=useState<ProductRow[]>(isDemo?demo:[]),[search,setSearch]=useState('')
 const [catalogSize,setCatalogSize]=useState(''),[catalogStock,setCatalogStock]=useState<'all'|'in'|'out'>('all'),[catalogSort,setCatalogSort]=useState<'newest'|'name'|'stock_desc'|'stock_asc'>('newest'),[catalogSuggestions,setCatalogSuggestions]=useState<CatalogSuggestion[]>([]),[catalogSizes,setCatalogSizes]=useState<string[]>([])
 const [opsProductId,setOpsProductId]=useState<number|null>(null)
 const [showAdd,setShowAdd]=useState(false),[productReload,setProductReload]=useState(0)
 const [detailProductId,setDetailProductId]=useState<number|null>(null),[dashboard,setDashboard]=useState<any>(null),[catalog,setCatalog]=useState<any>(null)
 const [catalogLoading,setCatalogLoading]=useState(false),[catalogError,setCatalogError]=useState(''),[dashboardError,setDashboardError]=useState('')
 useEffect(()=>{if(isDemo)return;fetch('/api/health').then(r=>r.json()).then(setHealth).catch(()=>setHealth(null))},[isDemo])
 useEffect(()=>{if(isDemo||active!=='Tổng quan')return;const controller=new AbortController();setDashboardError('');apiJson('/api/inventory/dashboard',{signal:controller.signal}).then(setDashboard).catch(e=>{if(!controller.signal.aborted){setDashboard(null);setDashboardError(e.message)}});return()=>controller.abort()},[active,isDemo,productReload])
 useEffect(()=>{
  if(isDemo){setCatalogSizes(['Size 1','Size 2','Size 3','Size 4']);return}
  fetch('/api/inventory/filter-options').then(r=>r.json()).then(j=>setCatalogSizes(Array.isArray(j.sizes)?j.sizes:[])).catch(()=>setCatalogSizes([]))
 },[isDemo,productReload])
 useEffect(()=>{
  if(isDemo||active!=='Danh mục sản phẩm')return
  const controller=new AbortController()
  setCatalogLoading(true);setCatalogError('');setProducts([])
  const q=new URLSearchParams({search,size:catalogSize,stockState:catalogStock,sort:catalogSort})
  const timer=setTimeout(()=>{apiJson('/api/products?'+q,{signal:controller.signal}).then(j=>{if(!controller.signal.aborted)setProducts(Array.isArray(j)?j:[])}).catch(e=>{if(!controller.signal.aborted)setCatalogError(e.message)}).finally(()=>{if(!controller.signal.aborted)setCatalogLoading(false)})},180)
  return()=>{controller.abort();clearTimeout(timer)}
 },[active,search,isDemo,productReload,catalogSize,catalogStock,catalogSort])
 useEffect(()=>{
  if(isDemo||active!=='Danh mục sản phẩm')return
  const controller=new AbortController()
  apiJson('/api/catalog/dashboard',{signal:controller.signal}).then(setCatalog).catch(e=>{if(!controller.signal.aborted){setCatalog(null);setCatalogError(e.message)}})
  return()=>controller.abort()
 },[active,isDemo,productReload])
 useEffect(()=>{
  if(active!=='Danh mục sản phẩm'||!search.trim()){setCatalogSuggestions([]);return}
  let cancelled=false
  const timer=setTimeout(()=>{
    if(isDemo){
      const needle=search.trim().toLocaleLowerCase('vi')
      const items=demo.flatMap(p=>(p.stock_by_size??[]).map((v,i)=>({product_id:p.id,product_code:p.product_code,product_name:p.name,variant_id:p.id*10+i,sku:p.product_code+'-'+v.size,size:v.size,stock:v.stock})))
      if(!cancelled)setCatalogSuggestions(items.filter(x=>[x.product_name,x.product_code,x.sku,x.size].some(t=>t.toLocaleLowerCase('vi').includes(needle))).slice(0,12))
    }else{
      fetch('/api/inventory/suggestions?search='+encodeURIComponent(search)).then(r=>r.json()).then(j=>{if(!cancelled)setCatalogSuggestions(Array.isArray(j)?j:[])}).catch(()=>{if(!cancelled)setCatalogSuggestions([])})
    }
  },220)
  return()=>{cancelled=true;clearTimeout(timer)}
 },[active,search,isDemo])
 const catalogVisibleProducts=useMemo(()=>{
  if(!isDemo)return products
  const needle=search.trim().toLocaleLowerCase('vi')
  const rows=demo.filter(p=>(!needle||[p.name,p.product_code,...(p.sizes??[])].some(x=>x.toLocaleLowerCase('vi').includes(needle)))&&(!catalogSize||p.sizes?.includes(catalogSize)))
   .map(p=>({...p,filtered_stock:catalogSize?(p.stock_by_size??[]).find(v=>v.size===catalogSize)?.stock??0:p.total_stock}))
   .filter(p=>catalogStock==='all'||(catalogStock==='in'?p.filtered_stock>0:p.filtered_stock===0))
  if(catalogSort==='stock_desc')rows.sort((a,b)=>b.filtered_stock-a.filtered_stock)
  else if(catalogSort==='stock_asc')rows.sort((a,b)=>a.filtered_stock-b.filtered_stock)
  else if(catalogSort==='name')rows.sort((a,b)=>a.name.localeCompare(b.name,'vi'))
  else rows.sort((a,b)=>b.id-a.id)
  return rows
 },[products,isDemo,search,catalogSize,catalogStock,catalogSort])
 function chooseCatalogSuggestion(s:CatalogSuggestion){setSearch(s.product_name);setCatalogSize(s.size);setCatalogSuggestions([])}
 const isWindowsSandbox=!!health?.sandbox&&!isDemo
 const mode=isDemo?'DEMO':health?.ok?(health?.localV2Business?'LOCAL V2 · KHO KINH DOANH':isWindowsSandbox?'TEST SANDBOX':'LOCAL'):'LOCAL / API OFFLINE'
 const catalogDisplay=isDemo?{
  categoryBreakdown:[{category:'Đồ tole bé gái',count:2}],
  sizeBreakdown:[{size:'Size 1',count:2},{size:'Size 2',count:2},{size:'Size 3',count:2},{size:'Size 4',count:1}],
  mostVariants:[{product_id:2,product_name:'Bộ gái hoa',count:4},{product_id:1,product_name:'Lửng gái T5',count:3}]
 }:catalog
 const menuItems=nav.filter(n=>n.toLocaleLowerCase('vi').includes(menuSearch.trim().toLocaleLowerCase('vi')))
 useEffect(()=>{if(!menuOpen)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setMenuOpen(false)};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close)},[menuOpen])
 useEffect(()=>{const navigate=(e:Event)=>{const section=(e as CustomEvent).detail;if(nav.includes(section))goTo(section)};window.addEventListener('mecacao-navigate',navigate);return()=>window.removeEventListener('mecacao-navigate',navigate)},[health?.salesDrafts])
 async function chooseForDraft(ids:number[],key:string){
  const products=await apiJson('/api/inventory/explorer')
  const prices=new Map<number,number>();for(const p of products)for(const v of p.variants)for(const i of v.images)prices.set(i.id,v.sale_price)
  const items=ids.map(imageId=>{const unitPrice=prices.get(imageId);if(unitPrice===undefined)throw Error('Ảnh không còn tồn. Làm mới kho rồi chọn lại.');return {imageId,unitPrice}})
  let result
  if(addToDraft){
   const old=await apiJson('/api/sales/drafts/'+addToDraft)
   const extra=items.filter(i=>!old.items.some((x:any)=>x.image_id===i.imageId))
   result=extra.length?await conflictChoice.submit(token=>apiJson('/api/sales/drafts/'+old.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:old.version,discount:old.discount,note:old.note,items:[...old.items.map((i:any)=>({imageId:i.image_id,unitPrice:i.unit_price})),...extra],conflictToken:token})})):old
  }else result=await conflictChoice.submit(token=>apiJson('/api/sales/drafts',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({items,discount:0,note:'',conflictToken:token})}))
  setSalesId(result.id);setAddToDraft(null);goTo('Bán hàng')
 }
 function goTo(section:string){setActive(section);setMenuOpen(false);setMenuSearch('');setDetailProductId(null)}
 return <div className={'shell '+(darkMode?'themeDark':'')+(compact?' densityCompact':' densityComfort')}>
  {conflictChoice.dialog}
  <header className="topbar"><div className="brandIdentity"><button type="button" className="menuToggle" aria-label="Mở danh mục chức năng" aria-expanded={menuOpen} onClick={()=>setMenuOpen(true)}>☰</button><img className="brandLogo" src={`${import.meta.env.BASE_URL}brand/logo.jpg`} alt="Logo Shop Mẹ CaCao" onError={e=>{e.currentTarget.style.display="none"}}/><span className="brandMonogram">MC</span><div><p className="eyebrow">SHOP MẸ CACAO · SINCE 2023</p><h1>Quản lý kho</h1></div></div><div className="headerActions"><DisplayDensity compact={compact} onChange={setCompact}/><WarehouseNotifications isDemo={isDemo} onReview={()=>goTo('Import kho')}/><button type="button" className="themeToggle" onClick={()=>setDarkMode(v=>!v)} aria-label={darkMode?"Bật giao diện sáng":"Bật giao diện tối"}>{darkMode?"☀":"☾"}</button><span className={'badge '+(mode==='LOCAL'?'local':mode==='DEMO'?'demo':mode==='TEST SANDBOX'?'test':'offline')}>{mode}</span></div></header>
  {health?.localV2Business&&<div className="sandboxSafetyBanner businessSafetyBanner" role="status"><b>LOCAL V2 · KHO KINH DOANH</b><br/>Kho: {health.warehouse}<br/>DB: {health.databasePath}<br/>Ảnh nhập mới: {health.incoming} · Không mở V1/Python cũ đồng thời.</div>}
  {health?.localV2RestoreReview&&<div className="sandboxSafetyBanner" role="status">BẢN PHỤC HỒI THỬ · Không phải kho kinh doanh.</div>}
  {isWindowsSandbox&&!health?.localV2RestoreReview&&<div className="sandboxSafetyBanner" role="status">{health?.localV2Review?'LOCAL V2 — BẢN SAO ĐỂ DUYỆT. Dữ liệu lấy từ backup V1; thao tác chỉ thay bản sao, chưa kích hoạt kho thật.':'CHẾ ĐỘ THỬ WINDOWS — Database và kho giả lập riêng. KHÔNG thao tác ghi lên D:\\1-Me CaCao Store.'}</div>}
  {menuOpen&&<div className="drawerBackdrop" onClick={()=>setMenuOpen(false)}><aside className="featureDrawer" role="dialog" aria-modal="true" aria-label="Danh mục chức năng" onClick={e=>e.stopPropagation()}><div className="drawerHead"><img src={`${import.meta.env.BASE_URL}brand/logo.jpg`} alt="" /><div><b>Shop Mẹ CaCao</b><small>Danh mục chức năng</small></div><button type="button" aria-label="Đóng danh mục" onClick={()=>setMenuOpen(false)}>×</button></div><div className="drawerSearch"><span>⌕</span><input value={menuSearch} onChange={e=>setMenuSearch(e.target.value)} placeholder="Tìm chức năng..." /></div><p className="drawerSection">QUẢN LÝ CỬA HÀNG · {menuItems.length} CHỨC NĂNG</p><div className="drawerLinks">{menuItems.map((n,i)=><button type="button" key={n} className={active===n?"selected":""} onClick={()=>goTo(n)}><span className="drawerIcon">{({ "Tổng quan":"⌂","Danh mục sản phẩm":"▦","Nhập hàng":"＋","Import kho":"⇩","Tồn kho":"▤","Bán hàng":"▧","Cài đặt":"⚙"} as Record<string,string>)[n]}</span><span>{n}</span><span className="drawerArrow">›</span></button>)}{menuItems.length===0&&<p>Không tìm thấy chức năng phù hợp.</p>}</div><div className="drawerFoot"><span className="drawerDot"/> {mode} · Since 2023</div></aside></div>}
  <div className="layout"><nav className="sidebar">{nav.map(n=><button key={n} className={active===n?'active':''} onClick={()=>setActive(n)}><strong>{n}</strong></button>)}</nav>
  <main><nav className="pageBreadcrumb" aria-label="Vị trí hiện tại">{active==='Tổng quan'?<strong>Trang chủ · Tổng quan</strong>:<><button onClick={()=>goTo('Tổng quan')}>Tổng quan</button><span>›</span><strong>{active}</strong></>}{isDemo&&<small>DEMO · Dữ liệu minh họa</small>}</nav>
  {active==='Tổng quan'&&<div className="overview">
 <div className="dashboardFoldHeader"><div><span className="dashboardFoldEyebrow">BẢNG ĐIỀU HÀNH CỬA HÀNG</span><h2>Dashboard tổng quan</h2><p>Chỉ số tồn theo ảnh vật lý · chọn thẻ để mở chức năng</p></div><button type="button" className="dashboardFoldToggle" aria-expanded={overviewExpanded} aria-controls="overview-dashboard-body" onClick={()=>setOverviewExpanded(v=>!v)}>{overviewExpanded?'Thu gọn':'Xem dashboard'} <span aria-hidden="true">{overviewExpanded?'⌃':'⌄'}</span></button></div>
 {dashboardError&&<p className="notice warning" role="alert">{dashboardError} <button onClick={()=>setProductReload(x=>x+1)}>THỬ LẠI</button></p>}
 {overviewExpanded&&<div id="overview-dashboard-body" className="dashboardFoldBody">
 <div className="overviewWelcome"><div><span className="overviewKicker">TỔNG QUAN KHO HÀNG</span><h2>Hôm nay ở Shop Mẹ CaCao</h2><p>Quản lý hàng tole bé yêu · số tồn thực tế theo ảnh đã đăng ký</p></div><button className="overviewAction" onClick={()=>goTo('Nhập hàng')}>＋ Nhập hàng</button></div>
 <section className="overviewStats">
 <button type="button" className="overviewStat mainStat" onClick={()=>goTo('Tồn kho')}><span>TỔNG TỒN THỰC TẾ</span><strong>{isDemo?'19':dashboard?.stock??'—'}</strong><small>Bộ có ảnh hiện hữu trong kho</small><span className="overviewStatLink">Xem chi tiết →</span></button>
 <button type="button" className="overviewStat" onClick={()=>goTo('Danh mục sản phẩm')}><span>MẪU SẢN PHẨM</span><strong>{isDemo?'2':dashboard?.products??'—'}</strong><small>Mẫu đang quản lý</small><span className="overviewStatLink">Xem chi tiết →</span></button>
 <button type="button" className="overviewStat" onClick={()=>goTo('Danh mục sản phẩm')}><span>SIZE / SKU</span><strong>{isDemo?'7':dashboard?.skus??'—'}</strong><small>Biến thể sản phẩm</small><span className="overviewStatLink">Xem chi tiết →</span></button>
 <button type="button" className="overviewStat" onClick={()=>goTo('Tồn kho')}><span>SIZE HẾT HÀNG</span><strong>{isDemo?'0':dashboard?.outOfStock??'—'}</strong><small>Chưa có ảnh tồn</small><span className="overviewStatLink">Xem chi tiết →</span></button>
 <button type="button" className="overviewStat warningStat" onClick={()=>goTo('Tồn kho')}><span>LỆCH SỔ SÁCH</span><strong>{isDemo?'—':dashboard?.mismatches??'—'}</strong><small>Size cần đối soát</small><span className="overviewStatLink">Xem chi tiết →</span></button>
 </section>
 <section className="overviewPanels"><article className="overviewPanel"><div className="overviewPanelTitle"><h3>Tồn thực tế theo sản phẩm</h3><button className="overviewTextAction" onClick={()=>goTo('Tồn kho')}>Xem tồn kho →</button></div><p className="chartCaption">Mỗi thanh là tổng ảnh vật lý còn tồn của sản phẩm qua tất cả Size.</p>{isDemo&&<p className="overviewDemoLabel">DỮ LIỆU MINH HỌA · Không phải tồn kho thật</p>}{(isDemo?demo.map(x=>({product_id:x.id,product_name:x.name,stock:x.total_stock})):dashboard?.topProducts??[]).length?(isDemo?demo.map(x=>({product_id:x.id,product_name:x.name,stock:x.total_stock})):dashboard.topProducts).map((x:any)=><button className="productStockBar" key={x.product_id} onClick={()=>goTo('Tồn kho')}><span className="productStockBarLabel"><b>{x.product_name}</b><strong>{x.stock} bộ</strong></span><span className="overviewTrack"><span style={{width:(x.stock/Math.max(1,...(isDemo?demo.map(y=>y.total_stock):dashboard.topProducts.map((y:any)=>y.stock)))*100)+'%'}}/></span></button>):<p className="overviewEmpty">Chưa có sản phẩm tồn thực tế.</p>}</article>
 <article className="overviewPanel"><div className="overviewPanelTitle"><h3>Hàng tồn nhiều nhất</h3><span>Top 5</span></div>{isDemo&&<p className="overviewDemoLabel">DỮ LIỆU MINH HỌA</p>}{(isDemo?[{product_id:1,product_name:'Lửng gái T5',product_code:'LG0001',stock:12},{product_id:2,product_name:'Bộ gái hoa',product_code:'BG0001',stock:7}]:dashboard?.topProducts??[]).length?(isDemo?[{product_id:1,product_name:'Lửng gái T5',product_code:'LG0001',stock:12},{product_id:2,product_name:'Bộ gái hoa',product_code:'BG0001',stock:7}]:dashboard.topProducts).map((x:any,i:number)=><div className="overviewRank" key={x.product_id}><span>{i+1}</span><div><b>{x.product_name}</b><small>{x.product_code}</small></div><strong>{x.stock} bộ</strong></div>):<p className="overviewEmpty">Chưa có sản phẩm đang tồn.</p>}</article>
 <article className="overviewPanel"><div className="overviewPanelTitle"><h3>Cần kiểm tra</h3><span>Ưu tiên</span></div><div className="overviewAlert"><span>!</span><div><b>{isDemo?'—':dashboard?.mismatches??'—'} Size lệch sổ sách</b><small>Đối chiếu tồn ảnh và ledger</small></div></div><div className="overviewAlert"><span>○</span><div><b>{isDemo?'0':dashboard?.outOfStock??'—'} Size hết hàng</b><small>Không có ảnh tồn thực tế</small></div></div><button className="overviewTextAction" onClick={()=>goTo('Tồn kho')}>Mở đối soát tồn kho →</button></article></section>
 <section className="overviewShortcuts"><h3>Thao tác nhanh</h3><div><button onClick={()=>goTo('Danh mục sản phẩm')}>▦ <span>Danh mục sản phẩm</span></button><button onClick={()=>goTo('Nhập hàng')}>＋ <span>Nhập hàng</span></button><button onClick={()=>goTo('Tồn kho')}>▤ <span>Kiểm tra tồn kho</span></button><button onClick={()=>goTo('Import kho')}>⇩ <span>Quét kho ảnh</span></button></div></section>
 </div>}
 <div className="brandHeroCompact"><section className="hero"><img className="brandBanner" src={`${import.meta.env.BASE_URL}brand/banner.jpg`} alt="Banner Shop Mẹ CaCao" onError={e=>{e.currentTarget.style.display="none"}}/><p className="eyebrow">SHOP MẸ CACAO · SINCE 2023</p><h2>{active}</h2><p>Quản lý sản phẩm, Size và tồn kho theo ảnh vật lý. {isDemo?'Dữ liệu trên trang này là minh họa.':'Xem dữ liệu kho thật tại LOCAL.'}</p></section></div>
 </div>}
  {active==='Nhập hàng'&&<ReceiptDashboard isDemo={isDemo} onChanged={()=>setProductReload(x=>x+1)}/>}
  {active==='Tồn kho'&&<InventoryView isDemo={isDemo} onDraft={health?.salesDrafts?chooseForDraft:undefined} draftLabel={addToDraft?'THÊM VÀO ĐƠN NHÁP':'TẠO ĐƠN NHÁP'}/>}
  {active==='Bán hàng'&&health?.salesDrafts&&<SalesDraftView business={!!health?.localV2Business} execute={!!health?.salesExecution} onStockChanged={()=>setProductReload(n=>n+1)} openId={salesId} onOpen={setSalesId} onSelectImages={id=>{setAddToDraft(id);goTo('Tồn kho')}}/>}
  {active==='Cài đặt'&&<section className="displayPreferences"><div><h3>Không gian làm việc</h3><p>Chọn độ gọn cho màn hình máy tính. Lựa chọn được nhớ trên trình duyệt; điện thoại giữ kích thước dễ chạm.</p></div><DisplayDensity compact={compact} onChange={setCompact}/></section>}
  {active==='Cài đặt'&&(isDemo?<section className="panel"><h3>Cài đặt & Backup</h3><p>DEMO không ghi cài đặt hoặc tạo backup. Các chức năng này chỉ hoạt động ở LOCAL.</p></section>:<SettingsView sandbox={!!health?.sandbox||!!health?.localV2Business}/>)}
  {active==='Danh mục sản phẩm'&&<><div className="dashboardFoldHeader"><div><span className="dashboardFoldEyebrow">BÁO CÁO DANH MỤC</span><h2>Dashboard sản phẩm</h2><p>Tổng hợp sản phẩm, Size và mức độ hoàn chỉnh dữ liệu</p></div><button type="button" className="dashboardFoldToggle" aria-expanded={catalogExpanded} aria-controls="catalog-dashboard-body" onClick={()=>setCatalogExpanded(v=>!v)}>{catalogExpanded?'Thu gọn':'Xem dashboard'} <span aria-hidden="true">{catalogExpanded?'⌃':'⌄'}</span></button></div>{catalogExpanded&&<div id="catalog-dashboard-body" className="dashboardFoldBody"><section className="catalogMetrics"><article><span>MẪU SẢN PHẨM</span><strong>{isDemo?2:catalog?.products??'—'}</strong></article><article><span>SIZE / SKU</span><strong>{isDemo?7:catalog?.skus??'—'}</strong></article><article><span>DANH MỤC</span><strong>{isDemo?1:catalog?.categories??'—'}</strong></article><article><span>SIZE THIẾU ẢNH</span><strong>{isDemo?0:catalog?.missingImages??'—'}</strong></article><article><span>SIZE THIẾU GIÁ</span><strong>{isDemo?0:catalog?.missingPrices??'—'}</strong></article></section><section className="panel catalogInsights"><div><h3>Cơ cấu danh mục</h3>{catalogDisplay?.categoryBreakdown?.map((x:any)=><p key={x.category}><span>{x.category}</span><b>{x.count}</b></p>)}</div><div><h3>Size phổ biến</h3>{catalogDisplay?.sizeBreakdown?.slice(0,8).map((x:any)=><p key={x.size}><span>{x.size}</span><b>{x.count} mẫu</b></p>)}</div><div><h3>Mẫu có nhiều Size</h3>{catalogDisplay?.mostVariants?.map((x:any)=><p key={x.product_id}><span>{x.product_name}</span><b>{x.count} Size</b></p>)}</div></section></div>}<section className="panel catalogPanel"><div className="catalogPanelHeading"><div><h3>Tra cứu sản phẩm</h3><p>Tìm nhanh theo tên, mã, SKU hoặc Size · tồn theo ảnh vật lý</p></div>{!isDemo&&<button className="primary" onClick={()=>setShowAdd(!showAdd)}>+ SẢN PHẨM</button>}</div>
   <div className="catalogSearchArea"><div className="smartSearch catalogSearch"><label htmlFor="catalog-search">Tìm kiếm thông minh</label><input id="catalog-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nhập tên, mã sản phẩm, SKU hoặc Size..." autoComplete="off"/>{catalogSuggestions.length>0&&<div className="suggestions" role="listbox" aria-label="Gợi ý sản phẩm và Size">{catalogSuggestions.map(s=><button type="button" key={s.variant_id} onClick={()=>chooseCatalogSuggestion(s)}><b>{s.product_name}</b><span>{s.product_code} · {s.size} · {s.sku} · {s.stock} bộ tồn</span></button>)}</div>}</div>
   <div className="catalogFilterGrid">
    <label>Size<select value={catalogSize} onChange={e=>{setCatalogSize(e.target.value);setCatalogSuggestions([])}}><option value="">Tất cả Size</option>{catalogSizes.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
    <label>Tình trạng tồn<select value={catalogStock} onChange={e=>setCatalogStock(e.target.value as 'all'|'in'|'out')}><option value="all">Tất cả</option><option value="in">Còn hàng</option><option value="out">Hết hàng</option></select></label>
    <label>Sắp xếp<select value={catalogSort} onChange={e=>setCatalogSort(e.target.value as 'newest'|'name'|'stock_desc'|'stock_asc')}><option value="newest">Mới nhất</option><option value="stock_desc">Tồn nhiều nhất</option><option value="stock_asc">Tồn ít nhất</option><option value="name">Tên A–Z</option></select></label>
   </div></div>
   <div className="catalogFilterSummary"><span>{catalogLoading?'Đang tra cứu...':catalogVisibleProducts.length+' mẫu phù hợp'}{catalogSize?' · '+catalogSize:''}{isDemo?' · dữ liệu minh họa':''}</span>{(search||catalogSize||catalogStock!=='all'||catalogSort!=='newest')&&<button onClick={()=>{setSearch('');setCatalogSize('');setCatalogStock('all');setCatalogSort('newest');setCatalogSuggestions([])}}>Xóa bộ lọc</button>}</div>{showAdd&&active==='Danh mục sản phẩm'&&<AddProduct onDone={()=>{setShowAdd(false);setProductReload(x=>x+1)}}/>}<div className="productList">{catalogVisibleProducts.map(p=><article className="product clickable" role={isDemo?undefined:'button'} tabIndex={isDemo?undefined:0} onKeyDown={e=>{if(!isDemo&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setDetailProductId(p.id);setOpsProductId(null)}}} key={p.id} onClick={()=>{if(!isDemo){setDetailProductId(p.id);setOpsProductId(null)}}}><div className="catalogPhoto">{!isDemo&&p.image_id?<img loading="lazy" src={"/api/images/"+p.image_id} alt={"Ảnh "+p.name}/>:<span>Chưa có ảnh</span>}</div><div className="catalogInfo"><b>{p.product_code}</b><h3>{p.name}</h3><small>{p.category||"Chưa phân loại"} · {p.variant_count} size</small></div><strong>{p.filtered_stock??p.total_stock}<small>{catalogSize?'tồn '+catalogSize:'tồn ảnh thực tế'}</small></strong></article>)}{catalogLoading&&<p className="loadingState" role="status">Đang tải danh mục sản phẩm...</p>}{catalogError&&<p className="notice warning" role="alert">{catalogError} <button onClick={()=>setProductReload(x=>x+1)}>THỬ LẠI</button></p>}{!catalogLoading&&!catalogError&&!catalogVisibleProducts.length&&<p>Không tìm thấy sản phẩm phù hợp bộ lọc.</p>}</div>{detailProductId&&<ProductDetail productId={detailProductId} onClose={()=>setDetailProductId(null)}/>} {opsProductId&&<InventoryOps productId={opsProductId} onClose={()=>setOpsProductId(null)}/>}</section></>}
  {active==='Import kho'&&<WarehouseImport isDemo={isDemo} onChanged={()=>setProductReload(x=>x+1)}/>}

  </main></div></div>
}
