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

registerSW({ immediate: true })

function Runtime(){
 const [remote,setRemote]=React.useState(new URLSearchParams(location.search).get('cloud')==='1'||(location.hostname.endsWith('github.io')&&new URLSearchParams(location.search).get('demo')!=='1'))
 React.useEffect(()=>{if(remote||location.hostname.endsWith('github.io'))return;const controller=new AbortController();void fetch('/api/health',{signal:controller.signal}).then(r=>r.json()).then(h=>{if(h.cloudAuthority)setRemote(true)}).catch(()=>{});return()=>controller.abort()},[remote])
 return remote?<React.Suspense fallback={<p>Đang mở Shop Mẹ Ca Cao Cloud…</p>}><CloudWorkspace/></React.Suspense>:<App/>
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Runtime/></React.StrictMode>,
)
