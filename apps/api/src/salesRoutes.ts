import {soldRetentionService} from './soldRetention.js'
import {businessReports,csvText} from './businessReports.js'
import {bootstrapStocktake,stocktakeService} from './stocktake.js'
import {financeService} from './orderFinance.js'
import {customerService} from './customers.js'
import {orderSlipService} from './orderSlip.js'
import {salesExecutionService} from './salesExecution.js'
import {readSchemaVersion} from './schema.js'
import {salesConfirmTrialService} from './salesConfirmTrial.js'
import {salesPreflightService} from './salesPreflight.js'
import {salesArchiveService} from './salesArchive.js'
import {salesPreviewService} from './salesPreview.js'
import {Router} from 'express'
import {DatabaseSync} from 'node:sqlite'
import {SalesError,salesDraftService} from './salesDrafts.js'

export function salesDraftRouter(db:DatabaseSync,root:string,port:number){
 const retention=readSchemaVersion(db)===130?soldRetentionService(db,root):null
 const router=Router(),service=salesDraftService(db,root),preview=salesPreviewService(db,root),archive=salesArchiveService(db,root),preflight=salesPreflightService(db,root),trial=readSchemaVersion(db)===120?salesConfirmTrialService(db,root):null,sales=readSchemaVersion(db)===130?salesExecutionService(db,root):null
 router.use((req,res,next)=>{
  if(res.locals.lanUser)return next()
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||''))return res.status(403).json({error:'V2 thử nghiệm chỉ truy cập trên cùng máy.'})
  if(req.method!=='GET'){
   let same=false;try{const u=new URL(req.get('origin')||'');same=u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&Number(u.port||80)===port}catch{}
   if(!same)return res.status(403).json({error:'Chỉ lưu đơn từ giao diện LOCAL sandbox trên cùng máy.'})
  }
  next()
 })
 function execute(res:any,action:()=>unknown,status=200){try{res.status(status).json(action())}catch(e){res.status(e instanceof SalesError?e.status:500).json({error:e instanceof Error?e.message:'Không xử lý được đơn nháp',...(e instanceof SalesError?e.details:{})})}}
 async function previewRequest(res:any,action:()=>Promise<unknown>,image=false){try{const result=await action();res.set('Cache-Control','no-store');if(image)res.type('jpeg').send(result);else res.json(result)}catch(e){res.status(e instanceof SalesError?e.status:500).json({error:e instanceof Error?e.message:'Không tạo được ảnh xem trước'})}}
 if(sales){
 router.get('/sold-retention',(req,res)=>execute(res,()=>retention!.list(req.query.offset)))
 router.get('/sold-retention/:imageId/verify',(req,res)=>void previewRequest(res,()=>retention!.verify(req.params.imageId)))
 bootstrapStocktake(db)
 const reports=businessReports(db),stocktake=stocktakeService(db,root)
 router.get('/reports/summary',(req,res)=>execute(res,()=>reports.summary(req.query.from,req.query.to)))
 router.get('/reports/export.csv',(req,res)=>{try{const r=reports.summary(req.query.from,req.query.to),kind=String(req.query.kind??'orders');if(!['orders','entries'].includes(kind))throw new SalesError('Loại báo cáo không hợp lệ');const rows=kind==='orders'?[['Mã đơn','Ngày bán UTC','Khách','Số bộ','Tiền hàng trước giảm','Giảm giá','Tiền hàng','Phí ship','Tổng đơn','Giá vốn biết','Bộ thiếu vốn','Lãi gộp hàng','Điều chỉnh đến nay','Phải thu hiện tại','Cần hoàn hiện tại'],...r.orders.map(o=>[o.id,o.soldAt,o.recipientName,o.quantity,o.subtotal,o.discount,o.goodsTotal,o.shipping,o.payableTotal,o.knownCost,o.unknownCosts,o.grossMargin,o.creditToDate,o.dueNow,o.refundDueNow])]:[['Mã chứng từ','Mã đơn','Ngày UTC','Khách','Loại','Hình thức','Số tiền','Nội dung'],...r.entries.map(e=>[e.id,e.orderId,e.createdAt,e.recipientName,e.kind,e.method,e.amount,e.note])];res.set('Cache-Control','no-store').attachment('mecacao-'+kind+'-'+r.range.from+'-'+r.range.to+'.csv').type('text/csv').send(csvText(rows))}catch(e){res.status(e instanceof SalesError?e.status:500).json({error:e instanceof Error?e.message:'Không xuất được báo cáo'})}})
 router.get('/stocktakes',(req,res)=>execute(res,()=>stocktake.list()))
 router.post('/stocktakes',(req,res)=>execute(res,()=>stocktake.create(req.body,req.get('Idempotency-Key')),201))
 router.get('/stocktakes/:sessionId',(req,res)=>execute(res,()=>stocktake.current(req.params.sessionId)))
 router.put('/stocktakes/:sessionId',(req,res)=>execute(res,()=>stocktake.save(req.params.sessionId,req.body)))
 router.post('/stocktakes/:sessionId/finish',(req,res)=>execute(res,()=>stocktake.finish(req.params.sessionId,req.body)))
 router.get('/stocktakes/:sessionId/export.csv',(req,res)=>{try{const s=stocktake.get(req.params.sessionId);res.set('Cache-Control','no-store').attachment('mecacao-stocktake-'+String(s.id).slice(0,8)+'.csv').type('text/csv').send(csvText([['Phiên',s.title,'Trạng thái',s.status,'Mốc UTC',s.created_at,'Kết luận',s.conclusion],['Mã mẫu','Sản phẩm','Size','SKU','Tồn sổ','Tồn ảnh đầu phiên','Ảnh thiếu','Ảnh đã bán','Số đếm thực','Chênh so ảnh','Ghi chú'],...s.rows.map(r=>[r.productCode,r.productName,r.size,r.sku,r.ledger,r.physical,r.missing,r.retired,r.counted,r.difference,r.note])]))}catch(e){res.status(e instanceof SalesError?e.status:500).json({error:e instanceof Error?e.message:'Không xuất kiểm kê'})}})
 }
 const finance=financeService(db)
 router.get('/finance/debts',(req,res)=>execute(res,()=>finance.debts()))
 router.get('/:id/finance',(req,res)=>execute(res,()=>finance.summary(req.params.id)))
 router.put('/:id/finance',(req,res)=>execute(res,()=>finance.configure(req.params.id,req.body)))
 router.post('/:id/finance/entries',(req,res)=>execute(res,()=>finance.record(req.params.id,req.body,req.get('Idempotency-Key')),201))
 router.post('/:id/aftercare',(req,res)=>execute(res,()=>finance.createCase(req.params.id,req.body,req.get('Idempotency-Key')),201))
 router.put('/:id/aftercare/:caseId',(req,res)=>execute(res,()=>finance.resolveCase(req.params.id,req.params.caseId,req.body)))
 const customers=customerService(db),slips=orderSlipService(db,root)
 router.get('/customers',(req,res)=>execute(res,()=>customers.list(String(req.query.q??''))))
 router.post('/customers',(req,res)=>execute(res,()=>customers.save(req.body),201))
 router.put('/customers/:customerId',(req,res)=>execute(res,()=>customers.save(req.body,req.params.customerId)))
 router.get('/:id/slip',(req,res)=>execute(res,()=>slips.summary(req.params.id,Number(req.query.version))))
 router.get('/:id/slip.png',(req,res)=>{void (async()=>{try{const data=await slips.png(req.params.id,Number(req.query.version),Number(req.query.page??1),req.query.financeVersion===undefined?undefined:Number(req.query.financeVersion));res.set('Cache-Control','no-store').type('png').send(data)}catch(e){res.status(e instanceof SalesError?e.status:500).json({error:e instanceof Error?e.message:'Không tạo được phiếu PNG'})}})()})
 if(sales){
 router.post('/:id/confirm',(req,res)=>void previewRequest(res,()=>sales.confirm(req.params.id,req.body,req.get('Idempotency-Key'))))
 router.get('/operations/:requestKey',(req,res)=>void previewRequest(res,()=>sales.status(req.params.requestKey)))
 router.post('/recover',(req,res)=>void previewRequest(res,()=>req.body.confirmed===true?sales.recover():Promise.reject(new SalesError('Xác nhận phục hồi trước'))))
 router.get('/:id/sold',(req,res)=>execute(res,()=>sales.history(req.params.id)))
 router.get('/:id/sold-image/:imageId',(req,res)=>void previewRequest(res,()=>sales.image(req.params.id,Number(req.params.imageId)),true))
 }
 if(trial)router.post('/:id/confirm-trial',(req,res)=>void previewRequest(res,()=>trial!.confirm(req.params.id,req.body,req.get('Idempotency-Key'))))
 if(trial)router.get('/:id/confirm-trials/:requestKey',(req,res)=>void previewRequest(res,()=>trial!.status(req.params.id,req.params.requestKey)))
 if(trial)router.post('/:id/confirm-trials/:requestKey/recover',(req,res)=>void previewRequest(res,()=>trial!.recover(req.params.id,req.params.requestKey,req.body.confirmed)))
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
