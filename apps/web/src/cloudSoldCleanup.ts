import {cloud,cloudRpc,cloudRows,CLOUD_BUCKET} from './cloudClient'
import {apiJson} from './uiState'
import {cleanupVerifiedSold} from './verifiedSoldCleanup'
let cleaning=false
export async function cleanCloudSold(selection?:number[],reason?:string,alive:()=>boolean=()=>true){
 if(cleaning)throw Error('Đang xác minh dọn ảnh ở thao tác khác; vui lòng chờ.')
 const work=async()=>{
  cleaning=true
  try{
   const session=(await cloud.auth.getSession()).data.session;if(!session)return 0
   const check=async()=>{const current=(await cloud.auth.getSession()).data.session;if(!alive()||!navigator.onLine||current?.user.id!==session.user.id)throw Error('Dọn ảnh tạm dừng; sẽ tiếp tục khi kết nối và đăng nhập lại.')}
   const mutation={method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token}}
   return await cleanupVerifiedSold({
    health:()=>cloudRpc('mc_v7_health'),state:()=>apiJson('/api/cloud/state'),
    assets:()=>cloudRows('cloud_image_assets'),units:()=>cloudRows('sales_units'),check,
    reconcile:async orders=>{await apiJson('/api/cloud/reconcile',{...mutation,body:JSON.stringify({orders})})},
    prepare:(ids,why)=>cloudRpc('mc_v7_sold_cleanup',{p_action:'prepare',p_images:ids,p_reason:why,p_confirmed:true}),
    remove:async paths=>{const {error}=await cloud.storage.from(CLOUD_BUCKET).remove(paths);if(error)throw Error(error.message)},
    finalize:(ids,why)=>cloudRpc('mc_v7_sold_cleanup',{p_action:'finalize',p_images:ids,p_reason:why,p_confirmed:true})
   },selection,reason)
  }finally{cleaning=false}
 }
 if(navigator.locks)return navigator.locks.request('mecacao-v7-sold-cleanup',{ifAvailable:true},lock=>{if(!lock)throw Error('Tab khác đang dọn ảnh SOLD; sẽ kiểm tra lại sau.');return work()})
 return work()
}
