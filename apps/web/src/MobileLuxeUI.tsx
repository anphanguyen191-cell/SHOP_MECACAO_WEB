import {useEffect,useId,useRef,useState,type ReactNode} from 'react'
import {createPortal} from 'react-dom'
import ShopIcon from './ShopIcon'
import DisplayDensity from './DisplayDensity'
import type {DisplaySize} from './uiState'

export function useMobileLuxe(){
 const [mobile,setMobile]=useState(()=>typeof window.matchMedia==='function'?window.matchMedia('(max-width:800px)').matches:window.innerWidth<=800)
 useEffect(()=>{if(typeof window.matchMedia!=='function'){const resize=()=>setMobile(window.innerWidth<=800);window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)}const media=window.matchMedia('(max-width:800px)'),change=()=>setMobile(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change)},[])
 return mobile
}

/** Presentation-only sheet. Portaled to avoid clipping by scrolling workspaces. */
export function MobileSheet({title,onClose,children,footer,full=false}:{title:string;onClose:()=>void;children:ReactNode;footer?:ReactNode;full?:boolean}){
 const root=useRef<HTMLElement>(null),close=useRef(onClose);close.current=onClose
 const id=useId()
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow
  document.body.style.overflow='hidden';root.current?.querySelector<HTMLButtonElement>('button')?.focus()
  const key=(e:KeyboardEvent)=>{
   if(document.querySelector('.stockViewerBackdrop'))return
   if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close.current();return}
   if(e.key!=='Tab')return
   const nodes=Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')||[]).filter(n=>n.getClientRects().length)
   const first=nodes[0],last=nodes.at(-1)
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
  }
  document.addEventListener('keydown',key,true)
  return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key,true);previous?.focus()}
 },[])
 return createPortal(<div className={'mobileLuxeOverlay'+(document.querySelector('.shell.themeDark')?' themeDark':'')} onClick={onClose}><section ref={root} className={'mobileLuxeSheet'+(full?' isFull':'')} role="dialog" aria-modal="true" aria-labelledby={id} onClick={e=>e.stopPropagation()}><header><button type="button" onClick={onClose} aria-label={'Đóng '+title}>‹</button><h2 id={id}>{title}</h2><button type="button" onClick={onClose} aria-label="Đóng cửa sổ">×</button></header><div className="mobileLuxeSheetBody">{children}</div>{footer&&<footer>{footer}</footer>}</section></div>,document.body)
}

type Metric={label:string;value:number|string;hint:string;route:string;icon:string}
export function MobileOverview({metrics,products,onNavigate,stockRoute,children}:{metrics:Metric[];products:{product_name:string;stock:number;product_id:number}[];onNavigate:(route:string)=>void;stockRoute:string;children?:ReactNode}){
 const date=new Intl.DateTimeFormat('vi-VN',{weekday:'long',day:'numeric',month:'numeric'}).format(new Date())
 const max=Math.max(1,...products.map(p=>p.stock))
 return <section className="mobileOverview overview"><div className="mobileWelcome"><img src={import.meta.env.BASE_URL+'brand/logo.jpg'} alt=""/><div><span>Chào ngày mới, chủ shop</span><h2>Hôm nay ở Mẹ CaCao</h2><small>{date}</small></div></div><div className="mobileMetricGrid overviewStats">{metrics.map((m,i)=><button key={m.label} className="mobileMetric overviewStat" onClick={()=>onNavigate(m.route)}><span className={'mobileMetricIcon tone'+i}><ShopIcon label={m.icon}/></span><span>{m.label}</span><strong>{typeof m.value==='number'?m.value.toLocaleString('vi-VN'):m.value}</strong><small>{m.hint}</small></button>)}</div><section className="mobileCard mobileStockChart"><header><div><small>KHO HÀNG</small><h3>Tồn theo sản phẩm</h3></div><button onClick={()=>onNavigate(stockRoute)}>Xem kho ›</button></header>{products.length?products.slice(0,5).map(p=><button className="mobileChartRow" key={p.product_id} onClick={()=>onNavigate(stockRoute)}><span><b>{p.product_name}</b><strong>{p.stock.toLocaleString('vi-VN')} bộ</strong></span><i><i style={{width:p.stock/max*100+'%'}}/></i></button>):<p className="mobileEmpty">Chưa có dữ liệu tồn để hiển thị.</p>}</section>{children}<section className="mobileShopNote"><img src={import.meta.env.BASE_URL+'brand/logo.jpg'} alt=""/><div><b>Shop Mẹ CaCao · Since 2023</b><span>Tole xinh cho bé yêu!</span></div></section></section>
}

type MobileNotice={id:string;title:string;description:string;onOpen:()=>void}
export function MobileSystemPanel({status,online,onRefresh,disabled,children,notices=[]}:{status:string;online:boolean;onRefresh:()=>void;disabled?:boolean;children?:ReactNode;notices?:MobileNotice[]}){
 const [open,setOpen]=useState(false)
 return <><button type="button" className="mobileStatusBell" aria-label="Thông báo và trạng thái kết nối" onClick={()=>setOpen(true)}><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>{!online&&<i/>}</button>{open&&<MobileSheet title="Thông báo & kết nối" onClose={()=>setOpen(false)}><div className={'mobileConnectionState'+(!online?' isOffline':'')}><ShopIcon label="Cloud"/><h3>{online?'Kết nối mạng đang bật':'Thiết bị đang ngoại tuyến'}</h3><p>{online?status:'Chỉ xem dữ liệu đã đọc. Kết nối lại trước khi thao tác.'}</p></div><button className="mobilePrimary" disabled={disabled||!online} onClick={onRefresh}>Đọc lại dữ liệu</button>{children}{notices.length>0&&<section className="mobileNoticeList"><h3>Đơn gần đây</h3>{notices.map(n=><button key={n.id} onClick={()=>{setOpen(false);n.onOpen()}}><span><b>{n.title}</b><small>{n.description}</small></span><span>›</span></button>)}</section>}<p className="mobileHelp">Trạng thái kết nối mạng không có nghĩa dữ liệu đã đồng bộ xong.</p></MobileSheet>}</>
}

export function MobileAppearance({density,onDensity,dark,onTheme,onConnection}:{density:DisplaySize;onDensity:(size:DisplaySize)=>void;dark:boolean;onTheme:()=>void;onConnection:()=>void}){
 return <section className="mobileAppearance"><section className="mobileCard"><h3>Màu sắc & giao diện</h3><p>Chọn cách hiển thị riêng trên thiết bị này.</p><div className="mobileThemeChoices"><button type="button" aria-pressed={!dark} onClick={()=>{if(dark)onTheme()}}><i className="themeSample light"/><b>Sáng nhẹ nhàng</b></button><button type="button" aria-pressed={dark} onClick={()=>{if(!dark)onTheme()}}><i className="themeSample dark"/><b>Tối dịu mắt</b></button></div></section><section className="mobileCard"><h3>Kích thước hiển thị</h3><p>Nhỏ để xem nhiều ảnh; Lớn để dễ đọc và chạm.</p><DisplayDensity value={density} onChange={onDensity}/></section><section className="mobileSettingsList"><button onClick={onConnection}><span className="mobileMenuIcon"><ShopIcon label="Cloud"/></span><span><b>Tài khoản & kết nối</b><small>Đăng nhập, mật khẩu và trạng thái Cloud</small></span><span>›</span></button></section><div className="mobileShopNote"><img src={import.meta.env.BASE_URL+'brand/logo.jpg'} alt=""/><div><b>Shop Mẹ CaCao</b><span>Mobile Travel Luxe · 18.10.2026</span></div></div></section>
}

export function MobileCloudSummary({status,online,images,products,onRefresh,disabled}:{status:string;online:boolean;images:number;products:number;onRefresh:()=>void;disabled?:boolean}){
 return <section className="mobileCard mobileCloudSummary"><div className={'mobileConnectionState'+(!online?' isOffline':'')}><ShopIcon label="Cloud"/><h3>{online?'Dữ liệu từ Cloud':'Đang ngoại tuyến'}</h3><p>{status}</p></div><div className="mobileCloudCounts"><div><strong>{images.toLocaleString('vi-VN')}</strong><span>Ảnh sẵn sàng, chưa SOLD</span></div><div><strong>{products.toLocaleString('vi-VN')}</strong><span>Mẫu trong dữ liệu đã đọc</span></div></div><button className="mobilePrimary" disabled={disabled||!online} onClick={onRefresh}>Đọc lại dữ liệu Cloud</button><p className="mobileHelp">Ảnh gốc và đối soát tồn được quản lý trên laptop. Số liệu ở đây phản ánh lần đọc Cloud thành công gần nhất.</p></section>
}
