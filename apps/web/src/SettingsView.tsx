import { useEffect,useState } from 'react'
export default function SettingsView(){
 const [threshold,setThreshold]=useState(2),[msg,setMsg]=useState('')
 useEffect(()=>{fetch('/api/settings').then(r=>r.json()).then(j=>setThreshold(j.lowStockThreshold??2))},[])
 async function save(){const r=await fetch('/api/settings/low-stock-threshold',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:threshold})});const j=await r.json();setMsg(r.ok?'Đã lưu ngưỡng tồn thấp.':j.error||'Không thể lưu')}
 async function backup(){const r=await fetch('/api/backup',{method:'POST'});const j=await r.json();setMsg(r.ok?'Đã backup: '+j.backup.file:j.error||'Backup thất bại')}
 return <section className="panel"><h3>Cài đặt & Backup</h3><div className="formGrid"><label>Ngưỡng tồn thấp<input type="number" min="0" step="1" value={threshold} onChange={e=>setThreshold(Math.max(0,Number(e.target.value)||0))}/></label></div><div className="inventoryActions"><button className="primary" onClick={save}>LƯU CÀI ĐẶT</button><button onClick={backup}>BACKUP DATABASE</button></div>{msg&&<p className="notice">{msg}</p>}</section>
}
