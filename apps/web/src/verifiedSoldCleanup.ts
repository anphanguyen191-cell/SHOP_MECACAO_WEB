type Asset={image_id:number;object_path:string;ready:boolean;cleanup_requested?:boolean;deleted_at?:string|null}
type Unit={image_id:number;order_id:string}
type Result={images:Array<{imageId:number;path:string;deletedAt?:string|null}>}
export type CleanupIO={
 health:()=>Promise<{role:string;instance:string;contract:number;schema:number}>
 state:()=>Promise<{enabled:boolean;instance:string}>
 assets:()=>Promise<Asset[]>
 units:()=>Promise<Unit[]>
 reconcile:(orders:string[])=>Promise<void>
 prepare:(ids:number[],reason:string)=>Promise<Result>
 remove:(paths:string[])=>Promise<void>
 finalize:(ids:number[],reason:string)=>Promise<Result>
 check:()=>Promise<void>
}
/** Storage deletion follows fresh local archive verification, never a SOLD flag alone. */
export async function cleanupVerifiedSold(io:CleanupIO,selection?:number[],reason='Tự dọn SOLD sau khi laptop xác minh ảnh lưu'){
 const state=await io.state();if(!state.enabled)return 0
 const health=await io.health();if(health.role!=='owner')return 0
 if(health.contract!==1||health.schema!==130||!state.instance||state.instance!==health.instance)throw Error('Cloud chưa khớp kho laptop; giữ ảnh để kiểm tra.')
 const [assets,units]=await Promise.all([io.assets(),io.units()])
 const sold=new Map(units.map(u=>[u.image_id,u.order_id])),chosen=selection?new Set(selection):null
 if(chosen&&(!chosen.size||chosen.size!==selection!.length||selection!.some(id=>!sold.has(id))))throw Error('Chỉ dọn ảnh thuộc đơn đã SOLD.')
 const candidates=assets.filter(a=>!a.deleted_at&&(a.ready||a.cleanup_requested)&&sold.has(a.image_id)&&(!chosen||chosen.has(a.image_id)))
 let removed=0
 for(let offset=0;offset<candidates.length;offset+=100){
  const batch=candidates.slice(offset,offset+100),ids=batch.map(a=>a.image_id),orders=[...new Set(batch.map(a=>sold.get(a.image_id)!))]
  await io.check();await io.reconcile(orders)
  await io.check();const prepared=await io.prepare(ids,reason)
  if(!Array.isArray(prepared.images)||prepared.images.length!==batch.length||new Set(prepared.images.map(i=>i.imageId)).size!==ids.length||prepared.images.some(i=>!batch.some(a=>a.image_id===i.imageId&&a.object_path===i.path)))throw Error('Danh sách ảnh dọn không khớp; chưa xóa file Cloud.')
  await io.check();await io.remove(prepared.images.map(i=>i.path))
  // Always verify finalization after remove, even if the UI has since closed.
  const done=await io.finalize(ids,reason)
  if(!Array.isArray(done.images)||done.images.length!==ids.length||new Set(done.images.map(i=>i.imageId)).size!==ids.length||done.images.some(i=>!ids.includes(i.imageId)||!i.deletedAt))throw Error('File đã yêu cầu dọn nhưng chưa xác nhận xong. Sẽ đọc lại và tiếp tục.')
  removed+=ids.length
 }
 return removed
}
