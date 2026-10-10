import {useState,type FormEvent} from 'react'
import './lanLogin.css'
export default function LanLogin({onLogin,connectionError,onRetry}:{onLogin:()=>void;connectionError?:string;onRetry?:()=>void}){
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 async function submit(e:FormEvent){
  e.preventDefault();setBusy(true);setError('');const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000)
  try{
   const r=await fetch('/api/lan/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password}),signal:controller.signal})
   const j=await r.json()
   if(!r.ok)throw Error(j.error||'Không đăng nhập được')
   setPassword('');onLogin()
  }catch(e){setError(controller.signal.aborted||e instanceof TypeError?'Không kết nối được Windows. Kiểm tra Wi-Fi và bật LAN rồi thử lại.':e instanceof Error?e.message:String(e))}
  finally{clearTimeout(timer);setBusy(false)}
 }
 return <div className="lanLoginScreen"><main className="lanLoginCard">
  <img src={import.meta.env.BASE_URL+'brand/logo.jpg'} alt="Logo Shop Mẹ CaCao"/>
  <span>SHOP MẸ CACAO · SINCE 2023</span>
  <h1>Đăng nhập quản lý shop</h1>
  <p>Dùng tài khoản được tạo trên Windows để truy cập kho, đơn hàng và công nợ trong cùng mạng Wi-Fi.</p>
  {connectionError&&<div role="alert"><p>{connectionError}</p><button type="button" onClick={onRetry}>Kiểm tra lại kết nối</button></div>}
  <form onSubmit={e=>void submit(e)}>
   <label>Tài khoản<input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" maxLength={40} required/></label>
   <label>Mật khẩu<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/></label>
   {error&&<p role="alert">{error}</p>}
   <button type="submit" disabled={busy}>{busy?'Đang đăng nhập...':'Đăng nhập'}</button>
  </form>
  <small>Chỉ dùng địa chỉ HTTPS nội bộ của shop. Trang DEMO GitHub Pages không kết nối dữ liệu thật.</small>
 </main></div>
}
