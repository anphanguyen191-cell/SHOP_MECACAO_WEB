import {useEffect,useState} from 'react'
export type SyncPhase='idle'|'reading'|'catalog'|'images'|'verify'|'cleanup'|'done'|'paused'|'error'
export type SyncMeter={phase:SyncPhase;total:number;processed:number;uploaded:number;reused:number;missing:number;started:number;current:string}
export const emptySyncMeter:SyncMeter={phase:'idle',total:0,processed:0,uploaded:0,reused:0,missing:0,started:0,current:''}
const labels:Record<SyncPhase,string>={idle:'Chưa đồng bộ',reading:'Đang đọc tồn laptop và Cloud',catalog:'Đang đối chiếu sản phẩm / Size',images:'Đang xử lý ảnh',verify:'Đang xác minh tồn và file Cloud',cleanup:'Đang dọn file dư đã đối soát',done:'Đồng bộ hoàn tất',paused:'Đã tạm dừng — có thể tiếp tục',error:'Chưa hoàn tất — cần tiếp tục'}
export default function CloudSyncProgress({state}:{state:SyncMeter}){
 const [now,setNow]=useState(Date.now())
 const active=!['idle','done','error','paused'].includes(state.phase)
 useEffect(()=>{if(!active)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[active,state.started])
 if(state.phase==='idle')return null
 const pct=state.total?Math.min(100,Math.floor(state.processed/state.total*100)):0
 const seconds=Math.max(0,Math.floor((now-state.started)/1000))
 return <section className="cloudSyncProgress panel" aria-label="Tiến trình đồng bộ Cloud" aria-busy={active} style={{marginBlock:12,padding:16}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><strong>{labels[state.phase]}</strong><span>{state.phase==='done'?'Đã xác minh':state.phase==='images'?pct+'% ảnh':'Chưa xác nhận hoàn tất'}</span></div>
  <progress aria-label="Ảnh đã xử lý" max={Math.max(1,state.total)} value={state.processed} style={{width:'100%',height:18,accentColor:'#ac346d',marginBlock:10}}/>
  <div style={{display:'flex',gap:16,flexWrap:'wrap'}}><span>Ảnh đã xử lý: <b>{state.processed.toLocaleString('vi-VN')} / {state.total.toLocaleString('vi-VN')}</b></span><span>Còn lại: <b>{Math.max(0,state.total-state.processed).toLocaleString('vi-VN')}</b></span><span>Tải mới: <b>{state.uploaded.toLocaleString('vi-VN')}</b></span><span>Giữ nguyên / tái dùng: <b>{state.reused.toLocaleString('vi-VN')}</b></span><span>Nguồn thiếu: <b>{state.missing.toLocaleString('vi-VN')}</b></span></div>
  <p role="status" style={{marginBottom:0,overflowWrap:'anywhere'}}>{state.current||labels[state.phase]}{active&&' · '+Math.floor(seconds/60)+' phút '+seconds%60+' giây'}</p>
  {state.phase!=='done'&&state.processed===state.total&&state.total>0&&<small>Đã xử lý ảnh; chỉ hoàn tất sau khi xác minh toàn bộ tồn và file Cloud.</small>}
 </section>
}
