// Real Cloud workspace/forms, isolated transport: never connects to shop data.
import assert from 'node:assert/strict'
import {webcrypto} from 'node:crypto'
import {build} from 'esbuild'
import {JSDOM} from 'jsdom'

const entry=`import React,{act} from 'react';import {createRoot} from 'react-dom/client';
import CloudWorkspace from './apps/web/src/CloudWorkspace';import {cloud} from './apps/web/src/cloudClient';
window.IS_REACT_ACT_ENVIRONMENT=true;
const a=window.fixture={act,calls:[],sequence:1,delayFinance:false,financeReplies:[],role:'owner'};
const orders=['order-a-fixture','order-b-fixture'].map(id=>({id,status:'SOLD',version:1,discount:0}));
const tables={sales_orders:orders,sales_confirmations:orders.map(o=>({order_id:o.id,version:1})),order_contacts:orders.map(o=>({order_id:o.id,recipient_name:o.id,customer_id:null,phone:''})),sales_order_images:orders.map((o,i)=>({order_id:o.id,image_id:i+1,product_name:'Test',unit_price:50000,size:'1'}))};
const finance=id=>({orderId:id,orderVersion:1,orderStatus:'SOLD',version:0,method:'COD',delivery:'NEW',tracking:'',adjustedTotal:50000,netCollected:0,due:50000,refundDue:0});
cloud.auth.getSession=async()=>({data:{session:{access_token:'fake',user:{id:'fake'}}}});
cloud.auth.getUser=async()=>({data:{user:{id:'fake'}}});
cloud.auth.onAuthStateChange=()=>({data:{subscription:{unsubscribe(){}}}});
cloud.channel=()=>{const c={on:()=>c,subscribe:()=>c};return c};cloud.removeChannel=async()=>{};
cloud.rpc=async(name,args)=>{a.calls.push({name,args});
 if(name==='mc_v7_health')return {data:{contract:1,schema:130,role:a.role,status:'CLOUD_TEST_READY',instance:'fake',sequence:a.sequence}};
 if(name==='mc_v7_rows'){const rows=tables[args.p_table]||[];return {data:{rows,nextOffset:rows.length}}}
 if(['mc_v8_local_sales','mc_v8_local_customers'].includes(name)&&args.p_action==='list')return {data:[]};
 if(name==='mc_v7_debts')return {data:orders.map(o=>finance(o.id))};
 if(name==='mc_v7_finance'){if(a.delayFinance)return new Promise(resolve=>a.financeReplies.push(()=>resolve({data:finance(args.p_id)})));return {data:finance(args.p_id)}}
 if(name==='mc_v7_report')return {data:{generatedAt:'2026-10-21T00:00:00Z',range:{from:'2026-10-01',to:'2026-10-21'},totals:Object.fromEntries(['orders','quantity','goodsTotal','receipts','refunds','netCash','dueNow','refundDueNow','grossMargin','subtotal','discount','shipping','payableTotal','credits'].map(k=>[k,0])),orders:[],products:[],entries:[]}};
 throw Error('Unexpected RPC '+name);
};
cloud.storage.from=()=>({createSignedUrls:async()=>({data:[]})});
window.fetch=async()=>{throw Error('Unexpected HTTP')};
const root=createRoot(document.getElementById('root'));a.mount=()=>root.render(<CloudWorkspace/>);a.unmount=()=>root.unmount();`;
const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"development"','import.meta.env.BASE_URL':'"/"','__APP_BUILD':'"fixture"'}});

async function setup(width=390,search='?cloud=1'){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://mobile.example/'+search,runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window;
 Object.defineProperty(w,'crypto',{value:webcrypto});w.innerWidth=width;
 w.matchMedia=()=>({matches:width<=800,addEventListener(){},removeEventListener(){}});
 w.scrollTo=()=>{};w.ResizeObserver=class{observe(){}disconnect(){}};w.confirm=()=>true;w.URL.createObjectURL=()=> 'blob:fake';w.URL.revokeObjectURL=()=>{};
 w.MessageChannel=class{constructor(){this.port1={onmessage:null};this.port2={postMessage:()=>setTimeout(()=>this.port1.onmessage?.(),0)}}};
 w.localStorage.setItem('mecacao-ui-cloud-auto-sync','false');w.eval(bundle.outputFiles[0].text);
 const a=w.fixture,act=fn=>a.act(async()=>{await fn?.();await new Promise(r=>setTimeout(r,30))});
 const click=async(label,scope=w.document)=>{const b=[...scope.querySelectorAll('button')].find(b=>b.textContent.trim()===label);assert(b,label);assert(!b.disabled,label+' enabled');await act(()=>b.click());await act()};
 const route=label=>click(label,w.document.querySelector('.sidebar'));
 const pick=async index=>{const b=w.document.querySelectorAll('.salesOrderRow')[index];assert(b);await act(()=>b.click());await act()};
 await act(a.mount);await act();
 return {w,a,act,click,route,pick,close:async()=>{await act(a.unmount);w.close()}};
}

for(const width of [375,390,430,768]){
 const t=await setup(width),{w,a,act,click,route,pick}=t;
 try{
  assert(w.document.querySelector('.mobileOverview'),'mobile starts at Overview');
  await route('Bán hàng');await pick(1);assert(w.document.querySelector('.mobileDetailOpen'));
  await route('Báo cáo');await route('Bán hàng');assert(!w.document.querySelector('.mobileDetailOpen'),'return to Sales starts at list');
  await pick(1);await route('Bán hàng');assert(!w.document.querySelector('.mobileDetailOpen'),'reselect active Sales tab starts at list');
  await pick(1);await click('Tiền / Công nợ');assert(w.document.querySelector('.financePanel'));
  assert.equal(a.calls.filter(c=>c.name==='mc_v7_finance').at(-1).args.p_id,'order-b-fixture');
  await click('‹ Tổng quan công nợ');assert(w.document.querySelector('.debtOrder'));assert(!w.document.querySelector('.financePanel'));
  await route('Bán hàng');await pick(0);const n=a.calls.filter(c=>c.name==='mc_v7_finance').length;
  await route('Công nợ');assert(w.document.querySelector('.debtOrder'));assert(!w.document.querySelector('.financePanel'));
  assert.equal(a.calls.filter(c=>c.name==='mc_v7_finance').length,n,'generic debts route never inherits sales selection');
  await act(()=>w.document.querySelectorAll('.debtOrder')[1].click());await act();assert(w.document.querySelector('.financePanel'));
  const amount=w.document.querySelector('.financePanel input[type=number]');
  await act(()=>{Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(amount,'1000');amount.dispatchEvent(new w.Event('input',{bubbles:true}))});
  await click('‹ Tổng quan công nợ');assert(w.document.querySelector('.financePanel'),'back preserves unsaved input');assert.equal(amount.value,'1000');
  await route('Bán hàng');assert(w.document.querySelector('.financePanel'),'tabs preserve unsaved input');
  await click('Bỏ thay đổi và đọc số mới');await click('‹ Tổng quan công nợ');assert(w.document.querySelector('.debtOrder'));
  // An old asynchronous read cannot reopen detail or overwrite another order.
  a.delayFinance=true;await act(()=>w.document.querySelector('.debtOrder').click());assert(!w.document.querySelector('.financePanel'));
  await click('‹ Tổng quan công nợ');await act(()=>w.document.querySelectorAll('.debtOrder')[1].click());
  assert(a.financeReplies.length>=2);await act(()=>a.financeReplies.splice(0,1)[0]());assert(!w.document.querySelector('.financePanel'),'old reply is ignored');
  await act(()=>a.financeReplies.splice(0).forEach(reply=>reply()));assert(w.document.querySelector('.financePanel'));
  assert(w.document.querySelector('.salesDraftPage').textContent.includes('Đơn ORDER-B-'));
  await click('‹ Tổng quan công nợ');assert(w.document.querySelector('.debtOrder'));
  // Notifications explicitly open the chosen order despite the generic tab reset.
  await act(()=>w.document.querySelector('.mobileStatusBell').click());await click('Đơn ORDER-B-Đã bán · xem lịch sử›');
  assert(w.document.querySelector('.mobileDetailOpen'));assert.equal(w.document.querySelector('.cloudOrder h3').textContent,'Đơn ORDER-B-');
  assert(a.calls.every(c=>['mc_v7_health','mc_v7_rows','mc_v7_finance','mc_v7_debts','mc_v7_report'].includes(c.name)||c.args?.p_action==='list'),'navigation only reads business data');
 }finally{await t.close()}
}
for(const width of [390,1280]){
 const t=await setup(width,'?cloud=1&order=order-b-fixture');
 try{assert.equal(t.w.document.querySelector('.cloudOrder h3').textContent,'Đơn ORDER-B-');await t.route('Báo cáo');assert(!new URL(t.w.location.href).searchParams.has('order'))}finally{await t.close()}
}
const desktop=await setup(1280);try{assert(!desktop.w.document.querySelector('.mobileOverview'));assert.equal(desktop.w.document.querySelector('.pageBreadcrumb strong').textContent,'Tồn kho')}finally{await desktop.close()}
console.log('PASS mobile Cloud navigation: Overview launch, Sales list/reset, independent debts/detail/back, unsaved input, delayed responses, notification/deep links and desktop initial view; 375/390/430/768px, read-only fake transport');
