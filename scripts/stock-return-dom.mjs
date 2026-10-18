import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {JSDOM} from 'jsdom'
const temporary=fs.mkdtempSync(path.resolve('.stock-return-dom-'))
const source=`import React,{act} from 'react';import {createRoot} from 'react-dom/client';import StockReturnPanel from '../apps/web/src/StockReturnPanel';
window.IS_REACT_ACT_ENVIRONMENT=true;
const a=window.test={writes:[],returned:false,lost:true,changes:0,syncs:0};window.addEventListener('mecacao-cloud-sync-now',()=>a.syncs++);
window.fetch=async(url,options)=>{
 let data;
 if(options?.method==='POST'){a.writes.push({key:options.headers['Idempotency-Key'],body:JSON.parse(options.body)});a.returned=true;if(a.lost){a.lost=false;throw Error('FAKE response lost after commit')}data={status:'RETURNED'}}
 else if(String(url).includes('/operations/'))data={status:a.returned?'RETURNED':'NOT_FOUND',quantity:1,recoveryRequired:false};
 else data={items:[{imageId:17,productName:'Bộ thử',size:'S',newImageId:a.returned?28:null}],recoveryRequired:false};
 return {ok:true,status:200,json:async()=>data};
};let root; a.act=act;a.mount=()=>{root=createRoot(document.getElementById('root'));root.render(<StockReturnPanel id="sold-order" onChanged={()=>{a.changes++}}/>)};a.unmount=()=>root.unmount();`
try{
 fs.writeFileSync(path.join(temporary,'entry.tsx'),source)
 const bundle=await build({entryPoints:[path.join(temporary,'entry.tsx')],bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"development"'},loader:{'.css':'empty'}})
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window;w.confirm=()=>true;w.MessageChannel=class{constructor(){this.port1={onmessage:null};this.port2={postMessage:()=>setTimeout(()=>this.port1.onmessage?.(),0)}}};w.eval(bundle.outputFiles[0].text)
 const a=w.test,act=async fn=>a.act(async()=>{fn?.();await new Promise(r=>setTimeout(r,25))})
 await act(a.mount);await act()
 await act(()=>w.document.querySelector('.stockReturnUnits input').click())
 await act(()=>{const i=w.document.querySelector('.stockReturnPanel input:not([type=checkbox])');Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(i,'Đã nhận hàng thật');i.dispatchEvent(new w.Event('input',{bubbles:true}))})
 const button=()=>[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Nhận lại 1 bộ vào kho')
 assert(button().disabled,'Physical receipt acknowledgement required')
 await act(()=>w.document.querySelector('.stockReturnAgree input').click());assert(!button().disabled)
 await act(()=>{button().click();button()?.click()});assert.equal(a.writes.length,1,'Immediate duplicate clicks send one operation')
 assert(w.document.querySelector('[role=alert]').textContent.includes('Kết quả chưa được xác nhận'));const saved=JSON.parse(w.localStorage.getItem('mecacao-stock-return:sold-order'));assert.equal(saved.key,a.writes[0].key);assert.deepEqual(saved.imageIds,[17]);assert.equal(a.syncs,0,'No success notification on uncertain response')
 await act(a.unmount);await act(a.mount);await act()
 assert.equal(a.writes.length,1,'Reopen inspects the same key; never POSTs again')
 assert(w.document.body.textContent.includes('Đã nhận lại 1 bộ tại laptop'));assert(w.document.querySelector('.stockReturnUnits input').disabled);assert.equal(a.changes,1);assert.equal(a.syncs,1);assert.equal(w.localStorage.getItem('mecacao-stock-return:sold-order'),null)
 await act(a.unmount);w.close()
 console.log('STOCK_RETURN_DOM PASS: physical receipt required, immediate duplicate clicks, lost response after commit, persisted original key, reopen status inspection, one sync notification and disabled returned unit')
}finally{fs.rmSync(temporary,{recursive:true,force:true})}
