import React from 'react'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import WindowsStartup from './WindowsStartup'
import {MobileLuxeSplash} from './MobileLuxeUI'
const CloudWorkspace=React.lazy(()=>import('./CloudWorkspace'))
import './styles.css'
import './desktopExperience.css'
import './inventorySharing.css'
import './lightContrast.css'
import './uiRefresh.css'
import './displaySize.css'
import './floatingActions.css'
import './v8-design.css'
import './v8-flow.css'
import './travelLuxeV2.css'
import './travelLuxeWorkspaces.css'
import './travelLuxeDesktopFinal.css'
import './travelLuxeStartup.css'
import './travelLuxeDemoAuth.css' // Approved demo splash/login over legacy startup styling
import './travelLuxePolish.css' // Final Windows-only visual parity and independent workspace scrolling
import './travelLuxeContrast.css' // Device-local Travel Luxe contrast levels and fixed workspace chrome
import './mobileLuxeV2.css' // Mobile-only overrides loaded last; Windows remains unchanged

const updateSW=registerSW({ immediate: true,onNeedRefresh(){window.dispatchEvent(new Event('mecacao-update-ready'))} })
const windowsLocalHost=['localhost','127.0.0.1','[::1]'].includes(location.hostname)

export default function Runtime(){
 const [updateReady,setUpdateReady]=React.useState(false)
 React.useEffect(()=>{const ready=()=>setUpdateReady(true),activated=()=>{if(!windowsLocalHost&&window.dispatchEvent(new Event('mecacao-before-navigate',{cancelable:true})))setRemote(true)};window.addEventListener('mecacao-update-ready',ready);window.addEventListener('mecacao-cloud-activated',activated);return()=>{window.removeEventListener('mecacao-update-ready',ready);window.removeEventListener('mecacao-cloud-activated',activated)}},[])
 const [remote,setRemote]=React.useState(new URLSearchParams(location.search).get('cloud')==='1'||(location.hostname.endsWith('github.io')&&new URLSearchParams(location.search).get('demo')!=='1'))
 const [windowsGate,setWindowsGate]=React.useState<'checking'|'enabled'|'disabled'>('checking')
 const [entered,setEntered]=React.useState(false)
 React.useEffect(()=>{
  if(location.protocol==='https:'||location.hostname.endsWith('github.io')||!windowsLocalHost||new URLSearchParams(location.search).get('demo')==='1'){setWindowsGate('disabled');return}
  const controller=new AbortController()
  void fetch('/api/health',{signal:controller.signal,cache:'no-store'}).then(r=>r.json()).then(h=>{if(controller.signal.aborted)return;setWindowsGate(h.windowsAuth?'enabled':'disabled')}).catch(()=>{if(!controller.signal.aborted)setWindowsGate('disabled')})
  return()=>controller.abort()
 },[])
 return <>{windowsLocalHost&&remote&&<button type="button" aria-label="Quay về CORE laptop để cập nhật" onClick={()=>{const localUrl=new URL(location.href);localUrl.searchParams.delete('cloud');history.replaceState(null,'',localUrl);setRemote(false)}} style={{position:'fixed',top:12,right:16,zIndex:100000,border:'1px solid #dfbfd2',borderRadius:999,padding:'11px 16px',background:'#fff7fb',color:'#78234f',fontWeight:700,boxShadow:'0 6px 24px #401b3526',cursor:'pointer'}}>← Về CORE laptop · Cập nhật</button>}<MobileLuxeSplash/>{updateReady&&(windowsGate!=='enabled'||entered)&&<div className="notice appUpdateNotice" role="status">Có phiên bản giao diện mới. <button onClick={()=>{if(window.dispatchEvent(new Event('mecacao-before-navigate',{cancelable:true})))void updateSW(true)}}>Mở bản mới</button></div>}{windowsGate==='checking'?<div className="luxeStartupScreen" role="status">Đang kết nối Shop Mẹ CaCao Windows…</div>:windowsGate==='enabled'?entered?<App/>:<WindowsStartup onEnter={()=>setEntered(true)}/>:remote?<React.Suspense fallback={<div className="mobileCloudLaunch" role="status"><img src={import.meta.env.BASE_URL+'brand/logo.jpg'} alt="Logo Shop Mẹ CaCao"/><h1>Mẹ CaCao</h1><span>TRAVEL LUXE · SINCE 2023</span><p>Đang mở cửa hàng…</p></div>}><CloudWorkspace/></React.Suspense>:<App/>}</>
}

