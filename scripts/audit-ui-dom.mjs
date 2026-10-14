// React effect/event regression with FAKE transports; not Safari/layout acceptance.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {JSDOM} from 'jsdom'
const root=process.cwd(),temp=fs.mkdtempSync(path.join(root,'.audit-dom-'))
const source=`import React,{act} from 'react';import {createRoot} from 'react-dom/client';import CloudWorkspace from '../apps/web/src/CloudWorkspace';import {cloud} from '../apps/web/src/cloudClient';
const a={signs:0,health:0,prices:0,role:'owner',timers:[],commands:[],sequence:0};window.audit=a;window.IS_REACT_ACT_ENVIRONMENT=true;window.ResizeObserver=class{observe(){}disconnect(){}};
const interval=window.setInterval.bind(window);window.setInterval=(fn,ms,...args)=>{if(ms===60000)a.timers.push(fn);return interval(fn,ms,...args)};
cloud.auth.getSession=async()=>({data:{session:{user:{id:'fake-user'},access_token:'fake'}},error:null});cloud.auth.getUser=async()=>({data:{user:{id:'fake-user'}},error:null});cloud.auth.onAuthStateChange=()=>({data:{subscription:{unsubscribe(){}}}});cloud.channel=()=>{const c={on:()=>c,subscribe:()=>c};return c};cloud.removeChannel=async()=> 'ok';
const tables={products:[{id:1,product_code:'FAKE',name:'FAKE sản phẩm',status:'active',category_id:1}],categories:[{id:1,name:'FAKE danh mục'}],product_variants:[{id:1,product_id:1,sku:'FAKE-S1',size:'Size 1',status:'active',sale_price:50000,cost_price:10000}],product_images:[{id:1,product_id:1,variant_id:1}],cloud_image_assets:[{image_id:1,ready:true,object_path:'fake.jpg'}],sales_orders:[{id:'fake-other-order',version:1,status:'DRAFT',discount:0}],sales_order_images:[{order_id:'fake-other-order',image_id:1,product_name:'FAKE sản phẩm',product_code:'FAKE',size:'Size 1',unit_price:50000}]};
cloud.rpc=async(name,args)=>{if(name==='mc_v7_health'){a.health++;return {data:{contract:1,schema:130,sequence:a.sequence,role:a.role,status:'CLOUD_TEST_READY',instance:'fake'},error:null}}if(name==='mc_v7_command'&&args.p_action==='draft.save'){a.commands.push(args.p_payload);if(!args.p_payload.acknowledgeDraftConflict)return {data:null,error:{message:'CLOUD_DRAFT_CONFLICT',code:'P0001'}};tables.sales_orders.push({id:args.p_payload.id,status:'DRAFT',version:1,discount:0});a.sequence++;return {data:{id:args.p_payload.id,version:1},error:null}}return {data:{rows:tables[args?.p_table]||[],nextOffset:(tables[args?.p_table]||[]).length},error:null}};
cloud.storage.from=()=>({createSignedUrls:async(paths)=>{a.signs++;return {data:paths.map(path=>({path,signedUrl:'https://example.invalid/'+path+'?v='+a.signs})),error:null}}});
window.fetch=async(url)=>String(url).includes('/api/cloud/prices')?(a.prices++,{ok:false,status:409,json:async()=>({error:'FAKE OWNER_REQUIRED'})}):{ok:true,status:200,json:async()=>({enabled:true,instance:'fake',reconciled:[]})};
const r=createRoot(document.getElementById('root'));a.act=act;a.mount=()=>r.render(<CloudWorkspace/>);a.unmount=()=>r.unmount();`
try{
 fs.writeFileSync(path.join(temp,'entry.tsx'),source)
 const bundle=await build({entryPoints:[path.join(temp,'entry.tsx')],bundle:true,write:false,format:'iife',platform:'browser',define:{'import.meta.env.BASE_URL':'"/"','process.env.NODE_ENV':'"development"','__APP_BUILD':'"fixture"'},loader:{'.css':'empty'}})
 const wait=()=>new Promise(r=>setTimeout(r,30))
 async function setup(url,role='owner'){
  const dom=new JSDOM('<div id="root"></div>',{url,runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window;w.confirm=()=>true;w.MessageChannel=class{constructor(){this.port1={onmessage:null};this.port2={postMessage:()=>setTimeout(()=>this.port1.onmessage?.(),0)}}};w.localStorage.setItem('mecacao-ui-cloud-auto-sync','false');w.eval(bundle.outputFiles[0].text);const a=w.audit;a.role=role;const act=async(fn)=>a.act(async()=>{fn?.();await wait()});await act(a.mount);await act();return {dom,w,a,act,close:async()=>{await act(a.unmount);w.close()}}
 }
 const {w,a,act,close}=await setup('https://audit.example/?cloud=1')
 async function click(label){const b=[...w.document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);assert(b,label);await act(()=>b.click())}
 assert.equal(a.signs,1);const realNow=w.Date.now;w.Date.now=()=>realNow()+31*60*1000;await act(()=>{a.timers.forEach(fn=>fn());w.document.dispatchEvent(new w.Event('visibilitychange'))});assert(a.signs>=2,'Expired URLs renew without a snapshot change');w.Date.now=realNow
 await click('Khách hàng');const input=w.document.querySelector('.contactCard fieldset input');await act(()=>{Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(input,'FAKE chưa lưu');input.dispatchEvent(new w.Event('input',{bubbles:true}))});await click('Tồn kho');assert(w.document.querySelector('.contactCard'),'Unsaved customer blocks menu navigation');assert.equal(input.value,'FAKE chưa lưu');const unload=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(unload);assert(unload.defaultPrevented,'Reload/close warning for unsaved customer');await click('＋ Khách mới');await click('Tồn kho');assert(w.document.querySelector('.inventoryPage'))
 await act(()=>w.document.querySelector('.treeProductHead').click());await act(()=>w.document.querySelector('.treeVariantHead').click());await act(()=>w.document.querySelector('.stockImageSelect').click());await click('TẠO ĐƠN NHÁP');assert(w.document.querySelector('[role=alertdialog]'),'Cloud conflict lists existing draft');await click('Vẫn thêm vào đơn nháp');assert.equal(a.commands.length,2);assert.equal(a.commands[0].acknowledgeDraftConflict,false);assert.equal(a.commands[1].acknowledgeDraftConflict,true);await close()
 for(const role of ['cashier','inventory','viewer']){const test=await setup('http://localhost/?cloud=1',role);assert(test.w.document.querySelector('.treeProductHead'),role+' can read the Cloud snapshot');assert.equal(test.a.prices,0,'Non-owner never calls owner-only price reconciliation');assert(!test.w.document.body.textContent.includes('FAKE OWNER_REQUIRED'));await test.close()}
 console.log('PASS audit React/DOM: expiry without changes, customer navigation/reload, explicit draft conflict confirmation and all non-owner Windows read roles')
}finally{fs.rmSync(temp,{recursive:true,force:true})}
