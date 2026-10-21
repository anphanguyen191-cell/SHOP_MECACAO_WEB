import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import {mobileAppearancePresets,resetMobileAppearance,setMobileAppearance,useMobileAppearance,type MobileAppearancePreferences} from './mobileAppearance'

export function MobileMascot({fallbackLogo=false}:{fallbackLogo?:boolean}){
 const p=useMobileAppearance()
 if(!p.mascot)return fallbackLogo?<img src={import.meta.env.BASE_URL+'brand/logo.jpg'} alt=""/>:null
 return <span className="mobileCaCaoMascot" aria-hidden="true"><img src={import.meta.env.BASE_URL+'brand/logo.jpg'} alt=""/></span>
}

/** Decorative artwork stays inside the existing heading/welcome frame. */
export function MobileBannerArt(){
 const p=useMobileAppearance(),[broken,setBroken]=useState(false)
 useEffect(()=>setBroken(false),[p.customBanner])
 if(p.banner==='none')return null
 return <span className={'mobileBannerArt banner-'+p.banner} aria-hidden="true">{p.banner==='custom'?(!broken&&<img src={p.customBanner} alt="" onError={()=>setBroken(true)}/>):<svg viewBox="0 0 220 140" fill="none" focusable="false">{p.banner==='nature'?<><path d="M164 142C120 100 143 49 194 8M151 92C122 83 115 58 117 42C144 44 158 65 151 92ZM169 58C165 31 180 15 204 9C205 36 190 52 169 58ZM150 113C177 88 203 94 219 109C197 129 169 134 150 113Z" fill="currentColor" opacity=".55"/><circle cx="81" cy="42" r="25" stroke="currentColor" opacity=".4"/></>:p.banner==='family'?<><path d="M108 48C79 14 32 53 108 108C184 53 137 14 108 48Z" fill="currentColor" opacity=".45"/><path d="M179 20C164 2 139 23 179 52C219 23 194 2 179 20Z" fill="currentColor" opacity=".45"/><circle cx="175" cy="114" r="37" stroke="currentColor" opacity=".35"/></>:<><ellipse cx="160" cy="70" rx="47" ry="64" transform="rotate(25 160 70)" stroke="currentColor" opacity=".5"/><ellipse cx="167" cy="74" rx="32" ry="49" transform="rotate(25 167 74)" stroke="currentColor" opacity=".35"/><path d="M86 29L91 42L104 47L91 52L86 65L81 52L68 47L81 42Z" fill="currentColor"/><circle cx="201" cy="27" r="5" fill="currentColor"/></>}</svg>}</span>
}

/** Animate decorative page surfaces only. Never wraps, remounts or delays a form. */
export function MobilePageMotion({page,enabled}:{page:string;enabled:boolean}){
 const marker=useRef<HTMLSpanElement>(null),p=useMobileAppearance()
 useLayoutEffect(()=>{
  if(!enabled||p.motion!=='gentle'||typeof matchMedia!=='function'||matchMedia('(prefers-reduced-motion: reduce)').matches)return
  const shell=marker.current?.closest('.mobileLuxeWorkspace'),heading=shell?.querySelector<HTMLElement>('.mobileLuxeSectionHeader'),main=shell?.querySelector('main')
  const content=main?.querySelector<HTMLElement>(':scope > section:not(.displayPreferences),:scope > .mobileAppearance')
  const animations=[heading,content].filter((node):node is HTMLElement=>!!node).map(node=>node.animate?.([{opacity:.65},{opacity:1}],{duration:160,easing:'ease-out'})).filter((a):a is Animation=>!!a)
  return()=>animations.forEach(a=>a.cancel())
 },[page,enabled,p.motion])
 return <span ref={marker} hidden/>
}

type Option<T extends string>={value:T;label:string;hint?:string;color?:string}
function Choices<K extends 'palette'|'material'|'cards'|'banner'|'motion'>({name,title,value,options,onChange,disabled=false}:{name:K;title:string;value:MobileAppearancePreferences[K];options:Option<MobileAppearancePreferences[K]>[];onChange:(patch:Partial<MobileAppearancePreferences>)=>void;disabled?:boolean}){
 return <fieldset className="mobileStyleChoices" disabled={disabled}><legend>{title}</legend><div>{options.map(o=><button type="button" key={o.value} disabled={disabled} aria-pressed={value===o.value} data-appearance-choice={name+':'+o.value} onClick={()=>onChange({[name]:o.value})}>{o.color&&<i aria-hidden="true" style={{background:o.color}}/>}<span><b>{o.label}</b>{o.hint&&<small>{o.hint}</small>}</span><span className="mobileStyleCheck" aria-hidden="true">{value===o.value?'✓':''}</span></button>)}</div></fieldset>
}

/** Local file decoding: store a small raster thumbnail on this device only. */
export async function prepareMobileBanner(file:File):Promise<string>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)throw Error('Chọn ảnh JPG, PNG hoặc WebP tối đa 8 MB.')
 const url=URL.createObjectURL(file)
 try{
  const image=new Image();image.src=url;await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error('Không đọc được ảnh. Chọn ảnh khác nhé.'))})
  if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>50000000)throw Error('Ảnh quá lớn hoặc không hợp lệ. Chọn ảnh nhỏ hơn.')
  const canvas=document.createElement('canvas'),scale=Math.min(1,960/image.naturalWidth,480/image.naturalHeight)
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));const ctx=canvas.getContext('2d');if(!ctx)throw Error('Trình duyệt chưa hỗ trợ xử lý ảnh.')
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height)
  const data=canvas.toDataURL('image/jpeg',.72);if(data.length>400000)throw Error('Ảnh vẫn quá nặng. Chọn ảnh đơn giản hoặc nhỏ hơn.');return data
 }finally{URL.revokeObjectURL(url)}
}

export default function MobilePersonalization(){
 const p=useMobileAppearance(),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),alive=useRef(true),fileInput=useRef<HTMLInputElement>(null),upload=useRef(0)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;upload.current++}},[])
 const apply=(patch:Partial<MobileAppearancePreferences>)=>{const saved=setMobileAppearance(patch);setStatus(saved?'Đã lưu giao diện trên thiết bị này.':'Đã áp dụng tạm. Trình duyệt chưa cho lưu; giao diện có thể trở về mặc định khi mở lại.')}
 async function choose(file?:File){if(!file||busy)return;const token=++upload.current;setBusy(true);setStatus('Đang chuẩn bị ảnh trên thiết bị…');try{const data=await prepareMobileBanner(file);if(alive.current&&token===upload.current)apply({banner:'custom',customBanner:data})}catch(e){if(alive.current&&token===upload.current)setStatus((e as Error).message)}finally{if(alive.current&&token===upload.current)setBusy(false);if(fileInput.current)fileInput.current.value=''}}
 function reset(){if(busy)return;if(!window.confirm('Về phong cách mobile mặc định và bỏ ảnh banner riêng trên thiết bị này?'))return;const saved=resetMobileAppearance();setStatus(saved?'Đã trở về phong cách mobile mặc định.':'Đã về mặc định cho phiên hiện tại; trình duyệt chưa cho lưu.')}
 return <section className="mobileCard mobilePersonalization" aria-label="Phong cách riêng CaCao">
  <header><span className="mobileStyleEyebrow">CACAO · YOUR OWN STYLE</span><h3>Phong cách riêng CaCao</h3><p>Chọn bộ mẫu, rồi chỉnh theo ý thích. Chỉ lưu trên thiết bị này.</p></header>
  <div className="mobileStylePreview" aria-label="Xem trước phong cách đang chọn"><MobileBannerArt/><MobileMascot fallbackLogo/><div><small>SHOP MẸ CACAO · SINCE 2023</small><b>Chạm một chút, riêng một chút.</b><span>Màu sắc và chất liệu áp dụng ngay</span></div></div>
  <fieldset className="mobileStylePresets"><legend>Bộ phong cách</legend><div>{([['classic','Travel Luxe gốc'],['signature','CaCao Signature'],['garden','Vườn mint'],['lavender','Lavender dịu'],['champagne','Champagne']] as const).map(([key,label])=><button type="button" key={key} data-appearance-preset={key} aria-pressed={Object.entries(mobileAppearancePresets[key]).every(([k,v])=>k==='customBanner'||p[k as keyof MobileAppearancePreferences]===v)} disabled={busy} onClick={()=>apply({...mobileAppearancePresets[key],customBanner:p.customBanner})}>{label}</button>)}</div></fieldset>
  <Choices disabled={busy} name="palette" title="Bộ màu CaCao" value={p.palette} onChange={apply} options={[{value:'classic',label:'Hồng Travel Luxe',color:'#a83877'},{value:'rose',label:'Hồng ngọc trai',color:'#8b2f63'},{value:'lavender',label:'Tím lavender',color:'#674398'},{value:'mint',label:'Xanh mint',color:'#176655'},{value:'champagne',label:'Kem champagne',color:'#7b531e'}]}/>
  <Choices disabled={busy} name="material" title="Chất liệu" value={p.material} onChange={apply} options={[{value:'flat',label:'Phẳng',hint:'Gọn nhẹ, rõ ràng'},{value:'glass',label:'Kính mờ nhẹ',hint:'Thanh trên & điều hướng'},{value:'pearl',label:'Ngọc trai',hint:'Ánh nền dịu'}]}/>
  <Choices disabled={busy} name="cards" title="Phong cách thẻ" value={p.cards} onChange={apply} options={[{value:'original',label:'Nguyên bản'},{value:'soft',label:'Bo mềm'},{value:'outlined',label:'Viền mảnh'},{value:'lifted',label:'Nổi nhẹ'}]}/>
  <Choices disabled={busy} name="banner" title="Hoạ tiết banner" value={p.banner} onChange={apply} options={[{value:'none',label:'Tối giản'},{value:'nature',label:'Thiên nhiên'},{value:'family',label:'Gia đình'},{value:'muse',label:'CaCao Muse'},...(p.customBanner?[{value:'custom' as const,label:'Ảnh riêng'}]:[])]}/>
  <p className="mobileHelp">Hoạ tiết trang trí trong khung tiêu đề và lời chào hiện có. Có thể dùng ảnh từ bộ banner của shop.</p>
  <div className="mobileBannerUpload"><label className="mobileStyleFile">{busy?'Đang chuẩn bị ảnh…':'Chọn ảnh banner trên máy'}<input ref={fileInput} aria-label="Chọn ảnh banner riêng" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>void choose(e.target.files?.[0])}/></label>{p.customBanner&&<button type="button" disabled={busy} onClick={()=>apply({customBanner:'',banner:p.banner==='custom'?'none':p.banner})}>Bỏ ảnh riêng</button>}</div>
  <Choices disabled={busy} name="motion" title="Chuyển động" value={p.motion} onChange={apply} options={[{value:'system',label:'Nguyên bản'},{value:'gentle',label:'Mềm nhẹ',hint:'Chuyển tab & chạm nút'},{value:'none',label:'Tắt hiệu ứng'}]}/>
  <p className="mobileHelp">Luôn tôn trọng chế độ Giảm chuyển động của iPhone.</p>
  <label className="mobileMascotToggle"><input type="checkbox" disabled={busy} checked={p.mascot} onChange={e=>apply({mascot:e.target.checked})}/><span><b>Mascot CaCao</b><small>Bé trai logo trong lời chào, màn hình trống và thông báo</small></span></label>
  <p className="mobileStyleStatus" role="status" aria-live="polite">{status}</p><button type="button" className="mobileStyleReset" disabled={busy} onClick={reset}>Về phong cách mặc định</button>
  <p className="mobileHelp">Đặt lại bộ màu, chất liệu, thẻ, hoạ tiết, mascot và hiệu ứng. Giữ lựa chọn Sáng/Tối và cỡ hiển thị hiện tại.</p>
 </section>
}
