import {Router} from 'express'
import {DatabaseSync} from 'node:sqlite'
import {SalesError,salesDraftService} from './salesDrafts.js'

export function salesDraftRouter(db:DatabaseSync,root:string,port:number){
 const router=Router(),service=salesDraftService(db,root)
 router.use((req,res,next)=>{
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||''))return res.status(403).json({error:'V2 thử nghiệm chỉ truy cập trên cùng máy.'})
  if(req.method!=='GET'){
   let same=false;try{const u=new URL(req.get('origin')||'');same=u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&Number(u.port||80)===port}catch{}
   if(!same)return res.status(403).json({error:'Chỉ lưu đơn từ giao diện LOCAL sandbox trên cùng máy.'})
  }
  next()
 })
 function execute(res:any,action:()=>unknown,status=200){try{res.status(status).json(action())}catch(e){res.status(e instanceof SalesError?e.status:500).json({error:e instanceof Error?e.message:'Không xử lý được đơn nháp'})}}
 router.get('/',(req,res)=>execute(res,()=>service.list(String(req.query.status??'DRAFT'))))
 router.post('/',(req,res)=>execute(res,()=>service.create(req.body,req.get('Idempotency-Key')),201))
 router.get('/:id',(req,res)=>execute(res,()=>service.get(req.params.id)))
 router.put('/:id',(req,res)=>execute(res,()=>service.update(req.params.id,req.body)))
 router.post('/:id/cancel',(req,res)=>execute(res,()=>service.cancel(req.params.id,req.body.version)))
 return router
}
