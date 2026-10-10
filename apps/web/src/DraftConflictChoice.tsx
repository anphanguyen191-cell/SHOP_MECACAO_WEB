import {useEffect,useRef,useState} from 'react'
import {ApiError} from './uiState'
import './salesDrafts.css'
export type DraftConflict={imageId:number;productName:string;size:string;orders:{id:string;code:string;note:string;version:number}[]}
type Warning={conflicts:DraftConflict[];conflictToken:string}
export function useDraftConflictChoice(){
 const [warning,setWarning]=useState<Warning|null>(null),answer=useRef<((yes:boolean)=>void)|null>(null)
 useEffect(()=>()=>{answer.current?.(false);answer.current=null},[])
 function choose(yes:boolean){const callback=answer.current;answer.current=null;setWarning(null);callback?.(yes)}
 async function submit<T>(action:(token?:string)=>Promise<T>):Promise<T>{
  let token:string|undefined
  while(true){
   try{return await action(token)}catch(e){
    if(!(e instanceof ApiError)||e.data?.code!=='DRAFT_IMAGE_CONFLICT')throw e
    const proceed=await new Promise<boolean>(resolve=>{answer.current=resolve;setWarning(e.data)})
    if(!proceed)throw new Error('Đã bỏ qua việc thêm vào nháp. Ảnh và đơn giữ nguyên; có thể chọn lại hàng khác.')
    token=e.data.conflictToken
   }
  }
 }
 return {submit,dialog:warning?<ConflictDialog warning={warning} onChoose={choose}/>:null}
}
function ConflictDialog({warning,onChoose}:{warning:Warning;onChoose:(yes:boolean)=>void}){
 const cancel=useRef<HTMLButtonElement>(null)
 useEffect(()=>{const prev=document.activeElement as HTMLElement,old=document.body.style.overflow;document.body.style.overflow='hidden';cancel.current?.focus();return()=>{document.body.style.overflow=old;requestAnimationFrame(()=>{if(prev?.isConnected&&prev!==document.body&&!prev.hasAttribute('disabled'))prev.focus();else document.querySelector<HTMLButtonElement>('.imageSendActions button:not(:disabled),.salesButtons button:not(:disabled),.salesHeading button:not(:disabled)')?.focus()})}},[])
 return <div className="draftConflictBackdrop"><section className="draftConflictDialog" role="alertdialog" aria-modal="true" aria-labelledby="draft-conflict-title" aria-describedby="draft-conflict-description" onKeyDown={e=>{if(e.key==='Escape')onChoose(false);if(e.key==='Tab'){const buttons=Array.from(e.currentTarget.querySelectorAll('button'));const first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}}}><span className="draftConflictIcon" aria-hidden="true">!</span><h3 id="draft-conflict-title">{warning.conflicts.length} bộ đã có trong đơn nháp khác</h3><p id="draft-conflict-description">Đây là cùng ảnh/bộ hàng đang được tham chiếu. Nháp chưa giữ hàng; chỉ thêm tiếp khi bạn đồng ý.</p><div className="draftConflictList">{warning.conflicts.map(i=><article key={i.imageId}><img src={'/api/images/'+i.imageId} alt=""/><div><b>{i.productName} · {i.size}</b><small>Ảnh #{i.imageId}</small>{i.orders.map(o=><span key={o.id}>NHÁP · {o.code}{o.note?' · '+o.note:''}</span>)}</div></article>)}</div><div className="draftConflictActions"><button ref={cancel} className="salesAction salesActionSecondary" onClick={()=>onChoose(false)}>Quay lại chọn hàng</button><button className="salesAction salesActionWarning" onClick={()=>onChoose(true)}>Vẫn thêm vào đơn nháp</button></div></section></div>
}
