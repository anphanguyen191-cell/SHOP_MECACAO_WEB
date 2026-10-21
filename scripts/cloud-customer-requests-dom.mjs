// Real React forms with isolated Cloud RPC: no network or shop data writes.
import assert from 'node:assert/strict'
import {webcrypto} from 'node:crypto'
import {build} from 'esbuild'
import {JSDOM} from 'jsdom'
const entry=`import React,{act} from 'react';import {createRoot} from 'react-dom/client';import CloudCustomers from './apps/web/src/CloudCustomers';import {cloud,retryCloudCommand} from './apps/web/src/cloudClient';
window.IS_REACT_ACT_ENVIRONMENT=true;const a=window.fixture={act,epoch:0,calls:[],requests:[],rows:[{id:'customer-one',version:1,name:'Khách cũ',phone:'0900000000',address:'Địa chỉ cũ',note:''},{id:'customer-two',version:1,name:'Khách khác',phone:'',address:'',note:''}]};const root=createRoot(document.getElementById('root'));
cloud.auth.getUser=async()=>({data:{user:{id:'fake-owner'}}});cloud.rpc=async(name,args)=>{if(name!=='mc_v8_local_customers'||args.p_action!=='request')throw Error('Unexpected write '+name);a.calls.push(args);let r=a.requests.find(r=>r.request_key===args.p_key);if(!r){r={request_key:args.p_key,customer_id:args.p_payload.id,payload:args.p_payload,state:'PENDING'};a.requests.push(r)}if(a.loseReply){a.loseReply=false;return {error:{message:'FAKE lost response',code:'NETWORK'}}}return {data:{queued:true,requestKey:r.request_key,customerId:r.customer_id,state:r.state}}};
a.mount=()=>root.render(<CloudCustomers key={a.epoch} rows={[...a.rows]} requests={[...a.requests]} editable onChanged={async()=>a.mount()}/>);a.remount=()=>{a.epoch++;a.mount()};a.retry=retryCloudCommand;a.unmount=()=>root.unmount();`;
const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"development"','import.meta.env.BASE_URL':'"/"'}});
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window;
Object.defineProperty(w,'crypto',{value:webcrypto});w.confirm=()=>true;w.MessageChannel=class{constructor(){this.port1={onmessage:null};this.port2={postMessage:()=>setTimeout(()=>this.port1.onmessage?.(),0)}}};
try{
 w.eval(bundle.outputFiles[0].text);const a=w.fixture,act=fn=>a.act(async()=>{await fn?.();await new Promise(r=>setTimeout(r,35))});
 const button=text=>[...w.document.querySelectorAll('button')].find(b=>b.textContent.trim()===text),click=async text=>{assert(button(text),text);await act(()=>button(text).click());await act()};
 const field=()=>w.document.querySelector('.contactCard fieldset input');
 const type=async value=>act(()=>{Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(field(),value);field().dispatchEvent(new w.Event('input',{bubbles:true}))});
 await act(a.mount);await act(()=>w.document.querySelector('.salesOrderRow').click());await type('Tên đang chờ');await click('Lưu khách hàng');
 assert(w.document.querySelector('.contactCard fieldset').disabled);assert(w.document.body.textContent.includes('chờ laptop'));assert(!w.document.body.textContent.includes('Đã lưu khách hàng'));assert.equal(a.rows[0].name,'Khách cũ');assert.equal(a.requests.length,1);
 const nav=new w.Event('mecacao-before-navigate',{cancelable:true});await act(()=>w.dispatchEvent(nav));assert(!nav.defaultPrevented,'accepted durable intent no longer counts as unsaved typing');
 await act(a.remount);await click('Tên đang chờ · Chờ laptop');assert.equal(field().value,'Tên đang chờ');assert(w.document.querySelector('.contactCard fieldset').disabled,'reload restores pending intent from Cloud');
 a.requests[0].state='CONFIRMED';a.requests[0].result={version:2,currentVersion:2};a.rows[0]={...a.rows[0],version:2,name:'Tên đang chờ'};await act(a.mount);await act();assert(!w.document.querySelector('.contactCard fieldset').disabled);assert(w.document.body.textContent.includes('Cloud đã xác nhận'));
 await type('Nội dung bị từ chối');await click('Lưu khách hàng');const rejected=a.requests.at(-1);rejected.state='REJECTED';rejected.error='Hồ sơ đã thay đổi tại laptop';a.rows[0]={...a.rows[0],version:3,name:'Tên mới trên laptop'};await act(a.mount);await act();assert.equal(field().value,'Nội dung bị từ chối','rejected input is retained');assert(!button('Lưu khách hàng').disabled);assert(w.document.querySelector('[role=alert]').textContent.includes('Laptop chưa lưu'));
 await act(()=>w.document.querySelector('.salesOrderRow').click());assert.equal(field().value,'Tên mới trên laptop');await type('Lượt tiếp theo');await click('Lưu khách hàng');const pending=a.requests.at(-1);
 await act(()=>w.document.querySelectorAll('.salesOrderRow')[1].click());pending.state='CONFIRMED';pending.result={version:4,currentVersion:5};a.rows[0]={...a.rows[0],name:'LOCAL sửa tiếp',version:5};await act(a.mount);await act();assert.equal(field().value,'Khách khác','background completion never replaces another selected customer');
 await click('+ Khách mới');await type('Khách mới mất phản hồi');a.loseReply=true;await click('Lưu khách hàng');assert(w.localStorage.getItem('mecacao-v7-pending-command'));assert(!w.document.body.textContent.includes('Đã lưu khách hàng'));
 const requestCount=a.requests.length;await act(async()=>{await a.retry();a.mount()});assert.equal(a.requests.length,requestCount,'retry uses the durable original ID and request key');assert.equal(w.localStorage.getItem('mecacao-v7-pending-command'),null);
 await act(a.remount);await click('Khách mới mất phản hồi · Chờ laptop');assert(w.document.querySelector('.contactCard fieldset').disabled);assert.equal(field().value,'Khách mới mất phản hồi');
 await act(a.unmount);console.log('PASS customer request DOM: no false success, pending lock/reload, confirmed profile, rejected input, current selection retained, durable lost-response retry, no direct Cloud customer writes');
}finally{w.close()}
