import {useEffect,useRef,useState} from 'react'
import {cloudRows,CloudRpcError} from './cloudClient'
import {ConflictDialog,type DraftConflict} from './DraftConflictChoice'
export function useCloudDraftConflictChoice(urls:Record<string,string>={}){
 const [conflicts,setConflicts]=useState<DraftConflict[]|null>(null),answer=useRef<((yes:boolean)=>void)|null>(null)
 useEffect(()=>()=>answer.current?.(false),[])
 function choose(yes:boolean){const fn=answer.current;answer.current=null;setConflicts(null);fn?.(yes)}
 async function submit<T>(ids:number[],orderId:string,action:(acknowledged:boolean)=>Promise<T>){
  try{return await action(false)}catch(error){
   if(!(error instanceof CloudRpcError)||!error.raw.includes('CLOUD_DRAFT_CONFLICT'))throw error
   const [orders,items]=await Promise.all([cloudRows('sales_orders'),cloudRows('sales_order_images')]);const drafts=new Map(orders.filter(o=>o.id!==orderId&&o.status==='DRAFT').map(o=>[o.id,o]))
   const groups:DraftConflict[]=ids.flatMap(imageId=>{const matches=items.filter(i=>Number(i.image_id)===imageId&&drafts.has(i.order_id));if(!matches.length)return [];return [{imageId,productName:matches[0].product_name,size:matches[0].size,orders:matches.map(i=>{const o=drafts.get(i.order_id)!;return {id:o.id,code:o.id.slice(0,8).toUpperCase(),version:o.version,note:o.note||''}})}]})
   if(!groups.length)throw Error('Đơn nháp vừa thay đổi. Đọc lại kho và thử lại.')
   const yes=await new Promise<boolean>(resolve=>{answer.current=resolve;setConflicts(groups)});if(!yes)throw Error('Đã bỏ qua thêm ảnh trùng. Các đơn và tồn giữ nguyên.');return action(true)
  }
 }
 return {submit,dialog:conflicts?<ConflictDialog warning={{conflicts,conflictToken:''}} urls={urls} onChoose={choose}/>:null}
}
