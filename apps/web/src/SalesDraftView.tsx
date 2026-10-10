import SalesPreflight from './SalesPreflight'
import {useEffect,useRef,useState} from 'react'
import {apiJson,useBooleanPreference} from './uiState'
import './salesDrafts.css'
import SalesPreview from './SalesPreview'
import {useDraftConflictChoice,type DraftConflict} from './DraftConflictChoice'

type Item={image_id:number;variant_id:number;product_name:string;product_code:string;size:string;sku:string;unit_price:number;unit_cost:number|null;unavailable:string|null}
type Draft={id:string;status:string;version:number;note:string;discount:number;quantity:number;subtotal:number;total:number;items:Item[];conflicts:DraftConflict[]}
type Row=Omit<Draft,'items'>
const vnd=(n:number|bigint)=>n.toLocaleString('vi-VN')+' đ'
export default function SalesDraftView({openId,onOpen,onSelectImages}:{openId:string|null;onOpen:(id:string|null)=>void;onSelectImages:(id:string|null)=>void}){
 const conflictChoice=useDraftConflictChoice()
 const [rows,setRows]=useState<Row[]>([]),[status,setStatus]=useState('DRAFT'),[reload,setReload]=useState(0),[draft,setDraft]=useState<Draft|null>(null)
 const [prices,setPrices]=useState<Record<number,string>>({}),[discount,setDiscount]=useState('0'),[note,setNote]=useState(''),[removed,setRemoved]=useState<Set<number>>(new Set())
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[listError,setListError]=useState(''),[listLoading,setListLoading]=useState(false),[message,setMessage]=useState(''),[dirty,setDirty]=useState(false)
 const [expanded,setExpanded]=useBooleanPreference('sales-drafts-expanded',true),lock=useRef(false)
 useEffect(()=>{const c=new AbortController();setListError('');setListLoading(true);apiJson('/api/sales/drafts?status='+status,{signal:c.signal}).then(setRows).catch(e=>{if(!c.signal.aborted)setListError(e.message)}).finally(()=>{if(!c.signal.aborted)setListLoading(false)});return()=>c.abort()},[status,reload])
 useEffect(()=>{
  setDraft(null);setError('');setMessage('');setDirty(false);if(!openId)return
  const c=new AbortController();setLoading(true)
  apiJson('/api/sales/drafts/'+openId,{signal:c.signal}).then((d:Draft)=>{setDraft(d);setPrices(Object.fromEntries(d.items.map(i=>[i.image_id,String(i.unit_price)])));setDiscount(String(d.discount));setNote(d.note);setRemoved(new Set())}).catch(e=>{if(!c.signal.aborted)setError(e.message)}).finally(()=>{if(!c.signal.aborted)setLoading(false)})
  return()=>c.abort()
 },[openId,reload])
 const visible=draft?.items.filter(i=>!removed.has(i.image_id))??[]
 const validInt=(s:string)=>/^\d+$/.test(s)&&Number.isSafeInteger(Number(s))
 const subtotal=visible.reduce((n,i)=>n+Number(prices[i.image_id]),0),total=subtotal-Number(discount)
 const valid=!!visible.length&&visible.every(i=>validInt(prices[i.image_id]))&&validInt(discount)&&Number.isSafeInteger(subtotal)&&total>=0&&visible.every(i=>!i.unavailable)
 function leave(action:()=>void){if(!dirty||window.confirm('Đơn có thay đổi chưa lưu. Bỏ thay đổi và tiếp tục?'))action()}
 async function save(){
  if(lock.current||!draft||!valid)return;lock.current=true;setBusy(true);setError('');setMessage('')
  try{await conflictChoice.submit(token=>apiJson('/api/sales/drafts/'+draft.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:draft.version,items:visible.map(i=>({imageId:i.image_id,unitPrice:Number(prices[i.image_id])})),discount:Number(discount),note,conflictToken:token})}));setDirty(false);setReload(n=>n+1)}catch(e){setError(e instanceof Error?e.message:'Không lưu được đơn')}finally{lock.current=false;setBusy(false)}
 }
 async function cancel(){
  if(lock.current||!draft||!window.confirm('Hủy đơn nháp này? Hàng và ảnh tồn vẫn giữ nguyên.'))return
  lock.current=true;setBusy(true);setError('')
  try{await apiJson('/api/sales/drafts/'+draft.id+'/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:draft.version})});setDirty(false);setReload(n=>n+1)}catch(e){setError(e instanceof Error?e.message:'Không hủy được nháp')}finally{lock.current=false;setBusy(false)}
 }
 return <section className="salesDraftPage">{conflictChoice.dialog}
  <header className="salesHeading"><div><p className="eyebrow">V2 · THỬ NGHIỆM SANDBOX</p><h2>Bán hàng · Đơn nháp</h2><p>Chuẩn bị hàng và giá trước khi bán. Nháp chưa giữ hàng, chưa trừ tồn.</p></div><button className="salesAction salesActionPrimary" disabled={busy||loading} onClick={()=>leave(()=>onSelectImages(null))}>＋ Chọn hàng tạo nháp</button></header>
  <div className="notice">Đợt này hỗ trợ đơn nháp. Xác nhận bán và lưu ảnh sau bán đang được phát triển.</div>
  <section className="panel salesOverview"><button className="salesFold" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>Tổng quan danh sách {expanded?'⌃':'⌄'}</button>{expanded&&<div className="salesKpis"><button onClick={()=>setStatus('DRAFT')}><b>{rows.length}</b><span>Đơn trong danh sách · tối đa 200</span></button><div><b>{rows.reduce((n,r)=>n+r.quantity,0)}</b><span>Bộ được tham chiếu · chưa giữ hàng</span></div><div><b>{vnd(rows.reduce((n,r)=>n+BigInt(r.total),0n))}</b><span>Giá trị danh sách · chưa phải doanh thu</span></div></div>}</section>
  <div className="salesWorkspace"><aside className="panel salesList"><div className="salesListHead"><h3>Danh sách đơn</h3><select aria-label="Lọc đơn" value={status} onChange={e=>setStatus(e.target.value)}><option value="DRAFT">Đang nháp</option><option value="CANCELLED_DRAFT">Đã hủy nháp</option><option value="all">Tất cả</option></select></div>{listError&&<p role="alert">{listError} <button onClick={()=>setReload(n=>n+1)}>Thử lại</button></p>}{listLoading&&<p role="status">Đang tải danh sách…</p>}{!listLoading&&!listError&&!rows.length&&<p>Chưa có đơn trong bộ lọc này.</p>}{rows.map(r=><button key={r.id} className={'salesOrderRow'+(r.id===openId?' active':'')} disabled={busy||loading} onClick={()=>leave(()=>onOpen(r.id))}><span><b>NHÁP · {r.id.slice(0,8).toUpperCase()}</b><small>{r.status==='DRAFT'?'Đang nháp':'Đã hủy nháp'} · {r.quantity} bộ</small></span><strong>{vnd(r.total)}</strong></button>)}</aside>
  <section className="panel salesEditor">{loading&&<p role="status">Đang kiểm tra đơn và ảnh tồn…</p>}{error&&<p className="notice warning" role="alert">{error} <button disabled={busy} onClick={()=>leave(()=>setReload(n=>n+1))}>Mở lại đơn</button></p>}{!draft&&!loading&&!error&&<div className="salesEmpty"><h3>Chọn hàng từ ảnh tồn</h3><p>Vào Tồn kho, chọn nhóm Size hoặc từng ảnh rồi bấm TẠO ĐƠN NHÁP.</p><button className="salesAction salesActionPrimary" onClick={()=>onSelectImages(null)}>Mở Tồn kho →</button></div>}{draft&&<><header className="salesEditorHead"><div><h3>NHÁP · {draft.id.slice(0,8).toUpperCase()}</h3><small>Phiên bản {draft.version} · {draft.status==='DRAFT'?'Chưa giữ hàng':'Đã hủy nháp'}</small></div>{draft.status==='DRAFT'&&<button className="salesAction salesActionMint" disabled={busy||loading||dirty} onClick={()=>onSelectImages(draft.id)}>＋ Thêm ảnh tồn</button>}</header>
  <div className="salesDuplicateSummary" role="status">{draft.status==='DRAFT'&&!!draft.conflicts?.length&&<><b>⚠ {draft.conflicts.length} bộ cũng nằm trong nháp khác</b><span>Kiểm tra các đơn liên quan trước khi chốt bán.</span></>}</div>
  <fieldset disabled={busy||loading||draft.status!=='DRAFT'}><div className="salesItems">{visible.map(i=><article key={i.image_id} className={'salesItem'+(i.unavailable?' unavailable':'')}><img loading="lazy" src={'/api/images/'+i.image_id} alt={i.product_name+' '+i.size}/><div><b>{i.product_name}</b><small>{i.size} · {i.sku} · 1 bộ</small><small>{i.unit_cost===null?'Giá vốn chưa xác định':'Giá vốn: '+vnd(i.unit_cost)}</small>{draft.status==='DRAFT'&&draft.conflicts?.find(c=>c.imageId===i.image_id)&&<small className="draftOverlapBadge">Cũng có trong {draft.conflicts.find(c=>c.imageId===i.image_id)!.orders.map(o=>'NHÁP '+o.code).join(', ')}</small>}{i.unavailable&&<p role="alert">{i.unavailable}</p>}<button className="salesAction salesActionRemove" onClick={()=>{setRemoved(new Set([...removed,i.image_id]));setDirty(true)}}>Bỏ khỏi nháp</button></div><label>Giá bán (đ)<input aria-label={'Giá bán ảnh '+i.image_id} inputMode="numeric" value={prices[i.image_id]??''} onChange={e=>{setPrices({...prices,[i.image_id]:e.target.value});setDirty(true)}}/></label></article>)}</div>
  <div className="salesMoney"><label>Giảm giá toàn đơn (đ)<input inputMode="numeric" value={discount} onChange={e=>{setDiscount(e.target.value);setDirty(true)}}/></label><label>Ghi chú<input maxLength={500} value={note} onChange={e=>{setNote(e.target.value);setDirty(true)}}/></label></div></fieldset>
  <footer className="salesTotals"><span>{visible.length} bộ · {new Set(visible.map(i=>i.variant_id)).size} Size/SKU</span><strong>{Number.isSafeInteger(total)&&total>=0?vnd(total):'Kiểm tra lại tiền'}</strong></footer>{draft.status==='DRAFT'&&<><p className="salesHint">{!valid?'Kiểm tra ảnh, giá và giảm giá trước khi lưu.':visible.some(i=>Number(prices[i.image_id])===0)?'Có bộ giá 0 đ; cần kiểm tra giá trước khi bán.':dirty?'Có thay đổi chưa lưu. Lưu trước khi thêm ảnh.':'Giá đã lưu trong nháp; mở lại không lấy đè bằng giá sản phẩm mới.'}</p><div className="salesButtons"><button className="salesAction salesActionPrimary" disabled={busy||loading||!valid||!dirty} onClick={()=>void save()}>{busy?'Đang xử lý…':'Lưu thay đổi'}</button><button className="salesAction salesActionSecondary" disabled={busy||loading} onClick={()=>void cancel()}>Hủy nháp</button></div></>}{draft.status==='DRAFT'&&<SalesPreflight key={'check:'+draft.id+':'+draft.version+':'+dirty} id={draft.id} version={draft.version} disabled={busy||loading||dirty}/>} {draft.status==='DRAFT'&&<SalesPreview key={draft.id+':'+draft.version+':'+dirty} id={draft.id} version={draft.version} disabled={busy||loading||dirty||!valid}/>}{message&&<p role="status">{message}</p>}</>}</section></div>
 </section>
}
