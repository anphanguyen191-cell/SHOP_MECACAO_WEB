import type {RequestHandler} from 'express'
import type {DatabaseSync} from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import {salesActivity,SALES_AREA} from './salesExecution.js'
import {pendingStockReturn} from './stockReturnState.js'

/** Shared by the production HTTP stack and its integration test. */
export function salesRequestGuard(db:DatabaseSync,root:string|null,enabled:boolean):RequestHandler{
 return (req,res,next)=>{
  if(req.method==='GET'&&req.path==='/cloud/live/events')return next()
  if(enabled&&root&&req.path!=='/health'){
   const returnRoute=/^\/sales\/drafts\/(?:returns\/(?:operations\/[^/]+|recover)|[^/]+\/returns)$/.test(req.path)
   if(returnRoute)return next()
   if(pendingStockReturn(db,root)&&req.method==='GET'&&/^\/sales\/drafts(?:\/[^/]+(?:\/sold-image\/\d+)?)?$/.test(req.path))return next()
   if(pendingStockReturn(db,root))return res.status(409).json({error:'Nhận lại hàng cần kiểm tra phục hồi. Mở đơn SOLD tại laptop → Nhận lại hàng.',code:'STOCK_RETURN_RECOVERY_REQUIRED'})
  }
  if(!enabled||!root||req.path==='/health'||req.path==='/cloud/reconcile'||req.path.startsWith('/tasks')||req.path==='/sales/drafts/recover'||/^\/sales\/drafts\/operations\//.test(req.path)||/\/confirm$/.test(req.path))return next()
  if(salesActivity.busy||fs.existsSync(path.join(root,SALES_AREA+'-pending.json'))||db.prepare("SELECT 1 FROM sales_operations WHERE status='PREPARED'").get())return res.status(409).json({error:'Giao dịch bán đang xử lý hoặc cần phục hồi. Vào Bán hàng kiểm tra trạng thái.',code:'SALE_RECOVERY_REQUIRED'})
  // These coordinators validate activity themselves around synchronous snapshots,
  // re-check after network I/O, and use the normal sale/archive locks on replay.
  // Counting their own HTTP request as a reader deadlocks upload AND activation
  // AND pull (including sale replay). Keep the recovery/busy checks above.
  if(req.method==='POST'&&['/cloud/business','/cloud/business/pull','/cloud/activate'].includes(req.path))return next()
  salesActivity.readers++
  let done=false
  const release=()=>{if(!done){done=true;salesActivity.readers--}}
  res.once('finish',release);res.once('close',release);next()
 }
}
