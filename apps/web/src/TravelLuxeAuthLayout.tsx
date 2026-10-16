import {useEffect,useRef,useState,type ChangeEvent,type ReactNode} from 'react'
import './travelLuxeDemoAuth.css'

type LoginMedia={url:string;video:boolean}
const loginMediaKey='travel-luxe:login-banner'
function openLoginMediaDb():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  if(!('indexedDB' in window))return reject(Error('Thiết bị không hỗ trợ lưu banner'))
  const request=indexedDB.open('mecacao-luxe-local-prefs',1)
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('settings'))request.result.createObjectStore('settings')}
  request.onsuccess=()=>resolve(request.result)
  request.onerror=()=>reject(request.error||Error('Không mở được cài đặt giao diện'))
 })
}
function useLoginBanner(){
 const [media,setMedia]=useState<LoginMedia|null>(null)
 const [message,setMessage]=useState('')
 const activeUrl=useRef<string|null>(null)
 useEffect(()=>{
  let alive=true
  void openLoginMediaDb().then(db=>{
   const tx=db.transaction('settings','readonly')
   const req=tx.objectStore('settings').get(loginMediaKey)
   req.onsuccess=()=>{
    if(alive&&req.result instanceof Blob){
     const blob=req.result as Blob
     if(!blob.type.startsWith('image/')&&!['video/mp4','video/webm'].includes(blob.type))return
     const url=URL.createObjectURL(blob)
     if(activeUrl.current)URL.revokeObjectURL(activeUrl.current)
     activeUrl.current=url;setMedia({url,video:blob.type.startsWith('video/')})
    }
   }
   tx.oncomplete=()=>db.close()
   tx.onerror=()=>db.close()
  }).catch(()=>{})
  return()=>{alive=false;if(activeUrl.current){URL.revokeObjectURL(activeUrl.current);activeUrl.current=null}}
 },[])
 async function choose(e:ChangeEvent<HTMLInputElement>){
  const file=e.currentTarget.files?.[0]
  e.currentTarget.value=''
  if(!file)return
  if(!file.type.startsWith('image/')&&!['video/mp4','video/webm'].includes(file.type)){setMessage('Chỉ nhận ảnh hoặc video MP4/WebM.');return}
  if(file.size>20*1024*1024){setMessage('Banner tối đa 20 MB để giao diện mở nhanh.');return}
  const url=URL.createObjectURL(file)
  if(activeUrl.current)URL.revokeObjectURL(activeUrl.current)
  activeUrl.current=url;setMedia({url,video:file.type.startsWith('video/')})
  setMessage('Đang lưu banner riêng trên thiết bị...')
  try{
   const db=await openLoginMediaDb()
   await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('settings','readwrite')
    tx.objectStore('settings').put(file,loginMediaKey)
    tx.oncomplete=()=>resolve()
    tx.onerror=()=>reject(tx.error)
   })
   db.close();setMessage('Đã lưu banner đăng nhập. Không thay đổi ảnh kho.')
  }catch{setMessage('Đã hiển thị banner, nhưng chưa lưu được cho lần mở sau.')}
 }
 async function reset(){
  if(activeUrl.current){URL.revokeObjectURL(activeUrl.current);activeUrl.current=null}
  setMedia(null)
  try{
   const db=await openLoginMediaDb()
   await new Promise<void>(resolve=>{
    const tx=db.transaction('settings','readwrite')
    tx.objectStore('settings').delete(loginMediaKey)
    tx.oncomplete=()=>resolve()
    tx.onerror=()=>resolve()
   })
   db.close();setMessage('Đã khôi phục phong cảnh gốc của bản demo.')
  }catch{setMessage('Không xóa được banner đã lưu; vui lòng thử lại.')}
 }
 return {media,message,choose,reset}
}

/** Visual source: owner-approved Shop_MeCaCao_Travel_Luxe_Laptop_Demo_V2.html.
 * This never replaces the Windows owner or LAN HTTPS authentication handlers.
 */
export function TravelLuxeSplash({onContinue,busy=false,error=''}:{onContinue:()=>void;busy?:boolean;error?:string}){
 return <main className="luxeSplashScreen cacaoDemoSplash" aria-label="Màn hình chào CaCao Travel Luxe">
  <section className="cacaoDemoSplashCenter">
   <div className="cacaoDemoSplashMark" aria-hidden="true"><img src={import.meta.env.BASE_URL+'brand/logo.jpg'} alt=""/><span>✿</span></div>
   <div className="cacaoDemoEyebrow">Since 2023 · Shop Mẹ CaCao</div>
   <h1>Hành trình xinh đẹp bắt đầu...</h1>
   <p>Tole xinh cho bé yêu!</p>
   <div className="cacaoDemoSplashLine" aria-hidden="true"/>
   {error&&<p className="cacaoDemoError" role="alert">{error}</p>}
   <button type="button" className="luxeSplashContinue cacaoDemoSkip" onClick={onContinue} disabled={busy}>{busy?'Đang kết nối Windows…':'Tiếp tục đến đăng nhập →'}</button>
   <small className="cacaoDemoSplashHint">Tự động chuyển sang đăng nhập sau lời chào</small>
  </section>
 </main>
}
export function TravelLuxeAuthLayout({children,variant='windows'}:{children:ReactNode;variant?:'windows'|'lan'}){
 const {media,message,choose,reset}=useLoginBanner()
 const input=useRef<HTMLInputElement>(null)
 return <main className="luxeStartupScreen cacaoDemoAuthScreen" aria-label="Đăng nhập Shop Mẹ CaCao">
  <section className="cacaoDemoLogin" aria-label={variant==='lan'?'Màn hình đăng nhập LAN Travel Luxe':'Màn hình đăng nhập Windows Travel Luxe'}>
   <div className={'cacaoDemoVisual'+(media?' hasCustomMedia':'')}>
    <div className="cacaoDemoScene" style={{backgroundImage:'url("'+import.meta.env.BASE_URL+'brand/travel-luxe-login-scene.svg")'}} aria-hidden="true"/>
    {media&&<div className="cacaoDemoLoginMedia" aria-hidden="true">{media.video?<video src={media.url} autoPlay muted loop playsInline/>:<img src={media.url} alt=""/>}</div>}
    <div className="cacaoDemoWording">
     <div className="cacaoDemoEyebrow">CaCao Travel Luxe · Since 2023</div>
     <h1>Mỗi ngày làm việc<br/>là một chuyến đi thật đẹp.</h1>
     <p>Một không gian quản lý cửa hàng dịu dàng, tràn đầy cảm hứng. Chào mừng trở lại với Shop Mẹ CaCao.</p>
    </div>
    <div className="cacaoDemoVisualBottom"><div className="cacaoDemoGlass">✦ Trải nghiệm desktop mới</div><div className="cacaoDemoGlass">✧ Thiết kế riêng cho Shop Mẹ CaCao</div></div>
    <div className="cacaoDemoLoginBannerControls">
     <input ref={input} type="file" accept="image/*,video/mp4,video/webm" aria-label="Chọn ảnh hoặc video banner đăng nhập" onChange={e=>void choose(e)}/>
     <button type="button" onClick={()=>input.current?.click()}>Đổi ảnh / video banner</button>
     {media&&<button type="button" onClick={()=>void reset()}>Nền demo</button>}
    </div>
    {message&&<p className="cacaoDemoMediaMessage" role="status">{message}</p>}
   </div>
   <div className="cacaoDemoFormZone luxeStartupCard">
    <div className="cacaoDemoFields">
     <div className="cacaoDemoBrandRow"><div className="cacaoDemoBrandIcon" aria-hidden="true">✿</div><div><b>Shop Mẹ CaCao</b><small>TOLE XINH CHO BÉ YÊU!</small></div></div>
     {children}
     <div className="cacaoDemoBottomLine"><span>CaCao Travel Luxe V2.0</span><span className="cacaoDemoPill">✧ {variant==='lan'?'LAN · Wi-Fi':'Windows · Laptop'}</span></div>
    </div>
   </div>
  </section>
 </main>
}
