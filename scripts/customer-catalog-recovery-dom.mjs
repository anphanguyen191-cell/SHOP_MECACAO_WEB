// Public guest component with isolated transport; no production inquiries or stock writes.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {JSDOM} from 'jsdom'
const temp=fs.mkdtempSync(path.join(process.cwd(),'.catalog-recovery-test-'))
const source=`import React,{act} from 'react';import {createRoot} from 'react-dom/client';import Catalog from '../apps/web/src/CustomerCatalog';
window.IS_REACT_ACT_ENVIRONMENT=true;
const a=window.fixture={calls:[],refresh:[],failPhotos:false,photoReads:0};
const products=Array.from({length:22},(_,i)=>({public_product_id:i+1,name:'Mẫu '+(i+1),public_code:'FIX'+(i+1),cover_image_id:i+1,stock_as_of:new Date().toISOString(),updated_at:'2026-10-18T00:00:00Z',sizes:[{variant_id:i+1,size_label:'8',sale_price:50000,available_count:5}]}));
window.setInterval=(fn,ms)=>{if(ms===30000)a.refresh.push(fn);return 0};
window.fetch=async(url,options={})=>{const u=new URL(url);a.calls.push({url:String(url),method:options.method||'GET'});let data={};let ok=true;
 if(options.method==='POST'){const body=JSON.parse(options.body);if(body.action!=='receipt')throw Error('Test must never submit a production inquiry');data={reference:'CC-RESTORED',status:'NEW'}}
 else if(u.searchParams.get('action')==='config')data={enabled:true,version:1,config:{}};
 else if(u.searchParams.get('action')==='products'){const id=Number(u.searchParams.get('product_id')),offset=Number(u.searchParams.get('offset')||0),rows=id?products.filter(p=>p.public_product_id===id):products.slice(offset,offset+20);data={products:rows,next_offset:offset+rows.length}}
 else if(u.searchParams.get('action')==='photos'){a.photoReads++;if(a.failPhotos){a.failPhotos=false;ok=false;data={error:'Ảnh tạm lỗi'}}else data={photos:[{id:1,variant_id:1},{id:2,variant_id:1}],next_offset:2}}
 return {ok,status:ok?200:503,json:async()=>data};
};
const root=createRoot(document.getElementById('root'));a.act=act;a.mount=()=>root.render(<Catalog/>);a.unmount=()=>root.unmount();`
try{
 fs.writeFileSync(path.join(temp,'entry.tsx'),source)
 const bundle=await build({entryPoints:[path.join(temp,'entry.tsx')],bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"development"','import.meta.env.BASE_URL':'"/"'}})
 async function setup({favorites=[],pending=null,blocked=false}={}){
  const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid/?catalog=1',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window
  w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{}
  w.MessageChannel=class{constructor(){this.port1={onmessage:null};this.port2={postMessage:()=>setTimeout(()=>this.port1.onmessage?.(),0)}}}
  w.localStorage.setItem('mecacao-customer-favorites-v1',JSON.stringify(favorites));if(pending)w.localStorage.setItem('mecacao-customer-submit-v1',JSON.stringify(pending))
  if(blocked)Object.defineProperty(w,'localStorage',{get(){throw new w.DOMException('Storage blocked','SecurityError')}})
  w.eval(bundle.outputFiles[0].text);const a=w.fixture
  const act=async(fn)=>a.act(async()=>{fn?.();await new Promise(r=>setTimeout(r,30))})
  async function until(test){for(let n=0;n<100;n++){if(test())return;await act()}throw Error('Guest UI did not settle: '+w.document.body.textContent)}
  async function click(label){const b=[...w.document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);assert(b,label);await act(()=>b.click())}
  await act(a.mount);await until(()=>w.document.querySelectorAll('.cc-product').length===20)
  return {w,a,act,until,click,close:async()=>{await act(a.unmount);w.close()}}
 }
 const guest=await setup({favorites:[22]});const {w,a,act,until,click}=guest
 await click('♡ Yêu thích');await until(()=>w.document.querySelector('.cc-product h3')?.textContent==='Mẫu 22')
 assert(a.calls.some(c=>new URL(c.url).searchParams.get('product_id')==='22'),'Wishlist retrieves saved public IDs beyond the first page')
 await act(()=>w.document.querySelector('.cc-filter-pills button').click());await until(()=>w.document.querySelectorAll('.cc-product').length===20)
 await click('Xem thêm mẫu');await until(()=>w.document.querySelectorAll('.cc-product').length===22)
 const calls=a.calls.length;await act(()=>a.refresh.forEach(fn=>fn()));await until(()=>a.calls.slice(calls).some(c=>new URL(c.url).searchParams.get('offset')==='20'))
 assert.equal(w.document.querySelectorAll('.cc-product').length,22,'Refresh preserves already loaded pages')
 a.failPhotos=true;await click('Xem mẫu');await until(()=>w.document.querySelector('[role=alert]')?.textContent.includes('Ảnh tạm lỗi'))
 await click('Thử lại');await until(()=>w.document.querySelectorAll('.cc-thumbnails button').length===2);assert.equal(a.photoReads,2,'Photo retry reloads the failed gallery without leaving the Product')
 await guest.close()
 const restored=await setup({pending:{token:'a'.repeat(64),payload:{items:[]},summary:'Bộ đã gửi · Size 8: 3 bộ · ảnh #42, #43'}})
 await restored.act(()=>restored.w.document.querySelector('.cc-cart-trigger').click());await restored.click('Kiểm tra lần gửi trước')
 await restored.until(()=>restored.w.document.querySelector('.cc-success')?.textContent.includes('CC-RESTORED'))
 assert(restored.w.document.querySelector('.cc-success .cc-copy-text').textContent.includes('ảnh #42, #43'),'Recovered receipt keeps the submitted summary even when the current cart is empty')
 assert.equal(restored.a.calls.filter(c=>c.method==='POST').length,1,'Recovery looks up the existing receipt instead of creating a second inquiry')
 await restored.close()
 const restricted=await setup({blocked:true});assert.equal(restricted.w.document.querySelectorAll('.cc-product').length,20,'Restricted storage does not crash the guest Catalog');await restricted.close()
 console.log('CATALOG_RECOVERY_DOM PASS: saved Product outside page one, retained pages on refresh, real gallery retry, restored receipt summary without resubmit, storage-restricted browsing')
}finally{fs.rmSync(temp,{recursive:true,force:true})}
