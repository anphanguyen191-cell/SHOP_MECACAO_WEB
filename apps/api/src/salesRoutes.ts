import {salesConfirmTrialService} from './salesConfirmTrial.js'
import {salesPreflightService} from './salesPreflight.js'
import {salesArchiveService} from './salesArchive.js'
import {salesPreviewService} from './salesPreview.js'
import {Router} from 'express'
import {DatabaseSync} from 'node:sqlite'
import {SalesError,salesDraftService} from './salesDrafts.js'

export function salesDraftRouter(db:DatabaseSync,root:string,port:number){
 const router=Router(),service=salesDraftService(db,root),preview=salesPreviewService(db,root),archive=salesArchiveService(db,root),preflight=salesPreflightService(db,root),trial=salesConfirmTrialService(db,root)
 router.use((req,res,next)=>{
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||''))return res.status(403).json({error:'V2 thử nghiệm chỉ truy cập trên cùng máy.'})
  if(req.method!=='GET'){
   let same=false;try{const u=new URL(req.get('origin')||'');same=u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&Number(u.port||80)===port}catch{}
   if(!same)return res.status(403).json({error:'Chỉ lưu đơn từ giao diện LOCAL sandbox trên cùng máy.'})
  }
  next()
 })
 function execute(res:any,action:()=>unknown,status=200){try{res.status(status).json(action())}catch(e){res.status(e instanceof SalesError?e.status:500).json({error:e instanceof Error?e.message:'Không xử lý được đơn nháp',...(e instanceof SalesError?e.details:{})})}}
 async function previewRequest(res:any,action:()=>Promise<unknown>,image=false){try{const result=await action();res.set('Cache-Control','no-store');if(image)res.type('jpeg').send(result);else res.json(result)}catch(e){res.status(e instanceof SalesError?e.status:500).json({error:e instanceof Error?e.message:'Không tạo được ảnh xem trước'})}}
 router.post('/:id/confirm-trial',(req,res)=>void previewRequest(res,()=>trial.confirm(req.params.id,req.body,req.get('Idempotency-Key'))))
 router.get('/:id/confirm-trials/:requestKey',(req,res)=>void previewRequest(res,()=>trial.status(req.params.id,req.params.requestKey)))
 router.post('/:id/confirm-trials/:requestKey/recover',(req,res)=>void previewRequest(res,()=>trial.recover(req.params.id,req.params.requestKey,req.body.confirmed)))
 router.post('/:id/archives',(req,res)=>void previewRequest(res,()=>archive.prepare(req.params.id,req.body,req.get('Idempotency-Key'))))
 router.get('/:id/archives',(req,res)=>void previewRequest(res,()=>archive.list(req.params.id)))
 router.post('/:id/archives/:archiveId/verify',(req,res)=>void previewRequest(res,()=>archive.verify(req.params.id,req.params.archiveId)))
 router.post('/:id/archives/:archiveId/recover',(req,res)=>void previewRequest(res,()=>archive.recover(req.params.id,req.params.archiveId)))
 router.post('/:id/preflight',(req,res)=>void previewRequest(res,()=>preflight.check(req.params.id,req.body.version,req.body.token)))
 router.post('/:id/preview',(req,res)=>void previewRequest(res,()=>preview.preview(req.params.id,req.body.version)))
 router.get('/:id/preview/:imageId',(req,res)=>void previewRequest(res,()=>preview.image(req.params.id,Number(req.query.version),Number(req.params.imageId),String(req.query.hash||'')),true))
 router.get('/', (req,res)=>execute(res,()=>service.list(String(req.query.status??'DRAFT'))))
 router.post('/',(req,res)=>execute(res,()=>service.create(req.body,req.get('Idempotency-Key')),201))
 router.get('/:id',(req,res)=>execute(res,()=>service.get(req.params.id)))
 router.put('/:id',(req,res)=>execute(res,()=>service.update(req.params.id,req.body)))
 router.post('/:id/cancel',(req,res)=>execute(res,()=>service.cancel(req.params.id,req.body.version)))
 return router
}
