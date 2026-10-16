import {useEffect,useState,type FormEvent} from 'react'
import {TravelLuxeSplash,TravelLuxeAuthLayout} from './TravelLuxeAuthLayout'
import './lanLogin.css'

/** LAN uses its own HTTPS session; never treat the demo's fake sign-in as authentication. */
export default function LanLogin({onLogin,connectionError,onRetry}:{onLogin:()=>void;connectionError?:string;onRetry?:()=>void}){
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const [showSplash,setShowSplash]=useState(()=>window.matchMedia('(min-width: 801px)').matches&&sessionStorage.getItem('mecacao-lan-welcome-shown')!=='yes')
 useEffect(()=>{
  if(!showSplash)return
  const timer=window.setTimeout(()=>skipSplash(),2100)
  return()=>window.clearTimeout(timer)
 },[showSplash])
 function skipSplash(){sessionStorage.setItem('mecacao-lan-welcome-shown','yes');setShowSplash(false)}
 async function submit(e:FormEvent){
  e.preventDefault();setBusy(true);setError('');const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000)
  try{
   const r=await fetch('/api/lan/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({username,password}),signal:controller.signal})
   const j=await r.json()
   if(!r.ok)throw Error(j.error||'Không đăng nhập được')
   setPassword('');onLogin()
  }catch(e){setError(controller.signal.aborted||e instanceof TypeError?'Không kết nối được Windows. Kiểm tra Wi-Fi và bật LAN rồi thử lại.':e instanceof Error?e.message:String(e))}
  finally{clearTimeout(timer);setBusy(false)}
 }
 if(showSplash)return <TravelLuxeSplash onContinue={skipSplash}/>
 return <TravelLuxeAuthLayout variant="lan">
  <div className="lanLoginCard">
   <h2>Chào mừng<br/>chủ shop trở lại 👋</h2>
   <p>Bắt đầu hành trình quản lý hôm nay bằng một trải nghiệm thật nhẹ nhàng.</p>
   {connectionError&&<div className="cacaoDemoError" role="alert"><p>{connectionError}</p><button type="button" className="cacaoDemoLink" onClick={onRetry}>Kiểm tra lại kết nối</button></div>}
   <form className="cacaoDemoForm" onSubmit={e=>void submit(e)}>
    <label className="cacaoDemoField"><span>Tên đăng nhập</span><input className="cacaoDemoTextInput" value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" maxLength={40} required/></label>
    <label className="cacaoDemoField"><span>Mật khẩu</span><input className="cacaoDemoTextInput" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/></label>
    {error&&<p className="cacaoDemoError" role="alert">{error}</p>}
    <button className="cacaoDemoSubmit" type="submit" disabled={busy}>{busy?'Đang đăng nhập…':'Đăng nhập'} <span aria-hidden="true">→</span></button>
   </form>
   <p className="cacaoDemoNote"><span aria-hidden="true">♧</span> Kết nối LAN nội bộ qua HTTPS · Sử dụng tài khoản LAN đã được tạo trên Windows. Trình duyệt có thể tự điền thông tin nếu bạn đã lưu bằng trình quản lý mật khẩu.</p>
  </div>
 </TravelLuxeAuthLayout>
}
