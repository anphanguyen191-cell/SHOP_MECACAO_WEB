import {runTask,type OperationTask} from './taskClient'
import {TaskMeter} from './TaskProgress'
import RestoreTestPanel from './RestoreTestPanel'
import { useEffect,useState } from 'react'
export default function SettingsView({sandbox=false}:{sandbox?:boolean}){
 const [task,setTask]=useState<OperationTask|null>(null)
 const [directory,setDirectory]=useState(''),[restoring,setRestoring]=useState(false)
 const [threshold,setThreshold]=useState(2),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{let alive=true;fetch('/api/settings').then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error||'Không đọc được cài đặt');if(alive)setThreshold(j.lowStockThreshold??2)}).catch(e=>{if(alive)setMsg(e.message)});return()=>{alive=false}},[])
 async function save(){if(busy||restoring)return;setBusy(true);try{const r=await fetch('/api/settings/low-stock-threshold',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:threshold})});const j=await r.json();if(!r.ok)throw Error(j.error||'Không thể lưu');setMsg('Đã lưu ngưỡng tồn thấp.')}catch(e){setMsg(e instanceof Error?e.message:'Không thể kết nối máy chủ')}finally{setBusy(false)}}
 async function backupDb(){if(busy||restoring)return;setBusy(true);try{const r=await fetch('/api/backup',{method:'POST'});const j=await r.json();setMsg(r.ok?'Đã sao lưu SQLite (KHÔNG gồm ảnh): '+j.backup.path:j.error||'Backup thất bại')}catch{setMsg('Backup thất bại')}finally{setBusy(false)}}
 async function backupFull(){
  if(busy||restoring)return;setDirectory('');setBusy(true);setMsg('Đang sao lưu dữ liệu và ảnh gốc, không tắt ứng dụng...')
  try{
   const j={backup:await runTask('/api/backup/lossless',{},setTask)}
   setDirectory(j.backup.directory)
   setMsg('ĐÃ KIỂM TRA THÀNH CÔNG '+j.backup.imageCount+' ảnh gốc, '+(j.backup.archiveFileCount??0)+' file ảnh nhẹ và database. Thư mục: '+j.backup.directory+'. Hãy sao chép cả thư mục backup sang ổ khác để phòng hỏng ổ D:.')
  }catch(e){setMsg(e instanceof Error?e.message:'Sao lưu đầy đủ thất bại')}
  finally{setBusy(false)}
 }
 async function backupImages(){if(busy||restoring)return;setBusy(true);try{const r=await fetch('/api/backup/images-optimized',{method:'POST'});const j=await r.json();if(!r.ok)throw new Error(j.error||'Sao lưu ảnh thất bại');const saved=Math.max(0,j.backup.totalOriginalBytes-j.backup.totalBackupBytes);setMsg('Đã sao lưu '+j.backup.optimizedImageCount+' ảnh tối ưu · tiết kiệm khoảng '+Math.round(saved/1024/1024)+' MB'+(j.backup.missingImageCount?' · thiếu '+j.backup.missingImageCount+' ảnh':''))}catch(e){setMsg(e instanceof Error?e.message:'Sao lưu ảnh thất bại')}finally{setBusy(false)}}
 return <section className="panel settingsPage"><h3>Cài đặt & Backup</h3><div className="formGrid"><label>Ngưỡng tồn thấp<input type="number" min="0" step="1" value={threshold} onChange={e=>setThreshold(Math.max(0,Number(e.target.value)||0))}/></label></div><div className="inventoryActions"><button className="primary" disabled={busy||restoring} onClick={save}>LƯU CÀI ĐẶT</button><button className="primary" disabled={busy||restoring} onClick={backupFull}>{busy?'ĐANG SAO LƯU...':'BACKUP ĐẦY ĐỦ DB + ẢNH GỐC (KIỂM TRA SHA)'}</button><button disabled={busy||restoring} onClick={backupDb}>{busy?'ĐANG XỬ LÝ...':'BACKUP SQLITE (KHÔNG GỒM ẢNH)'}</button><button disabled={busy||restoring} onClick={backupImages}>SAO LƯU ẢNH NÉN (KHÔNG PHẢI BẢN GỐC)</button></div><TaskMeter task={task}/>{msg&&<p className="notice" role="status">{msg}</p>}{sandbox&&<RestoreTestPanel directory={directory} busyParent={busy} onBusy={setRestoring}/>}</section>
}
