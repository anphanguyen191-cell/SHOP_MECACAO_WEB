import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import sharp from 'sharp'
import {DatabaseSync} from 'node:sqlite'
import {SalesError,salesDraftService} from './salesDrafts.js'

const hash=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex')
/** Read-only sale gate: evidence is a point-in-time check, never a claim or permission to sell. */
export function salesPreflightService(db:DatabaseSync,sandboxRoot:string){
 const root=fs.realpathSync(sandboxRoot),drafts=salesDraftService(db,root)
 let busy=false
 function current(id:string,version:number){
  if(!Number.isSafeInteger(version)||version<1)throw new SalesError('Thiếu phiên bản đơn hợp lệ')
  const d=drafts.get(id)
  if(d.status!=='DRAFT'||d.version!==version)throw new SalesError('Đơn đã thay đổi hoặc đã hủy. Mở lại đơn trước khi kiểm tra.',409)
  if(!d.items.length||d.items.length>100||new Set(d.items.map(i=>i.image_id)).size!==d.items.length)throw new SalesError('Danh sách ảnh đơn không hợp lệ',409)
  if(!Number.isSafeInteger(d.discount)||d.discount<0||!Number.isSafeInteger(d.subtotal)||d.items.some(i=>!Number.isSafeInteger(i.unit_price)||i.unit_price<0)||!Number.isSafeInteger(d.total)||d.total<0)throw new SalesError('Giá hoặc giảm giá đã lưu không hợp lệ',409)
  return d
 }
 function source(imageId:number){
  const row=db.prepare('SELECT file_path FROM product_images WHERE id=?').get(imageId) as {file_path:string}|undefined
  if(!row)throw Error('Ảnh không còn đăng ký')
  const p=path.resolve(row.file_path),rel=path.relative(root,p)
  if(!rel||path.isAbsolute(rel)||rel==='..'||rel.startsWith('..'+path.sep)||rel.split(path.sep).some(s=>s.startsWith('.mecacao-')))throw Error('Ảnh không thuộc vùng kho đang bán')
  const st=fs.lstatSync(p)
  if(st.isSymbolicLink()||!st.isFile()||fs.realpathSync(p)!==p)throw Error('Ảnh hoặc thư mục là liên kết; cần kiểm tra đường dẫn')
  if(st.size>32*1024*1024)throw Error('Ảnh lớn hơn giới hạn kiểm tra 32 MB')
  const bytes=fs.readFileSync(p)
  if(bytes.length>32*1024*1024)throw Error('Ảnh lớn hơn giới hạn kiểm tra 32 MB')
  return {path:p,bytes,sha256:hash(bytes)}
 }
 return {async check(id:string,version:number,expectedToken?:unknown){
  if(expectedToken!==undefined&&(typeof expectedToken!=='string'||! /^[a-f0-9]{64}$/.test(expectedToken)))throw new SalesError('Mã kiểm tra không hợp lệ')
  if(busy)throw new SalesError('Đang kiểm tra đơn khác. Đợi hoàn tất rồi thử lại.',429)
  busy=true
  try{
   const before=current(id,version),snapshot=JSON.stringify(before),items=[]
   for(const item of before.items){
    let evidence:{sourcePath:string;sourceHash:string;bytes:number;width:number;height:number}|null=null,issue=item.unavailable
    if(!issue)try{
     const s=source(item.image_id)
     const image=sharp(s.bytes,{limitInputPixels:40_000_000,failOn:'warning'}),meta=await image.metadata()
     if(meta.pages&&meta.pages>1)throw Error('Ảnh nhiều khung hình chưa được hỗ trợ')
     await image.stats() // Metadata alone cannot prove the image can be fully decoded.
     if(!meta.width||!meta.height)throw Error('Không xác định được kích thước ảnh')
     evidence={sourcePath:s.path,sourceHash:s.sha256,bytes:s.bytes.length,width:meta.width,height:meta.height}
    }catch(e){issue=e instanceof Error&&/Ảnh|đường dẫn|khung hình/.test(e.message)?e.message:'Không giải mã được ảnh vật lý; thay ảnh hợp lệ trước khi bán'}
    items.push({imageId:item.image_id,productName:item.product_name,size:item.size,sku:item.sku,unitPrice:item.unit_price,unitCost:item.unit_cost,issue,evidence})
   }
   // Re-read all successful sources after async decoding and compare the full saved draft/conflict snapshot.
   for(const i of items)if(i.evidence){let same=false;try{const s=source(i.imageId);same=s.path===i.evidence.sourcePath&&s.sha256===i.evidence.sourceHash}catch{}if(!same)throw new SalesError('Ảnh đã thay đổi trong lúc kiểm tra. Kiểm tra lại toàn đơn.',409)}
   if(JSON.stringify(current(id,version))!==snapshot)throw new SalesError('Đơn, trạng thái kho hoặc nháp liên quan đã đổi. Mở lại và kiểm tra lần nữa.',409)
   const report={orderId:id,version,quantity:before.quantity,sizeCount:new Set(before.items.map(i=>i.variant_id)).size,productCount:new Set(before.items.map(i=>i.product_id)).size,subtotal:before.subtotal,discount:before.discount,total:before.total,payableTotal:before.payableTotal,shippingFee:before.contact.shippingFee,blockedCount:items.filter(i=>i.issue).length,zeroPriceCount:items.filter(i=>i.unitPrice===0).length,unknownCostCount:items.filter(i=>i.unitCost===null).length,conflicts:before.conflicts,items}
   const token=hash(JSON.stringify({snapshot,report}))
   if(expectedToken!==undefined&&expectedToken!==token)throw new SalesError('Kết quả kiểm tra cũ đã thay đổi. Kiểm tra lại trước khi tiếp tục.',409)
   return {...report,token,checkedAt:new Date().toISOString(),readOnly:true,reservesStock:false,canConfirmSale:false,checksPassed:report.blockedCount===0,requiresReview:!!(report.zeroPriceCount||report.unknownCostCount||report.conflicts.length)}
  }finally{busy=false}
 }}
}
