import {useEffect,useRef,useState} from 'react'
import {apiJson} from './uiState'
import './phonePhotoInbox.css'

type Entry={id:string;sha256:string;mime:string;bytes:number;width:number;height:number;sourceName:string;receivedBy:string;receivedAt:string;status:'PENDING_REVIEW'|'REVIEWED_NOT_REGISTERED';reviewedAt?:string}
type Listing={rows:Entry[];maxBytes:number;maxCount:number;registrationAutomatic:false}
const LIMIT=4*1024*1024
const bytes=(x:number)=>(x/1024/1024).toFixed(2)+' MB'

async function jpegFromImage(file:File,maxDimension=2400,quality=.88){
 const url=URL.createObjectURL(file)
 try{
  const image=new Image()
  await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error('Safari không đọc được định dạng này. Hãy đổi ảnh sang JPEG trước khi thử lại.'));image.src=url})
  const scale=Math.min(1,maxDimension/Math.max(image.naturalWidth,image.naturalHeight))
  const w=Math.max(1,Math.floor(image.naturalWidth*scale)),h=Math.max(1,Math.floor(image.naturalHeight*scale))
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h
  const ctx=canvas.getContext('2d')
  if(!ctx)throw Error('Thiết bị không tạo được ảnh JPEG')
  ctx.drawImage(image,0,0,w,h)
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(v=>v?resolve(v):reject(Error('Không mã hóa được JPEG')), 'image/jpeg',quality))
  return new File([blob],file.name.replace(/\.[^.]+$/, '')+'.jpg',{type:'image/jpeg'})
 }finally{URL.revokeObjectURL(url)}
}
async function sendable(file:File):Promise<{data:File;converted:boolean}>{
 if(['image/jpeg','image/png','image/webp'].includes(file.type)&&file.size<=LIMIT)return {data:file,converted:false}
 let jpg=await jpegFromImage(file)
 if(jpg.size>LIMIT)jpg=await jpegFromImage(file,1600,.72)
 if(jpg.size>LIMIT)throw Error('Ảnh quá lớn sau nén. Vui lòng chọn ảnh nhỏ hơn.')
 return {data:jpg,converted:true}
}
async function toBase64(file:File){
 return new Promise<string>((resolve,reject)=>{
  const reader=new FileReader()
  reader.onerror=()=>reject(Error('Không đọc được ảnh trên điện thoại'))
  reader.onload=()=>{const value=String(reader.result??'');const at=value.indexOf(',');if(at<0)reject(Error('Không chuyển được ảnh'));else resolve(value.slice(at+1))}
  reader.readAsDataURL(file)
 })
}
export default function PhonePhotoInboxView({mobile,onChanged}:{mobile:boolean;onChanged?:()=>void}){
 const [data,setData]=useState<Listing|null>(null),[error,setError]=useState(''),[message,setMessage]=useState('')
 const [uploading,setUploading]=useState(false),[reviewing,setReviewing]=useState<string|null>(null),[progress,setProgress]=useState('')
 const [reload,setReload]=useState(0),fileRef=useRef<HTMLInputElement|null>(null)
 useEffect(()=>{const changed=()=>setReload(n=>n+1);window.addEventListener('mecacao-server-change',changed);return()=>window.removeEventListener('mecacao-server-change',changed)},[])
 useEffect(()=>{
  const ctrl=new AbortController()
  setError('')
  apiJson<Listing>('/api/lan/photos',{signal:ctrl.signal}).then(x=>{if(!ctrl.signal.aborted)setData(x)}).catch(e=>{if(!ctrl.signal.aborted)setError(e.message)})
  return()=>ctrl.abort()
 },[reload])
 async function upload(files:FileList|null){
  if(!files?.length||uploading)return
  if(files.length>12){setError('Tối đa 12 ảnh mỗi lượt. Hãy chia thành nhiều lượt.');return}
  setError('');setMessage('');setUploading(true)
  let ok=0
  try{
   for(let i=0;i<files.length;i++){
    setProgress('Đang xử lý ảnh '+(i+1)+'/'+files.length)
    const {data:prepared,converted}=await sendable(files[i])
    if(prepared.size>LIMIT)throw Error('Ảnh vượt 4 MB')
    const payload={filename:converted?files[i].name+' (đã chuyển JPEG)':files[i].name,mime:prepared.type,base64:await toBase64(prepared)}
    await apiJson('/api/lan/photos/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    ok++
    setMessage('Đã nhận '+ok+' ảnh vào khu chờ, chưa tăng tồn kho.'+(converted?' Có ảnh đã chuyển/nén JPEG để gửi.':''))
    setReload(x=>x+1);onChanged?.()
   }
  }catch(e){
   setError((e instanceof Error?e.message:String(e))+' Đã nhận '+ok+'/'+files.length+' ảnh. Nếu mất mạng, xem danh sách trước khi thử lại để tránh gửi trùng.')
  }finally{setProgress('');setUploading(false);if(fileRef.current)fileRef.current.value=''}
 }
 async function review(photo:Entry){
  if(mobile||reviewing)return
  if(!window.confirm('Đã so ảnh gốc, mã SHA-256 và chắc chắn muốn sao chép ảnh này vào thư mục nguồn chờ Nhập hàng trên Windows? Thao tác không làm tăng tồn.'))return
  setReviewing(photo.id);setError('');setMessage('')
  try{
   const answer=await apiJson<{intakeFolder:string;registeredStock:false}>('/api/lan/photos/'+photo.id+'/review',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sha256:photo.sha256,confirmed:true})
   })
   setMessage('Đã duyệt bản sao; tồn kho CHƯA thay đổi. Trên Windows mở Nhập hàng, chọn thư mục nguồn: '+answer.intakeFolder)
   setReload(n=>n+1);onChanged?.()
  }catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setReviewing(null)}
 }
 const pending=data?.rows.filter(r=>r.status==='PENDING_REVIEW').length??0
 return <section className="phoneInbox" aria-label="Ảnh chờ từ iPhone">
  <header className="phoneInboxHeader"><div><p className="eyebrow">CHECKPOINT 6C · MOBILE LAN</p><h2>Ảnh từ iPhone</h2><p>Ảnh gửi nằm trong khu chờ riêng, <b>không được tính là một bộ tồn</b> cho đến khi hoàn tất phiếu Nhập hàng trên Windows.</p></div>
   <button type="button" onClick={()=>setReload(n=>n+1)}>Làm mới</button></header>
  <div className="phoneInboxSummary"><div><strong>{pending}</strong><span>Ảnh chờ xem xét</span></div><div><strong>{data?.rows.filter(r=>r.status==='REVIEWED_NOT_REGISTERED').length??0}</strong><span>Đã duyệt bản sao</span></div><div><strong>0</strong><span>Tồn tự động cộng</span></div></div>
  {mobile&&<div className="phoneInboxUpload"><h3>Gửi ảnh sản phẩm về Windows</h3><p>Chọn hoặc chụp ảnh, tối đa 12 ảnh/lượt và 4 MB/ảnh sau xử lý. JPEG, PNG, WebP giữ nguyên khi hợp lệ; HEIC/ảnh quá lớn có thể chuyển thành JPEG, cần đối chiếu màu và chất lượng trên Windows.</p>
   <input ref={fileRef} aria-label="Chọn ảnh hoặc chụp ảnh từ iPhone" type="file" accept="image/*" multiple disabled={uploading} onChange={e=>void upload(e.target.files)}/>
   {uploading&&<p role="status">{progress||'Đang tải ảnh...'} — không đóng trang khi đang gửi.</p>}
  </div>}
  {!mobile&&<div className="phoneInboxReviewNotice"><b>Duyệt trên Windows LOCAL</b><p>Xác minh đúng ảnh và hàng thực nhận, bấm Duyệt bản sao, rồi vào Nhập hàng để chọn ảnh đã duyệt và khai báo Product/Size/giá. Không chuyển ảnh chờ thành tồn bằng thao tác này.</p></div>}
  {error&&<p role="alert" className="notice warning">{error}</p>}
  {message&&<p role="status" className="notice">{message}</p>}
  {!data&&!error&&<p>Đang tải hộp ảnh...</p>}
  {data&&<><p className="phoneInboxCount">{data.rows.length} ảnh trong hộp chờ · giới hạn {data.maxCount} ảnh</p>
   {!data.rows.length&&<p>Chưa có ảnh nào gửi từ iPhone.</p>}
   <div className="phoneInboxGrid">{data.rows.map(photo=><article className="phoneInboxCard" key={photo.id}>
    <img loading="lazy" src={'/api/lan/photos/'+photo.id+'/preview'} alt={'Ảnh cần kiểm tra '+photo.sourceName}/>
    <div><b title={photo.sourceName}>{photo.sourceName}</b><small>{photo.width} × {photo.height} · {bytes(photo.bytes)} · {new Date(photo.receivedAt).toLocaleString('vi-VN')}</small><small>Người gửi: {photo.receivedBy}</small><small>SHA-256: {photo.sha256.slice(0,16)}…</small>
    <strong>{photo.status==='PENDING_REVIEW'?'CHỜ DUYỆT · CHƯA TÍNH TỒN':'ĐÃ DUYỆT BẢN SAO · CHƯA TÍNH TỒN'}</strong>
    {!mobile&&photo.status==='PENDING_REVIEW'&&<button type="button" disabled={reviewing!==null} onClick={()=>void review(photo)}>{reviewing===photo.id?'Đang xác minh...':'Duyệt và sao chép nguồn'}</button>}</div>
   </article>)}</div>
  </>}
 </section>
}
