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
   const preserve=async(assets:any[],units:any[])=>{const state=await apiJson('/api/cloud/state');for(const asset of assets){if(asset.proof_path)continue;await check();const order=units.find(u=>Number(u.image_id)===Number(asset.image_id))?.order_id;if(!order)throw Error('Không xác định được đơn của ảnh chứng từ.');const response=await fetch('/api/cloud/proof-images/'+asset.image_id+'?order='+encodeURIComponent(order),{headers:{Authorization:'Bearer '+session.access_token}});if(!response.ok)throw Error('Chưa đọc được ảnh chứng từ đã kiểm chứng trên Windows.');const bytes=await response.arrayBuffer(),sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');if(bytes.byteLength>40000||response.headers.get('X-Proof-Sha256')!==sha||response.headers.get('X-Warehouse-Instance')!==state.instance)throw Error('Ảnh chứng từ chưa khớp kiểm chứng.');const path='proof/v7/'+state.instance+'/'+asset.image_id+'-'+sha+'.jpg';const {error}=await cloud.storage.from(CLOUD_BUCKET).upload(path,bytes,{contentType:'image/jpeg',upsert:false});if(error){const existing=await cloud.storage.from(CLOUD_BUCKET).download(path);if(existing.error||!existing.data)throw error;const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await existing.data.arrayBuffer()))).map(v=>v.toString(16).padStart(2,'0')).join('');if(hash!==sha)throw Error('Ảnh chứng từ Cloud khác bản đã kiểm chứng.');}await cloudRpc('mc_v7_proof_register',{p_instance:state.instance,p_image:Number(asset.image_id),p_path:path,p_sha:sha})}}
   return await cleanupVerifiedSold({
    preserve,
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
