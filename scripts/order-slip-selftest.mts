import assert from 'node:assert/strict'
import {draftSlipFinance,renderOrderSlip,slipDate,slipModel,slipFooter} from '../apps/web/src/orderSlipLayout.ts'
const items=[80000,80000,65000,72000].map(unit_price=>({product_name:'TDQD gái',product_code:'TD0001',size:'Size 10',unit_price}))
const order={id:'ab25319c-fake',discount:17000},contact={recipient_name:'FAKE Khách',phone:'0900000000',address:'FAKE Cà Mau',shipping_fee:30000},finance={credit:10000,netCollected:100000,adjustedTotal:300000,due:200000,refundDue:0}
const model=slipModel(order,items,contact,finance,'13/10/2026')
assert.equal(model.subtotal,297000);assert.equal(model.shipping,30000);assert.equal(model.discount,27000);assert.equal(model.collected,100000);assert.equal(model.due,200000)
assert.throws(()=>slipModel(order,items,{...contact,shipping_fee:31000},finance,''));assert.throws(()=>slipModel(order,items,contact,{...finance,due:1},''))
const draftOrder={...order,version:7,discount:17000},draftContact={...contact,shipping_fee:45000}
const draftFinance=draftSlipFinance(draftOrder,items,draftContact,{orderId:order.id,orderVersion:7,version:4,credit:10000,netCollected:100000,adjustedTotal:300000,due:200000,refundDue:0})
assert.equal(draftFinance.originalTotal,325000,'Pending draft uses its own subtotal, shipping and discount')
assert.equal(draftFinance.adjustedTotal,315000,'Existing Cloud credit remains applied')
assert.equal(draftFinance.due,215000,'Current Cloud collections are reconciled against the pending draft')
const draftModel=slipModel(draftOrder,items,draftContact,draftFinance,'13/10/2026')
assert.equal(draftModel.discount,27000);assert.equal(draftModel.due,215000)
assert.throws(()=>draftSlipFinance({...draftOrder,discount:220000},items,{...draftContact,shipping_fee:0},{orderId:order.id,orderVersion:7,version:4,credit:0,netCollected:100000}),/thấp hơn tiền đã thu/)
assert.throws(()=>draftSlipFinance(draftOrder,items,draftContact,{orderId:order.id,orderVersion:6,version:4,credit:10000,netCollected:100000}),/Đơn đã thay đổi/);
assert.equal(slipDate('2026-10-12 18:00:00',new Date()),'13/10/2026');assert.equal(slipDate(undefined,new Date('2026-10-13T00:00:00Z')),'13/10/2026')
const text:string[]=[],draws:any[]=[]
const ctx:any={font:'',measureText(s:string){return {width:s.length*Number(this.font.match(/(\d+)px/)?.[1]||28)*0.6}},fillText(s:string){text.push(s)},drawImage(...args:any[]){draws.push(args)},fillRect(){},beginPath(){},moveTo(){},lineTo(){},quadraticCurveTo(){},closePath(){},fill(){},stroke(){}}
const canvas:any={getContext(){return ctx}},banner:any={width:1536,height:572},images:any[]=items.map(()=>({width:120,height:120}))
const normal=renderOrderSlip(canvas,banner,items,images,model,0,4,1,1)
assert.equal(normal.width,1080);assert.equal(normal.bannerHeight,402);assert.equal(normal.numberedTo,4)
assert(text.includes('-27.000 ₫'),'Discount is shown as a deduction on the exported slip')
assert(text.includes('297.000 ₫')&&text.includes('30.000 ₫')&&text.includes('100.000 ₫')&&text.includes('200.000 ₫'),'Other amounts retain their signs and values')
text.length=0;renderOrderSlip(canvas,banner,items,images,{...model,discount:0},0,4,1,1);assert(text.includes('0 ₫'));assert(!text.includes('-0 ₫'),'Zero discount has no minus sign')
for(const n of ['1','2','3','4'])assert(text.includes(n));assert(text.includes('Size 10 · 1 bộ'));assert(!text.some(t=>t.includes('Size Size')))
for(const paragraph of slipFooter)assert(text.join(' ').includes(paragraph))
for(const [source,,,w,h] of draws)assert(Math.abs(w/h-source.width/source.height)<0.01)
const long=renderOrderSlip(canvas,banner,[{...items[0],product_name:'Tên sản phẩm dài '.repeat(15)}],[images[0]],{...model,name:'Khách hàng '.repeat(30),address:'Địa chỉ dài '.repeat(60)},8,9,2,2)
assert.equal(long.numberedFrom,9);assert.equal(long.numberedTo,9);assert(text.includes('9'));assert(text.includes('9 bộ · Trang 2/2'));assert(long.height>normal.height)
const refund=slipModel(order,items,contact,{...finance,netCollected:350000,due:0,refundDue:50000},'13/10/2026');renderOrderSlip(canvas,banner,items,images,refund,0,4,1,1);assert(text.includes('Cần hoàn lại:'))
console.log('PASS order slip: money reconciliation, stale data rejection, Vietnam date, proportional images, 4-item numbering, long contact/name wrapping, cross-page numbering and refund visibility')

// No-op marker: retrigger the mobile PR preview workflow after its setup.

// Trigger the preview rebuild with the corrected Pages service-worker routing.
