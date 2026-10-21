// Isolated RPC fixture: no network or business writes.
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {JSDOM} from 'jsdom'

const source=`import React,{act} from 'react';import {createRoot} from 'react-dom/client';import CloudDebts from './apps/web/src/CloudDebts';import {cloud} from './apps/web/src/cloudClient';
window.IS_REACT_ACT_ENVIRONMENT=true;
const summaries=[['018ce4b0',163000],['order-second',200000],['order-same-name',100000],['order-direct',50000],['order-missing',90000]].map(([orderId,due])=>({orderId,due,refundDue:0,method:'COD',delivery:'NEW'}));
const contacts=[{order_id:'018ce4b0',customer_id:'customer-1',recipient_name:'Thùy Trân',phone:'0900000001'}, {order_id:'order-second',customer_id:'customer-1',recipient_name:'Thùy Trân',phone:'0900000001'}, {order_id:'order-same-name',customer_id:'customer-2',recipient_name:'Thùy Trân',phone:'0900000002'}, {order_id:'order-direct',customer_id:null,recipient_name:'Người nhận trực tiếp',phone:'0900000003'}];
window.fixture={act,opened:'',calls:[],summaries,contacts};const a=window.fixture;
cloud.rpc=async(name)=>{a.calls.push(name);if(name!=='mc_v7_debts')throw Error('Unexpected RPC '+name);return {data:summaries}};
const root=createRoot(document.getElementById('root'));a.mount=()=>root.render(<CloudDebts contacts={a.contacts} refresh={a.contacts} onOpen={id=>a.opened=id}/>);a.unmount=()=>root.unmount();`;
const bundle=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"development"','import.meta.env.BASE_URL':'"/"'}});
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true});
const w=dom.window;
w.MessageChannel=class{constructor(){this.port1={onmessage:null};this.port2={postMessage:()=>setTimeout(()=>this.port1.onmessage?.(),0)}}};
try{
 w.eval(bundle.outputFiles[0].text);const a=w.fixture;
 const act=fn=>a.act(async()=>{fn?.();await new Promise(r=>setTimeout(r,40))});
 await act(a.mount);await act();
 let orders=[...w.document.querySelectorAll('.debtOrder')];
 assert(orders[0].textContent.includes('018CE4B0 · Thùy Trân'),'Cloud debt uses the exact order contact, not an empty finance-only summary');
 const groups=[...w.document.querySelectorAll('.debtCustomer')];
 assert.equal(groups.length,4,'same explicit customer ID groups; same name with different IDs stays separate');
 assert(groups[0].textContent.includes('Thùy Trân · 2 đơn'));assert(groups[0].textContent.includes('363.000'));
 assert(groups[1].textContent.includes('Thùy Trân · 1 đơn'));assert(groups[1].textContent.includes('100.000'));
 assert(orders[3].textContent.includes('Người nhận trực tiếp'));assert(orders[4].textContent.includes('Chưa chọn khách'),'missing contact is not guessed from another order');
 assert(w.document.querySelector('.financeMetrics').textContent.includes('603.000'),'financial totals are unchanged');
 assert(a.summaries.every(s=>!('customerId' in s)&&!('recipientName' in s)),'RPC summaries are not mutated');
 const input=w.document.querySelector('input');
 const search=async value=>{await act(()=>{Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new w.Event('input',{bubbles:true}))})};
 await search('0900000002');assert.equal(w.document.querySelectorAll('.debtOrder').length,1);
 await act(()=>w.document.querySelector('.debtOrder').click());assert.equal(a.opened,'order-same-name');
 await search('Thùy Trân');assert.equal(w.document.querySelectorAll('.debtOrder').length,3);
 await search('018ce4b0');assert.equal(w.document.querySelectorAll('.debtOrder').length,1);
 a.contacts=a.contacts.map(c=>c.order_id==='018ce4b0'?{...c,recipient_name:'Tên người nhận mới'}:c);
 await act(a.mount);await act();assert(w.document.querySelector('.debtOrder').textContent.includes('Tên người nhận mới'),'snapshot refresh updates the contact');
 a.contacts=[];await act(a.mount);await act();assert(w.document.querySelector('.debtOrder').textContent.includes('Chưa chọn khách'),'removed contacts do not retain stale identity');
 assert(a.calls.every(name=>name==='mc_v7_debts'),'read-only debt RPC only');
 await act(a.unmount);console.log('PASS Cloud debt contacts: exact order/customer IDs, grouping, same-name isolation, direct/missing recipient, search, navigation, refresh, immutable money and read-only RPC');
}finally{w.close()}
