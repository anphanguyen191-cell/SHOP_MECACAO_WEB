import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
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

const updateSW=registerSW({ immediate: true,onNeedRefresh(){window.dispatchEvent(new Event('mecacao-update-ready'))} })

function Runtime(){
 const [updateReady,setUpdateReady]=React.useState(false)
 React.useEffect(()=>{const ready=()=>setUpdateReady(true),activated=()=>{if(window.dispatchEvent(new Event('mecacao-before-navigate',{cancelable:true})))setRemote(true)};window.addEventListener('mecacao-update-ready',ready);window.addEventListener('mecacao-cloud-activated',activated);return()=>{window.removeEventListener('mecacao-update-ready',ready);window.removeEventListener('mecacao-cloud-activated',activated)}},[])
 const [remote,setRemote]=React.useState(new URLSearchParams(location.search).get('cloud')==='1'||(location.hostname.endsWith('github.io')&&new URLSearchParams(location.search).get('demo')!=='1'))
 React.useEffect(()=>{if(remote||location.hostname.endsWith('github.io'))return;const controller=new AbortController();void fetch('/api/health',{signal:controller.signal}).then(r=>r.json()).then(h=>{if(h.cloudAuthority)setRemote(true)}).catch(()=>{});return()=>controller.abort()},[remote])
 return <>{updateReady&&<div className="notice" role="status">Có phiên bản giao diện mới. <button onClick={()=>{if(window.dispatchEvent(new Event('mecacao-before-navigate',{cancelable:true})))void updateSW(true)}}>Mở bản mới</button></div>}{remote?<React.Suspense fallback={<p>Đang mở Shop Mẹ Ca Cao Cloud…</p>}><CloudWorkspace/></React.Suspense>:<App/>}</>
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Runtime/></React.StrictMode>,
)
