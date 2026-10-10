import {useEffect,useState} from 'react'
import {apiJson} from './uiState'

type Evidence={
 imageId:number;orderId:string;soldAt:string;productName:string;size:string;
 status:'RETAINED_UNVERIFIED'|'REVIEW_REQUIRED'|'VERIFIED';
 originalPresent:boolean;originalBytes:number;previewPresent:boolean;previewBytes:number;
 previewUrl:string;message:string
}
type Listing={policy:string;deletionEnabled:boolean;archiveMoveEnabled:boolean;offset:number;limit:number;total:number;rows:Evidence[]}
const bytes=(n:number)=>n>=1024*1024?(n/1024/1024).toFixed(2)+' MB':(n/1024).toFixed(1)+' KB'
export default function SoldRetentionView(){
 const [data,setData]=useState<Listing|null>(null),[offset,setOffset]=useState(0),[reload,setReload]=useState(0)
 const [busy,setBusy]=useState<number|null>(null),[error,setError]=useState(''),[verified,setVerified]=useState<Record<number,string>>({})
 useEffect(()=>{
  const ctrl=new AbortController()
  setError('')
  apiJson<Listing>('/api/sales/drafts/sold-retention?offset='+offset,{signal:ctrl.signal})
   .then(setData).catch(e=>{if(!ctrl.signal.aborted)setError(String(e.message||e))})
  return()=>ctrl.abort()
 },[offset,reload])
 async function inspect(row:Evidence){
  setBusy(row.imageId);setError('')
  try{
   const result=await apiJson<Evidence&{checksumVerified:boolean;previewDecoded:boolean}>('/api/sales/drafts/sold-retention/'+row.imageId+'/verify')
   setVerified(v=>({...v,[row.imageId]:result.checksumVerified&&result.previewDecoded?'Đã xác minh SHA-256 và giải mã':'Cần đối soát'}))
  }catch(e){setVerified(v=>({...v,[row.imageId]:'KHÔNG ĐẠT — cần đối soát'}));setError(e instanceof Error?e.message:String(e))}
  finally{setBusy(null)}
 }
 return <section className="soldRetentionPage">
  <div className="soldRetentionIntro"><div><span className="soldRetentionEyebrow">STAGE 5 · BẢO TOÀN CHỨNG TỪ</span><h2>Quản lý ảnh đã bán</h2><p>Đối chiếu ảnh gốc SOLD và ảnh chứng từ, theo từng image ID. Chỉ đọc và xác minh; không di chuyển hoặc xóa file.</p></div><span className="soldRetentionPolicy">Chính sách: GIỮ ẢNH GỐC</span></div>
  <div className="soldRetentionNotice" role="note"><strong>Chưa bật dọn ảnh hoặc xóa tự động.</strong> Kiểm chứng trong màn này không thay đổi tồn kho, ledger, đơn bán hay chứng từ.</div>
  {error&&<p className="notice warning" role="alert">{error}</p>}
  <div className="soldRetentionToolbar"><strong>{data?data.total+' bộ đã SOLD':'Đang tải...'}</strong><button type="button" onClick={()=>{setVerified({});setReload(x=>x+1)}}>Làm mới</button></div>
  <div className="soldRetentionGrid">
  {data?.rows.map(row=><article className="soldRetentionCard" key={row.imageId}>
    <div className="soldRetentionPhoto">{row.previewPresent?<img src={row.previewUrl} loading="lazy" alt={'Ảnh chứng từ '+row.productName}/>:<span>Ảnh cần đối soát</span>}</div>
    <div className="soldRetentionDetails"><span className={row.status==='REVIEW_REQUIRED'?'soldRetentionBad':'soldRetentionGood'}>{row.status==='REVIEW_REQUIRED'?'CẦN ĐỐI SOÁT':'CÒN ẢNH · CHƯA KIỂM CHỨNG'}</span><h3>{row.productName}</h3><p>{row.size} · Ảnh #{row.imageId}</p><p>Đơn {row.orderId}</p><p>Gốc: {row.originalPresent?bytes(row.originalBytes):'Thiếu'} · Preview: {row.previewPresent?bytes(row.previewBytes):'Thiếu'}</p><small>{verified[row.imageId]??row.message}</small><button type="button" disabled={busy!==null} onClick={()=>void inspect(row)}>{busy===row.imageId?'Đang kiểm tra...':'Xác minh ảnh và checksum'}</button></div>
   </article>)}
  </div>
  {data&&data.total===0&&<p className="soldRetentionEmpty">Chưa có ảnh SOLD. Không có dữ liệu nào bị thay đổi.</p>}
  {data&&data.total>data.limit&&<div className="soldRetentionPager"><button disabled={offset===0} onClick={()=>setOffset(v=>Math.max(0,v-25))}>Trang trước</button><span>{Math.floor(offset/data.limit)+1} / {Math.ceil(data.total/data.limit)}</span><button disabled={offset+data.limit>=data.total} onClick={()=>setOffset(v=>v+data.limit)}>Trang sau</button></div>}
 </section>
}
