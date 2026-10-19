import {useEffect,useState} from 'react'
export type SyncPhase='idle'|'reading'|'catalog'|'business'|'images'|'verify'|'cleanup'|'done'|'paused'|'error'
export type SyncMeter={phase:SyncPhase;total:number;processed:number;uploaded:number;reused:number;missing:number;started:number;current:string}
export const emptySyncMeter:SyncMeter={phase:'idle',total:0,processed:0,uploaded:0,reused:0,missing:0,started:0,current:''}
const labels:Record<SyncPhase,string>={idle:'Chưa đồng bộ',reading:'Đang đọc tồn laptop và Cloud',catalog:'Đang đối chiếu sản phẩm / Size',business:'Đang đồng bộ khách hàng, đơn bán và sổ tiền',images:'Đang xử lý ảnh',verify:'Đang xác minh tồn và file Cloud',cleanup:'Đang dọn file dư đã đối soát',done:'Đồng bộ hoàn tất',paused:'Đã tạm dừng — có thể tiếp tục',error:'Chưa hoàn tất — cần tiếp tục'}
const imageProgressPhases:SyncPhase[]=['images','verify','cleanup','done']
export default function CloudSyncProgress({state}:{state:SyncMeter}){
 const [now,setNow]=useState(Date.now())
 const active=!['idle','done','error','paused'].includes(state.phase)
 useEffect(()=>{if(!active)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[active,state.started])
 if(state.phase==='idle')return null
 const pct=state.total?Math.min(100,Math.floor(state.processed/state.total*100)):0
 const seconds=Math.max(0,Math.floor((now-state.started)/1000))
 const imageProgressVisible=imageProgressPhases.includes(state.phase)||(['paused','error'].includes(state.phase)&&state.total>0)
 return <section className="cloudSyncProgress panel" aria-label="Tiến trình đồng bộ Cloud" aria-busy={active}>
  <div className="cloudSyncProgressHeading"><strong>{labels[state.phase]}</strong><span>{state.phase==='done'?'Đã xác minh':state.phase==='images'?pct+'% ảnh':state.phase==='paused'?'Có thể tiếp tục':state.phase==='error'?'Cần kiểm tra và tiếp tục':'Chưa xác nhận hoàn tất'}</span></div>
  <progress aria-label={imageProgressVisible?'Ảnh đã xử lý':'Bước đồng bộ đang chạy'} max={imageProgressVisible?Math.max(1,state.total):undefined} value={imageProgressVisible?state.processed:undefined}/>
  {imageProgressVisible&&<div className="cloudSyncProgressStats"><span>Ảnh đã xử lý: <b>{state.processed.toLocaleString('vi-VN')} / {state.total.toLocaleString('vi-VN')}</b></span><span>Còn lại: <b>{Math.max(0,state.total-state.processed).toLocaleString('vi-VN')}</b></span><span>Tải mới: <b>{state.uploaded.toLocaleString('vi-VN')}</b></span><span>Giữ nguyên / tái dùng: <b>{state.reused.toLocaleString('vi-VN')}</b></span><span>Nguồn thiếu: <b>{state.missing.toLocaleString('vi-VN')}</b></span></div>}
  <p role="status">{state.current||labels[state.phase]}{active&&' · '+Math.floor(seconds/60)+' phút '+seconds%60+' giây'}</p>
  {state.phase!=='done'&&state.processed===state.total&&state.total>0&&<small>Đã xử lý ảnh; chỉ hoàn tất sau khi xác minh toàn bộ tồn và file Cloud.</small>}
 </section>
}
