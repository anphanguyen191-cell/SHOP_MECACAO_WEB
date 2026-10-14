import {useEffect,useState} from 'react'
import {apiJson} from './uiState'
type Config={rootPath:string;startup:boolean;periodic:boolean;intervalSeconds:number;popup:boolean;autoRename:boolean}
const defaults:Config={rootPath:'',startup:false,periodic:false,intervalSeconds:300,popup:false,autoRename:false}
export default function WarehouseWatchSettings(){
 const [config,setConfig]=useState<Config>(defaults),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[ready,setReady]=useState(false)
 useEffect(()=>{let alive=true
  Promise.all([apiJson('/api/warehouse/settings'),apiJson('/api/health')]).then(([c,h])=>{if(alive){setConfig({...defaults,...c});setReady(!!h.customWarehouse)}}).catch(e=>{if(alive)setMessage(e.message)})
  return()=>{alive=false}
 },[])
 async function save(){if(busy||!ready)return;setBusy(true);setMessage('')
  try{const c=await apiJson('/api/warehouse/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(config)})
   setConfig(c);setMessage('Đã lưu cấu hình quét kho.')}
  catch(e){setMessage(e instanceof Error?e.message:'Không lưu được cấu hình.')}
  finally{setBusy(false)}
 }
 return <section className="panel warehouseWatchSettings"><h3>Cấu hình quét kho</h3><p className="muted">Thư mục kho được chọn trực tiếp tại Import kho. Các lựa chọn dưới đây chỉ quyết định khi nào quét, không tự ghi nhập hàng.</p>
 <div className="watchOptions">{(['startup','periodic','popup','autoRename'] as const).map((key,i)=><label key={key}><input type="checkbox" checked={config[key]} disabled={busy||!ready} onChange={e=>setConfig(c=>({...c,[key]:e.target.checked}))}/>{['Quét kho khi khởi động','Quét tự động theo chu kỳ','Hiển thị thông báo thay đổi kho','Chuẩn hóa tên ảnh COPY khi nhập'][i]}</label>)}
 <label>Chu kỳ (giây)<input type="number" min="60" max="86400" disabled={busy||!ready} value={config.intervalSeconds} onChange={e=>setConfig(c=>({...c,intervalSeconds:Number(e.target.value)}))}/></label>
 </div><button type="button" className="primary" onClick={()=>void save()} disabled={busy||!ready}>{busy?'ĐANG LƯU':'LƯU CẤU HÌNH QUÉT'}</button>{!ready&&<p className="muted">Chọn kho tại Import kho trước khi thiết lập.</p>}{message&&<p role="status" className="notice">{message}</p>}</section>
}
