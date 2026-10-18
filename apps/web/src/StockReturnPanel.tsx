import {useEffect,useRef,useState} from 'react'
import {apiJson} from './uiState'
import './stockReturns.css'

type Pending={key:string;imageIds:number[];reason:string;received:true}
export default function StockReturnPanel({id,disabled=false,onChanged}:{id:string;disabled?:boolean;onChanged:()=>void|Promise<void>}){
 const [data,setData]=useState<any>(null),[selected,setSelected]=useState<number[]>([]),[reason,setReason]=useState(''),[received,setReceived]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[pending,setPending]=useState<Pending|null>(null),[operation,setOperation]=useState<any>(null)
 const lock=useRef(false),alive=useRef(true),storage='mecacao-stock-return:'+id,base='/api/sales/drafts/'
 async function load(){const r=await apiJson(base+encodeURIComponent(id)+'/returns');if(!Array.isArray(r.items))throw Error('Chưa đọc được chứng từ nhận lại tại laptop; đồng bộ rồi đọc lại');if(alive.current)setData(r)}
 function forget(){localStorage.removeItem(storage);setPending(null);setSelected([]);setReason('');setReceived(false)}
 async function inspect(p:Pending){const r=await apiJson(base+'returns/operations/'+encodeURIComponent(p.key));if(!alive.current)return;setOperation(r);if(r.status==='RETURNED'){setMessage('Đã nhận lại '+r.quantity+' bộ tại laptop. Giữ nguyên đơn SOLD và tiền; đồng bộ Cloud để hiện trên điện thoại.');forget();window.dispatchEvent(new Event('mecacao-cloud-sync-now'));void Promise.resolve(onChanged()).catch(()=>{});await load()}else if(r.status==='ROLLED_BACK'){setMessage('Đã phục hồi lần nhận lại dở dang; chưa tăng tồn. Có thể chọn hàng và tạo phiếu mới.');forget();await load()}}
 async function action(fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await fn()}catch(e){if(alive.current)setError((e instanceof Error?e.message:'Chưa rõ kết quả')+' · Kiểm tra trạng thái trước khi thao tác tiếp.')}finally{lock.current=false;if(alive.current)setBusy(false)}}
 useEffect(()=>{alive.current=true;void action(async()=>{const saved=localStorage.getItem(storage);if(saved){const p=JSON.parse(saved) as Pending;setPending(p);await inspect(p)}await load()});return()=>{alive.current=false}},[id])
 async function submit(){
  if(disabled)return
  await action(async()=>{
   let p=pending
   if(!p){
    if(!selected.length||!reason.trim()||!received)return
    if(!window.confirm('Nhận lại '+selected.length+' bộ đã thực về shop? Tạo tồn mới từ ảnh gốc; giữ nguyên SOLD và tiền của đơn cũ.'))return
    p={key:'return-'+crypto.randomUUID(),imageIds:selected,reason:reason.trim(),received:true}
    // Persist BEFORE sending: a lost response must never create a second operation.
    localStorage.setItem(storage,JSON.stringify(p));setPending(p)
   }
   await apiJson(base+encodeURIComponent(id)+'/returns',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':p.key},body:JSON.stringify({imageIds:p.imageIds,reason:p.reason,received:true})})
   await inspect(p)
  })
 }
 async function recover(){if(!window.confirm('Kiểm tra chứng từ nhận lại? Chưa ghi sổ sẽ thu hồi bản sao dở; đã ghi sổ sẽ giữ tồn mới. Ảnh SOLD gốc được giữ nguyên.'))return;await action(async()=>{const r=await apiJson(base+'returns/recover',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"confirmed":true}'});if(pending)await inspect(pending);else setMessage(r.status==='RETURNED'?'Đã xác minh tồn nhận lại.':'Đã kiểm tra/phục hồi: '+r.status);await load();window.dispatchEvent(new Event('mecacao-cloud-sync-now'));void Promise.resolve(onChanged()).catch(()=>{})})}
 return <details className="stockReturnPanel"><summary>Nhận lại hàng · khôi phục tồn</summary><p>Chỉ chọn bộ đã thực nhận lại tại shop. Tạo ID ảnh và tên file mới từ ảnh gốc đã lưu; mỗi bộ SOLD được nhận lại một lần. Hoàn tiền / giảm nợ ghi riêng tại Tiền / Công nợ.</p>
  <fieldset disabled={busy||disabled||!!pending||data?.recoveryRequired}>
   <div className="stockReturnUnits">{data?.items.map((i:any)=><label key={i.imageId}><input type="checkbox" disabled={!!i.newImageId} checked={selected.includes(i.imageId)} onChange={e=>setSelected(s=>e.target.checked?[...s,i.imageId]:s.filter(n=>n!==i.imageId))}/><img loading="lazy" src={base+encodeURIComponent(id)+'/sold-image/'+i.imageId} alt=""/><span><b>{i.productName} · {i.size}</b><small>Ảnh SOLD #{i.imageId}{i.newImageId?' · Đã nhận lại → ảnh tồn #'+i.newImageId:''}</small></span></label>)}</div>
   <label>Lý do nhận lại<input maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Khách trả hàng / hủy sau khi đã SOLD…"/></label>
   <label className="stockReturnAgree"><input type="checkbox" checked={received} onChange={e=>setReceived(e.target.checked)}/>Tôi đã kiểm tra và thực nhận đúng các bộ được chọn tại shop.</label>
  </fieldset>
  <div className="salesButtons"><button className="salesAction salesActionMint" disabled={busy||disabled||(!pending&&(!selected.length||!reason.trim()||!received||!!data?.recoveryRequired))||(!!pending&&operation?.status!=='NOT_FOUND')} onClick={()=>void submit()}>{busy?'Đang kiểm tra…':pending?'Gửi lại cùng mã nhận lại':'Nhận lại '+selected.length+' bộ vào kho'}</button>{pending&&<button disabled={busy} onClick={()=>void action(()=>inspect(pending))}>Kiểm tra trạng thái nhận lại</button>}{pending&&operation?.status==='NOT_FOUND'&&!operation.recoveryRequired&&<button disabled={busy} onClick={()=>{forget();setOperation(null)}}>Bỏ phiếu chưa ghi sổ</button>}<button disabled={busy||disabled} onClick={()=>void recover()}>Kiểm tra / phục hồi nhận lại</button><button disabled={busy} onClick={()=>void action(load)}>Đọc lại danh sách</button></div>
  {pending&&<p role="status">Phiếu {pending.key} · {pending.imageIds.length} bộ · {operation?.status||'Chưa rõ kết quả; cần kiểm tra trạng thái'}</p>}{message&&<p role="status">{message}</p>}{error&&<p role="alert" className="notice warning">{error}</p>}
 </details>
}
