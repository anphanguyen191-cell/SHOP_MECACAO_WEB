import MobileLuxeSectionHeader from './MobileLuxeSectionHeader'
import MobileLuxeNav from './MobileLuxeNav'
import {MobileOverview} from './MobileLuxeUI'
import ShopIcon from './ShopIcon'
import {LuxeDesktopSidebar,LuxeDesktopTopbar,LuxeDashboardHero,LuxeWorkspaceIntro} from './TravelLuxeDesktop'
import CloudSoldMaintenance from './CloudSoldMaintenance'
import CloudSettings from './CloudSettings'
import {ShopHeader,ShopDrawer} from './ShopChrome'
import PhonePhotoInboxView from './PhonePhotoInboxView'
import ShopSyncStatus from './ShopSyncStatus'
import LanLogin from './LanLogin'
import SoldRetentionView from './SoldRetentionView'
import BusinessReports from './BusinessReports'
import LanSettingsView from './LanSettingsView'
import StocktakeView from './StocktakeView'
import {DebtsView} from './OrderFinance'
import ReleaseStatus from './ReleaseStatus'
import CustomersView from './CustomersView'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import InventoryOps from './InventoryOps'
import AddProduct from './AddProduct'
import PriceWorkbookPanel from './PriceWorkbookPanel'
import InventoryView from './InventoryView'
import SettingsView from './SettingsView'
import ReceiptDashboard from './ReceiptDashboard'
import ProductDetail from './ProductDetail'
import WarehouseImport from './WarehouseImport'
import WarehouseNotifications from './WarehouseNotifications'
import DisplayDensity from './DisplayDensity'
import TaskProgress from './TaskProgress'
import ToastHost from './ToastHost'
import SalesDraftView from './SalesDraftView'
import {useDraftConflictChoice} from './DraftConflictChoice'
import {apiJson,useBooleanPreference,useDisplaySize,usePageMotion,useContrastMode} from './uiState'

type Health={ok:boolean;version:string;schema:number;database:string;freshDevelopment?:boolean;customWarehouse?:boolean;release?:{version:string;channel:string;stage:number;status:string;next:string};sandbox?:boolean;localV2Review?:boolean;localV2Business?:boolean;localV2RestoreReview?:boolean;warehouse?:string;databasePath?:string;incoming?:string;salesDrafts?:boolean;salesExecution?:boolean;lanClient?:boolean;windowsAuth?:boolean;lanRole?:'owner'|'cashier'|'inventory'|'viewer'}
type ProductRow={id:number;product_code:string;name:string;category?:string;variant_count:number;total_stock:number;image_id?:number|null;filtered_stock?:number;sizes?:string[];stock_by_size?:Array<{size:string;stock:number}>}
type CatalogSuggestion={product_id:number;product_code:string;product_name:string;variant_id:number;sku:string;size:string;stock:number}
const demo:ProductRow[]=[
{id:1,product_code:'LG0001',name:'Lửng gái T5',category:'Đồ tole bé gái',variant_count:3,total_stock:12,sizes:['Size 1','Size 2','Size 3'],stock_by_size:[{size:'Size 1',stock:5},{size:'Size 2',stock:4},{size:'Size 3',stock:3}]},
{id:2,product_code:'BG0001',name:'Bộ gái hoa',category:'Đồ tole bé gái',variant_count:4,total_stock:7,sizes:['Size 1','Size 2','Size 3','Size 4'],stock_by_size:[{size:'Size 1',stock:2},{size:'Size 2',stock:1},{size:'Size 3',stock:1},{size:'Size 4',stock:3}]}
]
const baseNav=['Tổng quan','Danh mục sản phẩm','Nhập hàng','Import kho','Tồn kho','Kết nối Cloud','Cài đặt']
const demoNav=['Tổng quan','Danh mục sản phẩm','Nhập hàng','Import kho','Tồn kho','Khách hàng','Bán hàng','Công nợ','Báo cáo','Kiểm kê','Ảnh SOLD','Ảnh iPhone','Cài đặt']
const demoInfo:Record<string,string>={'Khách hàng':'Danh bạ khách, liên hệ và thông tin giao hàng.','Bán hàng':'Đơn nháp, chọn ảnh, chốt SOLD và phiếu PNG.','Công nợ':'Các khoản phải thu và hoàn khách.','Báo cáo':'Doanh số, dòng tiền, giá vốn và xuất CSV.','Kiểm kê':'Các phiên kiểm đếm theo mẫu và Size.','Ảnh SOLD':'Kiểm chứng ảnh hàng đã bán và SHA-256.','Ảnh iPhone':'Nhận ảnh qua Wi-Fi, chủ shop duyệt trên Windows.'}

export default function App(){
 const isDemo=useMemo(()=>location.hostname.endsWith('github.io')||new URLSearchParams(location.search).get('demo')==='1',[])
 const [desktopWidth,setDesktopWidth]=useState(()=>window.matchMedia('(min-width: 801px)').matches)
 useEffect(()=>{const viewport=window.matchMedia('(min-width: 801px)');const sync=()=>setDesktopWidth(viewport.matches);sync();viewport.addEventListener('change',sync);return()=>viewport.removeEventListener('change',sync)},[])

 const [health,setHealth]=useState<Health|null>(null),[active,setActive]=useState('Tổng quan')
 const remoteLan=!isDemo&&location.protocol==='https:' // HTTPS LAN also supports loopback in isolated acceptance tests
 const [lanLoginRequired,setLanLoginRequired]=useState(remoteLan),[healthReload,setHealthReload]=useState(0),[healthError,setHealthError]=useState('')
 const lanRole=health?.lanClient?health.lanRole:null
 const canSell=!health?.lanClient||lanRole==='owner'||lanRole==='cashier'
 const canCount=!health?.lanClient||lanRole==='owner'||lanRole==='inventory'
 const canReport=!health?.lanClient||lanRole==='owner'
 const canAuditSold=!health?.lanClient||lanRole==='owner'
 const canPhoneInbox=!isDemo&&!!health?.freshDevelopment&&(!health?.lanClient||lanRole==='owner'||lanRole==='inventory')
 const baseAccess=health?.lanClient?baseNav.filter(n=>!['Nhập hàng','Import kho','Kết nối Cloud','Cài đặt'].includes(n)):baseNav
 const nav=isDemo?demoNav:health?.salesDrafts?[...baseAccess.filter(n=>n!=='Cài đặt'),...(canSell?['Khách hàng','Bán hàng','Công nợ']:[]),...(health?.salesExecution?[...(canReport?['Báo cáo']:[]),...(canCount?['Kiểm kê']:[]),...(canAuditSold?['Ảnh SOLD']:[])]:[]),...(canPhoneInbox?['Ảnh iPhone']:[]),...(health?.lanClient?[]:[...(health?.freshDevelopment?['Mobile LAN']:[]),'Cài đặt'])]:baseAccess
 const conflictChoice=useDraftConflictChoice()
 const [salesId,setSalesId]=useState<string|null>(null),[addToDraft,setAddToDraft]=useState<string|null>(null)
 const [receiptPrefill,setReceiptPrefill]=useState<string|null>(null)
 const [menuOpen,setMenuOpen]=useState(false),[menuSearch,setMenuSearch]=useState('')
 const [darkMode,setDarkMode]=useBooleanPreference('dark-mode',false)
 const [welcomeDismissed,setWelcomeDismissed]=useBooleanPreference('travel-luxe-v2-welcome',false)
 const [sidebarCollapsed,setSidebarCollapsed]=useBooleanPreference('travel-luxe-v2-sidebar-collapsed',false)
 const [heroExpanded,setHeroExpanded]=useBooleanPreference('travel-luxe-v2-hero',true)
 const [density,setDensity]=useDisplaySize()
 const [contrastMode,setContrastMode]=useContrastMode()
 const [pageMotion,setPageMotion]=usePageMotion()
 const [glassEnabled,setGlassEnabled]=useBooleanPreference('travel-luxe-v2-glass',true)
 const [overviewExpanded,setOverviewExpanded]=useBooleanPreference('overview-expanded',true),[catalogExpanded,setCatalogExpanded]=useBooleanPreference('catalog-expanded',true)
 const [products,setProducts]=useState<ProductRow[]>(isDemo?demo:[]),[featuredProducts,setFeaturedProducts]=useState<ProductRow[]>([]),[search,setSearch]=useState('')
 const [catalogProductCode,setCatalogProductCode]=useState(''),[catalogProductOptions,setCatalogProductOptions]=useState<Array<{product_code:string;name:string}>>([]),[catalogSize,setCatalogSize]=useState(''),[catalogStock,setCatalogStock]=useState<'all'|'in'|'out'>('all'),[catalogSort,setCatalogSort]=useState<'newest'|'name'|'stock_desc'|'stock_asc'>('newest'),[catalogSuggestions,setCatalogSuggestions]=useState<CatalogSuggestion[]>([]),[catalogSizes,setCatalogSizes]=useState<string[]>([])
 const [opsProductId,setOpsProductId]=useState<number|null>(null)
 const [showAdd,setShowAdd]=useState(false),[productReload,setProductReload]=useState(0)
 const [detailProductId,setDetailProductId]=useState<number|null>(null),[dashboard,setDashboard]=useState<any>(null),[catalog,setCatalog]=useState<any>(null)
 const [catalogLoading,setCatalogLoading]=useState(false),[catalogError,setCatalogError]=useState(''),[dashboardError,setDashboardError]=useState('')
 useEffect(()=>{if(isDemo)return;let alive=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);setHealthError('');fetch('/api/health',{signal:controller.signal}).then(async r=>{if(!alive)return;if(r.status===401){if(!remoteLan){window.location.reload();return}setLanLoginRequired(true);setHealth(null);return}if(!r.ok)throw Error('Server unavailable');const h=await r.json();if(alive){setHealth(h);setLanLoginRequired(false)}}).catch(()=>{if(!alive)return;setHealthError('Không kết nối được Windows. Kiểm tra Wi-Fi, ứng dụng và trạng thái LAN.');if(remoteLan)setLanLoginRequired(true);setHealth(null)}).finally(()=>clearTimeout(timer));return()=>{alive=false;clearTimeout(timer);controller.abort()}},[isDemo,healthReload])
 useLayoutEffect(()=>{const dock=document.querySelector<HTMLElement>('.mobileQuickNav'),shell=document.querySelector<HTMLElement>('.shell');if(!dock||!shell)return;const measure=()=>shell.style.setProperty('--mobile-nav-offset',getComputedStyle(dock).display==='none'?'0px':Math.max(0,Math.ceil(innerHeight-dock.getBoundingClientRect().top))+'px');const observer=new ResizeObserver(measure);observer.observe(dock);window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);measure();return()=>{observer.disconnect();window.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('resize',measure)}},[density,health?.ok,health?.lanRole,lanLoginRequired])
 useEffect(()=>{const changed=()=>setProductReload(n=>n+1);window.addEventListener('mecacao-server-change',changed);return()=>window.removeEventListener('mecacao-server-change',changed)},[])
 useEffect(()=>{const expired=()=>{if(!isDemo){if(!remoteLan){window.location.reload();return}setLanLoginRequired(true);setHealth(null);setActive('Tổng quan');setProducts([]);setDashboard(null);setCatalog(null);setSalesId(null);setAddToDraft(null);setDetailProductId(null);setMenuOpen(false)}};window.addEventListener('mecacao-lan-expired',expired);return()=>window.removeEventListener('mecacao-lan-expired',expired)},[isDemo,remoteLan])
 useEffect(()=>{if(isDemo||lanLoginRequired||active!=='Tổng quan')return;const controller=new AbortController();setDashboardError('');apiJson('/api/inventory/dashboard',{signal:controller.signal}).then(j=>{if(!controller.signal.aborted)setDashboard(j)}).catch(e=>{if(!controller.signal.aborted){setDashboard(null);setDashboardError(e.message)}});return()=>controller.abort()},[active,isDemo,productReload,lanLoginRequired])
 useEffect(()=>{
  if(isDemo||lanLoginRequired||active!=='Tổng quan')return
  const controller=new AbortController()
  void apiJson('/api/products?sort=stock_desc',{signal:controller.signal}).then(rows=>{if(!controller.signal.aborted)setFeaturedProducts(Array.isArray(rows)?rows:[])}).catch(()=>{if(!controller.signal.aborted)setFeaturedProducts([])})
  return()=>controller.abort()
 },[active,isDemo,productReload,lanLoginRequired])
 useEffect(()=>{
  if(isDemo){setCatalogSizes(['Size 1','Size 2','Size 3','Size 4']);setCatalogProductOptions(demo.map(p=>({product_code:p.product_code,name:p.name})));return}
  if(lanLoginRequired)return;const controller=new AbortController();apiJson('/api/inventory/filter-options',{signal:controller.signal}).then(j=>{if(!controller.signal.aborted){setCatalogSizes(Array.isArray(j.sizes)?j.sizes:[]);setCatalogProductOptions(Array.isArray(j.products)?j.products:[])}}).catch(()=>{if(!controller.signal.aborted){setCatalogSizes([]);setCatalogProductOptions([])}});return()=>controller.abort()
 },[isDemo,productReload,lanLoginRequired])
 useEffect(()=>{
  if(isDemo||lanLoginRequired||active!=='Danh mục sản phẩm')return
  const controller=new AbortController()
  setCatalogLoading(true);setCatalogError('');setProducts([])
  const q=new URLSearchParams({search,size:catalogSize,stockState:catalogStock,sort:catalogSort})
  const timer=setTimeout(()=>{apiJson('/api/products?'+q,{signal:controller.signal}).then(j=>{if(!controller.signal.aborted)setProducts(Array.isArray(j)?j:[])}).catch(e=>{if(!controller.signal.aborted)setCatalogError(e.message)}).finally(()=>{if(!controller.signal.aborted)setCatalogLoading(false)})},180)
  return()=>{controller.abort();clearTimeout(timer)}
 },[active,search,isDemo,productReload,catalogSize,catalogStock,catalogSort,lanLoginRequired])
 useEffect(()=>{
  if(isDemo||lanLoginRequired||active!=='Danh mục sản phẩm')return
  const controller=new AbortController()
  apiJson('/api/catalog/dashboard',{signal:controller.signal}).then(j=>{if(!controller.signal.aborted)setCatalog(j)}).catch(e=>{if(!controller.signal.aborted){setCatalog(null);setCatalogError(e.message)}})
  return()=>controller.abort()
 },[active,isDemo,productReload,lanLoginRequired])
 useEffect(()=>{
  if(lanLoginRequired||active!=='Danh mục sản phẩm'||!search.trim()){setCatalogSuggestions([]);return}
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
 },[active,search,isDemo,lanLoginRequired])
 const catalogVisibleProducts=useMemo(()=>{
  if(!isDemo)return products.filter(p=>!catalogProductCode||p.product_code===catalogProductCode)
  const needle=search.trim().toLocaleLowerCase('vi')
  const rows=demo.filter(p=>(!catalogProductCode||p.product_code===catalogProductCode)&&(!needle||[p.name,p.product_code,...(p.sizes??[])].some(x=>x.toLocaleLowerCase('vi').includes(needle)))&&(!catalogSize||p.sizes?.includes(catalogSize)))
   .map(p=>({...p,filtered_stock:catalogSize?(p.stock_by_size??[]).find(v=>v.size===catalogSize)?.stock??0:p.total_stock}))
   .filter(p=>catalogStock==='all'||(catalogStock==='in'?p.filtered_stock>0:p.filtered_stock===0))
  if(catalogSort==='stock_desc')rows.sort((a,b)=>b.filtered_stock-a.filtered_stock)
  else if(catalogSort==='stock_asc')rows.sort((a,b)=>a.filtered_stock-b.filtered_stock)
  else if(catalogSort==='name')rows.sort((a,b)=>a.name.localeCompare(b.name,'vi'))
  else rows.sort((a,b)=>b.id-a.id)
  return rows
 },[products,isDemo,search,catalogProductCode,catalogSize,catalogStock,catalogSort])
 function chooseCatalogSuggestion(s:CatalogSuggestion){setSearch(s.product_name);setCatalogProductCode(s.product_code);setCatalogSize(s.size);setCatalogSuggestions([])}
 const isWindowsSandbox=!!health?.sandbox&&!health?.freshDevelopment&&!isDemo
 const mode=isDemo?'DEMO':health?.ok?(health?.lanClient?'LOCAL · LAN':health?.freshDevelopment?'LOCAL':health?.localV2Business?'LOCAL V2 · KHO KINH DOANH':isWindowsSandbox?'TEST SANDBOX':'LOCAL'):'LOCAL / API OFFLINE'
 const catalogDisplay=isDemo?{
  categoryBreakdown:[{category:'Đồ tole bé gái',count:2}],
  sizeBreakdown:[{size:'Size 1',count:2},{size:'Size 2',count:2},{size:'Size 3',count:2},{size:'Size 4',count:1}],
  mostVariants:[{product_id:2,product_name:'Bộ gái hoa',count:4},{product_id:1,product_name:'Lửng gái T5',count:3}]
 }:catalog
 const menuItems=nav.filter(n=>n.toLocaleLowerCase('vi').includes(menuSearch.trim().toLocaleLowerCase('vi')))
 useEffect(()=>{if(!menuOpen)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setMenuOpen(false)};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close)},[menuOpen])
 useEffect(()=>{const navigate=(e:Event)=>{const section=(e as CustomEvent).detail;if(nav.includes(section))goTo(section)};window.addEventListener('mecacao-navigate',navigate);return()=>window.removeEventListener('mecacao-navigate',navigate)},[health?.salesDrafts,health?.lanRole,health?.freshDevelopment])
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
 function goTo(section:string){if(!window.dispatchEvent(new Event('mecacao-before-navigate',{cancelable:true}))){setMenuOpen(false);return;}const scene=document.querySelector<HTMLElement>('.luxePageScene');if(scene)scene.scrollTop=0;if(!desktopWidth)window.scrollTo(0,0);setActive(section);setMenuOpen(false);setMenuSearch('');setDetailProductId(null)}
 useLayoutEffect(()=>{const scene=document.querySelector<HTMLElement>('.luxePageScene');if(scene)scene.scrollTop=0;if(!desktopWidth)window.scrollTo(0,0)},[active])
 const desktopShell=!isDemo&&!health?.lanClient&&desktopWidth
 useLayoutEffect(()=>{if(!desktopShell)return;const html=document.documentElement,body=document.body,oldHtml=html.style.overflow,oldBody=body.style.overflow;html.style.overflow='hidden';body.style.overflow='hidden';return()=>{html.style.overflow=oldHtml;body.style.overflow=oldBody}},[desktopShell])
 if(lanLoginRequired)return <LanLogin connectionError={healthError} onRetry={()=>setHealthReload(n=>n+1)} onLogin={()=>{setActive('Tổng quan');setProducts([]);setDashboard(null);setCatalog(null);setSalesId(null);setAddToDraft(null);setHealthReload(n=>n+1)}}/>
 return <div className={'shell mobileLuxeWorkspace '+(darkMode?'themeDark':'')+(' density'+density[0].toUpperCase()+density.slice(1)+(density==='small'?' densityCompact':' densityComfort'))+ (desktopShell?' luxeWindows contrast-'+contrastMode:'')+(desktopShell&&sidebarCollapsed?' luxeSidebarCollapsed':'')+(desktopShell?(glassEnabled?' luxeGlassOn':' luxeNoGlass'):'')} data-page-motion={pageMotion}>
  {!isDemo&&!health?.lanClient&&health?.ok&&!health?.windowsAuth&&!welcomeDismissed&&<div className="luxeWelcomeBackdrop" role="presentation"><section className="luxeWelcome" role="dialog" aria-modal="true" aria-labelledby="luxe-welcome-heading"><span className="luxeWelcomeMark">SHOP MẸ CACAO · SINCE 2023</span><div className="luxeWelcomeGlow" aria-hidden="true">✦</div><h1 id="luxe-welcome-heading">CaCao Travel Luxe</h1><p className="luxeWelcomeSubtitle">Không gian điều hành Shop Mẹ CaCao</p><p>Quản lý kho ảnh, nhập hàng, bán hàng và theo dõi cửa hàng trên Windows. Các chức năng và phân quyền nghiệp vụ hiện có được giữ nguyên.</p><div className="luxeWelcomeActions"><button type="button" className="primary" onClick={()=>setWelcomeDismissed(true)}>Vào cửa hàng →</button><button type="button" onClick={()=>setWelcomeDismissed(true)}>Bỏ qua</button></div><small>Màn hình giới thiệu một lần, chỉ lưu tùy chọn hiển thị trên thiết bị này.</small></section></div>}
  {conflictChoice.dialog}
  <ToastHost/>
  {!desktopShell&&<ShopHeader density={density} onDensity={setDensity} dark={darkMode} onTheme={()=>setDarkMode(v=>!v)} onMenu={()=>setMenuOpen(true)} menuOpen={menuOpen} mode={mode}>{!health?.lanClient&&<WarehouseNotifications isDemo={isDemo} onReview={()=>goTo('Import kho')}/>}{health?.lanClient&&<button type="button" className="lanLogout" onClick={()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);void fetch('/api/lan/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:controller.signal}).catch(()=>setHealthError('Chưa xác nhận đăng xuất ở Windows vì mất kết nối. Kết nối lại hoặc tắt LAN trên Windows để thu hồi phiên.')).finally(()=>{clearTimeout(timer);window.dispatchEvent(new Event('mecacao-lan-expired'))})}}>Đăng xuất</button>}</ShopHeader>}

  {!desktopShell&&!isDemo&&health?.ok&&!health?.lanClient&&<TaskProgress/>}
  <ShopSyncStatus enabled={!isDemo&&!!health?.ok}/>
  {!isDemo&&health?.freshDevelopment&&!health?.lanClient&&<CloudSoldMaintenance/>}
  {health?.lanClient&&<div className="lanSafetyBanner" role="status"><b>LAN NỘI BỘ · BẢN THỬ NGHIỆM</b><span>Tài khoản {health.lanRole??'chưa xác định'} · Dùng kho đã chọn trên Windows; Windows xác nhận mọi giao dịch. Chưa nghiệm thu vận hành thật.</span></div>}
  {health?.localV2Business&&<div className="sandboxSafetyBanner businessSafetyBanner" role="status"><b>LOCAL V2 · KHO KINH DOANH</b><br/>Kho: {health.warehouse}<br/>DB: {health.databasePath}<br/>Ảnh nhập mới: {health.incoming} · Không mở V1/Python cũ đồng thời.</div>}
  {health?.localV2RestoreReview&&<div className="sandboxSafetyBanner" role="status">BẢN PHỤC HỒI THỬ · Không phải kho kinh doanh.</div>}
  {isWindowsSandbox&&!health?.localV2RestoreReview&&<div className="sandboxSafetyBanner" role="status">{health?.localV2Review?'LOCAL V2 — BẢN SAO ĐỂ DUYỆT. Dữ liệu lấy từ backup V1; thao tác chỉ thay bản sao, chưa kích hoạt kho thật.':'CHẾ ĐỘ THỬ WINDOWS — Database và kho giả lập riêng. KHÔNG thao tác ghi lên D:\\1-Me CaCao Store.'}</div>}
  {menuOpen&&<ShopDrawer sections={nav.map(n=>({key:n,label:n,icon:({'Tổng quan':'⌂','Danh mục sản phẩm':'▦','Nhập hàng':'＋','Import kho':'⇩','Tồn kho':'▤','Bán hàng':'▧','Công nợ':'₫','Báo cáo':'▥','Kiểm kê':'✓','Ảnh SOLD':'▧','Khách hàng':'♧','Ảnh iPhone':'▧','Cài đặt':'⚙','Mobile LAN':'↔'} as Record<string,string>)[n]}))} active={active} onNavigate={goTo} onClose={()=>setMenuOpen(false)} search={menuSearch} onSearch={setMenuSearch} density={density} onDensity={setDensity} mode={mode}/>}

  <div className="layout">{desktopShell?<LuxeDesktopSidebar sections={nav} active={active} collapsed={sidebarCollapsed} onToggle={()=>setSidebarCollapsed(v=>!v)} onNavigate={goTo}/>:<nav className="sidebar" aria-label="Danh mục quản lý Windows">{nav.map(n=><button key={n} title={n} aria-label={n} aria-current={active===n?'page':undefined} className={active===n?'active':''} onClick={()=>goTo(n)}><ShopIcon label={n}/><strong>{n}</strong></button>)}</nav>}
  <main>
  {desktopShell&&<LuxeDesktopTopbar mode={mode} active={active} dark={darkMode} density={density} onDensity={setDensity} onTheme={()=>setDarkMode(v=>!v)} onMenu={()=>setMenuOpen(true)} onLogout={health?.windowsAuth?()=>{if(!window.dispatchEvent(new Event('mecacao-before-navigate',{cancelable:true})))return;void fetch('/api/local/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>{if(!r.ok)throw Error('Không đăng xuất được');window.location.reload()}).catch(()=>setHealthError('Không đăng xuất được. Kiểm tra kết nối Windows rồi thử lại.'))}:undefined} onSearch={value=>{setCatalogProductCode('');setCatalogSize('');setSearch(value);goTo('Danh mục sản phẩm')}}><WarehouseNotifications isDemo={false} onReview={()=>goTo('Import kho')}/>{health?.ok&&!isDemo&&<TaskProgress compact/>}</LuxeDesktopTopbar>}
  <div className="luxePageScene">
  <div key={active} className={'luxePageContent'+(desktopShell?' luxeAppear-'+pageMotion:'')}>
  {!desktopShell&&<MobileLuxeSectionHeader title={active} mode={mode==='DEMO'?'DEMO':health?.lanClient?'LAN':'LOCAL'}/>} 
  {desktopShell&&active!=='Tổng quan'&&<LuxeWorkspaceIntro section={active}/>}
<nav className="pageBreadcrumb" aria-label="Vị trí hiện tại">{active==='Tổng quan'?<strong>Trang chủ · Tổng quan</strong>:<><button onClick={()=>goTo('Tổng quan')}>Tổng quan</button><span>›</span><strong>{active}</strong></>}{isDemo&&<small>DEMO · Dữ liệu minh họa</small>}{!isDemo&&!health?.lanClient&&<div className="luxeSidebarTools"><button type="button" className="luxeSidebarToggle" aria-label={sidebarCollapsed?'Mở rộng thanh chức năng':'Thu gọn thanh chức năng'} aria-expanded={!sidebarCollapsed} onClick={()=>setSidebarCollapsed(v=>!v)}>{sidebarCollapsed?'»':'«'}<span>{sidebarCollapsed?'':'Thu gọn menu'}</span></button></div>}</nav>

   {active==='Cài đặt'&&(health?.freshDevelopment||isDemo)&&<ReleaseStatus version={health?.version??'3.5.0-stage6-main-test'} release={health?.release} warehouse={health?.lanClient?undefined:health?.warehouse} custom={health?.customWarehouse} onImport={()=>goTo('Import kho')}/>}
   
  {active==='Tổng quan'&&!desktopWidth&&<MobileOverview metrics={[{label:isDemo?'Tồn minh họa':'Tồn ảnh thực tế',value:isDemo?19:dashboard?.stock??'—',hint:'Bộ theo ảnh hiện hữu',route:'Tồn kho',icon:'Kho ảnh'},{label:'Mẫu sản phẩm',value:isDemo?2:dashboard?.products??'—',hint:'Mẫu đang quản lý',route:'Danh mục sản phẩm',icon:'Danh mục sản phẩm'},{label:'Size / SKU',value:isDemo?7:dashboard?.skus??'—',hint:'Biến thể sản phẩm',route:'Danh mục sản phẩm',icon:'Danh mục sản phẩm'},{label:'Size cần đối soát',value:isDemo?'—':dashboard?.mismatches??'—',hint:'Chênh lệch ảnh và sổ',route:'Tồn kho',icon:'Báo cáo'}]} products={isDemo?demo.map(x=>({product_id:x.id,product_name:x.name,stock:x.total_stock})):dashboard?.topProducts??[]} onNavigate={goTo} stockRoute="Tồn kho">{dashboardError&&<p className="notice warning" role="alert">{dashboardError}</p>}<div className="mobileQuickLinks"><button onClick={()=>goTo('Tồn kho')}>Chọn ảnh gửi khách</button>{nav.includes('Bán hàng')&&<button onClick={()=>goTo('Bán hàng')}>Xem đơn hàng</button>}</div></MobileOverview>}
  {active==='Tổng quan'&&desktopWidth&&<div className="overview">{desktopShell&&<LuxeDashboardHero expanded={heroExpanded} onToggle={()=>setHeroExpanded(v=>!v)} onNavigate={goTo}/>}

 <div className="dashboardFoldHeader"><div><span className="dashboardFoldEyebrow">BẢNG ĐIỀU HÀNH CỬA HÀNG</span><h2>Dashboard tổng quan</h2><p>Chỉ số tồn theo ảnh vật lý · chọn thẻ để mở chức năng</p></div><button type="button" className="dashboardFoldToggle" aria-expanded={overviewExpanded} aria-controls="overview-dashboard-body" onClick={()=>setOverviewExpanded(v=>!v)}>{overviewExpanded?'Thu gọn':'Xem dashboard'} <span aria-hidden="true">{overviewExpanded?'⌃':'⌄'}</span></button></div>
 {dashboardError&&<p className="notice warning" role="alert">{dashboardError} <button onClick={()=>setProductReload(x=>x+1)}>THỬ LẠI</button></p>}
 {overviewExpanded&&<div id="overview-dashboard-body" className="dashboardFoldBody">
 <div className="overviewWelcome"><div><span className="overviewKicker">TỔNG QUAN KHO HÀNG</span><h2>Hôm nay ở Shop Mẹ CaCao</h2><p>Quản lý hàng tole bé yêu · tồn vật lý gồm ảnh đã đăng ký và ảnh chờ duyệt</p></div>{!health?.lanClient&&<button className="overviewAction" onClick={()=>goTo('Nhập hàng')}>＋ Nhập hàng</button>}</div>
 <section className="overviewStats">
 <button type="button" className="overviewStat mainStat" onClick={()=>goTo('Tồn kho')}><span>TỔNG TỒN THỰC TẾ</span><strong>{isDemo?'19':dashboard?.stock??'—'}</strong><small>Bộ có ảnh hiện hữu trong kho</small><span className="overviewStatLink">Xem chi tiết →</span></button>
 <button type="button" className="overviewStat" onClick={()=>goTo('Danh mục sản phẩm')}><span>MẪU SẢN PHẨM</span><strong>{isDemo?'2':dashboard?.products??'—'}</strong><small>Mẫu đang quản lý</small><span className="overviewStatLink">Xem chi tiết →</span></button>
 <button type="button" className="overviewStat" onClick={()=>goTo('Danh mục sản phẩm')}><span>SIZE / SKU</span><strong>{isDemo?'7':dashboard?.skus??'—'}</strong><small>Biến thể sản phẩm</small><span className="overviewStatLink">Xem chi tiết →</span></button>
 <button type="button" className="overviewStat" onClick={()=>goTo('Tồn kho')}><span>SIZE HẾT HÀNG</span><strong>{isDemo?'0':dashboard?.outOfStock??'—'}</strong><small>Chưa có ảnh tồn</small><span className="overviewStatLink">Xem chi tiết →</span></button>
 <button type="button" className="overviewStat warningStat" onClick={()=>goTo('Tồn kho')}><span>LỆCH SỔ SÁCH</span><strong>{isDemo?'—':dashboard?.mismatches??'—'}</strong><small>Size cần đối soát</small><span className="overviewStatLink">Xem chi tiết →</span></button>
 </section>
 {!isDemo&&featuredProducts.some(p=>p.total_stock>0)&&<section className="luxeFeatured" aria-label="Bộ sưu tập sản phẩm đang tồn"><div className="luxeFeaturedHead"><div><h3>Bộ sưu tập đang có tại shop</h3><p>Hình ảnh và số tồn theo dữ liệu sản phẩm hiện tại, không phải hàng minh họa.</p></div><button type="button" onClick={()=>goTo('Danh mục sản phẩm')}>Xem tất cả →</button></div><div className="luxeFeaturedGrid">{featuredProducts.filter(p=>p.total_stock>0).slice(0,5).map(p=><button type="button" className="luxeFeaturedCard" key={p.id} onClick={()=>{goTo('Danh mục sản phẩm');setDetailProductId(p.id)}}><div className="luxeFeaturedPhoto">{p.image_id?<img loading="lazy" alt={'Ảnh '+p.name} src={'/api/images/'+p.image_id}/>:<span aria-label="Chưa có ảnh sản phẩm">✿</span>}</div><b title={p.name}>{p.name}</b><small>{p.variant_count} Size · {p.total_stock} bộ tồn</small></button>)}</div></section>}
 <section className="overviewPanels"><article className="overviewPanel"><div className="overviewPanelTitle"><h3>Tồn thực tế theo sản phẩm</h3><button className="overviewTextAction" onClick={()=>goTo('Tồn kho')}>Xem tồn kho →</button></div><p className="chartCaption">Mỗi thanh là tổng ảnh vật lý còn tồn của sản phẩm qua tất cả Size.</p>{isDemo&&<p className="overviewDemoLabel">DỮ LIỆU MINH HỌA · Không phải tồn kho thật</p>}{(isDemo?demo.map(x=>({product_id:x.id,product_name:x.name,stock:x.total_stock})):dashboard?.topProducts??[]).length?(isDemo?demo.map(x=>({product_id:x.id,product_name:x.name,stock:x.total_stock})):dashboard.topProducts).map((x:any)=><button className="productStockBar" key={x.product_id} onClick={()=>goTo('Tồn kho')}><span className="productStockBarLabel"><b>{x.product_name}</b><strong>{x.stock} bộ</strong></span><span className="overviewTrack"><span style={{width:(x.stock/Math.max(1,...(isDemo?demo.map(y=>y.total_stock):dashboard.topProducts.map((y:any)=>y.stock)))*100)+'%'}}/></span></button>):<p className="overviewEmpty">Chưa có sản phẩm tồn thực tế.</p>}</article>
 <article className="overviewPanel"><div className="overviewPanelTitle"><h3>Hàng tồn nhiều nhất</h3><span>Top 5</span></div>{isDemo&&<p className="overviewDemoLabel">DỮ LIỆU MINH HỌA</p>}{(isDemo?[{product_id:1,product_name:'Lửng gái T5',product_code:'LG0001',stock:12},{product_id:2,product_name:'Bộ gái hoa',product_code:'BG0001',stock:7}]:dashboard?.topProducts??[]).length?(isDemo?[{product_id:1,product_name:'Lửng gái T5',product_code:'LG0001',stock:12},{product_id:2,product_name:'Bộ gái hoa',product_code:'BG0001',stock:7}]:dashboard.topProducts).map((x:any,i:number)=><div className="overviewRank" key={x.product_id}><span>{i+1}</span><div><b>{x.product_name}</b><small>{x.product_code}</small></div><strong>{x.stock} bộ</strong></div>):<p className="overviewEmpty">Chưa có sản phẩm đang tồn.</p>}</article>
 <article className="overviewPanel"><div className="overviewPanelTitle"><h3>Cần kiểm tra</h3><span>Ưu tiên</span></div><div className="overviewAlert"><span>!</span><div><b>{isDemo?'—':dashboard?.mismatches??'—'} Size lệch sổ sách</b><small>Đối chiếu tồn ảnh và ledger</small></div></div><div className="overviewAlert"><span>○</span><div><b>{isDemo?'0':dashboard?.outOfStock??'—'} Size hết hàng</b><small>Không có ảnh tồn thực tế</small></div></div><button className="overviewTextAction" onClick={()=>goTo('Tồn kho')}>Mở đối soát tồn kho →</button></article></section>
 <section className="overviewShortcuts"><h3>Thao tác nhanh</h3><div><button onClick={()=>goTo('Danh mục sản phẩm')}>▦ <span>Danh mục sản phẩm</span></button>{!health?.lanClient&&<button onClick={()=>goTo('Nhập hàng')}>＋ <span>Nhập hàng</span></button>}<button onClick={()=>goTo('Tồn kho')}>▤ <span>Kiểm tra tồn kho</span></button>{!health?.lanClient&&<button onClick={()=>goTo('Import kho')}>⇩ <span>Quét kho ảnh</span></button>}</div></section>
 </div>}
 {(isDemo||health?.lanClient)&&<div className="brandHeroCompact"><section className="hero"><img className="brandBanner" src={`${import.meta.env.BASE_URL}brand/banner.jpg`} alt="Banner Shop Mẹ CaCao" onError={e=>{e.currentTarget.style.display="none"}}/><p className="eyebrow">SHOP MẸ CACAO · SINCE 2023</p><h2>{active}</h2><p>Quản lý sản phẩm, Size và tồn kho theo ảnh vật lý. {isDemo?'Dữ liệu trên trang này là minh họa.':'Xem dữ liệu kho thật tại LOCAL.'}</p></section></div>}
 </div>}
  {isDemo&&demoInfo[active]&&<section className="demoFeaturePreview"><span className="demoPreviewKicker">XEM TRƯỚC CHỨC NĂNG · DEMO</span><h2>{active}</h2><p>{demoInfo[active]}</p><div className="demoPreviewDisabled"><b>Không kết nối Windows</b><span>Đây là bản xem giao diện. Không có dữ liệu khách hàng và không thể ghi đơn, xuất kho, thu tiền hoặc kiểm kê.</span></div><button type="button" disabled>Chỉ thao tác được trên Windows / Mobile LAN</button></section>}
   {active==='Nhập hàng'&&<ReceiptDashboard isDemo={isDemo} initialSourcePath={receiptPrefill} onInitialSourceApplied={()=>setReceiptPrefill(null)} onChanged={()=>{setProductReload(x=>x+1);window.dispatchEvent(new Event('mecacao-cloud-sync-now'))}}/>}
  {active==='Mobile LAN'&&health?.freshDevelopment&&!health?.lanClient&&<LanSettingsView/>}
  {active==='Ảnh iPhone'&&canPhoneInbox&&<PhonePhotoInboxView mobile={!!health?.lanClient} onChanged={()=>setProductReload(n=>n+1)} onBeginReceipt={folder=>{if(health?.lanClient)return;setReceiptPrefill(folder);goTo('Nhập hàng')}}/>}
  {active==='Tồn kho'&&<InventoryView isDemo={isDemo} desktopMode={!isDemo&&!health?.lanClient} priceTools={!isDemo&&canCount?<PriceWorkbookPanel onChanged={()=>setProductReload(n=>n+1)}/>:undefined} onDraft={health?.salesDrafts&&canSell?chooseForDraft:undefined} draftLabel={addToDraft?'THÊM VÀO ĐƠN NHÁP':'TẠO ĐƠN NHÁP'}/>}
  {active==='Báo cáo'&&health?.salesExecution&&canReport&&<BusinessReports desktopMode={!isDemo&&!health?.lanClient} onOrder={id=>{setSalesId(id);goTo('Bán hàng')}}/>}
  {active==='Kiểm kê'&&health?.salesExecution&&canCount&&<StocktakeView desktopMode={!isDemo&&!health?.lanClient}/>}
  {active==='Ảnh SOLD'&&health?.salesExecution&&canAuditSold&&<SoldRetentionView/>}
  {active==='Công nợ'&&health?.salesDrafts&&canSell&&<DebtsView onOrder={id=>{setSalesId(id);goTo('Bán hàng')}}/>}
  {active==='Khách hàng'&&health?.salesDrafts&&canSell&&<CustomersView onNavigate={!isDemo&&!health?.lanClient?goTo:undefined}/>}
  {active==='Bán hàng'&&health?.salesDrafts&&canSell&&<SalesDraftView desktopMode={!isDemo&&!health?.lanClient} business={!!health?.localV2Business||!!health?.freshDevelopment} execute={!!health?.salesExecution} hideRecovery={!!health?.lanClient} onStockChanged={()=>setProductReload(n=>n+1)} openId={salesId} onOpen={setSalesId} onSelectImages={id=>{setAddToDraft(id);goTo('Tồn kho')}}/>}
  {active==='Cài đặt'&&<section className="displayPreferences" id="luxe-settings-appearance"><div><h3>Giao diện & trải nghiệm · Travel Luxe</h3><p>Chọn nhịp chuyển trang, hiệu ứng kính, mật độ và độ tương phản. Tùy chọn chỉ lưu trên laptop này, không tác động nghiệp vụ.</p></div><div className="luxeAppearanceActions"><fieldset className="luxeContrastSetting"><legend>Độ tương phản</legend><div role="group" aria-label="Mức tương phản giao diện"><button type="button" aria-pressed={contrastMode==='soft'} className={contrastMode==='soft'?'isSelected':''} onClick={()=>setContrastMode('soft')}>Dịu</button><button type="button" aria-pressed={contrastMode==='clear'} className={contrastMode==='clear'?'isSelected':''} onClick={()=>setContrastMode('clear')}>Rõ nét</button><button type="button" aria-pressed={contrastMode==='high'} className={contrastMode==='high'?'isSelected':''} onClick={()=>setContrastMode('high')}>Cao</button></div><small>Dịu là giao diện hiện tại; Rõ nét và Cao tăng dần độ đậm của chữ, viền và màu nhấn.</small></fieldset><label className="luxeMotionSetting">Chuyển trang<select aria-label="Hiệu ứng chuyển trang" value={pageMotion} onChange={e=>setPageMotion(e.target.value as typeof pageMotion)}><option value="fade">Tan biến</option><option value="slide">Trượt ngang</option><option value="flip">Lật trang</option><option value="none">Không hiệu ứng</option></select></label><label className="luxeGlassSetting"><input type="checkbox" checked={glassEnabled} onChange={e=>setGlassEnabled(e.target.checked)}/> Hiệu ứng kính</label><DisplayDensity value={density} onChange={setDensity}/>{!isDemo&&!health?.lanClient&&<button type="button" onClick={()=>{if(health?.windowsAuth){if(window.dispatchEvent(new Event('mecacao-before-navigate',{cancelable:true})))window.location.reload()}else setWelcomeDismissed(false)}}>{health?.windowsAuth?'Mở lại màn hình chào & đăng nhập':'Xem lại màn hình chào'}</button>}</div></section>}
  {active==='Cài đặt'&&(isDemo?<section className="panel"><h3>Cài đặt & Backup</h3><p>DEMO không ghi cài đặt hoặc tạo backup. Các chức năng này chỉ hoạt động ở LOCAL.</p></section>:<SettingsView showCloud={false} onNavigate={goTo} lanSettingsAvailable={!!health?.freshDevelopment} sandbox={!!health?.sandbox||!!health?.localV2Business}/>)}
  {active==='Danh mục sản phẩm'&&<><div className="dashboardFoldHeader"><div><span className="dashboardFoldEyebrow">BÁO CÁO DANH MỤC</span><h2>Dashboard sản phẩm</h2><p>Tổng hợp sản phẩm, Size và mức độ hoàn chỉnh dữ liệu</p></div><button type="button" className="dashboardFoldToggle" aria-expanded={catalogExpanded} aria-controls="catalog-dashboard-body" onClick={()=>setCatalogExpanded(v=>!v)}>{catalogExpanded?'Thu gọn':'Xem dashboard'} <span aria-hidden="true">{catalogExpanded?'⌃':'⌄'}</span></button></div>{catalogExpanded&&<div id="catalog-dashboard-body" className="dashboardFoldBody"><section className="catalogMetrics"><article><span>MẪU SẢN PHẨM</span><strong>{isDemo?2:catalog?.products??'—'}</strong></article><article><span>SIZE / SKU</span><strong>{isDemo?7:catalog?.skus??'—'}</strong></article><article><span>DANH MỤC</span><strong>{isDemo?1:catalog?.categories??'—'}</strong></article><article><span>SIZE THIẾU ẢNH</span><strong>{isDemo?0:catalog?.missingImages??'—'}</strong></article><article><span>SIZE THIẾU GIÁ</span><strong>{isDemo?0:catalog?.missingPrices??'—'}</strong></article></section><section className="panel catalogInsights"><div><h3>Cơ cấu danh mục</h3>{catalogDisplay?.categoryBreakdown?.map((x:any)=><p key={x.category}><span>{x.category}</span><b>{x.count}</b></p>)}</div><div><h3>Size phổ biến</h3>{catalogDisplay?.sizeBreakdown?.slice(0,8).map((x:any)=><p key={x.size}><span>{x.size}</span><b>{x.count} mẫu</b></p>)}</div><div><h3>Mẫu có nhiều Size</h3>{catalogDisplay?.mostVariants?.map((x:any)=><p key={x.product_id}><span>{x.product_name}</span><b>{x.count} Size</b></p>)}</div></section></div>}<section className="panel catalogPanel"><div className="catalogPanelHeading"><div><h3>Tra cứu sản phẩm</h3><p>Tìm nhanh theo tên, mã, SKU hoặc Size · tồn theo ảnh vật lý</p></div>{!isDemo&&!health?.lanClient&&<button className="primary" onClick={()=>setShowAdd(!showAdd)}>+ SẢN PHẨM</button>}</div>
   <div className="catalogSearchArea"><div className="smartSearch catalogSearch"><label htmlFor="catalog-search">Tìm kiếm thông minh</label><input id="catalog-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nhập tên, mã sản phẩm, SKU hoặc Size..." autoComplete="off"/>{catalogSuggestions.length>0&&<div className="suggestions" role="listbox" aria-label="Gợi ý sản phẩm và Size">{catalogSuggestions.map(s=><button type="button" key={s.variant_id} onClick={()=>chooseCatalogSuggestion(s)}><b>{s.product_name}</b><span>{s.product_code} · {s.size} · {s.sku} · {s.stock} bộ tồn</span></button>)}</div>}</div>
   <div className="catalogFilterGrid"><label>Sản phẩm<select aria-label="Chọn mẫu sản phẩm trong danh mục" value={catalogProductCode} onChange={e=>{setCatalogProductCode(e.target.value);setCatalogSuggestions([])}}><option value="">Tất cả sản phẩm ({catalogProductOptions.length})</option>{catalogProductOptions.map(p=><option key={p.product_code} value={p.product_code}>{p.name} · {p.product_code}</option>)}</select></label>
    <label>Size<select value={catalogSize} onChange={e=>{setCatalogSize(e.target.value);setCatalogSuggestions([])}}><option value="">Tất cả Size</option>{catalogSizes.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
    <label>Tình trạng tồn<select value={catalogStock} onChange={e=>setCatalogStock(e.target.value as 'all'|'in'|'out')}><option value="all">Tất cả</option><option value="in">Còn hàng</option><option value="out">Hết hàng</option></select></label>
    <label>Sắp xếp<select value={catalogSort} onChange={e=>setCatalogSort(e.target.value as 'newest'|'name'|'stock_desc'|'stock_asc')}><option value="newest">Mới nhất</option><option value="stock_desc">Tồn nhiều nhất</option><option value="stock_asc">Tồn ít nhất</option><option value="name">Tên A–Z</option></select></label>
   </div></div>
   <div className="catalogFilterSummary"><span>{catalogLoading?'Đang tra cứu...':catalogVisibleProducts.length+' mẫu phù hợp'}{catalogSize?' · '+catalogSize:''}{isDemo?' · dữ liệu minh họa':''}</span>{(search||catalogProductCode||catalogSize||catalogStock!=='all'||catalogSort!=='newest')&&<button onClick={()=>{setSearch('');setCatalogProductCode('');setCatalogSize('');setCatalogStock('all');setCatalogSort('newest');setCatalogSuggestions([])}}>Xóa bộ lọc</button>}</div>{showAdd&&active==='Danh mục sản phẩm'&&<AddProduct onDone={()=>{setShowAdd(false);setProductReload(x=>x+1)}}/>}<div className="productList">{catalogVisibleProducts.map(p=><article className="product clickable" role={isDemo?undefined:'button'} tabIndex={isDemo?undefined:0} onKeyDown={e=>{if(!isDemo&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setDetailProductId(p.id);setOpsProductId(null)}}} key={p.id} onClick={()=>{if(!isDemo){setDetailProductId(p.id);setOpsProductId(null)}}}><div className="catalogPhoto">{!isDemo&&p.image_id?<img loading="lazy" src={"/api/images/"+p.image_id} alt={"Ảnh "+p.name}/>:<span>Chưa có ảnh</span>}</div><div className="catalogInfo"><b>{p.product_code}</b><h3>{p.name}</h3><small>{p.category||"Chưa phân loại"} · {p.variant_count} size</small></div><strong>{p.filtered_stock??p.total_stock}<small>{catalogSize?'tồn '+catalogSize:'tồn ảnh thực tế'}</small></strong></article>)}{catalogLoading&&<p className="loadingState" role="status">Đang tải danh mục sản phẩm...</p>}{catalogError&&<p className="notice warning" role="alert">{catalogError} <button onClick={()=>setProductReload(x=>x+1)}>THỬ LẠI</button></p>}{!catalogLoading&&!catalogError&&!catalogVisibleProducts.length&&<p>Không tìm thấy sản phẩm phù hợp bộ lọc.</p>}</div>{detailProductId&&<ProductDetail productId={detailProductId} onClose={()=>setDetailProductId(null)}/>} {opsProductId&&<InventoryOps productId={opsProductId} onClose={()=>setOpsProductId(null)}/>}</section></>}
  {active==='Import kho'&&<WarehouseImport isDemo={isDemo} onChanged={()=>setProductReload(x=>x+1)}/>}
  </div>
  {!isDemo&&!health?.lanClient&&<div hidden={active!=='Kết nối Cloud'} className="luxeCloudLivePanel"><CloudSettings autoSync/></div>}
  </div>
  </main></div>
  {!isDemo&&health?.ok&&<MobileLuxeNav items={nav.map(n=>({key:n,label:n}))} active={active} onNavigate={goTo} onMore={()=>setMenuOpen(true)}/>}
 </div>
}
