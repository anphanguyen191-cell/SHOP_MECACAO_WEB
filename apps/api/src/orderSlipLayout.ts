type SlipContext=any
export type SlipCanvas={width:number;height:number;getContext:(kind:'2d')=>SlipContext|null}
export type SlipBitmap={width:number;height:number}
export const slipMoney=(n:number)=>n.toLocaleString('vi-VN')+' ₫'
export const slipFooter=[
 'Xin Quý khách hàng xem kỹ lại Phiếu chốt đơn trước khi chốt lần cuối!',
 'Một lần nữa cảm ơn Quý khách hàng đã lựa chọn Shop!',
 'Chúc Quý khách hàng vạn sự may mắn!'
]
const W=1080,ink='#412d3a',muted='#775c6c',pink='#a83869'
type Item={product_name:string;product_code:string;size:string;unit_price:number}
export type SlipModel={id:string;name:string;phone:string;address:string;date:string;subtotal:number;shipping:number;discount:number;collected:number;due:number;refundDue:number}
export function slipDate(value:string|undefined,issuedAt:Date){
 const date=value?new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)?value.replace(' ','T')+'Z':value):issuedAt
 return Number.isNaN(date.getTime())?'Chưa xác định':new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric'}).format(date)
}
export function slipModel(order:any,items:any[],contact:any,finance:any,date:string):SlipModel{
 const subtotal=items.reduce((n,i)=>n+Number(i.unit_price),0),shipping=Number(contact?.shipping_fee||0),discount=Number(order.discount||0)+Number(finance.credit||0),collected=Number(finance.netCollected),due=Number(finance.due),refundDue=Number(finance.refundDue||0)
 if([subtotal,shipping,discount,collected,due,refundDue].some(n=>!Number.isSafeInteger(n)||n<0)||subtotal+shipping-discount!==Number(finance.adjustedTotal)||due!==Math.max(0,subtotal+shipping-discount-collected))throw Error('Số tiền đơn đã thay đổi. Đọc lại đơn trước khi tạo phiếu.')
 return {id:order.id,name:contact?.recipient_name||'Chưa cung cấp',phone:contact?.phone||'Chưa cung cấp',address:contact?.address||'Chưa cung cấp',date,subtotal,shipping,discount,collected,due,refundDue}
}
function setFont(ctx:SlipContext,size:number,bold=false){ctx.font=(bold?'bold ':'')+size+'px Arial, sans-serif'}
function lines(ctx:SlipContext,value:string,width:number,size:number,bold=false){
 setFont(ctx,size,bold);const result:string[]=[];let line=''
 for(const word of String(value).split(/\s+/)){const candidate=(line+' '+word).trim();if(ctx.measureText(candidate).width<=width){line=candidate;continue}if(line){result.push(line);line=''}for(const ch of word){if(ctx.measureText(line+ch).width>width&&line){result.push(line);line=''}line+=ch}}
 if(line)result.push(line);return result.length?result:['']
}
function box(ctx:SlipContext,x:number,y:number,w:number,h:number,r:number,color:string){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();ctx.fill()}
export function renderOrderSlip(canvas:SlipCanvas,banner:SlipBitmap,items:Item[],images:SlipBitmap[],model:SlipModel,start:number,total:number,pageNumber:number,pageCount:number){
 canvas.width=W;const measure=canvas.getContext('2d');if(!measure)throw Error('Thiết bị chưa hỗ trợ tạo PNG.')
 const bannerHeight=Math.round(W*banner.height/banner.width),contactY=bannerHeight+130
 const contacts=[['Tên khách hàng:',model.name],['Số điện thoại:',model.phone],['Địa chỉ:',model.address],['Ngày chốt đơn:',model.date]].map(([label,value])=>({label,lines:lines(measure,value,630,28)}))
 const contactHeight=32+contacts.reduce((n,r)=>n+Math.max(47,r.lines.length*37+10),0)
 const headingY=contactY+contactHeight+39,itemsY=headingY+56
 const rows=items.map(item=>{const name=lines(measure,item.product_name||item.product_code,710,31,true),code=lines(measure,'Mã sản phẩm: '+(item.product_code||''),710,24),size=lines(measure,String(item.size).trim().replace(/^size\s*/i,'')+' · 1 bộ',420,26);return {name,code,size,height:Math.max(188,30+name.length*40+code.length*34+size.length*35+28)}})
 const totalsY=itemsY+rows.reduce((n,r)=>n+r.height,0)+38,totalsHeight=329+(model.refundDue>0?51:0),footerY=totalsY+totalsHeight+40
 const footer=slipFooter.map(p=>lines(measure,p,940,24)),height=footerY+footer.reduce((n,r)=>n+r.length*34+12,0)+30
 canvas.height=height;const ctx=canvas.getContext('2d')!;ctx.textBaseline='top';ctx.fillStyle='#fff';ctx.fillRect(0,0,W,height)
 const text=(x:number,y:number,s:string,size=28,bold=false,color=ink)=>{setFont(ctx,size,bold);ctx.fillStyle=color;ctx.fillText(s,x,y)}
 const right=(y:number,s:string,size=29,bold=false,color=ink)=>{setFont(ctx,size,bold);text(1020-ctx.measureText(s).width,y,s,size,bold,color)}
 ctx.drawImage(banner,0,0,W,bannerHeight)
 text(60,bannerHeight+30,'PHIẾU CHỐT ĐƠN',42,true,pink);right(bannerHeight+43,'Mã đơn: '+model.id.slice(0,8).toUpperCase(),25,true)
 box(ctx,60,contactY,960,contactHeight,22,'#fff4f8');let y=contactY+21
 for(const row of contacts){text(86,y,row.label,27,true);row.lines.forEach((line,i)=>text(360,y+i*37,line,28));y+=Math.max(47,row.lines.length*37+10)}
 text(60,headingY,'SẢN PHẨM ĐÃ CHỌN',26,true,pink);right(headingY,pageCount>1?total+' bộ · Trang '+pageNumber+'/'+pageCount:total+' bộ',25)
 y=itemsY
 rows.forEach((row,i)=>{const item=items[i],image=images[i];box(ctx,60,y+8,43,43,12,pink);const number=String(start+i+1);setFont(ctx,number.length>2?18:25,true);text(81.5-ctx.measureText(number).width/2,y+13,number,number.length>2?18:25,true,'#fff');const scale=Math.min(155/image.width,155/image.height);ctx.drawImage(image,120+(155-image.width*scale)/2,y+5+(155-image.height*scale)/2,image.width*scale,image.height*scale)
 let ty=y+13;row.name.forEach(line=>{text(310,ty,line,31,true);ty+=40});ty+=7;row.code.forEach(line=>{text(310,ty,line,24,false,muted);ty+=34});ty+=8;row.size.forEach((line,index)=>text(310,ty+index*35,(index===0?'Size ':'')+line,26));right(ty,slipMoney(Number(item.unit_price)),29,true,pink)
 ctx.strokeStyle='#eddce4';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(60,y+row.height-14);ctx.lineTo(1020,y+row.height-14);ctx.stroke();y+=row.height})
 box(ctx,60,totalsY,960,totalsHeight,22,'#fff4f8')
 const amounts=[['Tổng đơn:',model.subtotal],['Phí ship:',model.shipping],['Giảm giá:',model.discount],['Đã thu/cọc:',model.collected]] as const
 amounts.forEach(([label,amount],i)=>{text(86,totalsY+22+i*51,label,28,i===0);right(totalsY+22+i*51,(label==='Giảm giá:'&&amount>0?'-':'')+slipMoney(amount),29,i===0)})
 ctx.strokeStyle='#dab7c9';ctx.beginPath();ctx.moveTo(86,totalsY+237);ctx.lineTo(994,totalsY+237);ctx.stroke();text(86,totalsY+260,'CÒN PHẢI THU:',31,true,pink);right(totalsY+255,slipMoney(model.due),39,true,pink)
 if(model.refundDue>0){text(86,totalsY+311,'Cần hoàn lại:',28);right(totalsY+311,slipMoney(model.refundDue),29)}
 y=footerY;for(const paragraph of footer){for(const line of paragraph){setFont(ctx,24);text((W-ctx.measureText(line).width)/2,y,line,24,false,muted);y+=34}y+=12}
 return {width:W,height,bannerHeight,numberedFrom:start+1,numberedTo:start+items.length}
}
