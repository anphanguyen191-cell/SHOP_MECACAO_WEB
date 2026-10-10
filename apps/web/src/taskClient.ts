import {apiJson} from './uiState'
export type OperationTask={id:string;key?:string;kind:string;status:string;progress?:any;result?:any;error?:string;createdAt:string;updatedAt:string}
export function clearConfirmedTask(t:OperationTask){if(!['SUCCEEDED','FAILED'].includes(t.status))return;for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key?.startsWith('mecacao-pending-task:'+location.origin+':')){try{if(JSON.parse(localStorage.getItem(key)||'{}').key===t.key)localStorage.removeItem(key)}catch{}}}}
const terminal=(t:OperationTask)=>['SUCCEEDED','FAILED','REVIEW_REQUIRED'].includes(t.status)
export async function followTask(id:string,onUpdate:(t:OperationTask)=>void){
 return new Promise<OperationTask>((resolve,reject)=>{
  const events=new EventSource('/api/tasks/'+id+'/events');let closed=false,polling=false
  const finish=(t:OperationTask)=>{onUpdate(t);if(terminal(t)){closed=true;events.close();clearInterval(timer);resolve(t)}}
  const poll=async()=>{if(closed||polling)return;polling=true;try{finish(await apiJson('/api/tasks/'+id))}catch{onUpdate({id,kind:'',status:'RECONNECTING',updatedAt:new Date().toISOString(),createdAt:''})}finally{polling=false}}
  const timer=setInterval(()=>void poll(),2000)
  events.onmessage=e=>{try{finish(JSON.parse(e.data))}catch{closed=true;events.close();clearInterval(timer);reject(Error('Không đọc được trạng thái; mở lịch sử tác vụ trước khi thử lại.'))}}
  events.onerror=()=>void poll();void poll()
 })
}
export async function runTask(url:string,payload:unknown,onUpdate:(t:OperationTask)=>void){
 const storage='mecacao-pending-task:'+location.origin+':'+url
 const serialized=JSON.stringify(payload);let pending:{key:string;payload:string}|undefined
 try{const old=localStorage.getItem(storage);if(old)pending=JSON.parse(old)}catch{}
 if(pending&&pending.payload!==serialized)throw Error('Có yêu cầu cũ chưa xác minh. Mở Tiến độ tác vụ, kiểm tra trước khi tạo lô khác.')
 if(!pending){pending={key:'task-'+crypto.randomUUID(),payload:serialized};localStorage.setItem(storage,JSON.stringify(pending))}
 const request=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Prefer:'respond-async','Idempotency-Key':pending.key},body:serialized})
 const response=await request.json()
 if(!request.ok){if([400,403].includes(request.status)||response.notAccepted===true)localStorage.removeItem(storage);throw Error(response.error||'Chưa xác minh được yêu cầu. Kiểm tra lịch sử tác vụ trước khi thử lại.')}
 const t=await followTask(response.task.id,onUpdate)
 if(t.status==='REVIEW_REQUIRED')throw Error(t.error||'Tác vụ cần đối soát')
 localStorage.removeItem(storage)
 if(t.status!=='SUCCEEDED')throw Error(t.error||'Tác vụ thất bại')
 return t.result
}
