import {useEffect,useRef,useState} from 'react'
import {apiJson} from './uiState'

type Notice={id:string;kind:string;message:string;createdAt:string;state:string}
type WatchConfig={popup?:boolean}
/**
 * Warehouse notifications have exactly one foreground surface:
 * compact actionable toast OR bell panel. The legacy automatic folderOverlay
 * modal was duplicated over the toast and is intentionally removed.
 */
export default function WarehouseNotifications({isDemo,onReview}:{isDemo:boolean;onReview:()=>void}){
 const [notices,setNotices]=useState<Notice[]>([])
 const [open,setOpen]=useState(false)
 const [toast,setToast]=useState<Notice|null>(null)
 const [error,setError]=useState('')
 const [alertNotice,setAlertNotice]=useState<Notice|null>(null)
 const known=useRef(new Set<string>())
 const initialLoad=useRef(true)
 useEffect(()=>{
  if(isDemo)return
  const c=new AbortController()
  const poll=async()=>{
   try{
    const [rows,config]=await Promise.all([
     apiJson('/api/warehouse/notices',{signal:c.signal}) as Promise<Notice[]>,
     apiJson('/api/warehouse/settings',{signal:c.signal}) as Promise<WatchConfig>
    ])
    if(c.signal.aborted)return
    const unseen=rows.filter(n=>n.state==='unseen'&&!known.current.has(n.id))
    for(const n of rows)known.current.add(n.id)
    setNotices(rows);setError('')
    const target=document.activeElement?.tagName
    // Initial warehouse reconciliation is informational: never cover the Dashboard on launch.
    // Only newly arriving changes after the first poll may open an actionable notice.
    const allowForeground=!initialLoad.current&&config.popup&&unseen.length>0
    initialLoad.current=false
    if(allowForeground&&!['INPUT','TEXTAREA','SELECT'].includes(target??'')&&!document.querySelector('[role=dialog],fieldset:disabled')){
     if(unseen[0].kind==='error')setAlertNotice(unseen[0]);else setToast(unseen[0])
    }
   }catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'Không đọc được thông báo kho')}
  }
  void poll()
  const timer=setInterval(poll,15000)
  return()=>{c.abort();clearInterval(timer)}
 },[isDemo])
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(null),8000);return()=>clearTimeout(timer)},[toast])
 async function mark(id:string,state:string){
  try{
   setNotices(await apiJson('/api/warehouse/notices/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({state})}))
   setToast(null);setAlertNotice(null)
  }catch(e){setError(e instanceof Error?e.message:'Không lưu được trạng thái')}
 }
 function review(n:Notice){void mark(n.id,'seen');setOpen(false);onReview()}
 if(isDemo)return null
 const count=notices.filter(n=>n.state==='unseen').length
 return <div className="warehouseNotifications">
  <button type="button" aria-label={'Thông báo kho'+(count?' ('+count+' chưa xem)':'')} aria-expanded={open} onClick={()=>{setOpen(v=>!v);setToast(null);setAlertNotice(null)}} title="Thông báo kho">
   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span>{count}</span>
  </button>
  {toast&&!open&&!alertNotice&&<aside className="warehouseToast" role="status" aria-live="polite">
   <div className="warehouseToastHead"><span className="warehouseToastIcon" aria-hidden="true">✿</span><b>{toast.kind==='error'?'Cần kiểm tra kho ảnh':'Kho ảnh có thay đổi'}</b><button type="button" className="warehouseNoticeClose" aria-label="Đóng thông báo kho" onClick={()=>setToast(null)}>×</button></div>
   <p>{toast.message}</p>
   <div className="warehouseToastActions"><button type="button" onClick={()=>review(toast)}>Xem & duyệt</button><button type="button" onClick={()=>setToast(null)}>Để sau</button></div>
  </aside>}
  {open&&<section className="warehouseNoticePanel" aria-label="Danh sách thông báo kho"><div className="warehouseNoticeTitle"><span>Thông báo hệ thống</span><button type="button" className="warehouseNoticeClose" aria-label="Đóng bảng thông báo kho" onClick={()=>setOpen(false)}>×</button></div>
   <h3>Thông báo kho ảnh</h3>
   {error&&<p role="alert">{error}</p>}
   {!notices.length&&<p>Chưa có thông báo. Bật quét tự động trong Import kho.</p>}
   {notices.map(n=><article key={n.id}><b>{n.state==='unseen'?'CHƯA XEM':n.state==='seen'?'ĐÃ XEM':'ĐÃ XỬ LÝ'}</b><p>{n.message}</p><small>{n.createdAt}</small><div className="row"><button type="button" className="warehouseReviewButton" onClick={()=>review(n)}>Xem & duyệt</button>{n.state!=='resolved'&&<button type="button" onClick={()=>void mark(n.id,'resolved')}>Đã xử lý</button>}</div></article>)}
  </section>}
  {(error||alertNotice)&&!open&&!toast&&<aside className="warehouseErrorPanel" role="alert"><b>{alertNotice?'Cần kiểm tra kho ảnh':'Không đọc được thông báo kho'}</b><p>{alertNotice?.message??error}</p><div className="warehouseToastActions"><button type="button" onClick={()=>{setOpen(true);setAlertNotice(null)}}>Xem thông báo</button><button type="button" onClick={()=>{setError('');setAlertNotice(null)}}>Để sau</button></div></aside>}
 </div>
}
