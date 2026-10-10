import {useEffect,useRef,useState} from 'react'
import {apiJson} from './uiState'
type Archive={archiveId:string;version?:number;quantity?:number;optimizedBytes?:number;status:string;message?:string}
type Image={imageId:number;sourceHash:string}
export default function SalesArchivePanel({id,version,images,disabled}:{id:string;version:number;images?:Image[];disabled:boolean}){
 const [rows,setRows]=useState<Archive[]>([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[reload,setReload]=useState(0)
 const key=useRef<string|null>(null),lock=useRef(false)
 useEffect(()=>{const c=new AbortController();setLoading(true);apiJson('/api/sales/drafts/'+id+'/archives',{signal:c.signal}).then(setRows).catch(e=>{if(!c.signal.aborted)setError(e.message)}).finally(()=>{if(!c.signal.aborted)setLoading(false)});return()=>c.abort()},[id,reload])
 async function run(kind:'prepare'|'verify'|'recover',row?:Archive){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('')
  try{
   if(kind==='prepare'&&!key.current)key.current=crypto.randomUUID()
   await apiJson('/api/sales/drafts/'+id+'/archives'+(row?'/'+row.archiveId+'/'+kind:''),{method:'POST',headers:{'Content-Type':'application/json',...(kind==='prepare'?{'Idempotency-Key':key.current!}:{})},body:JSON.stringify(kind==='prepare'?{version,images}:{})})
   setMessage(kind==='verify'?'Checksum và giải mã ảnh lưu thử đạt.':kind==='recover'?'Bộ lưu thử đã phục hồi và kiểm chứng. Ảnh gốc giữ nguyên.':'Đã lưu và kiểm chứng bộ ảnh thử. Chưa bán, chưa xóa ảnh gốc.');setReload(n=>n+1)
  }catch(e){setError(e instanceof Error?e.message:'Không kiểm chứng được ảnh lưu thử');setReload(n=>n+1)}finally{lock.current=false;setBusy(false)}
 }
 return <section className="salesArchivePanel"><div className="salesPreviewHeading"><div><h4>Lưu thử ảnh nhẹ an toàn</h4><p>Bộ thử riêng, có nhật ký và SHA-256. Hiện tối đa 50 bộ gần nhất.</p></div><button className="salesAction salesActionMint" disabled={disabled||!images||busy||loading} onClick={()=>void run('prepare')}>{busy?'Đang kiểm chứng…':'Lưu bộ ảnh thử'}</button></div>{!images&&<small>Xem trước ảnh nhẹ trước để lưu thử chất lượng đã so sánh.</small>}{error&&<p className="notice warning" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}{loading&&<p role="status">Đang đọc các bộ ảnh thử đã lưu…</p>}<div className="salesArchiveList">{rows.map(r=><article key={r.archiveId}><div><b>{r.status==='READY'?'✓ Đã lưu · kiểm chứng lúc lưu':r.status==='INCOMPLETE'?'◷ Chưa hoàn tất':'⚠ Cần kiểm tra thủ công'}</b><small>{r.version?'Nháp phiên bản '+r.version+' · ':''}{r.quantity??'?'} ảnh · {r.optimizedBytes?Math.ceil(r.optimizedBytes/1024)+' KB':''} · {r.archiveId.slice(0,8).toUpperCase()}</small>{r.version!==undefined&&r.version!==version&&<small>Bộ thử thuộc phiên bản cũ; không tự dùng cho nháp hiện tại.</small>}{r.message&&<p>{r.message}</p>}</div>{r.status==='READY'&&<button className="salesAction salesActionSecondary" disabled={busy||loading} onClick={()=>void run('verify',r)}>Kiểm chứng lại</button>}{r.status==='INCOMPLETE'&&<button className="salesAction salesActionMint" disabled={busy||loading||disabled||r.version!==version} onClick={()=>void run('recover',r)}>Phục hồi bộ thử</button>}</article>)}</div><p className="salesHint">Đây là thử nghiệm lưu ảnh, chưa phải lịch sử bán. Không tự xóa bộ thử hoặc ảnh gốc; chưa ghi giao dịch bán.</p></section>
}
