import {useState,type FormEvent} from 'react'
import './lanLogin.css'
export default function LanLogin({onLogin}:{onLogin:()=>void}){
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 async function submit(e:FormEvent){
  e.preventDefault();setBusy(true);setError('')
  try{
   const r=await fetch('/api/lan/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})})
   const j=await r.json()
   if(!r.ok)throw Error(j.error||'Không đăng nhập được')
   setPassword('');onLogin()
  }catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 }
 return <div className="lanLoginScreen"><main className="lanLoginCard">
  <img src={import.meta.env.BASE_URL+'brand/logo.jpg'} alt="Logo Shop Mẹ CaCao"/>
  <span>SHOP MẸ CACAO · SINCE 2023</span>
  <h1>Đăng nhập quản lý shop</h1>
  <p>Dùng tài khoản được tạo trên Windows để truy cập kho, đơn hàng và công nợ trong cùng mạng Wi-Fi.</p>
  <form onSubmit={e=>void submit(e)}>
   <label>Tài khoản<input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" maxLength={40} required/></label>
   <label>Mật khẩu<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/></label>
   {error&&<p role="alert">{error}</p>}
   <button type="submit" disabled={busy}>{busy?'Đang đăng nhập...':'Đăng nhập'}</button>
  </form>
  <small>Chỉ dùng địa chỉ HTTPS nội bộ của shop. Trang DEMO GitHub Pages không kết nối dữ liệu thật.</small>
 </main></div>
}
