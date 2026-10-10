import {useState} from 'react'
import FolderPicker from './FolderPicker'
import {apiJson} from './uiState'
type Release={version:string;channel:string;stage:number;status:string;next:string}
export default function ReleaseStatus({version,release,warehouse,custom,onImport}:{version:string;release?:Release;warehouse?:string;custom?:boolean;onImport:()=>void}){
 const [picker,setPicker]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
 async function pick(warehouse:string){
  setPicker(false);setBusy(true);setError('')
  try{
   await apiJson('/api/local/warehouse',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({warehouse})})
   for(let n=0;n<60;n++){
    await new Promise(r=>setTimeout(r,500))
    try{const h=await apiJson('/api/health');if(h.customWarehouse&&h.warehouse===warehouse){location.reload();return}}catch{}
   }
   throw Error('Kho đã lưu. Đóng cửa sổ chạy ứng dụng rồi mở START_SHOP.bat để tiếp tục.')
  }catch(e){setError(e instanceof Error?e.message:String(e));setBusy(false)}
 }
 return <section className="releaseStatus" aria-label="Phiên bản và tiến độ phát triển"><div className="releaseHeading"><strong>v{version} · MAIN</strong><span>{release?.status??'Chặng 4 · Báo cáo và kiểm kê'}</span><b className="releaseState">ĐANG PHÁT TRIỂN</b></div><p>{release?.next??'Tiếp theo: Mobile LAN / đồng bộ — chưa triển khai'}</p>{warehouse&&<div className="releaseWarehouse"><span><b>Kho đang dùng:</b> {warehouse}</span>{!custom&&<button disabled={busy} onClick={()=>setPicker(true)}>CHỌN KHO TRÊN MÁY</button>}<button disabled={busy} onClick={onImport}>QUÉT / IMPORT KHO</button></div>}{!custom&&warehouse&&<small>Chọn kho riêng trước khi nhập dữ liệu; hoặc dùng kho mặc định. Bản cài mới bắt đầu với dữ liệu mới.</small>}{custom&&<small>Kho đã chọn dùng trực tiếp cho nhập hàng, tồn kho và bán hàng của bản cài này.</small>}{busy&&<p role="status">Đang mở kho đã chọn…</p>}{error&&<p role="alert">{error}</p>}{picker&&<FolderPicker title="Chọn kho của bản main này (Mẫu / Size / ảnh)" onPick={p=>void pick(p)} onClose={()=>setPicker(false)}/>}</section>
}
