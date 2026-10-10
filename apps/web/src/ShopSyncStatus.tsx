import {useEffect,useRef,useState} from 'react'
type State={epoch:string;revision:number;changedAt:string|null}
type Status='checking'|'connected'|'offline'
/** Read-only invalidation; does not confirm an order or payment. */
export default function ShopSyncStatus({enabled}:{enabled:boolean}){
 const previous=useRef<State|null>(null),ongoing=useRef(false)
 const [status,setStatus]=useState<Status>('checking')
 useEffect(()=>{
  if(!enabled){previous.current=null;setStatus('checking');return}
  let active=true
  async function poll(){
   if(ongoing.current||document.visibilityState==='hidden')return
   ongoing.current=true
   try{
    const r=await fetch('/api/lan/changes',{cache:'no-store'})
    if(r.status===401){window.dispatchEvent(new Event('mecacao-lan-expired'));return}
    if(!r.ok)throw Error('Máy chủ chưa phản hồi')
    const value=await r.json() as State
    if(typeof value.epoch!=='string'||!Number.isSafeInteger(value.revision))throw Error('Tín hiệu thay đổi không hợp lệ')
    const old=previous.current
    previous.current=value
    if(active){
     setStatus('connected')
     if(old&&(old.epoch!==value.epoch||old.revision!==value.revision)){
      window.dispatchEvent(new CustomEvent('mecacao-server-change',{detail:value}))
     }
    }
   }catch{if(active)setStatus('offline')}
   finally{ongoing.current=false}
  }
  void poll()
  const interval=setInterval(()=>void poll(),3500)
  const visibility=()=>{if(document.visibilityState==='visible')void poll()}
  window.addEventListener('online',visibility)
  document.addEventListener('visibilitychange',visibility)
  return()=>{active=false;clearInterval(interval);window.removeEventListener('online',visibility);document.removeEventListener('visibilitychange',visibility);previous.current=null}
 },[enabled])
 if(!enabled)return null
 return <div className={'shopSyncStatus '+(status==='offline'?'offline':'')} role="status" aria-live="polite">
  <span className="shopSyncDot" aria-hidden="true"/>
  <span>{status==='offline'?'Mất kết nối Windows. Dữ liệu hiển thị có thể đã cũ; giao dịch chưa được xác nhận không được coi là hoàn tất.':status==='checking'?'Đang kiểm tra kết nối máy chủ...':'Đã kết nối · kiểm tra thay đổi khoảng 4 giây/lần.'}</span>
  <button type="button" onClick={()=>window.dispatchEvent(new Event('mecacao-server-change'))}>Đọc lại dữ liệu</button>
 </div>
}
