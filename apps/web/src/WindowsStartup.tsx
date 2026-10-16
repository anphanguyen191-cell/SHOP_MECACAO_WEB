import {useEffect,useState,type FormEvent} from 'react'

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
 if(phase==='welcome')return <main className="luxeSplashScreen" aria-label="Màn hình chào CaCao Travel Luxe">
  <div className="luxeSplashAura luxeSplashAuraOne"/><div className="luxeSplashAura luxeSplashAuraTwo"/>
  <section className="luxeSplashCenter">
   <div className="luxeSplashMark"><img src={import.meta.env.BASE_URL+'brand/logo.jpg'} alt="Logo Shop Mẹ CaCao" onError={e=>{e.currentTarget.style.visibility='hidden'}}/><span aria-hidden="true">✿</span></div>
   <span className="luxeSplashEyebrow">SINCE 2023 · SHOP MẸ CACAO</span>
   <h1>Hành trình xinh đẹp bắt đầu...</h1>
   <p>Tole xinh cho bé yêu!</p>
   <div className="luxeSplashLine" aria-hidden="true"><span/></div>
   {error&&<p className="luxeStartupError" role="alert">{error}</p>}
   <button type="button" className="luxeSplashContinue" disabled={loading} onClick={next}>{loading?'Đang kết nối Windows…':'Tiếp tục đến đăng nhập'} <span>→</span></button>
   {!state&&!loading&&<button type="button" className="luxeStartupLink" onClick={()=>setReload(v=>v+1)}>Thử kết nối lại</button>}
   <small>CaCao Travel Luxe V2.0 · Windows LOCAL FIRST</small>
  </section>
 </main>
 return <main className="luxeStartupScreen">
  <div className="luxeStartupAmbient luxeAmbientOne"/><div className="luxeStartupAmbient luxeAmbientTwo"/>
  <div className="luxeStartupShell">
   <header className="luxeStartupBrand"><img src={import.meta.env.BASE_URL+'brand/logo.jpg'} alt="Shop Mẹ CaCao" onError={e=>{e.currentTarget.style.visibility='hidden'}}/><span><b>Shop Mẹ CaCao</b><small>Since 2023 · CaCao Travel Luxe V2.0</small></span><span className="luxeStartupSecure">WINDOWS · LOCAL FIRST</span></header>
   <div className="luxeStartupColumns">
    <section className="luxeStartupStory">
     <div className="luxeStartupStoryCopy"><span className="luxeStartupKicker">✦ MỘT KHÔNG GIAN RIÊNG CHO SHOP</span><h1>{phase==='setup'?'Thiết lập tài khoản chủ shop':'Mỗi ngày làm việc là một chuyến đi thật đẹp.'}</h1><p>{phase==='setup'?'Thiết lập một lần để bảo vệ quyền truy cập Windows. Kho ảnh và database hiện có không thay đổi.':'Một không gian quản lý cửa hàng dịu dàng, tràn đầy cảm hứng. Chào mừng trở lại với Shop Mẹ CaCao.'}</p></div>
     <svg className="luxeStartupLandscape" viewBox="0 0 700 440" role="img" aria-label="Khung cảnh đồi núi và cửa hàng pastel"><defs><linearGradient id="luxeSky" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#fff8fd"/><stop offset="1" stopColor="#e6e9fb"/></linearGradient><linearGradient id="luxeHill" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#c0e4d8"/><stop offset="1" stopColor="#b1c5eb"/></linearGradient></defs><rect width="700" height="440" rx="36" fill="url(#luxeSky)"/><circle cx="526" cy="93" r="49" fill="#ffe0b3"/><g fill="#fff" opacity=".85"><ellipse cx="160" cy="95" rx="80" ry="20"/><ellipse cx="434" cy="160" rx="70" ry="16"/></g><path d="M0 270Q95 150 200 246Q270 123 389 247Q490 130 700 245V440H0Z" fill="#cbd8ef"/><path d="M0 305Q120 220 240 299Q340 200 457 291Q580 207 700 290V440H0Z" fill="url(#luxeHill)"/><path d="M0 360Q130 300 255 360Q380 284 512 353Q616 302 700 340V440H0Z" fill="#e4d4e9"/><path d="M0 405Q225 347 404 401Q575 351 700 389V440H0Z" fill="#f6e8e8"/><g transform="translate(267 212)"><rect x="18" y="70" width="178" height="122" rx="12" fill="#fff6f7"/><path d="M0 79L105 4L215 79Z" fill="#db9bb5"/><path d="M23 77L105 19L194 77Z" fill="#f5c4d3"/><rect x="84" y="114" width="48" height="78" rx="8" fill="#b8a4cf"/><rect x="38" y="104" width="32" height="34" rx="6" fill="#d1e6ef"/><rect x="146" y="104" width="32" height="34" rx="6" fill="#d1e6ef"/></g><g fill="#90b8a7"><circle cx="135" cy="342" r="24"/><circle cx="161" cy="334" r="27"/><circle cx="568" cy="332" r="31"/><circle cx="601" cy="342" r="25"/></g></svg>
     <div className="luxeStartupStoryFooter"><span>✿ Tole xinh cho bé yêu!</span><span>PRODUCT · SIZE · PHOTO · ORDER</span></div>
    </section>
    <section className="luxeStartupCard" aria-label={phase==='welcome'?'Màn hình chào':phase==='setup'?'Thiết lập tài khoản':'Màn hình đăng nhập'}>
     <span className="luxeStartupCardEyebrow">{phase==='welcome'?'WELCOME HOME':phase==='setup'?'FIRST-TIME SETUP':'SECURE SIGN IN'}</span>
     {phase==='welcome'?<>
      <div className="luxeStartupCardIcon" aria-hidden="true">✿</div><h2>Xin chào, chủ Shop!</h2>
      <p>Chào mừng đến với <b>CaCao Travel Luxe V2.0</b>. Tiếp tục để đến màn hình đăng nhập trước khi vào Dashboard.</p>
      {error&&<p className="luxeStartupError" role="alert">{error}</p>}
      <button type="button" className="luxeStartupPrimary" disabled={loading} onClick={next}>{loading?'Đang kết nối Windows…':'Tiếp tục đến đăng nhập'} <span>→</span></button>
      {!state&&!loading&&<button type="button" className="luxeStartupLink" onClick={()=>setReload(v=>v+1)}>Thử kết nối lại</button>}
      <div className="luxeStartupPrivacy">Màn hình chào và đăng nhập luôn xuất hiện mỗi lần mở ứng dụng.</div>
     </>:<>
      <div className="luxeStartupCardIcon" aria-hidden="true">{phase==='setup'?'✧':'♧'}</div><h2>{phase==='setup'?'Tạo tài khoản chủ shop':'Chào mừng chủ shop trở lại'}</h2>
      <p>{phase==='setup'?'Chưa có tài khoản Windows. Hãy tạo tài khoản chủ shop để sử dụng từ lần mở này.':state?.remembered&&savedMode?'Thông tin đăng nhập đã được ghi nhớ bảo mật. Chỉ cần bấm Đăng nhập.':'Nhập thông tin chủ shop để mở Dashboard.'}</p>
      <form className="luxeStartupForm" onSubmit={e=>void submit(e)}>
       <label>Tài khoản<input name="username" value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" required maxLength={40} spellCheck={false}/></label>
       <label>Mật khẩu{phase==='login'&&state?.remembered&&savedMode?<div className="luxeStartupSavedPassword"><span aria-label="Thông tin đăng nhập đã lưu">••••••••••••</span><small>Đã ghi nhớ an toàn</small></div>:<input name="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={phase==='setup'?'new-password':'current-password'} required minLength={phase==='setup'?14:undefined} placeholder="Nhập mật khẩu"/>}</label>
       {phase==='setup'&&<label>Xác nhận mật khẩu<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" required minLength={14} placeholder="Nhập lại mật khẩu"/></label>}
       {phase==='setup'&&<small className="luxeStartupHint">Mật khẩu tối thiểu 14 ký tự, có chữ và số. Không lưu mật khẩu dạng văn bản thuần.</small>}
       {phase==='login'&&state?.remembered&&savedMode&&<button type="button" className="luxeStartupLink" onClick={()=>{setSavedMode(false);setPassword('')}}>Nhập lại mật khẩu</button>}
       <label className="luxeStartupCheck"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/><span>Ghi nhớ đăng nhập trên máy này</span></label>
       {error&&<p className="luxeStartupError" role="alert">{error}</p>}
       <button className="luxeStartupPrimary" type="submit" disabled={busy}>{busy?'Đang xác thực…':phase==='setup'?'Tạo tài khoản & vào cửa hàng':'Đăng nhập'} <span>→</span></button>
      </form>
      <div className="luxeStartupFooterActions"><button type="button" className="luxeStartupLink" onClick={()=>{setPhase('welcome');setError('')}}>← Màn hình chào</button>{phase==='login'&&state?.remembered&&<button type="button" className="luxeStartupLink" onClick={()=>void forget()}>Quên thông tin đã lưu</button>}</div>
      <div className="luxeStartupPrivacy">Tài khoản chủ shop · Windows LOCAL · Không thay đổi nghiệp vụ CORE</div>
     </>}
    </section>
   </div>
   <footer className="luxeStartupBottom">© Shop Mẹ CaCao · Since 2023 <span>CaCao Travel Luxe V2.0</span></footer>
  </div>
 </main>
}
