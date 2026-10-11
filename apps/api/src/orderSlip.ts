import {financeService} from './orderFinance.js'
import sharp,{type OutputInfo} from 'sharp'
import fs from 'node:fs/promises'
let banner:Promise<{data:Buffer;info:OutputInfo}>|undefined
function shopBanner(){return banner??=fs.readFile(new URL('./brand/banner.jpg',import.meta.url)).catch(()=>fs.readFile(new URL('../../web/public/brand/banner.jpg',import.meta.url))).then(bytes=>sharp(bytes).resize(1016).png().toBuffer({resolveWithObject:true}))}
import {DatabaseSync} from 'node:sqlite'
import {salesDraftService,SalesError} from './salesDrafts.js'
import {salesPreviewService} from './salesPreview.js'
import {salesExecutionService} from './salesExecution.js'
const escape=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!))
const money=(n:number)=>n.toLocaleString('vi-VN')+' đ'
const wrap=(value:string,width=45)=>{const lines:string[]=[];let line='';for(const word of value.split(/\s+/).flatMap(w=>w.match(/.{1,45}/gu)??[])){if((line+' '+word).trim().length>width){lines.push(line);line=word}else line=(line+' '+word).trim()}if(line)lines.push(line);return lines}
export function orderSlipService(db:DatabaseSync,root:string){
 const drafts=salesDraftService(db,root),preview=salesPreviewService(db,root)
 function current(id:string,version:number){const d=drafts.get(id);if(d.version!==version||d.status==='CANCELLED_DRAFT')throw new SalesError('Đơn đã thay đổi hoặc hủy. Mở lại trước khi xuất phiếu.',409);return d}
 return {summary(id:string,version:number){const d=current(id,version);return {orderId:id,version,pages:Math.ceil(d.quantity/8),quantity:d.quantity,total:d.payableTotal,contact:d.contact,finance:financeService(db).summary(id)}},
 async png(id:string,version:number,page:number,financeVersion?:number){
 const finance=financeService(db),payment=finance.summary(id)
 if(financeVersion!==undefined&&financeVersion!==payment.version)throw new SalesError('Thanh toán đã thay đổi. Tạo lại phiếu.',409)
 const d=current(id,version),pages=Math.ceil(d.quantity/8)
 if(!Number.isInteger(page)||page<1||page>pages)throw new SalesError('Trang phiếu không hợp lệ')
 const parts:string[]=[],overlays:Array<{input:Buffer;left:number;top:number}>=[]
 const text=(x:number,y:number,value:unknown,size=28,weight='normal',color='#403746',anchor='start')=>parts.push(`<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${escape(value)}</text>`)
 const brand=await shopBanner();overlays.push({input:brand.data,left:32,top:24})
 parts.push('<rect width="1080" height="100%" fill="#fffdfd"/>')
 const heading=brand.info.height+78
 text(45,heading,'PHIẾU CHỐT ĐƠN',34,'bold','#793751');text(45,heading+45,'Mã '+id.slice(0,8).toUpperCase()+' · '+(d.status==='SOLD'?'Đã bán':'Đơn nháp')+' · Trang '+page+'/'+pages,24)
 let y=heading+90
 for(const value of [d.contact.recipientName?'Khách: '+d.contact.recipientName:'Khách: chưa chọn',d.contact.phone?'Điện thoại: '+d.contact.phone:'',d.contact.address?'Giao đến: '+d.contact.address:''])for(const line of wrap(value,56)){text(45,y,line,25);y+=36}
 y+=15
 const proof:Array<{imageId:number;sourceHash:string}>=[]
 for(const item of d.items.slice((page-1)*8,page*8)){
 const encoded=d.status==='SOLD'?null:await preview.slipImage(id,version,item.image_id)
 const bytes=encoded?encoded.data:await salesExecutionService(db,root).image(id,item.image_id)
 if(encoded)proof.push(encoded.summary)
 const thumb=await sharp(bytes).resize(180,180,{fit:'contain',background:'#fff'}).png().toBuffer()
 overlays.push({input:thumb,left:45,top:y})
 const names=wrap(item.product_name,34),rowHeight=Math.max(215,105+names.length*34)
 parts.push(`<line x1="45" x2="1035" y1="${y+rowHeight-20}" y2="${y+rowHeight-20}" stroke="#eadfe4"/>`)
 let row=y+38;for(const line of names){text(250,row,line,27,'bold');row+=34}
 text(250,row+5,item.size+' · SL: 1 bộ',25);text(250,row+44,'Đơn giá: '+money(item.unit_price),25)
 y+=rowHeight
 }
 if(page===pages){
 y+=20;parts.push(`<rect x="28" y="${y-34}" width="1024" height="198" rx="18" fill="#fce4ee"/>`);for(const [label,value] of [['Tiền hàng',money(d.subtotal)],['Giảm giá','− '+money(d.discount)],['Phí ship',d.contact.shippingFee?money(d.contact.shippingFee):'Miễn phí'],['TỔNG THANH TOÁN',money(d.payableTotal)]]){text(45,y,label,29,label.startsWith('TỔNG')?'bold':'normal');text(1035,y,value,29,'bold','#403746','end');y+=48}
 for(const [label,value] of [['Hình thức dự kiến',({COD:'COD',TRANSFER:'Chuyển khoản',CASH:'Tiền mặt'} as Record<string,string>)[payment.method]],['Điều chỉnh hậu mãi','− '+money(payment.credit)],['Giá trị sau điều chỉnh',money(payment.adjustedTotal)],['Đã thu (sau hoàn)',money(payment.netCollected)],['Còn phải thu',money(payment.due)],['Cần hoàn khách',money(payment.refundDue)]]){text(45,y,label,27);text(1035,y,value,27,'bold','#403746','end');y+=44}
 for(const line of wrap(d.note?'Ghi chú: '+d.note:'',56)){text(45,y,line,23);y+=34}
 }
 y+=30;text(45,y,'Cảm ơn ba mẹ đã ủng hộ Shop Mẹ CaCao!',24);y+=40;text(45,y,payment.due?'Phiếu chốt đơn · Còn phải thu':payment.refundDue?'Phiếu chốt đơn · Cần hoàn khách':'Phiếu chốt đơn · Đã thanh toán',21)
 const height=y+45
 const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}">${parts.join('')}</svg>`)
 const data=await sharp(svg,{limitInputPixels:10_000_000}).composite(overlays).png().toBuffer()
 current(id,version)
 if(finance.summary(id).version!==payment.version)throw new SalesError('Thanh toán đổi trong lúc xuất. Tạo lại phiếu.',409)
 if(proof.length)preview.verifySlipSources(id,version,proof)
 return data
 }}
}
