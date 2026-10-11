import {useEffect,useRef,useState} from 'react'
import {apiJson} from './uiState'
export type ChosenImage={id:number;file_name:string;product:string;size:string}
export default function InventorySharing({images,hidden,onClear,onBusy,selectionBusy,onDraft,draftLabel}:{onDraft?:(ids:number[],key:string)=>Promise<void>;draftLabel?:string;images:ChosenImage[];hidden:number;onClear:()=>void;onBusy:(b:boolean)=>void;selectionBusy:boolean}){
 const [expanded,setExpanded]=useState(true),panel=useRef<HTMLElement>(null)
 const [native,setNative]=useState(false),[checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[files,setFiles]=useState<File[]>([])
 const key=images.map(i=>i.id).join(','),current=useRef(key),preparedAt=useRef(0),lock=useRef(false);current.current=key
 const draftKey=useRef({selection:'',key:''})
 useEffect(()=>{const node=panel.current,container=node?.closest<HTMLElement>('.inventoryPage');if(!node||!container)return;const measure=()=>container.style.setProperty('--selection-panel-height',Math.ceil(node.getBoundingClientRect().height)+'px');const observer=new ResizeObserver(measure);observer.observe(node);measure();return()=>{observer.disconnect();container.style.removeProperty('--selection-panel-height')}},[images.length>0,expanded])
 const groups=Array.from(images.reduce((m,i)=>{const k=i.product+'\0'+i.size;m.set(k,{product:i.product,size:i.size,count:(m.get(k)?.count??0)+1});return m},new Map<string,{product:string;size:string;count:number}>()).values())
 async function draft(){
  if(lock.current||selectionBusy||!onDraft)return
  lock.current=true;setBusy(true);onBusy(true);setMessage('Đang lưu đơn nháp…')
  if(draftKey.current.selection!==key)draftKey.current={selection:key,key:crypto.randomUUID()}
  try{await onDraft(images.map(i=>i.id),draftKey.current.key)}catch(e){setMessage(e instanceof Error?e.message:'Chưa xác minh được đơn; bấm lại để kiểm tra cùng yêu cầu.')}finally{lock.current=false;setBusy(false);onBusy(false)}
 }
 const webShare=typeof navigator.share==='function'&&typeof navigator.canShare==='function'
 useEffect(()=>{let alive=true;apiJson('/api/inventory/share/capabilities').then(j=>{if(alive)setNative(!!j.nativeFiles&&['localhost','127.0.0.1','[::1]'].includes(location.hostname))}).catch(()=>{}).finally(()=>{if(alive)setChecked(true)});return()=>{alive=false}},[])
 useEffect(()=>{setFiles([]);setMessage('');preparedAt.current=0},[key])
 useEffect(()=>()=>onBusy(false),[])
 async function act(){
  if(lock.current||selectionBusy)return
  lock.current=true
  const snapshot=key,ids=images.map(i=>i.id)
  // Share from a fresh user gesture, after the first tap prepared/verified files.
  if(!native&&files.length&&Date.now()-preparedAt.current<60000){
   setBusy(true);onBusy(true)
   try{await navigator.share({files});if(current.current===snapshot)setMessage('Đã mở chia sẻ. Kiểm tra ảnh và người nhận trong ứng dụng.')}
   catch(e){if(current.current===snapshot)setMessage(e instanceof DOMException&&e.name==='AbortError'?'Đã đóng chia sẻ; ảnh vẫn được chọn.':'Ứng dụng chưa nhận được nhóm ảnh. Thử lại hoặc dùng Windows LOCAL.')}
   finally{lock.current=false;setBusy(false);onBusy(false)}return
  }
  setBusy(true);onBusy(true);setMessage(native?'Đang copy nhóm ảnh…':'Đang kiểm tra và chuẩn bị ảnh…')
  try{
   if(native){const r=await apiJson('/api/inventory/share/copy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});if(r.copied!==ids.length)throw Error('Số ảnh copy không khớp. Hãy thử lại.');if(current.current===snapshot)setMessage('Đã copy '+r.copied+' ảnh — sang Zalo/Messenger và nhấn Ctrl+V. Kiểm tra đủ ảnh trước khi gửi.')}
   else{
    const data=await apiJson('/api/inventory/share/prepare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});const ready:File[]=[];let bytes=0
    for(const im of data.images){const r=await fetch(im.url,{cache:'no-store'});if(!r.ok)throw Error('Không đọc được ảnh #'+im.id+'. Làm mới tồn rồi thử lại.');const blob=await r.blob();bytes+=blob.size;if(bytes>32*1024*1024)throw Error('Nhóm ảnh quá lớn để chia sẻ trên điện thoại. Chọn ít ảnh hơn.');ready.push(new File([blob],'MeCaCao_'+im.id+'.jpg',{type:'image/jpeg'}))}
    if(ready.length!==ids.length||!navigator.canShare({files:ready}))throw Error('Thiết bị chưa hỗ trợ chia sẻ nhóm ảnh này. Dùng Windows LOCAL để copy.')
    if(current.current===snapshot){setFiles(ready);preparedAt.current=Date.now();setMessage('Đã chuẩn bị '+ready.length+' ảnh. Bấm CHIA SẺ để chọn ứng dụng và người nhận.')}
   }
  }catch(e){if(current.current===snapshot){setFiles([]);setMessage(e instanceof Error?e.message:'Không xử lý được nhóm ảnh.')}}
  finally{lock.current=false;setBusy(false);onBusy(false)}
 }
 if(!images.length)return null
 return <aside ref={panel} className={"imageSendBar floatingActions "+(expanded?"expanded":"collapsed")} aria-label="Ảnh chọn gửi khách"><button className="selectionToggle" type="button" aria-expanded={expanded} aria-label={expanded?"Thu gọn thanh thao tác":"Mở rộng thanh thao tác"} onClick={()=>setExpanded(v=>!v)}><span aria-hidden="true">{expanded?"⌄":"▧"}</span><strong>{images.length} ảnh · {images.length} bộ</strong></button><div className="imageSendSummary" hidden={!expanded}><b>Đã chọn {images.length} ảnh / {images.length} bộ</b><span>{hidden?hidden+' ảnh nằm ngoài kết quả đang lọc · ':''}{new Set(images.map(i=>i.product+'\0'+i.size)).size} nhóm Product / Size · không thay đổi tồn</span><div className="selectedGroupChips">{groups.map(g=><small key={g.product+'\0'+g.size}>{g.product} · {g.size} · {g.count} bộ</small>)}</div></div><div className="imageSendActions" hidden={!expanded}>{onDraft&&<button className="draftSelectedImages" type="button" disabled={busy||selectionBusy} onClick={()=>void draft()}>{draftLabel||'TẠO ĐƠN NHÁP'}</button>}<button type="button" className="copySelectedImages" disabled={busy||selectionBusy||!checked||(!native&&!webShare)} onClick={()=>void act()}>{busy?'ĐANG XỬ LÝ…':native?'COPY '+images.length+' ẢNH':files.length?'CHIA SẺ '+images.length+' ẢNH':'CHUẨN BỊ CHIA SẺ'}</button><button type="button" disabled={busy||selectionBusy} onClick={onClear}>BỎ CHỌN</button></div><p hidden={!expanded&&!message} role="status" aria-live="polite">{message||(!checked?'Đang kiểm tra clipboard…':!native&&!webShare?'Copy nhóm ảnh dùng Windows LOCAL; trình duyệt này chưa hỗ trợ chia sẻ file.':'Chọn thêm ảnh hoặc bỏ từng ảnh · chủ shop tự kiểm tra và gửi.')}</p></aside>
}

export function InventoryImageViewer({images,index,onIndex,onClose}:{images:ChosenImage[];index:number;onIndex:(i:number)=>void;onClose:()=>void}){
 const close=useRef<HTMLButtonElement>(null)
 useEffect(()=>{const prev=document.activeElement as HTMLElement;close.current?.focus();const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=old;prev?.focus()}},[])
 const img=images[index];if(!img)return null
 return <div className="stockViewerBackdrop" onClick={onClose}><section className="stockViewer" role="dialog" aria-modal="true" aria-label="Xem ảnh hàng tồn" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape')onClose();if(e.key==='ArrowRight')onIndex((index+1)%images.length);if(e.key==='ArrowLeft')onIndex((index+images.length-1)%images.length);if(e.key==='Tab'){const buttons=Array.from(e.currentTarget.querySelectorAll('button'));const first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}}}><header><div><b>{img.product} · {img.size}</b><small>{index+1} / {images.length} · {img.file_name}</small></div><button ref={close} onClick={onClose}>ĐÓNG ×</button></header><img src={'/api/inventory/share/image/'+img.id} alt={img.product+' '+img.size}/><footer><button onClick={()=>onIndex((index+images.length-1)%images.length)}>← TRƯỚC</button><button onClick={()=>onIndex((index+1)%images.length)}>SAU →</button></footer></section></div>
}
