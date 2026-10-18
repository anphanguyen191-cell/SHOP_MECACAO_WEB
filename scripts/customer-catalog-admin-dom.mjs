// Owner inbox integration with a fake Cloud transport. SQL permissions tested separately.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {JSDOM} from 'jsdom'
const temp=fs.mkdtempSync(path.join(process.cwd(),'.catalog-admin-test-'))
const source=`import React,{act} from 'react';import {createRoot} from 'react-dom/client';import Admin from '../apps/web/src/CustomerCatalogAdmin';import {cloud} from '../apps/web/src/cloudClient';
const state={role:'owner',commands:[],opened:'',drafted:false};window.fixture=state;window.IS_REACT_ACT_ENVIRONMENT=true;
const inquiry={id:'11111111-1111-4111-8111-111111111111',reference:'CC-FAKE',customer_name:'Fixture Guest',contact:'fixture@example.invalid',note:'',items:[{product_id:1,variant_id:1,name:'Fixture Product',size:'8',quick_quantity:1,selected_image_ids:[1],sale_price:50000}],status:'NEW',version:1,created_at:new Date().toISOString()};
cloud.rpc=async(name,args)=>{if(name==='mc_v7_health')return {data:{role:state.role},error:null};if(name==='mc_v7_rows'){const tables={products:[{id:1,name:'Fixture Product',product_code:'FIX1',status:'active'}],product_variants:[{id:1,product_id:1,size:'8',status:'active',sale_price:50000,sale_price_set:true}],product_images:[{id:1,product_id:1,variant_id:1},{id:2,product_id:1,variant_id:1}],cloud_image_assets:[{image_id:1,ready:true,source_present:true,object_path:'content-one.jpg'},{image_id:2,ready:true,source_present:true,object_path:'content-two.jpg'}]};const rows=tables[args.p_table]||[];return {data:{rows,nextOffset:rows.length},error:null}}if(args.p_action==='settings')return {data:{enabled:false,version:1,products:[],config:{guide:[],banner_url:'',size_image_url:'',zalo_url:'',messenger_url:''}},error:null};if(args.p_action==='inbox')return {data:[{...inquiry,status:state.drafted?'DRAFTED':'NEW'}],error:null};state.commands.push(args);if(args.p_action==='draft'){state.drafted=true;return {data:{id:inquiry.id},error:null}}return {data:{ok:true},error:null}};
cloud.storage.from=()=>({createSignedUrls:async(paths)=>({data:paths.map(path=>({path,signedUrl:'https://fixture.invalid/'+path})),error:null})});
const r=createRoot(document.getElementById('root'));state.act=act;state.mount=()=>r.render(<Admin onOrder={id=>state.opened=id}/>);state.unmount=()=>r.unmount();`
try{fs.writeFileSync(path.join(temp,'entry.tsx'),source);const bundle=await build({entryPoints:[path.join(temp,'entry.tsx')],bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"development"'}})
async function setup(role){const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid/?cloud=1',runScripts:'dangerously',pretendToBeVisual:true});const w=dom.window;w.confirm=()=>true;w.MessageChannel=class{constructor(){this.port1={onmessage:null};this.port2={postMessage:()=>setTimeout(()=>this.port1.onmessage?.(),0)}}};w.eval(bundle.outputFiles[0].text);const a=w.fixture;a.role=role;const act=async(fn)=>a.act(async()=>{fn?.();await new Promise(r=>setTimeout(r,30))});await act(a.mount);await act();return {w,a,act,close:async()=>{await act(a.unmount);w.close()}}}
const {w,a,act,close}=await setup('owner');async function click(label){const button=[...w.document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);assert(button,label);await act(()=>button.click())}
const search=w.document.querySelector('input[type=search]');assert(search);const setter=Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set;
await act(()=>{setter.call(search,'not-found');search.dispatchEvent(new w.Event('input',{bubbles:true}))});assert.equal(w.document.querySelectorAll('.cc-admin-list>button').length,0);
await act(()=>{setter.call(search,'CC-FAKE');search.dispatchEvent(new w.Event('input',{bubbles:true}))});assert.equal(w.document.querySelectorAll('.cc-admin-list>button').length,1);
const pick=w.document.querySelector('.cc-admin-list>button');assert(pick);await act(()=>pick.click());
assert.equal(w.document.querySelectorAll('.cc-admin-photos input').length,2);assert(w.document.querySelectorAll('.cc-admin-photos input')[0].checked);assert(w.document.querySelectorAll('.cc-admin-photos input')[0].disabled);assert(w.document.querySelector('img').src.endsWith('content-one.jpg'),'Asset object path, not canonical file path');
await act(()=>w.document.querySelectorAll('.cc-admin-photos input')[1].click());await click('Tạo đơn nháp · 2/2 bộ');assert.equal(a.commands[0].p_action,'draft');assert.deepEqual(Array.from(a.commands[0].p_payload.image_ids),[1,2]);assert.equal(a.opened,'11111111-1111-4111-8111-111111111111');assert(!a.commands.some(c=>c.p_action==='sale.confirm'));
await click('Banner & cấu hình');assert(w.document.body.textContent.includes('Catalog đã có sẵn hình ảnh & bảng Size'));
assert.equal(w.document.querySelectorAll('.cc-admin-presets img').length,2);assert.equal(w.document.querySelectorAll('.cc-admin-setup tbody tr').length,12);
assert([...w.document.querySelectorAll('.cc-admin-setup input[type=url]')].every(input=>input.closest('details')&&!input.closest('details').open),'URL fields optional and collapsed');
assert(w.document.querySelector('.cc-admin-presets img').src.endsWith('catalog-shop-banner.jpg'));
assert(!w.document.querySelector('.cc-admin-open input').checked,'Never open Catalog automatically');
await act(()=>w.document.querySelector('.cc-admin-open input').click());await click('Lưu cấu hình Catalog');
const saved=a.commands.find(c=>c.p_action==='configure');assert(saved);assert.equal(saved.p_payload.enabled,true);assert.equal(saved.p_payload.version,1);assert.equal(saved.p_payload.config.guide.length,12);assert(saved.p_payload.config.banner_url.endsWith('catalog-shop-banner.jpg'));assert(saved.p_payload.config.size_image_url.endsWith('catalog-shop-size.jpg'));assert.equal(saved.p_payload.config.zalo_url,'');
await close();
const nonOwner=await setup('cashier');assert(nonOwner.w.document.body.textContent.includes('Chỉ tài khoản chủ Shop'));assert.equal(nonOwner.w.document.querySelectorAll('.cc-admin-product').length,0);await nonOwner.close();console.log('CATALOG_ADMIN_DOM PASS: owner inbox, exact-photo preservation, quick allocation, asset-path URLs, CORE bridge payload, no SOLD and non-owner refusal')
}finally{fs.rmSync(temp,{recursive:true,force:true})}
