import {useEffect,useState} from 'react'
import {apiJson} from './uiState'
import type {OperationTask} from './taskClient'
import {clearConfirmedTask} from './taskClient'
import './taskProgress.css'
const names:Record<string,string>={SCAN:'Quét kho',RECEIPT:'Nhập hàng',REGISTER_BATCH:'Duyệt kho hàng loạt',BACKUP:'Backup đầy đủ'}
const statusNames:Record<string,string>={QUEUED:'Chờ xử lý',RUNNING:'Đang xử lý',SUCCEEDED:'Đã kết thúc',FAILED:'Có lỗi',REVIEW_REQUIRED:'Cần đối soát'}
const phases:Record<string,string>={SCAN:'Đang đọc kho',COPY:'Copy ảnh',VERIFY:'Kiểm tra ảnh',DB_COMMIT:'Ghi DB',INTEGRITY:'Kiểm tra toàn vẹn',BACKUP_VALIDATE:'Kiểm tra backup',BACKUP_COPY:'Copy backup',BACKUP_VERIFY:'Kiểm chứng backup',REGISTER:'Đăng ký Product',VALIDATE:'Kiểm tra dữ liệu',PREPARE:'Chuẩn bị',DONE:'Hoàn tất',ROLLBACK:'Hoàn tác'}
function TaskResult({task}:{task:OperationTask}){
 const r=task.result;if(!r)return null
 const stats=task.kind==='SCAN'?[['Mẫu',r.summary?.products],['Size',r.summary?.sizes],['Ảnh phát hiện',r.summary?.images],['Ảnh chờ duyệt',r.summary?.pendingImages]]:task.kind==='RECEIPT'?[['Bộ đã nhập',r.totalQuantity],['Ảnh đã copy',r.copiedImages?.length]]:task.kind==='BACKUP'?[['Ảnh đăng ký',r.imageCount],['File lưu giữ',r.archiveFileCount??0]]:[]
 return <section className="taskResult"><h4>Kết quả đã lưu</h4><div className="taskResultStats">{stats.map(([name,value])=><div key={name}><b>{value??'—'}</b><span>{name}</span></div>)}</div>{r.directory&&<p>Backup đã kiểm chứng: <code>{r.directory}</code></p>}{r.rootPath&&<p>Kho: <code>{r.rootPath}</code></p>}{r.outcomes?.slice(0,100).map((o:any,i:number)=><div className="taskHistoryRow" key={i}><b>{o.name}</b><span>{o.status==='SAVED'?'Đã lưu':o.status==='ERROR'?'Lỗi':'Chưa xử lý'} · +{o.images} ảnh · +{o.sizes} Size</span><small>{o.message}</small></div>)}{r.outcomes?.length>100&&<p>Hiển thị 100/{r.outcomes.length} mục; toàn bộ kết quả vẫn được lưu theo mã tác vụ.</p>}</section>
}
export function TaskMeter({task}:{task:OperationTask|null}){
 if(!task)return null;const p=task.progress||{},percent=p.percent??(p.total?Math.floor(100*(p.completed??0)/p.total):undefined)
 return <div className="taskMeter" role="status"><header><b>{names[task.kind]||'Tác vụ'}</b><span>{task.status==='SUCCEEDED'?(task.result?.outcomes?.some((r:any)=>r.status!=='SAVED')?'Đã kết thúc — có mục lỗi/chưa xử lý':'Hoàn tất'):task.status==='RECONNECTING'?'Đang kết nối lại — không gửi lô mới':task.status==='FAILED'?'Có lỗi':task.status==='REVIEW_REQUIRED'?'Cần đối soát':phases[p.phase]||'Đang xử lý'}</span></header><progress max="100" value={task.status==='SUCCEEDED'?100:percent}/><small>{p.total?`${p.completed??p.copied??0}/${p.total} ${task.kind==='REGISTER_BATCH'?'mẫu':'mục'}`:'Đang xác minh tổng công việc'}{p.sizes!==undefined?` · ${p.sizes} Size · ${p.images} ảnh`:''}</small>{p.current&&<code>{p.current}</code>}<small>Mã tác vụ: {task.id}</small>{task.error&&<p className="notice warning">{task.error}</p>}</div>
}
export default function TaskProgress({compact=false}:{compact?:boolean}){
 const [tasks,setTasks]=useState<OperationTask[]>([]),[selected,setSelected]=useState<OperationTask|null>(null),[error,setError]=useState('')
 async function load(){try{setTasks(await apiJson('/api/tasks'));setError('')}catch(e){setError(e instanceof Error?e.message:'Không đọc được tác vụ')}}
 useEffect(()=>{void load();const timer=setInterval(()=>{void load();if(selected&&['RUNNING','QUEUED'].includes(selected.status))void inspect(selected.id)},2000);return()=>clearInterval(timer)},[selected?.id,selected?.status])
 async function inspect(id:string){try{setSelected(await apiJson('/api/tasks/'+id))}catch(e){setError(String(e))}}
 async function acknowledge(){if(!selected||!confirm('Chỉ xác nhận sau khi đã kiểm tra tồn, lịch sử nhập và nhật ký phục hồi. Tác vụ cũ sẽ KHÔNG chạy lại.'))return;try{setSelected(await apiJson('/api/tasks/'+selected.id+'/acknowledge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmed:true})}));await load()}catch(e){setError(String(e))}}
 const running=tasks.filter(t=>['RUNNING','QUEUED','RECONNECTING'].includes(t.status)).length
 const body=<><p>Đổi tab/reload không hủy tác vụ. Khi chưa rõ kết quả, xem mã cũ thay vì gửi lô mới. Hiển thị 30 tác vụ gần nhất.</p>{error&&<p role="alert">{error}</p>}{tasks.map(t=><button className="taskHistoryRow" key={t.id} onClick={()=>void inspect(t.id)}><span>{names[t.kind]} · {new Date(t.createdAt).toLocaleString('vi-VN')}</span><b>{statusNames[t.status]||t.status}</b><small>{t.id}</small></button>)}{!tasks.length&&<p>Chưa có tác vụ nền.</p>}<TaskMeter task={selected}/>{selected?.result&&<TaskResult task={selected}/>}{selected&&['SUCCEEDED','FAILED'].includes(selected.status)&&<button onClick={()=>{clearConfirmedTask(selected);setError('Đã xác nhận kết quả cũ; có thể chuẩn bị tác vụ mới.')}}>Đã xem kết quả — gỡ yêu cầu chờ trên trình duyệt</button>}{selected?.status==='REVIEW_REQUIRED'&&<button onClick={()=>void acknowledge()}>Đã kiểm tra kho & nhật ký — đóng cảnh báo</button>}</>
 return <details className={'taskHistory'+(compact?' taskHistoryCompact':'')}>
  {compact?<summary title="Tiến độ & lịch sử tác vụ" aria-label={'Tiến độ và lịch sử tác vụ'+(running?' · '+running+' đang chạy':'')} aria-controls="task-history-popover"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>{running>0&&<span className="taskHistoryBadge" aria-hidden="true">{running>9?'9+':running}</span>}</summary>:<summary>Tiến độ & lịch sử tác vụ {running?'· ĐANG CHẠY':''}</summary>}
  {compact?<div className="taskHistoryPopover" id="task-history-popover" aria-label="Tiến độ & lịch sử tác vụ"><h3>Tiến độ & lịch sử tác vụ</h3>{body}</div>:body}
 </details>
}
