import {useCallback,useEffect,useRef,useState} from 'react'
import CloudSettings from './CloudSettings'
import {cloud,cloudRpc,cloudRows,cloudCommand,retryCloudCommand,pendingCloudCommand,CloudRpcError} from './cloudClient'
import './cloudWorkspace.css'
import {CLOUD_RELEASE,CLOUD_PROGRESS} from './cloudRelease'
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
const tables=['products','product_variants','product_images','cloud_image_assets','sales_units','sales_orders','sales_order_images','sales_confirmations','order_contacts','shop_customers','stocktake_sessions','stocktake_rows','cloud_photo_inbox','finance_entries','aftercare_cases']
const money=(n:number)=>new Intl.NumberFormat('vi-VN').format(n)+' ₫'
export default function CloudWorkspace(){
 const [signed,setSigned]=useState(false),[data,setData]=useState<Snapshot>({}),[urls,setUrls]=useState<Record<string,string>>({}),[status,setStatus]=useState('Đang kiểm tra đăng nhập…'),[tab,setTab]=useState('inventory'),[busy,setBusy]=useState(false),[selection,setSelection]=useState<number[]>([]),[query,setQuery]=useState(''),[recipient,setRecipient]=useState(''),[phone,setPhone]=useState(''),[address,setAddress]=useState(''),[shipping,setShipping]=useState('0'),[discount,setDiscount]=useState('0'),[finance,setFinance]=useState<any>(null),[current,setCurrent]=useState(''),[role,setRole]=useState(''),[online,setOnline]=useState(navigator.onLine),[cloudReady,setCloudReady]=useState(false),[receiptSource,setReceiptSource]=useState<string|null>(null),[syncStatus,setSyncStatus]=useState('Đồng bộ lần đầu tại Kết nối')
 const [density,setDensity]=useDisplaySize(),[dark,setDark]=useBooleanPreference('dark-mode',false),[expanded,setExpanded]=useState(false)
 const active=useRef(true),loading=useRef(false),dirty=useRef(false),generation=useRef(0),urlCache=useRef(new Map<string,{url:string;expires:number}>())
 const load=useCallback(async()=>{
  if(loading.current){dirty.current=true;return}
  loading.current=true
  try{
   do{
    dirty.current=false;const token=generation.current
    const health=await cloudRpc('mc_v7_health');if(health.contract!==1||health.schema!==130)throw Error('Phiên bản Cloud chưa tương thích.')
    const rows=await Promise.all(tables.map(t=>cloudRows(t)))
    const after=await cloudRpc('mc_v7_health')
    // A refresh event during the snapshot starts another read before showing it.
    if(dirty.current||health.sequence!==after.sequence){dirty.current=true;continue}
    if(!active.current||token!==generation.current)return
    setCloudReady(health.status==='CLOUD_TEST_READY');
    if(['localhost','127.0.0.1'].includes(location.hostname)&&health.status==='CLOUD_TEST_READY'){const state=await apiJson('/api/cloud/state'),confirmed=rows[tables.indexOf('sales_confirmations')].map(c=>c.order_id).filter(id=>!state.reconciled.includes(id));const session=(await cloud.auth.getSession()).data.session;if(session&&state.enabled)await apiJson('/api/cloud/prices',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:'{}'});if(session)for(let start=0;start<confirmed.length;start+=100)await apiJson('/api/cloud/reconcile',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({orders:confirmed.slice(start,start+100)})})}
    setData(Object.fromEntries(tables.map((t,i)=>[t,rows[i]])));setRole(health.role)
    setStatus('Đã đọc Cloud · '+new Date().toLocaleTimeString('vi-VN'))
   }while(dirty.current)
  }catch(e){if(active.current){if(e instanceof CloudRpcError&&e.code==='42501'){setData({});setUrls({});setSelection([]);setRole('');setCloudReady(false)}setStatus((e as Error).message+' · Dữ liệu đang hiển thị có thể chưa cập nhật.')}}
  finally{loading.current=false}
 },[])
 useEffect(()=>{
  active.current=true;void cloud.auth.getSession().then(({data})=>setSigned(!!data.session))
  const {data:auth}=cloud.auth.onAuthStateChange((_event,session)=>{generation.current++;setSigned(!!session);if(!session){setData({});setUrls({});urlCache.current.clear();setSelection([]);setFinance(null);setRole('')}})
  const connected=()=>{setOnline(navigator.onLine);if(navigator.onLine)void load()}
  const sync=(event:Event)=>setSyncStatus((event as CustomEvent<string>).detail);window.addEventListener('mecacao-cloud-sync-status',sync);
  window.addEventListener('online',connected);window.addEventListener('offline',connected)
  return()=>{active.current=false;generation.current++;auth.subscription.unsubscribe();window.removeEventListener('mecacao-cloud-sync-status',sync);window.removeEventListener('online',connected);window.removeEventListener('offline',connected)}
 },[load])
 useEffect(()=>{
  if(!signed)return
  void load()
  const channel=cloud.channel('v7-business').on('postgres_changes',{event:'INSERT',schema:'public',table:'cloud_sync_events'},()=>void load()).subscribe(state=>{if(state==='SUBSCRIBED')void load();if(state==='CHANNEL_ERROR'||state==='TIMED_OUT')setStatus('Realtime đang kết nối lại; tự đọc lại định kỳ.')})
  const interval=setInterval(()=>{if(navigator.onLine&&document.visibilityState==='visible')void load()},30000)
  const visible=()=>{if(document.visibilityState==='visible')void load()};document.addEventListener('visibilitychange',visible)
  return()=>{clearInterval(interval);document.removeEventListener('visibilitychange',visible);void cloud.removeChannel(channel)}
 },[signed,load])
 useEffect(()=>{
  let cancelled=false;const token=generation.current
  const assets=data.cloud_image_assets||[]
  void (async()=>{const ready=assets.filter(a=>a.ready),missing=ready.filter(a=>!urlCache.current.has(a.object_path)||urlCache.current.get(a.object_path)!.expires<Date.now());for(let start=0;start<missing.length;start+=100){if(cancelled||token!==generation.current)return;const batch=missing.slice(start,start+100);const {data,error}=await cloud.storage.from('shop-mobile-images').createSignedUrls(batch.map(a=>a.object_path),1800);if(error)throw error;for(const entry of data){if(entry.error||!entry.signedUrl)throw Error(entry.error||'Ảnh chưa sẵn sàng.');urlCache.current.set(entry.path!,{url:entry.signedUrl,expires:Date.now()+1200000})}}if(!cancelled&&token===generation.current)setUrls(Object.fromEntries(ready.map(a=>[String(a.image_id),urlCache.current.get(a.object_path)?.url||''])));const paths=new Set(ready.map(a=>a.object_path));for(const key of urlCache.current.keys())if(!paths.has(key))urlCache.current.delete(key)})().catch(e=>{if(!cancelled)setStatus('Không tải được ảnh: '+e.message)})
  const timer=setInterval(()=>{void load()},1500000)
  return()=>{cancelled=true;clearInterval(timer)}
 },[data.cloud_image_assets,load])
 async function run(fn:()=>Promise<void>){if(busy||!online)return;setBusy(true);try{await fn();await load()}catch(e){setStatus((e as Error).message)}finally{setBusy(false)}}
 async function command(action:string,payload:any){return cloudCommand(action,payload)}
 const sold=new Set((data.sales_units||[]).map(u=>Number(u.image_id))),ready=new Set((data.cloud_image_assets||[]).filter(a=>a.ready).map(a=>Number(a.image_id)))
 const allCards=(data.product_images||[]).filter(i=>!sold.has(Number(i.id))&&ready.has(Number(i.id))).map(i=>({...i,product:(data.products||[]).find(p=>p.id===i.product_id),variant:(data.product_variants||[]).find(v=>v.id===i.variant_id)})).filter(i=>i.product?.status==='active'&&i.variant?.status==='active')
 const cards=allCards.filter(i=>[i.product.name,i.product.product_code,i.variant.size,i.variant.sku].join(' ').toLowerCase().includes(query.toLowerCase()))
 useEffect(()=>{const valid=new Set(allCards.map(i=>Number(i.id)));setSelection(old=>old.filter(id=>valid.has(id)))},[data])
 const selected=allCards.filter(i=>selection.includes(Number(i.id)))
 const canSell=role==='owner'||role==='cashier'
 async function confirmSale(o:any){const items=(data.sales_order_images||[]).filter(i=>i.order_id===o.id),total=items.reduce((n,i)=>n+i.unit_price,0)-o.discount;const zero=items.some(i=>i.unit_price===0);if(!window.confirm('Chốt SOLD '+items.length+' ảnh, tiền hàng '+money(total)+(zero?' · có ảnh giá 0 ₫':'')+'? Thao tác sẽ trừ tồn Cloud.'))return;await command('sale.confirm',{id:o.id,version:o.version,confirmed:true,acknowledgeZeroPrice:zero});setStatus('Đã chốt SOLD trên Cloud. Windows sẽ đối soát ảnh gốc khi kết nối.')}
 async function createDraft(){const id=crypto.randomUUID();await command('draft.save',{id,version:0,items:selected.map(i=>({imageId:i.id,unitPrice:i.variant.sale_price})),discount:Number(discount),contact:{recipientName:recipient,phone,address,shippingFee:Number(shipping)}});setSelection([]);setCurrent(id);setTab('orders');setStatus('Đã lưu đơn nháp Cloud. Chưa trừ tồn.')}
 async function openFinance(id:string){setCurrent(id);setFinance(await cloudRpc('mc_v7_finance',{p_id:id}));setTab('finance')}
 return <main className={'shell cloudWorkspace density'+density[0].toUpperCase()+density.slice(1)+(dark?' themeDark':'')}><header><h1>Shop Mẹ Ca Cao · Cloud V7</h1><p>{CLOUD_RELEASE} · Core schema 130 · {CLOUD_PROGRESS}</p><DisplayDensity value={density} onChange={setDensity}/><button onClick={()=>setDark(v=>!v)}>{dark?'Giao diện sáng':'Giao diện tối'}</button></header><p className="notice" role="status">{online?status:'Mất mạng. Chỉ xem dữ liệu đã đọc; kết nối lại để thao tác.'}</p><nav className="cloudTabs">{[['inventory','Tồn kho'],['catalog','Danh mục / Giá'],['orders','Đơn hàng'],['customers','Khách hàng'],['finance','Công nợ'],['reports','Báo cáo'],['stocktake','Kiểm kê'],['soldCloud','SOLD Cloud'],['photos','Ảnh Cloud'],['settings','Kết nối'],...(['localhost','127.0.0.1'].includes(location.hostname)?[['receipt','Nhập hàng'],['import','Import kho'],['phone','Ảnh iPhone'],['sold','Ảnh SOLD']]:[])].filter(([key])=>role!=='inventory'||['inventory','catalog','stocktake','photos','settings'].includes(key)).map(([key,label])=><button key={key} className={tab===key?'primary':''} onClick={()=>setTab(key)}>{label}</button>)}<button disabled={!signed||busy||!online} onClick={()=>void load()}>Đọc lại</button></nav>
 {signed&&<button disabled={busy||!online} onClick={()=>run(async()=>{const pending=await pendingCloudCommand();const result=await retryCloudCommand();if(result&&pending?.action==='draft.save')setSelection([]);if(result&&pending?.action.startsWith('finance.'))await openFinance(pending.payload.id);setStatus(result?'Đã xác minh thao tác trước. Đọc lại đơn trước khi tiếp tục.':'Không có thao tác đang chờ xác minh.');if(result?.id&&pending?.action==='customer.save')setTab('customers');else if(result?.id&&pending?.action.startsWith('draft.')){setCurrent(result.id);setTab('orders')}})}>Kiểm tra thao tác trước</button>}
 <details open={!signed||tab==='settings'}><summary>{['localhost','127.0.0.1'].includes(location.hostname)?'Đồng bộ Windows: '+syncStatus:'Kết nối Cloud'}</summary><CloudSettings autoSync desktop={location.hostname==='localhost'||location.hostname==='127.0.0.1'}/></details>
 {signed&&tab==='inventory'&&<><label>Tìm sản phẩm / size<input value={query} onChange={e=>setQuery(e.target.value)}/></label><p>{cards.length} ảnh tồn sẵn sàng Cloud · {selection.length} đã chọn</p><div className="cloudGrid">{cards.map(i=><button className={'cloudCard '+(selection.includes(Number(i.id))?'selected':'')} key={i.id} disabled={!selection.includes(Number(i.id))&&selection.length>=100} onClick={()=>setSelection(old=>old.includes(Number(i.id))?old.filter(id=>id!==Number(i.id)):[...old,Number(i.id)])}>{urls[i.id]&&<img loading="lazy" src={urls[i.id]} alt={i.product.name}/>}<strong>{i.product.product_code} · {i.product.name}</strong><span>Size {i.variant.size} · {money(i.variant.sale_price)}</span></button>)}</div>{selected.length>0&&<section className="cloudSelection panel"><button aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'Thu gọn':'Mở thao tác'}</button><strong>{selected.length} ảnh / {selected.length} bộ · {new Set(selected.map(i=>i.product_id)).size} Product / {new Set(selected.map(i=>i.variant_id)).size} Size</strong>{expanded&&<><label>Người nhận<input value={recipient} onChange={e=>setRecipient(e.target.value)}/></label><label>Điện thoại<input value={phone} onChange={e=>setPhone(e.target.value)}/></label><label>Địa chỉ<input value={address} onChange={e=>setAddress(e.target.value)}/></label><label>Phí ship<input type="number" min="0" step="1" value={shipping} onChange={e=>setShipping(e.target.value)}/></label><label>Giảm giá<input type="number" min="0" step="1" value={discount} onChange={e=>setDiscount(e.target.value)}/></label><button className="primary" disabled={!canSell||busy||!online||selected.length!==selection.length} onClick={()=>run(createDraft)}>Tạo đơn nháp</button><button onClick={()=>setSelection([])}>Bỏ chọn</button><CloudShare items={selected} urls={urls}/></>}</section>}</>}
 {signed&&tab==='orders'&&<section className="panel"><h2>Đơn Cloud</h2><p>Đơn nháp chưa trừ tồn. Chốt SOLD trừ tồn Cloud. Ảnh gốc đối soát trên Windows khi máy kết nối.</p>{(data.sales_orders||[]).map(o=>{const confirmed=(data.sales_confirmations||[]).some(c=>c.order_id===o.id);const contact=(data.order_contacts||[]).find(c=>c.order_id===o.id);return <article key={o.id} className="cloudOrder"><strong>{contact?.recipient_name||'Chưa có người nhận'}</strong><p>{confirmed?'SOLD':o.status} · {o.id} · bản {o.version}</p><CloudOrderSlip key={o.id+':slip:'+o.version} order={o} items={(data.sales_order_images||[]).filter(i=>i.order_id===o.id)} contact={contact} urls={urls}/>{!confirmed&&o.status==='DRAFT'&&canSell&&<CloudOrderEditor key={o.id+':edit:'+o.version} order={o} items={(data.sales_order_images||[]).filter(i=>i.order_id===o.id)} contact={contact} onChanged={load}/>}<button disabled={busy||!online} onClick={()=>run(()=>openFinance(o.id))}>Tiền / Công nợ</button>{!confirmed&&o.status==='DRAFT'&&canSell&&<><button disabled={busy||!online||!cloudReady} onClick={()=>run(()=>confirmSale(o))}>Chốt SOLD</button><button disabled={busy||!online} onClick={()=>{if(window.confirm('Hủy đơn nháp này?'))void run(async()=>{await command('draft.cancel',{id:o.id,version:o.version})})}}>Hủy nháp</button></>}</article>})}</section>}
 {signed&&tab==='soldCloud'&&<CloudSold units={data.sales_units||[]} assets={data.cloud_image_assets||[]} urls={urls} desktop={role==='owner'&&['localhost','127.0.0.1'].includes(location.hostname)} onChanged={load}/>}
 {signed&&tab==='photos'&&role!=='viewer'&&<CloudPhotos rows={data.cloud_photo_inbox||[]} desktop={['localhost','127.0.0.1'].includes(location.hostname)} onChanged={load}/>}
 {signed&&tab==='catalog'&&<CloudCatalog products={data.products||[]} variants={data.product_variants||[]} editable={role==='owner'||role==='inventory'} onChanged={load}/>}
 {signed&&['localhost','127.0.0.1'].includes(location.hostname)&&tab==='receipt'&&<GoodsReceipt initialSourcePath={receiptSource} onInitialSourceApplied={()=>setReceiptSource(null)} onDone={()=>{window.dispatchEvent(new Event('mecacao-cloud-sync-now'));setTab('settings')}}/>}
 {signed&&['localhost','127.0.0.1'].includes(location.hostname)&&tab==='import'&&<WarehouseImport isDemo={false} onChanged={()=>{window.dispatchEvent(new Event('mecacao-cloud-sync-now'));setTab('settings')}}/>}
 {signed&&['localhost','127.0.0.1'].includes(location.hostname)&&tab==='phone'&&<PhonePhotoInboxView mobile={false} onBeginReceipt={folder=>{setReceiptSource(folder);setTab('receipt')}}/>}
 {signed&&['localhost','127.0.0.1'].includes(location.hostname)&&tab==='sold'&&<SoldRetentionView/>}
 {signed&&tab==='reports'&&<CloudReports/>}
 {signed&&tab==='stocktake'&&<CloudStocktake sessions={data.stocktake_sessions||[]} rows={data.stocktake_rows||[]} editable={role==='owner'||role==='inventory'} onChanged={load}/>}
 {signed&&tab==='customers'&&<CloudCustomers rows={data.shop_customers||[]} editable={canSell} onChanged={load}/>}
 {signed&&tab==='finance'&&<section className="panel"><h2>Tiền / Công nợ</h2>{finance&&current?<><p>Đơn {current}</p><p>Tổng {money(finance.adjustedTotal)} · đã thu {money(finance.netCollected)} · còn {money(finance.due)}</p><p>{finance.method} · {finance.delivery}</p><CloudFinance key={current+':'+finance.version} entries={data.finance_entries||[]} cases={data.aftercare_cases||[]} id={current} summary={finance} editable={canSell} onChanged={async()=>{await openFinance(current);await load()}}/><button disabled={busy||!online} onClick={()=>run(()=>openFinance(current))}>Đọc lại số tiền</button></>:<CloudDebts onOpen={id=>void run(()=>openFinance(id))}/>}</section>}
 {signed&&<nav className="cloudBottomNav" aria-label="Thao tác nhanh">{(role==='inventory'?[['inventory','Tồn kho'],['catalog','Giá'],['stocktake','Kiểm kê'],['settings','Kết nối']]:[['inventory','Tồn kho'],['orders','Đơn hàng'],['photos','Ảnh Cloud'],['settings','Kết nối']]).filter(([key])=>role!=='viewer'||key!=='photos').map(([key,label])=><button key={key} aria-pressed={tab===key} onClick={()=>setTab(key)}>{label}</button>)}</nav>}
 </main>
}
