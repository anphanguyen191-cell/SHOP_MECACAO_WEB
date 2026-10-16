import {useEffect,useRef,useState} from 'react'
import {apiJson} from './uiState'

type Notice={id:string;kind:string;message:string;createdAt:string;state:string}
type WatchConfig={popup?:boolean}
/**
 * Warehouse notifications have exactly one foreground surface:
 * compact actionable toast OR bell panel. The legacy automatic centered warehouse
 * modal was duplicated over the toast and is intentionally removed.
 */
export default function WarehouseNotifications({isDemo,onReview}:{isDemo:boolean;onReview:()=>void}){
 const [notices,setNotices]=useState<Notice[]>([])
 const [open,setOpen]=useState(false)
 const [tab,setTab]=useState<'pending'|'history'>('pending')
 const [showAll,setShowAll]=useState(false)
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
  window.addEventListener('mecacao-server-change',poll)
  return()=>{c.abort();clearInterval(timer);window.removeEventListener('mecacao-server-change',poll)}
 },[isDemo])
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(null),8000);return()=>clearTimeout(timer)},[toast])
 async function mark(id:string,state:string){
  try{
   setNotices(await apiJson('/api/warehouse/notices/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({state})}))
   setToast(null);setAlertNotice(null)
  }catch(e){setError(e instanceof Error?e.message:'Không lưu được trạng thái')}
 }
 function review(n:Notice){if(n.state!=='resolved')void mark(n.id,'seen');setOpen(false);onReview()}
 function timeLabel(value:string){const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):value}
 if(isDemo)return null
 const count=notices.filter(n=>n.state==='unseen').length
 const pending=notices.filter(n=>n.state!=='resolved')
 const history=notices.filter(n=>n.state==='resolved')
 const displayed=[...(tab==='pending'?pending:history)].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))
 const visible=showAll?displayed:displayed.slice(0,8)
 return <div className="warehouseNotifications">
  <button type="button" aria-label={'Thông báo kho'+(count?' ('+count+' chưa xem)':'')} aria-expanded={open} onClick={()=>{setOpen(v=>!v);setToast(null);setAlertNotice(null)}} title="Thông báo kho">
   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span>{count}</span>
  </button>
  {toast&&!open&&!alertNotice&&<aside className="warehouseToast" role="status" aria-live="polite">
   <div className="warehouseToastHead"><span className="warehouseToastIcon" aria-hidden="true">✿</span><b>{toast.kind==='error'?'Cần kiểm tra kho ảnh':'Kho ảnh có thay đổi'}</b><button type="button" className="warehouseNoticeClose" aria-label="Đóng thông báo kho" onClick={()=>setToast(null)}>×</button></div>
   <p>{toast.message}</p>
   <div className="warehouseToastActions"><button type="button" onClick={()=>review(toast)}>Xem & duyệt</button><button type="button" onClick={()=>setToast(null)}>Để sau</button></div>
  </aside>}
  {open&&<section className="warehouseNoticePanel" aria-label="Danh sách thông báo kho">
   <div className="warehouseNoticeTitle"><span>TRUNG TÂM THÔNG BÁO</span><button type="button" className="warehouseNoticeClose" aria-label="Đóng bảng thông báo kho" onClick={()=>setOpen(false)}>×</button></div>
   <div className="warehouseNoticeOverview"><div><h3>Thông báo kho ảnh</h3><p>{pending.length?pending.length+' việc cần xem hoặc xử lý':'Kho đã được xem và xử lý hết thông báo'}</p></div><span className="warehouseNoticeCount">{pending.length}</span></div>
   <div className="warehouseNoticeTabs" aria-label="Bộ lọc thông báo"><button type="button" aria-pressed={tab==='pending'} className={tab==='pending'?'selected':''} onClick={()=>{setTab('pending');setShowAll(false)}}>Cần xử lý <span>{pending.length}</span></button><button type="button" aria-pressed={tab==='history'} className={tab==='history'?'selected':''} onClick={()=>{setTab('history');setShowAll(false)}}>Lịch sử <span>{history.length}</span></button></div>
   {error&&<p className="warehouseNoticeInlineError" role="alert">{error}</p>}
   {!displayed.length&&<div className="warehouseNoticeEmpty"><span aria-hidden="true">✿</span><b>{tab==='pending'?'Không có việc cần xử lý':'Chưa có lịch sử thông báo'}</b><p>{tab==='pending'?'Thông báo mới sẽ hiển thị tại đây khi kho thay đổi.':'Thông báo đã xử lý được lưu tại đây để tra cứu.'}</p></div>}
   <div className="warehouseNoticeList">{visible.map(n=><article key={n.id} className={'warehouseNoticeItem'+(n.state==='unseen'?' isNew':'')}><div className="warehouseNoticeItemHead"><span className={'warehouseNoticeState '+(n.state==='resolved'?'isResolved':n.state==='unseen'?'isUnseen':'isSeen')}>{n.state==='unseen'?'Mới':n.state==='seen'?'Đã xem':'Đã xử lý'}</span><time dateTime={n.createdAt}>{timeLabel(n.createdAt)}</time></div><p>{n.message}</p><div className="warehouseNoticeItemActions"><button type="button" className="warehouseReviewButton" onClick={()=>review(n)}>{n.state==='resolved'?'Xem lại kho':'Xem & duyệt'}</button>{n.state!=='resolved'&&<button type="button" onClick={()=>void mark(n.id,'resolved')}>Đánh dấu xử lý</button>}</div></article>)}</div>
   {displayed.length>8&&<button type="button" className="warehouseNoticeMore" onClick={()=>setShowAll(v=>!v)}>{showAll?'Thu gọn':'Xem thêm '+(displayed.length-8)+' thông báo'}</button>}
  </section>}
  {(error||alertNotice)&&!open&&!toast&&<aside className="warehouseErrorPanel" role="alert"><b>{alertNotice?'Cần kiểm tra kho ảnh':'Không đọc được thông báo kho'}</b><p>{alertNotice?.message??error}</p><div className="warehouseToastActions"><button type="button" onClick={()=>{setOpen(true);setAlertNotice(null)}}>Xem thông báo</button><button type="button" onClick={()=>{setError('');setAlertNotice(null)}}>Để sau</button></div></aside>}
 </div>
}
