import {financeService} from './orderFinance.js'
import sharp from 'sharp'
import fs from 'node:fs/promises'
import {DatabaseSync} from 'node:sqlite'
import {salesDraftService,SalesError} from './salesDrafts.js'
import {salesPreviewService} from './salesPreview.js'
import {salesExecutionService} from './salesExecution.js'
import {slipModel,slipDate} from './orderSlipLayout.js'
import {renderSlipSvg} from './orderSlipSvg.js'
let banner:Promise<{data:Buffer;width:number;height:number}>|undefined
function shopBanner(){return banner??=fs.readFile(new URL('./brand/banner.jpg',import.meta.url)).catch(()=>fs.readFile(new URL('../../web/public/brand/banner.jpg',import.meta.url))).then(async data=>{const meta=await sharp(data).metadata();if(!meta.width||!meta.height)throw Error('Banner chưa hợp lệ');return {data,width:meta.width,height:meta.height}})}
export function orderSlipService(db:DatabaseSync,root:string){
 const drafts=salesDraftService(db,root),preview=salesPreviewService(db,root)
 function current(id:string,version:number){const d=drafts.get(id);if(d.version!==version||d.status==='CANCELLED_DRAFT')throw new SalesError('Đơn đã thay đổi hoặc hủy. Mở lại trước khi xuất phiếu.',409);return d}
 return {summary(id:string,version:number){const d=current(id,version);return {orderId:id,version,pages:Math.ceil(d.quantity/8),quantity:d.quantity,total:d.payableTotal,contact:d.contact,finance:financeService(db).summary(id)}},
 async png(id:string,version:number,page:number,financeVersion?:number){
  const finance=financeService(db),payment=finance.summary(id)
  if(financeVersion!==undefined&&financeVersion!==payment.version)throw new SalesError('Thanh toán đã thay đổi. Tạo lại phiếu.',409)
  const d=current(id,version),pages=Math.ceil(d.quantity/8);if(!Number.isInteger(page)||page<1||page>pages)throw new SalesError('Trang phiếu không hợp lệ')
  const proof:Array<{imageId:number;sourceHash:string}>=[],images:Array<{data:Buffer;width:number;height:number}>=[],start=(page-1)*8,items=d.items.slice(start,start+8)
  for(const item of items){const encoded=d.status==='SOLD'?null:await preview.slipImage(id,version,item.image_id),data=encoded?encoded.data:await salesExecutionService(db,root).image(id,item.image_id);if(encoded)proof.push(encoded.summary);const meta=await sharp(data).metadata();if(!meta.width||!meta.height)throw new SalesError('Ảnh chưa hợp lệ');images.push({data,width:meta.width,height:meta.height})}
  const confirmed=d.status==='SOLD'?db.prepare('SELECT created_at FROM sales_confirmations WHERE order_id=?').get(id)?.created_at:undefined
  const model=slipModel(d,d.items,{recipient_name:d.contact.recipientName,phone:d.contact.phone,address:d.contact.address,shipping_fee:d.contact.shippingFee},payment,slipDate(confirmed?String(confirmed):undefined,new Date()))
  const data=await renderSlipSvg(await shopBanner(),items,images,model,start,d.quantity,page,pages)
  current(id,version);if(finance.summary(id).version!==payment.version)throw new SalesError('Thanh toán đổi trong lúc xuất. Tạo lại phiếu.',409)
  if(proof.length)preview.verifySlipSources(id,version,proof);return data
 }}
}
