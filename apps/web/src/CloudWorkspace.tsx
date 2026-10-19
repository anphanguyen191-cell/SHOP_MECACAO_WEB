import CustomerCatalogAdmin from './CustomerCatalogAdmin'
import MobileLuxeSectionHeader from './MobileLuxeSectionHeader'
import MobileLuxeNav from './MobileLuxeNav'
import {MobileAppearance,MobileCloudSummary,MobileOverview,MobileSystemPanel,useMobileLuxe} from './MobileLuxeUI'
import ShopIcon from './ShopIcon'
import CloudSoldMaintenance from './CloudSoldMaintenance'
import CloudOrders from './CloudOrders'
import {cloudOrderCounts,effectiveCloudOrders} from './cloudOrderStatus'
import {useCloudDraftConflictChoice} from './CloudDraftConflictChoice'
import SettingsView from './SettingsView'
import PriceWorkbookPanel from './PriceWorkbookPanel'
import InventoryView,{type InventorySource} from './InventoryView'
import {useMemo} from 'react'
import {cloudInventory} from './cloudInventory'
import './salesDrafts.css'
import {ShopHeader,ShopDrawer,type ShopSection} from './ShopChrome'
import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react'
import CloudSettings from './CloudSettings'
import {cloudRecoveryRequested,cloud,cloudRpc,cloudRows,cloudCommand,retryCloudCommand,pendingCloudCommand,CloudRpcError} from './cloudClient'
import './cloudWorkspace.css'
import {CLOUD_RELEASE} from './cloudRelease'
import CloudDebts from './CloudDebts'
import CloudShare from './CloudShare'
import CloudSold from './CloudSold'
import CloudPhotos from './CloudPhotos'
import CloudCatalog from './CloudCatalog'
import GoodsReceipt from './GoodsReceipt'
import WarehouseImport from './WarehouseImport'
import PhonePhotoInboxView from './PhonePhotoInboxView'
import SoldRetentionView from './SoldRetentionView'
import CloudReports from './CloudReports'
import CloudStocktake from './CloudStocktake'
import CloudOrderEditor from './CloudOrderEditor'
import CloudOrderSlip from './CloudOrderSlip'
import CloudFinance from './CloudFinance'
import CloudCustomers from './CloudCustomers'
import {apiJson} from './uiState'
import DisplayDensity from './DisplayDensity'
import {useBooleanPreference,useDisplaySize} from './uiState'

type Snapshot=Record<string,any[]>
const tables=['categories','inventory_transactions','products','product_variants','product_images','cloud_image_assets','sales_units','sales_orders','sales_order_images','sales_confirmations','order_contacts','shop_customers','stocktake_sessions','stocktake_rows','cloud_photo_inbox','finance_entries','aftercare_cases']
const money=(n:number)=>new Intl.NumberFormat('vi-VN').format(n)+' ₫'
export default function CloudWorkspace(){
 const mobile=useMobileLuxe()
 const [signed,setSigned]=useState(false),[data,setData]=useState<Snapshot>({}),[urls,setUrls]=useState<Record<string,string>>({}),[status,setStatus]=useState('Đang kiểm tra đăng nhập…'),[tab,setTab]=useState(cloudRecoveryRequested?'settings':new URLSearchParams(location.search).has('order')?'orders':'inventory'),[busy,setBusy]=useState(false),[selection,setSelection]=useState<number[]>([]),[query,setQuery]=useState(''),[customerId,setCustomerId]=useState(''),[recipient,setRecipient]=useState(''),[phone,setPhone]=useState(''),[address,setAddress]=useState(''),[shipping,setShipping]=useState('0'),[discount,setDiscount]=useState('0'),[finance,setFinance]=useState<any>(null),[current,setCurrent]=useState(new URLSearchParams(location.search).get('order')||''),[role,setRole]=useState(''),[online,setOnline]=useState(navigator.onLine),[cloudReady,setCloudReady]=useState(false),[receiptSource,setReceiptSource]=useState<string|null>(null),[syncStatus,setSyncStatus]=useState('Đồng bộ lần đầu tại Kết nối'),[localRestore,setLocalRestore]=useState(false)
 const [density,setDensity]=useDisplaySize(),[dark,setDark]=useBooleanPreference('dark-mode',false),[expanded,setExpanded]=useState(false)
 const [menuOpen,setMenuOpen]=useState(false),[menuSearch,setMenuSearch]=useState('')
 const desktop=['localhost','127.0.0.1'].includes(location.hostname)
 useLayoutEffect(()=>{if(mobile)window.scrollTo(0,0)},[tab,mobile])
 useEffect(()=>{const dock=document.querySelector<HTMLElement>('.mobileQuickNav'),shell=document.querySelector<HTMLElement>('.cloudWorkspace');if(!dock||!shell)return;const measure=()=>shell.style.setProperty('--mobile-nav-offset',getComputedStyle(dock).display==='none'?'0px':Math.ceil(innerHeight-dock.getBoundingClientRect().top)+'px');const observer=new ResizeObserver(measure);observer.observe(dock);window.addEventListener('resize',measure);measure();return()=>{observer.disconnect();window.removeEventListener('resize',measure)}},[density])
 useEffect(()=>{if(desktop)void apiJson('/api/health').then(h=>setLocalRestore(!!h.sandbox||!!h.localV2Business)).catch(()=>{})},[desktop])
 const lastSnapshot=useRef('')
 const active=useRef(true),loading=useRef(false),dirty=useRef(false),generation=useRef(0),urlCache=useRef(new Map<string,{url:string;expires:number}>())
 const load=useCallback(async()=>{
  if(loading.current){dirty.current=true;return}
  loading.current=true
  try{
   do{
    dirty.current=false;const token=generation.current
    const health=await cloudRpc('mc_v7_health');if(health.contract!==1||health.schema!==130)throw Error('Phiên bản Cloud chưa tương thích.')
    const signature=JSON.stringify([token,health.sequence,health.role,health.status,health.instance]);if(lastSnapshot.current===signature){setStatus('Đã kiểm tra Cloud · '+new Date().toLocaleTimeString('vi-VN'));return}
    const rows=await Promise.all(tables.map(t=>cloudRows(t)))
    const after=await cloudRpc('mc_v7_health')
    // A refresh event during the snapshot starts another read before showing it.
    if(dirty.current||health.sequence!==after.sequence){dirty.current=true;continue}
    if(!active.current||token!==generation.current)return
    setCloudReady(health.status==='CLOUD_TEST_READY');

    lastSnapshot.current=signature;setData(Object.fromEntries(tables.map((t,i)=>[t,rows[i]])));setRole(health.role)
    setStatus('Đã đọc Cloud · '+new Date().toLocaleTimeString('vi-VN'));window.dispatchEvent(new Event('mecacao-server-change'))
    try{if(['localhost','127.0.0.1'].includes(location.hostname)&&health.status==='CLOUD_TEST_READY'&&health.role==='owner'){const state=await apiJson('/api/cloud/state'),confirmed=rows[tables.indexOf('sales_confirmations')].map(c=>c.order_id).filter(id=>!state.reconciled.includes(id));const session=(await cloud.auth.getSession()).data.session;if(session&&state.enabled){const headers={'Content-Type':'application/json',Authorization:'Bearer '+session.access_token};await apiJson('/api/cloud/prices',{method:'POST',headers,body:'{}'});if(state.businessHistorySync)await apiJson('/api/cloud/business/pull',{method:'POST',headers,body:'{}'})}if(session)for(let start=0;start<confirmed.length;start+=100)await apiJson('/api/cloud/reconcile',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({orders:confirmed.slice(start,start+100)})})}}catch(e){setSyncStatus('Đối soát Windows đang chờ: '+(e as Error).message);lastSnapshot.current=''}
   }while(dirty.current)
  }catch(e){if(active.current){if(e instanceof CloudRpcError&&e.code==='42501'){setData({});setUrls({});setSelection([]);setRole('');setCloudReady(false)}setStatus((e as Error).message+' · Dữ liệu đang hiển thị có thể chưa cập nhật.')}}
  finally{loading.current=false}
 },[])
 useEffect(()=>{
  active.current=true;void cloud.auth.getSession().then(({data})=>setSigned(!!data.session))
  const {data:auth}=cloud.auth.onAuthStateChange((event,session)=>{generation.current++;setSigned(!!session);if(event==='PASSWORD_RECOVERY'&&session)setTab('settings');if(!session){setData({});setUrls({});urlCache.current.clear();setSelection([]);setFinance(null);setRole('')}})
  const connected=()=>{setOnline(navigator.onLine);if(navigator.onLine)void load()}
  const sync=(event:Event)=>setSyncStatus((event as CustomEvent<string>).detail);window.addEventListener('mecacao-cloud-sync-status',sync);
  window.addEventListener('online',connected);window.addEventListener('offline',connected)
  return()=>{active.current=false;generation.current++;auth.subscription.unsubscribe();window.removeEventListener('mecacao-cloud-sync-status',sync);window.removeEventListener('online',connected);window.removeEventListener('offline',connected)}
 },[load])
 useEffect(()=>{
  if(!signed)return
  void load()
  const channel=cloud.channel('v7-business').on('postgres_changes',{event:'INSERT',schema:'public',table:'cloud_sync_events'},()=>void load()).on('postgres_changes',{event:'INSERT',schema:'public',table:'sales_units'},event=>{
   const unit=event.new as any;if(!Number.isSafeInteger(Number(unit.image_id)))return
   setData(previous=>({...previous,sales_units:[...(previous.sales_units||[]).filter(u=>Number(u.image_id)!==Number(unit.image_id)),unit]}));setSelection(previous=>previous.filter(id=>id!==Number(unit.image_id)));void load()
  }).subscribe(state=>{if(state==='SUBSCRIBED')void load();if(state==='CHANNEL_ERROR'||state==='TIMED_OUT')setStatus('Realtime đang kết nối lại; tự kiểm tra dữ liệu mỗi 5 giây.')})
  const interval=setInterval(()=>{if(navigator.onLine&&document.visibilityState==='visible')void load()},5000)
  const visible=()=>{if(document.visibilityState==='visible')void load()};window.addEventListener('mecacao-cloud-sold-cleaned',load);document.addEventListener('visibilitychange',visible)
  return()=>{clearInterval(interval);window.removeEventListener('mecacao-cloud-sold-cleaned',load);document.removeEventListener('visibilitychange',visible);void cloud.removeChannel(channel)}
 },[signed,load])
 useEffect(()=>{
  let cancelled=false,refreshing=false;const token=generation.current
  const assets=data.cloud_image_assets||[]
  const refresh=async()=>{if(refreshing||!navigator.onLine||cancelled)return;refreshing=true;try{const ready=assets.filter(a=>a.ready||a.proof_path).map(a=>({...a,object_path:a.ready?a.object_path:a.proof_path})),missing=ready.filter(a=>!urlCache.current.has(a.object_path)||urlCache.current.get(a.object_path)!.expires<Date.now());for(let start=0;start<missing.length;start+=100){if(cancelled||token!==generation.current)return;const batch=missing.slice(start,start+100);const {data,error}=await cloud.storage.from('shop-mobile-images').createSignedUrls(batch.map(a=>a.object_path),1800);if(error)throw error;for(const entry of data){if(entry.error||!entry.signedUrl)throw Error(entry.error||'Ảnh chưa sẵn sàng.');urlCache.current.set(entry.path!,{url:entry.signedUrl,expires:Date.now()+1200000})}}if(!cancelled&&token===generation.current)setUrls(Object.fromEntries(ready.map(a=>[String(a.image_id),urlCache.current.get(a.object_path)?.url||''])));const paths=new Set(ready.map(a=>a.object_path));for(const key of urlCache.current.keys())if(!paths.has(key))urlCache.current.delete(key)}catch(e){if(!cancelled)setStatus('Không tải được ảnh: '+(e as Error).message)}finally{refreshing=false}}
  void refresh();const timer=setInterval(()=>void refresh(),60000),visible=()=>{if(document.visibilityState==='visible')void refresh()};document.addEventListener('visibilitychange',visible);window.addEventListener('online',refresh)
  return()=>{cancelled=true;clearInterval(timer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('online',refresh)}
 },[data.cloud_image_assets,load])
 useEffect(()=>{if(!signed||tab!=='finance'||!current)return;let cancelled=false;void cloudRpc('mc_v7_finance',{p_id:current}).then(summary=>{if(!cancelled)setFinance(summary)}).catch(e=>{if(!cancelled)setStatus(e.message)});return()=>{cancelled=true}},[signed,tab,current,data])
 async function run(fn:()=>Promise<void>){if(busy||!online)return;setBusy(true);try{await fn();await load()}catch(e){setStatus((e as Error).message)}finally{setBusy(false)}}
 async function command(action:string,payload:any){return cloudCommand(action,payload)}
 const sold=new Set((data.sales_units||[]).map(u=>Number(u.image_id))),ready=new Set((data.cloud_image_assets||[]).filter(a=>a.ready&&a.source_present!==false).map(a=>Number(a.image_id)))
 const productsById=new Map((data.products||[]).map(p=>[p.id,p])),variantsById=new Map((data.product_variants||[]).map(v=>[v.id,v]))
 const allCards=(data.product_images||[]).filter(i=>!sold.has(Number(i.id))&&ready.has(Number(i.id))).map(i=>({...i,product:productsById.get(i.product_id),variant:variantsById.get(i.variant_id)})).filter(i=>i.product?.status==='active'&&i.variant?.status==='active')
 const inventorySource=useMemo<InventorySource>(()=>({...cloudInventory(data),urls,refresh:load,share:(images,onBusy)=><CloudShare items={images} urls={urls} onBusy={onBusy}/>}),[data,urls,load])
 const draftConflict=useCloudDraftConflictChoice(urls)
 async function inventoryDraft(ids:number[]){if(!canSell||busy||!online)throw Error('Kết nối mạng và đăng nhập tài khoản bán hàng để tạo đơn.');const selected=allCards.filter(i=>ids.includes(Number(i.id)));if(selected.length!==ids.length)throw Error('Ảnh đã thay đổi. Làm mới tồn kho và chọn lại.');setBusy(true);try{const id=crypto.randomUUID();await draftConflict.submit(ids,id,acknowledgeDraftConflict=>command('draft.save',{id,version:0,items:selected.map(i=>({imageId:i.id,unitPrice:i.variant.sale_price})),discount:0,acknowledgeDraftConflict,contact:{customerId:null,recipientName:'',phone:'',address:'',shippingFee:0}}));setCurrent(id);setTab('orders');await load()}finally{setBusy(false)}}
 const effectiveOrders=useMemo(()=>effectiveCloudOrders(data.sales_orders||[],data.sales_confirmations||[]),[data.sales_orders,data.sales_confirmations])
 const orderCounts=useMemo(()=>cloudOrderCounts(effectiveOrders),[effectiveOrders])
 const cards=allCards.filter(i=>[i.product.name,i.product.product_code,i.variant.size,i.variant.sku].join(' ').toLowerCase().includes(query.toLowerCase()))
 useEffect(()=>{const valid=new Set(allCards.map(i=>Number(i.id)));setSelection(old=>old.filter(id=>valid.has(id)))},[data])
 const selected=allCards.filter(i=>selection.includes(Number(i.id)))
 const canSell=cloudReady&&(role==='owner'||role==='cashier')
 async function confirmSale(o:any){const items=(data.sales_order_images||[]).filter(i=>i.order_id===o.id),total=items.reduce((n,i)=>n+i.unit_price,0)-o.discount;const zero=items.some(i=>i.unit_price===0);if(!window.confirm('Chốt SOLD '+items.length+' ảnh, tiền hàng '+money(total)+(zero?' · có ảnh giá 0 ₫':'')+'? Thao tác sẽ trừ tồn Cloud.'))return;await command('sale.confirm',{id:o.id,version:o.version,confirmed:true,acknowledgeZeroPrice:zero});window.dispatchEvent(new Event('mecacao-cloud-sold-check'));setStatus('Đã chốt SOLD. Laptop sẽ xác minh ảnh lưu và tự dọn ảnh Cloud khi kết nối.')}
 async function createDraft(){const id=crypto.randomUUID();await command('draft.save',{id,version:0,items:selected.map(i=>({imageId:i.id,unitPrice:i.variant.sale_price})),discount:Number(discount),contact:{customerId:customerId||null,recipientName:recipient,phone,address,shippingFee:Number(shipping)}});setSelection([]);setCurrent(id);setTab('orders');setStatus('Đã lưu đơn nháp Cloud. Chưa trừ tồn.')}
 async function openFinance(id:string){setCurrent(id);setFinance(await cloudRpc('mc_v7_finance',{p_id:id}));setTab('finance')}
 const sections:ShopSection[]=[...(role==='owner'?[{key:'customerCatalog',label:'Catalog khách hàng',icon:'▦'}]:[]),{key:'overview',label:'Tổng quan',icon:'⌂'},{key:'catalog',label:'Danh mục sản phẩm',icon:'▦'},...(desktop?[{key:'receipt',label:'Nhập hàng',icon:'＋'},{key:'import',label:'Import kho',icon:'⇩'}]:[]),{key:'inventory',label:'Tồn kho',icon:'▤'},{key:'customers',label:'Khách hàng',icon:'♧'},{key:'orders',label:'Bán hàng',icon:'▧'},{key:'finance',label:'Công nợ',icon:'₫'},{key:'reports',label:'Báo cáo',icon:'▥'},{key:'stocktake',label:'Kiểm kê',icon:'✓'},{key:'soldCloud',label:'Ảnh SOLD',icon:'▧'},{key:'photos',label:'Ảnh iPhone',icon:'▧'},...(desktop?[{key:'phone',label:'Duyệt ảnh trên máy',icon:'▧'},{key:'sold',label:'Lưu trữ SOLD trên máy',icon:'▧'}]:[]),{key:'connect',label:'Kết nối Cloud',icon:'☁'},{key:'settings',label:'Cài đặt',icon:'⚙'}].filter(s=>role!=='inventory'||['overview','inventory','catalog','stocktake','photos','connect','settings'].includes(s.key))
 function navigate(key:string){if(!window.dispatchEvent(new Event('mecacao-before-navigate',{cancelable:true})))return;if(mobile)window.scrollTo(0,0);setTab(key);setMenuOpen(false);setMenuSearch('')}
 async function mobileLogout(){
  if(busy||!window.dispatchEvent(new Event('mecacao-before-navigate',{cancelable:true})))return
  setBusy(true)
  try{
   const {error}=await cloud.auth.signOut()
   if(error)throw error
   setMenuOpen(false);setTab('connect')
   setStatus('Đã đăng xuất tài khoản Cloud trên thiết bị này.')
  }catch(e){
   setMenuOpen(false)
   setStatus('Không thể đăng xuất: '+(e as Error).message)
  }finally{setBusy(false)}
 }

 const recoveryAction=<button className="salesAction salesActionSecondary mobileRecoveryAction" disabled={busy||!online} onClick={()=>run(async()=>{const pending=await pendingCloudCommand();const result=await retryCloudCommand();if(result&&pending?.action==='draft.save')setSelection([]);if(result&&pending?.action.startsWith('finance.'))await openFinance(pending.payload.id);setStatus(result?'Đã xác minh thao tác trước. Đọc lại đơn trước khi tiếp tục.':'Không có thao tác đang chờ xác minh.');if(result?.id&&pending?.action==='customer.save')setTab('customers');else if(result?.id&&pending?.action.startsWith('draft.')){setCurrent(result.id);setTab('orders')}})}>Kiểm tra thao tác trước</button>
 return <div className={'shell mobileLuxeWorkspace cloudWorkspace'+(!signed?' mobileAuthWorkspace':'')+' density'+density[0].toUpperCase()+density.slice(1)+(density==='small'?' densityCompact':' densityComfort')+(dark?' themeDark':'')}>
 {draftConflict.dialog}<ShopHeader density={density} onDensity={setDensity} dark={dark} onTheme={()=>setDark(v=>!v)} onMenu={()=>setMenuOpen(true)} menuOpen={menuOpen} mode="CLOUD">{mobile&&signed&&<MobileSystemPanel children={recoveryAction} status={status} online={online} disabled={busy} onRefresh={()=>void load()} notices={sections.some(s=>s.key==='orders')?[...effectiveOrders].sort((a,b)=>String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||''))).slice(0,5).map(o=>({id:o.id,title:'Đơn '+o.id.slice(0,8).toUpperCase(),description:o.status==='DRAFT'?'Đơn nháp · chưa trừ tồn':o.status==='SOLD'?'Đã bán · xem lịch sử':'Đã hủy nháp',onOpen:()=>{if(window.dispatchEvent(new Event('mecacao-before-navigate',{cancelable:true}))){setCurrent(o.id);navigate('orders')}}})):[]}/>}</ShopHeader>
 {menuOpen&&<ShopDrawer sections={sections} active={tab} onNavigate={navigate} onClose={()=>setMenuOpen(false)} search={menuSearch} onSearch={setMenuSearch} density={density} onDensity={setDensity} mode="CLOUD" onMobileLogout={mobile&&signed&&!busy?()=>void mobileLogout():undefined}/>}
 <div className="layout"><nav className="sidebar" aria-label="Danh mục chức năng Cloud">{sections.map(s=><button key={s.key} className={tab===s.key?'active':''} onClick={()=>navigate(s.key)}><ShopIcon label={s.label}/><strong>{s.label}</strong></button>)}</nav><main>
 <MobileLuxeSectionHeader title={sections.find(s=>s.key===tab)?.label||'Shop Mẹ CaCao'} mode="CLOUD"/>
 <nav className="pageBreadcrumb" aria-label="Vị trí hiện tại"><button onClick={()=>navigate('overview')}>Tổng quan</button><span>›</span><strong>{sections.find(s=>s.key===tab)?.label||'Shop Mẹ CaCao'}</strong></nav>
 <p className="muted cloudBuildLabel">Shop Mẹ CaCao · {CLOUD_RELEASE}</p>
 <div className={'shopSyncStatus'+(!online?' offline':'')+(signed&&/^(Đã đọc Cloud|Đã kiểm tra Cloud)/.test(status)?' mobileStatusQuiet':'')} role="status"><span className="shopSyncDot"/><span>{online?status:'Mất mạng. Chỉ xem dữ liệu đã đọc; kết nối lại để thao tác.'}</span><button disabled={!signed||busy||!online} onClick={()=>void load()}>Đọc lại</button></div>
 {tab==='overview'&&(mobile&&signed?<MobileOverview metrics={[{label:'Tồn sẵn sàng Cloud',value:allCards.length,hint:'Ảnh đã tải, chưa SOLD',route:'inventory',icon:'Kho ảnh'},role==='inventory'?{label:'Size / SKU',value:(data.product_variants||[]).length,hint:'Biến thể sản phẩm',route:'catalog',icon:'Danh mục sản phẩm'}:{label:'Đơn nháp',value:orderCounts.drafts,hint:'Chưa trừ tồn',route:'orders',icon:'Bán hàng'},{label:'Mẫu sản phẩm',value:(data.products||[]).length,hint:'Trong dữ liệu đã đọc',route:'catalog',icon:'Danh mục sản phẩm'},role==='inventory'?{label:'Size hết hàng',value:inventorySource.dashboard.outOfStock,hint:'Theo dữ liệu đã đọc',route:'inventory',icon:'Kho ảnh'}:{label:'Ảnh đã SOLD',value:sold.size,hint:'Theo lịch sử bán',route:'soldCloud',icon:'Ảnh'}]} products={inventorySource.dashboard.topProducts} onNavigate={navigate} stockRoute="inventory"><div className="mobileQuickLinks"><button onClick={()=>navigate('inventory')}><ShopIcon label="Ảnh"/> Chọn ảnh gửi khách</button>{canSell&&<button onClick={()=>navigate('orders')}><ShopIcon label="Bán hàng"/> Xem đơn hàng</button>}</div></MobileOverview>:<section className="overview"><div className="overviewWelcome"><div><span className="overviewKicker">TỔNG QUAN KHO HÀNG</span><h2>Hôm nay ở Shop Mẹ CaCao</h2><p>{signed?'Dữ liệu Cloud dùng chung trên Windows và iPhone':'Đăng nhập tại Cài đặt để xem dữ liệu shop'}</p></div>{desktop&&<button className="overviewAction" onClick={()=>navigate('receipt')}>＋ Nhập hàng</button>}</div>{signed&&<section className="overviewStats"><button className="overviewStat mainStat" onClick={()=>navigate('inventory')}><span>TỔNG TỒN SẴN SÀNG CLOUD</span><strong>{allCards.length}</strong><small>Bộ có ảnh sẵn sàng, chưa SOLD</small></button><button className="overviewStat" onClick={()=>navigate('catalog')}><span>MẪU SẢN PHẨM</span><strong>{(data.products||[]).length}</strong></button><button className="overviewStat" onClick={()=>navigate('catalog')}><span>SIZE / SKU</span><strong>{(data.product_variants||[]).length}</strong></button><button className="overviewStat" onClick={()=>navigate('orders')}><span>ĐƠN NHÁP</span><strong>{orderCounts.drafts}</strong></button></section>}</section>)}

 {signed&&(!mobile||tab==='connect')&&recoveryAction}
 {signed&&!cloudReady&&<p className="notice warning" role="alert">Chưa đồng bộ đủ nghiệp vụ từ laptop. Tồn Cloud có thể chưa phản ánh đơn vừa bán. Mở Kết nối Cloud trên laptop → Đồng bộ / Tiếp tục trước khi chốt bán trên mobile.</p>}
 {!signed&&<div className="mobileLoginIntro"><img src={import.meta.env.BASE_URL+'brand/logo.jpg'} alt="Logo Shop Mẹ CaCao"/><h1>Mẹ CaCao</h1><span>TRAVEL LUXE · SINCE 2023</span><p>Chào mừng trở lại cửa hàng của mình.</p></div>}
 {signed&&mobile&&tab==='settings'&&<MobileAppearance density={density} onDensity={setDensity} dark={dark} onTheme={()=>setDark(v=>!v)} onConnection={()=>navigate('connect')} onLogout={busy?undefined:()=>void mobileLogout()}/>}
 {signed&&mobile&&tab==='connect'&&<MobileCloudSummary status={status} online={online} images={allCards.length} products={(data.products||[]).length} disabled={busy} onRefresh={()=>void load()}/>}
 <div hidden={signed&&tab!=='connect'&&tab!=='settings'}><details className="mobileAccountSettings" open={!mobile||!signed||cloudRecoveryRequested}><summary>Tài khoản & kết nối Cloud <span>›</span></summary><CloudSettings autoSync desktop={desktop}/></details></div>{!signed&&<div className="mobileLoginFooter"><img src={import.meta.env.BASE_URL+'brand/travel-luxe-login-scene.svg'} alt=""/><span>Good Business · Good Journey</span></div>}
 {tab==='settings'&&<><section className="displayPreferences"><div><h3>Cài đặt giao diện · Mật độ hiển thị</h3><p>Nhỏ để xem bao quát, Vừa để dùng hằng ngày, Lớn để dễ đọc và chạm.</p></div><DisplayDensity value={density} onChange={setDensity}/></section>{desktop&&<details className="mobileLocalSettings" open={!mobile}><summary>Cài đặt trên laptop</summary><SettingsView showCloud={false} sandbox={localRestore}/></details>}</>}
 {desktop&&signed&&<CloudSoldMaintenance/>}
 {signed&&tab==='inventory'&&<InventoryView priceTools={role==='owner'||role==='inventory'?<PriceWorkbookPanel cloud onChanged={load}/>:undefined} source={inventorySource} onDraft={canSell?inventoryDraft:undefined}/>}
 {signed&&tab==='orders'&&<CloudOrders canReturnOnLaptop={desktop&&role==='owner'} assets={data.cloud_image_assets||[]} orders={effectiveOrders} items={data.sales_order_images||[]} contacts={data.order_contacts||[]} confirmations={data.sales_confirmations||[]} customers={data.shop_customers||[]} urls={urls} current={current} onPick={id=>{if(window.dispatchEvent(new Event('mecacao-before-navigate',{cancelable:true})))setCurrent(id)}} onInventory={()=>navigate('inventory')} onFinance={id=>void run(()=>openFinance(id))} onConfirm={o=>void run(()=>confirmSale(o))} onCancel={(id,version)=>{if(window.confirm('Hủy đơn nháp này?'))void run(async()=>{await command('draft.cancel',{id,version})})}} onChanged={load} editable={canSell} busy={busy} online={online} ready={cloudReady}/>}

 {signed&&tab==='soldCloud'&&<CloudSold units={data.sales_units||[]} assets={data.cloud_image_assets||[]} urls={urls} desktop={role==='owner'&&['localhost','127.0.0.1'].includes(location.hostname)} onChanged={load}/>}
 {signed&&tab==='photos'&&role!=='viewer'&&<CloudPhotos rows={data.cloud_photo_inbox||[]} desktop={['localhost','127.0.0.1'].includes(location.hostname)} onChanged={load}/>}
 {signed&&tab==='customerCatalog'&&role==='owner'&&<CustomerCatalogAdmin onOrder={id=>{setCurrent(id);navigate('orders');void load()}}/>}
 {signed&&tab==='catalog'&&<CloudCatalog stock={inventorySource.products} urls={urls} products={data.products||[]} variants={data.product_variants||[]} editable={role==='owner'||role==='inventory'} onChanged={load}/>}
 {desktop&&tab==='receipt'&&<GoodsReceipt initialSourcePath={receiptSource} onInitialSourceApplied={()=>setReceiptSource(null)} onDone={()=>{window.dispatchEvent(new Event('mecacao-cloud-sync-now'));setTab('settings')}}/>}
 {desktop&&tab==='import'&&<WarehouseImport isDemo={false} onChanged={()=>{window.dispatchEvent(new Event('mecacao-cloud-sync-now'));setTab('settings')}}/>}
 {signed&&['localhost','127.0.0.1'].includes(location.hostname)&&tab==='phone'&&<PhonePhotoInboxView mobile={false} onBeginReceipt={folder=>{setReceiptSource(folder);setTab('receipt')}}/>}
 {signed&&['localhost','127.0.0.1'].includes(location.hostname)&&tab==='sold'&&<SoldRetentionView/>}
 {signed&&tab==='reports'&&<CloudReports onOrder={id=>{setCurrent(id);navigate('orders')}}/>}
 {signed&&tab==='stocktake'&&<CloudStocktake sessions={data.stocktake_sessions||[]} rows={data.stocktake_rows||[]} editable={role==='owner'||role==='inventory'} onChanged={load}/>}
 {signed&&tab==='customers'&&<CloudCustomers rows={data.shop_customers||[]} editable={canSell} onChanged={load}/>}
 {signed&&tab==='finance'&&<section className="salesDraftPage"><header className="salesHeading"><div><h2>Tiền / Công nợ</h2></div></header>{finance&&current?<><p>Đơn {current.slice(0,8).toUpperCase()}</p><p>{({COD:'COD',CASH:'Tiền mặt',TRANSFER:'Chuyển khoản'} as Record<string,string>)[finance.method]||finance.method} · {({NEW:'Chưa giao',SHIPPED:'Đã gửi',DELIVERED:'Đã giao',FAILED:'Giao thất bại'} as Record<string,string>)[finance.delivery]||finance.delivery}</p><CloudFinance key={current} entries={data.finance_entries||[]} cases={data.aftercare_cases||[]} id={current} summary={finance} editable={canSell} onChanged={async()=>{await openFinance(current);await load()}}/><button disabled={busy||!online} onClick={()=>run(()=>openFinance(current))}>Đọc lại số tiền</button></>:<CloudDebts refresh={data} onOpen={id=>void run(()=>openFinance(id))}/>}</section>}
 </main></div>
 <MobileLuxeNav items={sections} active={tab} onNavigate={navigate} onMore={()=>setMenuOpen(true)} cloudRoute="connect"/>
 </div>
}
