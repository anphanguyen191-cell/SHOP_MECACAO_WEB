import {useEffect,useState} from 'react'
import {cloud} from './cloudClient'
import {cleanCloudSold} from './cloudSoldCleanup'
/** Mounted throughout the local app, independent of the selected business screen. */
export default function CloudSoldMaintenance(){
 const [warning,setWarning]=useState('')
 useEffect(()=>{
  let alive=true,running=false,signed=false
  const sweep=async()=>{
   if(!alive||!signed||running||!navigator.onLine)return
   running=true
   try{const count=await cleanCloudSold(undefined,undefined,()=>alive);if(alive){setWarning('');if(count){window.dispatchEvent(new CustomEvent('mecacao-cloud-sold-cleaned',{detail:count}));window.dispatchEvent(new CustomEvent('mecacao-cloud-sync-status',{detail:'Đã tự dọn '+count+' ảnh SOLD khỏi Cloud; ảnh lưu laptop và lịch sử được giữ.'}))}}}
   catch(e){if(alive)setWarning('Tự dọn ảnh SOLD đang chờ: '+(e instanceof Error?e.message:String(e)))}finally{running=false}
  }
  void cloud.auth.getSession().then(({data})=>{if(alive){signed=!!data.session;void sweep()}})
  const {data}=cloud.auth.onAuthStateChange((_event,session)=>{signed=!!session;if(signed)setTimeout(()=>void sweep(),0);else if(alive)setWarning('')})
  const timer=setInterval(()=>void sweep(),30000)
  window.addEventListener('online',sweep);window.addEventListener('mecacao-cloud-sold-check',sweep)
  const channel=cloud.channel('v7-sold-maintenance').on('postgres_changes',{event:'INSERT',schema:'public',table:'cloud_sync_events'},()=>void sweep()).subscribe()
  return()=>{alive=false;clearInterval(timer);data.subscription.unsubscribe();window.removeEventListener('online',sweep);window.removeEventListener('mecacao-cloud-sold-check',sweep);void cloud.removeChannel(channel)}
 },[])
 return warning?<p className="notice warning" role="status">{warning} Phần mềm sẽ thử lại tự động.</p>:null
}
