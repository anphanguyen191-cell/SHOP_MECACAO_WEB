import React from 'react'
import ReactDOM from 'react-dom/client'
const catalog = new URLSearchParams(location.search).get('catalog') === '1'
const Surface = React.lazy(() => catalog ? import('./CustomerCatalog') : import('./AdminRuntime'))
ReactDOM.createRoot(document.getElementById('root')!).render(
 <React.StrictMode><React.Suspense fallback={<div role="status">Đang mở Shop Mẹ CaCao…</div>}><Surface/></React.Suspense></React.StrictMode>,
)
