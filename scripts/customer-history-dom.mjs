// Real customer tabs and paging with isolated, explicitly keyed HTTP responses.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {JSDOM} from 'jsdom'
const temp=fs.mkdtempSync(path.join(process.cwd(),'.customer-history-dom-'))
try{
 fs.writeFileSync(path.join(temp,'entry.tsx'),`import React,{act} from 'react';import {createRoot} from 'react-dom/client';import CustomersView from '../apps/web/src/CustomersView';window.IS_REACT_ACT_ENVIRONMENT=true;window.fixture={calls:[],opened:''};const a=window.fixture;window.fetch=async url=>{a.calls.push(String(url));const offset=Number(new URL(url,location.href).searchParams.get('offset')||0);return {ok:true,status:200,json:async()=>({rows:[{id:'order-'+offset,status:'SOLD',quantity:1,payableTotal:50000,created_at:'2026-10-20'}],total:251,offset,summary:{soldOrders:251,receipts:100000,refunds:0,due:500000,refundDue:0}})}};const r=createRoot(document.getElementById('root'));a.act=act;a.mount=()=>r.render(<CustomersView sourceRows={[{id:'customer-exact-1',name:'Khách trùng tên',phone:'0900000000',address:'',note:''},{id:'customer-exact-2',name:'Khách trùng tên',phone:'0900000001',address:'',note:''}]} onOpenOrder={id=>a.opened=id}/>);a.unmount=()=>r.unmount();`)
 const bundle=await build({entryPoints:[path.join(temp,'entry.tsx')],bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"development"','import.meta.env.BASE_URL':'"/"'}})
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window;w.MessageChannel=class{constructor(){this.port1={onmessage:null};this.port2={postMessage:()=>setTimeout(()=>this.port1.onmessage?.(),0)}}};w.eval(bundle.outputFiles[0].text)
 const a=w.fixture,act=fn=>a.act(async()=>{fn?.();await new Promise(r=>setTimeout(r,40))})
 const click=async(label,scope=w.document)=>{const b=[...scope.querySelectorAll('button')].find(b=>b.textContent.trim()===label);assert(b,label);await act(()=>b.click());await act()}
 await act(a.mount);await act();await act(()=>w.document.querySelector('.salesOrderRow').click());await click('Lịch sử đơn')
 assert(a.calls.at(-1).includes('/customer-exact-1/history?offset=0'))
 const history=w.document.querySelector('.luxeCustomerLinked');assert(history.textContent.includes('500.000'));await click('Sau',history)
 assert(a.calls.at(-1).endsWith('offset=50'));assert(history.textContent.includes('500.000'),'debt total stays global while paging')
 await click('Mở đơn →',history);assert.equal(a.opened,'order-50')
 await click('Công nợ');assert(w.document.querySelector('.luxeCustomerLinked').textContent.includes('100.000'))
 await act(()=>w.document.querySelectorAll('.salesOrderRow')[1].click());await click('Lịch sử đơn');assert(a.calls.at(-1).includes('/customer-exact-2/history?offset=0'),'same names do not merge customer identities')
 await act(a.unmount);w.close();console.log('PASS customer history DOM: exact customer IDs, full-history debt totals, paging beyond 200, order navigation and same-name isolation')
}finally{fs.rmSync(temp,{recursive:true,force:true})}
