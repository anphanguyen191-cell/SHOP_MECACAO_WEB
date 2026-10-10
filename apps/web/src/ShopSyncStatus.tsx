import {useEffect,useRef,useState} from 'react'
type State={epoch:string;revision:number;changedAt:string|null}
type Status='checking'|'connected'|'offline'
/** Read-only invalidation; does not confirm an order or payment. */
export default function ShopSyncStatus({enabled}:{enabled:boolean}){
 const previous=useRef<State|null>(null)
 const [status,setStatus]=useState<Status>('checking')
 useEffect(()=>{
  if(!enabled){previous.current=null;setStatus('checking');return}
  let active=true,ongoing=false,controller:AbortController|null=null
  async function poll(){
   if(ongoing||document.visibilityState==='hidden')return
   ongoing=true;controller=new AbortController();const timer=setTimeout(()=>controller?.abort(),20000)
   try{
    const r=await fetch('/api/lan/changes',{cache:'no-store',signal:controller.signal})
    if(!active)return
    if(r.status===401){window.dispatchEvent(new Event('mecacao-lan-expired'));return}
    if(!r.ok)throw Error('Máy chủ chưa phản hồi')
    const value=await r.json() as State
    if(typeof value.epoch!=='string'||!Number.isSafeInteger(value.revision))throw Error('Tín hiệu thay đổi không hợp lệ')
    if(!active)return
    const old=previous.current
    previous.current=value
    if(active){
     setStatus('connected')
     if(old&&(old.epoch!==value.epoch||old.revision!==value.revision)){
      window.dispatchEvent(new CustomEvent('mecacao-server-change',{detail:value}))
     }
    }
   }catch{if(active)setStatus('offline')}
   finally{clearTimeout(timer);ongoing=false;controller=null}
  }
  void poll()
  const interval=setInterval(()=>void poll(),3500)
  const visibility=()=>{if(document.visibilityState==='visible')void poll()}
  const offline=()=>{if(active){setStatus('offline');controller?.abort()}}
  window.addEventListener('offline',offline)
  window.addEventListener('online',visibility)
  document.addEventListener('visibilitychange',visibility)
  return()=>{active=false;controller?.abort();clearInterval(interval);window.removeEventListener('offline',offline);window.removeEventListener('online',visibility);document.removeEventListener('visibilitychange',visibility);previous.current=null}
 },[enabled])
 if(!enabled)return null
 return <div className={'shopSyncStatus '+(status==='offline'?'offline':'')} role="status" aria-live="polite">
  <span className="shopSyncDot" aria-hidden="true"/>
  <span>{status==='offline'?'Mất kết nối Windows. Dữ liệu hiển thị có thể đã cũ; giao dịch chưa được xác nhận không được coi là hoàn tất.':status==='checking'?'Đang kiểm tra kết nối máy chủ...':'Đã kết nối · kiểm tra thay đổi khoảng 4 giây/lần.'}</span>
  <button type="button" onClick={()=>window.dispatchEvent(new Event('mecacao-server-change'))}>Đọc lại dữ liệu</button>
 </div>
}
