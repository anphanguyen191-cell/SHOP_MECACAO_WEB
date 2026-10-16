import {useEffect,useState} from 'react'

type ShopToast={id:number;message:string}
/** Displays only confirmed UI success events; errors and uncertain writes stay in CORE panels. */
export default function ToastHost(){
 const [toast,setToast]=useState<ShopToast|null>(null)
 useEffect(()=>{
  const onToast=(event:Event)=>{
   const detail=(event as CustomEvent<{message?:string}>).detail
   if(typeof detail?.message!=='string'||!detail.message.trim())return
   setToast({id:Date.now(),message:detail.message.slice(0,220)})
  }
  window.addEventListener('mecacao-ui-success',onToast)
  return()=>window.removeEventListener('mecacao-ui-success',onToast)
 },[])
 useEffect(()=>{
  if(!toast)return
  const timer=setTimeout(()=>setToast(current=>current?.id===toast.id?null:current),4200)
  return()=>clearTimeout(timer)
 },[toast?.id])
 if(!toast)return null
 return <div className="luxeToast" role="status" aria-live="polite"><span className="luxeToastIcon" aria-hidden="true">✓</span><span>{toast.message}</span><button type="button" onClick={()=>setToast(null)} aria-label="Đóng thông báo">×</button></div>
}
