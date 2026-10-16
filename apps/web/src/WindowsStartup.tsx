import {useEffect,useState,type FormEvent} from 'react'
import {TravelLuxeSplash,TravelLuxeAuthLayout} from './TravelLuxeAuthLayout'

type AuthState={configured:boolean;username:string;remembered:boolean}
export default function WindowsStartup({onEnter}:{onEnter:()=>void}){
 const [phase,setPhase]=useState<'welcome'|'login'|'setup'>('welcome')
 const [state,setState]=useState<AuthState|null>(null)
 const [username,setUsername]=useState('owner'),[password,setPassword]=useState(''),[confirm,setConfirm]=useState('')
 const [remember,setRemember]=useState(true),[savedMode,setSavedMode]=useState(true)
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const [reload,setReload]=useState(0)
 useEffect(()=>{
  const controller=new AbortController()
  setLoading(true);setError('')
  void fetch('/api/local/auth/state',{cache:'no-store',signal:controller.signal})
   .then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error||'Không đọc được tài khoản');return data as AuthState})
   .then(data=>{if(controller.signal.aborted)return;setState(data);setUsername(data.username||'owner');setSavedMode(data.remembered)})
   .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Không kết nối được Windows')})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
  return()=>controller.abort()
 },[reload])
 useEffect(()=>{
  if(phase!=='welcome'||loading||!state)return
  const timer=window.setTimeout(()=>setPhase(state.configured?'login':'setup'),2100)
  return()=>window.clearTimeout(timer)
 },[phase,loading,state])
 function next(){if(!state){setReload(v=>v+1);return}setError('');setPhase(state.configured?'login':'setup')}
 async function submit(e:FormEvent){
  e.preventDefault();if(!state||busy)return
  if(phase==='setup'&&password!==confirm){setError('Xác nhận mật khẩu chưa khớp');return}
  setBusy(true);setError('')
  try{
   const useRemember=phase==='login'&&savedMode&&state.remembered&&!password
   const body=phase==='setup'?{username,password,remember}:{username,password,remember,useRemember}
   const response=await fetch('/api/local/auth/'+(phase==='setup'?'setup':'login'),{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(body)})
   const result=await response.json()
   if(!response.ok)throw Error(result.error||'Không đăng nhập được')
   setPassword('');setConfirm('');onEnter()
  }catch(e){setError(e instanceof Error?e.message:'Không đăng nhập được');if(phase==='login'&&savedMode){setSavedMode(false);setPassword('')}}
  finally{setBusy(false)}
 }
 async function forget(){
  try{
   const r=await fetch('/api/local/auth/forget',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})
   if(!r.ok)throw Error('Không xóa được ghi nhớ')
   setState(v=>v?{...v,remembered:false}:v);setSavedMode(false);setPassword('');setError('')
  }catch(e){setError(e instanceof Error?e.message:'Không xóa được ghi nhớ')}
 }
 if(phase==='welcome')return <TravelLuxeSplash onContinue={next} busy={loading} error={error}/>
 return <TravelLuxeAuthLayout variant="windows">
  <h2>{phase==='setup'?'Tạo tài khoản chủ shop':<>Chào mừng<br/>chủ shop trở lại 👋</>}</h2>
  <p>{phase==='setup'?'Tạo tài khoản Windows một lần để bảo vệ kho ảnh và dữ liệu hiện có.':'Bắt đầu hành trình quản lý hôm nay bằng một trải nghiệm thật nhẹ nhàng.'}</p>
  <form className="luxeStartupForm cacaoDemoForm" onSubmit={e=>void submit(e)}>
   <label className="cacaoDemoField"><span>Tên đăng nhập</span><input className="cacaoDemoTextInput" name="username" value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" required maxLength={40} spellCheck={false}/></label>
   <label className="cacaoDemoField"><span>Mật khẩu</span>
    {phase==='login'&&state?.remembered&&savedMode?
     <div className="luxeStartupSavedPassword"><span aria-label="Thông tin đăng nhập đã lưu">••••••••••••</span><small>Đã ghi nhớ an toàn</small></div>:
     <input className="cacaoDemoTextInput" name="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={phase==='setup'?'new-password':'current-password'} required minLength={phase==='setup'?14:undefined} placeholder="Nhập mật khẩu"/>}
   </label>
   {phase==='setup'&&<label className="cacaoDemoField"><span>Xác nhận mật khẩu</span><input className="cacaoDemoTextInput" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" required minLength={14} placeholder="Nhập lại mật khẩu"/></label>}
   {phase==='setup'&&<small className="cacaoDemoHint">Mật khẩu tối thiểu 14 ký tự, có chữ và số. Mật khẩu không được lưu dạng văn bản thuần.</small>}
   {phase==='login'&&state?.remembered&&savedMode&&<button type="button" className="cacaoDemoLink" onClick={()=>{setSavedMode(false);setPassword('')}}>Nhập lại mật khẩu</button>}
   <label className="cacaoDemoRemember"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/><span>Ghi nhớ đăng nhập trên máy này</span></label>
   {error&&<p className="cacaoDemoError" role="alert">{error}</p>}
   <button className="luxeStartupPrimary cacaoDemoSubmit" type="submit" disabled={busy}>{busy?'Đang xác thực…':phase==='setup'?'Tạo tài khoản & vào cửa hàng':'Đăng nhập'} <span aria-hidden="true">→</span></button>
  </form>
  <div className="cacaoDemoFormActions">
   <button type="button" className="cacaoDemoLink" onClick={()=>{setPhase('welcome');setError('')}}>← Màn hình chào</button>
   {phase==='login'&&state?.remembered&&<button type="button" className="cacaoDemoLink" onClick={()=>void forget()}>Quên thông tin đã lưu</button>}
  </div>
  <p className="cacaoDemoNote"><span aria-hidden="true">♧</span> Tài khoản Windows LOCAL · Xác thực thật, bảo vệ quyền truy cập kho ảnh. Không thay đổi ảnh gốc, database hoặc nghiệp vụ CORE.</p>
 </TravelLuxeAuthLayout>
}
