import { useEffect,useState } from 'react'
export default function SettingsView(){
 const [threshold,setThreshold]=useState(2),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{let alive=true;fetch('/api/settings').then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error||'Không đọc được cài đặt');if(alive)setThreshold(j.lowStockThreshold??2)}).catch(e=>{if(alive)setMsg(e.message)});return()=>{alive=false}},[])
 async function save(){if(busy)return;setBusy(true);try{const r=await fetch('/api/settings/low-stock-threshold',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:threshold})});const j=await r.json();if(!r.ok)throw Error(j.error||'Không thể lưu');setMsg('Đã lưu ngưỡng tồn thấp.')}catch(e){setMsg(e instanceof Error?e.message:'Không thể kết nối máy chủ')}finally{setBusy(false)}}
 async function backupDb(){if(busy)return;setBusy(true);try{const r=await fetch('/api/backup',{method:'POST'});const j=await r.json();setMsg(r.ok?'Đã sao lưu SQLite (KHÔNG gồm ảnh): '+j.backup.path:j.error||'Backup thất bại')}catch{setMsg('Backup thất bại')}finally{setBusy(false)}}
 async function backupFull(){
  if(busy)return;setBusy(true);setMsg('Đang sao lưu dữ liệu và ảnh gốc, không tắt ứng dụng...')
  try{
   const r=await fetch('/api/backup/lossless',{method:'POST'}),j=await r.json()
   if(!r.ok)throw new Error(j.error||'Không thể sao lưu đầy đủ')
   setMsg('ĐÃ KIỂM TRA THÀNH CÔNG '+j.backup.imageCount+' ảnh gốc và database. Thư mục: '+j.backup.directory+'. Hãy sao chép cả thư mục backup sang ổ khác để phòng hỏng ổ D:.')
  }catch(e){setMsg(e instanceof Error?e.message:'Sao lưu đầy đủ thất bại')}
  finally{setBusy(false)}
 }
 async function backupImages(){if(busy)return;setBusy(true);try{const r=await fetch('/api/backup/images-optimized',{method:'POST'});const j=await r.json();if(!r.ok)throw new Error(j.error||'Sao lưu ảnh thất bại');const saved=Math.max(0,j.backup.totalOriginalBytes-j.backup.totalBackupBytes);setMsg('Đã sao lưu '+j.backup.optimizedImageCount+' ảnh tối ưu · tiết kiệm khoảng '+Math.round(saved/1024/1024)+' MB'+(j.backup.missingImageCount?' · thiếu '+j.backup.missingImageCount+' ảnh':''))}catch(e){setMsg(e instanceof Error?e.message:'Sao lưu ảnh thất bại')}finally{setBusy(false)}}
 return <section className="panel"><h3>Cài đặt & Backup</h3><div className="formGrid"><label>Ngưỡng tồn thấp<input type="number" min="0" step="1" value={threshold} onChange={e=>setThreshold(Math.max(0,Number(e.target.value)||0))}/></label></div><div className="inventoryActions"><button className="primary" onClick={save}>LƯU CÀI ĐẶT</button><button className="primary" disabled={busy} onClick={backupFull}>{busy?'ĐANG SAO LƯU...':'BACKUP ĐẦY ĐỦ DB + ẢNH GỐC (KIỂM TRA SHA)'}</button><button disabled={busy} onClick={backupDb}>{busy?'ĐANG XỬ LÝ...':'BACKUP SQLITE (KHÔNG GỒM ẢNH)'}</button><button disabled={busy} onClick={backupImages}>SAO LƯU ẢNH NÉN (KHÔNG PHẢI BẢN GỐC)</button></div>{msg&&<p className="notice">{msg}</p>}</section>
}
