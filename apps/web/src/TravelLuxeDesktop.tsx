import {useEffect,useRef,useState,type ReactNode,type ChangeEvent} from 'react'
import ShopIcon from './ShopIcon'
import DisplayDensity from './DisplayDensity'
import type {DisplaySize} from './uiState'

const groups=[
 {title:'CỬA HÀNG CỦA TÔI',items:['Tổng quan','Danh mục sản phẩm','Tồn kho']},
 {title:'KINH DOANH',items:['Bán hàng','Khách hàng','Công nợ']},
 {title:'VẬN HÀNH KHO',items:['Nhập hàng','Import kho','Kiểm kê','Báo cáo']},
 {title:'HỆ THỐNG',items:['Ảnh SOLD','Ảnh iPhone','Mobile LAN','Kết nối Cloud','Cài đặt']}
]
type NavProps={sections:string[];active:string;collapsed:boolean;onToggle:()=>void;onNavigate:(section:string)=>void}
export function LuxeDesktopSidebar({sections,active,collapsed,onToggle,onNavigate}:NavProps){
 return <aside className={'luxeDesktopSidebar'+(collapsed?' isCollapsed':'')} aria-label="Điều hướng CaCao Travel Luxe">
  <div className="luxeSideBrand"><img src={import.meta.env.BASE_URL+'brand/logo.jpg'} alt="Logo Shop Mẹ CaCao" onError={e=>{e.currentTarget.style.display='none'}}/><div className="luxeSideBrandCopy"><b>Shop Mẹ CaCao</b><small>Since 2023 · Travel Luxe</small></div><button type="button" className="luxeSideCollapse" onClick={onToggle} title={collapsed?'Mở rộng menu':'Thu gọn menu'} aria-label={collapsed?'Mở rộng menu':'Thu gọn menu'} aria-expanded={!collapsed}>{collapsed?'»':'«'}</button></div>
  <nav className="luxeSideNavigation sidebar" aria-label="Chức năng cửa hàng">
   {groups.map(group=>{const members=group.items.filter(x=>sections.includes(x));return members.length?<div className="luxeSideGroup" key={group.title}><p className="luxeSideLabel">{group.title}</p>{members.map(n=><button key={n} title={n} type="button" className={'luxeSideItem'+(active===n?' selected':'')} aria-current={active===n?'page':undefined} onClick={()=>onNavigate(n)}><span className="luxeSideIcon"><ShopIcon label={n}/></span><span className="luxeSideText">{n}</span><span className="luxeSideArrow" aria-hidden="true"/></button>)}</div>:null})}
   {sections.filter(s=>!groups.some(g=>g.items.includes(s))).map(n=><button key={n} className={'luxeSideItem'+(active===n?' selected':'')} onClick={()=>onNavigate(n)}><ShopIcon label={n}/><span className="luxeSideText">{n}</span></button>)}
  </nav>
  <div className="luxeSideFooter"><div className="luxeSideAvatar" aria-hidden="true">MC</div><div className="luxeSideUser"><b>Chủ cửa hàng</b><small>Quản lý Shop Mẹ CaCao</small></div><span aria-hidden="true" className="luxeSideShield">✦</span></div>
 </aside>
}
type TopbarProps={mode:string;active:string;dark:boolean;density:DisplaySize;onDensity:(v:DisplaySize)=>void;onTheme:()=>void;onSearch:(v:string)=>void;onMenu:()=>void;children?:ReactNode}
export function LuxeDesktopTopbar({mode,active,dark,density,onDensity,onTheme,onSearch,onMenu,children}:TopbarProps){
 const [query,setQuery]=useState('')
 const searchRef=useRef<HTMLInputElement>(null)
 useEffect(()=>{function keyboard(e:KeyboardEvent){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();searchRef.current?.focus()}}window.addEventListener('keydown',keyboard);return()=>window.removeEventListener('keydown',keyboard)},[])
 return <header className="luxeDesktopTopbar">
  <button type="button" className="luxeTopMenu" onClick={onMenu} aria-label="Mở danh sách chức năng">☰</button>
  <div className="luxeTopLocation"><small>WORKSPACE / SHOP MẸ CACAO</small><strong>{active}</strong></div>
  <form className="luxeTopSearch" role="search" onSubmit={e=>{e.preventDefault();if(query.trim())onSearch(query.trim())}}><span aria-hidden="true">⌕</span><input ref={searchRef} type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm tên, mã, Size sản phẩm..." aria-label="Tìm sản phẩm toàn cửa hàng"/><kbd>Ctrl K</kbd><button type="submit" aria-label="Tìm sản phẩm" disabled={!query.trim()}>→</button></form>
  <div className="luxeTopActions"><span className="luxeConnectionTag"><i aria-hidden="true"/>{mode}</span>{children}<DisplayDensity value={density} onChange={onDensity}/><button className="luxeTopTheme themeToggle" type="button" onClick={onTheme} aria-label={dark?'Chế độ sáng':'Chế độ tối'} title={dark?'Chế độ sáng':'Chế độ tối'}>{dark?'☀':'☾'}</button></div>
 </header>
}
const intros:Record<string,[string,string,string]>={
 'Danh mục sản phẩm':['BỘ SƯU TẬP CỦA SHOP','Mẫu sản phẩm & Size','Tìm tên, kiểm tra Size, giá và số tồn trực tiếp từ kho thật.'],
 'Nhập hàng':['GOODS RECEIVING JOURNEY','Hành trình nhập hàng','Ba nghiệp vụ nhập hàng hiện hành, từng bước đối soát rõ ràng.'],
 'Import kho':['WAREHOUSE CONTROL','Tiếp nhận & quét kho','Quản lý thư mục ảnh vật lý, duyệt hàng và đối soát an toàn.'],
 'Tồn kho':['PHOTO LIBRARY','Thư viện kho ảnh','Mỗi ảnh hàng hợp lệ được quản lý theo Product → Size.'],
 'Bán hàng':['SALES WORKSPACE','Bán hàng & tạo đơn','Từ chọn ảnh, khách hàng đến thanh toán và xác nhận CORE.'],
 'Khách hàng':['CUSTOMER RELATIONSHIPS','Khách hàng thân thương','Tra cứu hồ sơ khách hàng và lịch sử đơn đã ghi nhận.'],
 'Công nợ':['FINANCE WORKSPACE','Quản lý công nợ','Theo dõi từng khoản phải thu, đã thu và còn lại.'],
 'Báo cáo':['BUSINESS INSIGHTS','Những con số biết kể chuyện','Phân tích doanh thu, giá vốn và kết quả cửa hàng.'],
 'Kiểm kê':['STOCKTAKE WORKSPACE','Kiểm kê kho hàng','Đối chiếu từng phiên kiểm kê, chênh lệch và lịch sử.'],
 'Kết nối Cloud':['CONNECTIVITY CENTER','Trung tâm kết nối','Phân biệt đăng nhập, kết nối và xác nhận đồng bộ.'],
 'Cài đặt':['PERSONALIZE YOUR WORKSPACE','Không gian làm việc của bạn','Giao diện, vận hành và các công cụ cấu hình hệ thống.'],
 'Ảnh SOLD':['SOLD PHOTO ARCHIVE','Thư viện ảnh đã bán','Theo dõi trạng thái lưu giữ và phục hồi theo CORE.'],
 'Ảnh iPhone':['MOBILE INBOX','Ảnh từ điện thoại','Tiếp nhận và duyệt ảnh trước khi đưa vào kho.'],
 'Mobile LAN':['LAN CONNECTIVITY','Kết nối Mobile LAN','Quản lý thiết bị, phiên đăng nhập và quyền trong mạng nội bộ.']
}
export function LuxeWorkspaceIntro({section}: {section:string}){
 const [eyebrow,title,description]=intros[section]||['SHOP MẸ CACAO',section,'Quản lý hoạt động cửa hàng trên phần mềm chính thức.']
 return <section className="luxeWorkspaceIntro" data-section={section} aria-label={'Không gian '+section}>
  <div><span className="luxeKicker">✦ {eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
  <div className="luxeIntroArt" aria-hidden="true"><span>✿</span><i/><i/><i/></div>
 </section>
}
const heroText=[['Một ngày thật xinh bắt đầu từ đây','Theo dõi kho ảnh, quản lý đơn hàng và chăm sóc cửa hàng trong một không gian thật thư thái.'],['Khám phá từng góc nhỏ của shop','Từ Product đến Size, mọi bộ đồ tole đều có vị trí rõ ràng và dễ tìm kiếm.'],['Bán hàng hạnh phúc, quản lý nhẹ tênh','Chọn ảnh tồn, tạo đơn và theo dõi hoạt động cửa hàng bằng quy trình an toàn.']]
function openHeroDb():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{if(!('indexedDB' in window))return reject(Error('Không hỗ trợ lưu media'));const req=indexedDB.open('mecacao-luxe-local-prefs',1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('settings'))req.result.createObjectStore('settings')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('Lỗi trình duyệt'))})
}
export function LuxeDashboardHero({expanded,onToggle,onNavigate}:{expanded:boolean;onToggle:()=>void;onNavigate:(v:string)=>void}){
 const [slide,setSlide]=useState(0)
 const [media,setMedia]=useState<{url:string;video:boolean}|null>(null)
 const [note,setNote]=useState('')
 const inputRef=useRef<HTMLInputElement>(null)
 useEffect(()=>{let mounted=true;let url:string|null=null;void openHeroDb().then(db=>{const tx=db.transaction('settings','readonly'),req=tx.objectStore('settings').get('hero');req.onsuccess=()=>{if(mounted&&req.result instanceof Blob){url=URL.createObjectURL(req.result);setMedia({url,video:req.result.type.startsWith('video/')})}};tx.oncomplete=()=>db.close();tx.onerror=()=>db.close()}).catch(()=>{});return()=>{mounted=false;if(url)URL.revokeObjectURL(url)}},[])
 async function chooseMedia(e:ChangeEvent<HTMLInputElement>){
  const file=e.currentTarget.files?.[0];if(!file)return
  e.currentTarget.value=''
  if(!file.type.startsWith('image/')&&!file.type.startsWith('video/')){setNote('Chỉ chọn ảnh hoặc video.');return}
  if(file.size>20*1024*1024){setNote('Ảnh/video vượt quá 20 MB. Chọn tệp nhẹ hơn để không làm nặng trình duyệt.');return}
  setMedia(prev=>{if(prev?.url.startsWith('blob:'))URL.revokeObjectURL(prev.url);return {url:URL.createObjectURL(file),video:file.type.startsWith('video/')}})
  setNote('Đã đổi hình nền. Đang lưu lựa chọn trên trình duyệt này...')
  try{const db=await openHeroDb();await new Promise<void>((resolve,reject)=>{const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put(file,'hero');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});db.close();setNote('Đã lưu hình nền trên trình duyệt này. Không thay đổi ảnh kho.') }catch{setNote('Đã áp dụng cho phiên này nhưng trình duyệt không lưu được ảnh/video.')}
 }
 async function resetMedia(){
  setMedia(prev=>{if(prev?.url.startsWith('blob:'))URL.revokeObjectURL(prev.url);return null})
  try{const db=await openHeroDb();await new Promise<void>(resolve=>{const tx=db.transaction('settings','readwrite');tx.objectStore('settings').delete('hero');tx.oncomplete=()=>resolve();tx.onerror=()=>resolve()});db.close()}catch{}
  setNote('Đã trở về ảnh nền mặc định.')
 }
 return <section className="luxeHeroGroup">
  <div className="luxeHeroToolbar"><span>✦ CaCao Travel Luxe · Desktop</span><div><input ref={inputRef} className="luxeVisuallyHidden" type="file" accept="image/*,video/mp4,video/webm" onChange={e=>void chooseMedia(e)}/><button type="button" onClick={()=>inputRef.current?.click()}>Đổi ảnh / video bìa</button>{media&&<button type="button" onClick={()=>void resetMedia()}>Dùng nền mặc định</button>}<button type="button" aria-expanded={expanded} onClick={onToggle}>{expanded?'Thu gọn ảnh bìa':'Hiện ảnh bìa'}</button></div></div>
  {note&&<p className="luxeHeroNote" role="status">{note}</p>}
  {expanded&&<div className="luxeDashboardHero" data-slide={slide}>
   <div className="luxeHeroScene" aria-hidden="true">{media?(media.video?<video src={media.url} autoPlay muted playsInline loop/>:<img src={media.url} alt=""/>):<><span className="luxeHeroSun"/><span className="luxeHeroHill luxeHeroHillOne"/><span className="luxeHeroHill luxeHeroHillTwo"/><span className="luxeHeroVilla"/></>}</div>
   <div className="luxeHeroContent"><span className="luxeHeroEyebrow">WELCOME HOME · SHOP MẸ CACAO · SINCE 2023</span><h1>{heroText[slide][0]}</h1><p>{heroText[slide][1]}</p><div className="luxeHeroActions"><button type="button" onClick={()=>onNavigate('Tồn kho')}>Khám phá kho ảnh <span>→</span></button><button type="button" onClick={()=>onNavigate('Bán hàng')}>＋ Tạo đơn hàng</button></div></div>
   <div className="luxeHeroDots" aria-label="Chọn nội dung bìa">{heroText.map((_,i)=><button type="button" key={i} className={slide===i?'isActive':''} onClick={()=>setSlide(i)} aria-label={'Nội dung bìa '+(i+1)} aria-pressed={slide===i}/>)}</div>
  </div>}
 </section>
}
