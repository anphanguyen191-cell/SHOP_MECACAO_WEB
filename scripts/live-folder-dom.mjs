// Actual CloudSettings React pipeline, with isolated Windows/Cloud transports.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {webcrypto,createHash} from 'node:crypto'
import {build} from 'esbuild'
import {JSDOM} from 'jsdom'
const temp=fs.mkdtempSync(path.resolve('.live-folder-dom-'))
const bytes=new Uint8Array([1,2,3]),sha=createHash('sha256').update(bytes).digest('hex')
const entry=`import React,{act} from 'react';import {createRoot} from 'react-dom/client';import CloudSettings from '../apps/web/src/CloudSettings';import {cloud} from '../apps/web/src/cloudClient';
window.IS_REACT_ACT_ENVIRONMENT=true;
window.MessageChannel=class{constructor(){this.port1={onmessage:null};this.port2={postMessage:()=>setTimeout(()=>this.port1.onmessage?.(),0)}}};
const a=window.audit={revision:1,ack:0,present:[1],images:[{id:1,product_id:1,variant_id:1}],acks:[],tables:{products:[],product_variants:[],product_images:[],cloud_image_assets:[],inventory_transactions:[]},calls:[],ticks:[],blockId:0,release:()=>{},online:true,mobileStock:[],uploads:[]};
const interval=window.setInterval.bind(window);window.setInterval=(fn,ms)=>{if(ms===1000)a.ticks.push(fn);return interval(fn,ms===1000?100000:ms)};
Object.defineProperty(navigator,'onLine',{get:()=>a.online});
cloud.auth.getSession=async()=>({data:{session:{user:{id:'fake-owner'},access_token:'fake'}}});cloud.auth.onAuthStateChange=()=>({data:{subscription:{unsubscribe(){}}}});
const upsert=(table,row)=>{const list=a.tables[table]||=[];const key=table==='cloud_image_assets'?'image_id':'id',old=list.findIndex(x=>x[key]===row[key]);if(old>=0)list[old]=row;else list.push(row)};
cloud.rpc=async(name,args)=>{
 a.calls.push({name,args});let result={};
 if(name==='mc_v7_health')result={contract:1,schema:130,role:'owner',instance:'fake',status:'CLOUD_TEST_READY'};
 else if(name==='mc_v7_rows'){const start=Number(args.p_after||0),rows=(a.tables[args.p_table]||[]).slice(start,start+200);result={rows,nextOffset:start+rows.length}}
 else if(name==='mc_v7_catalog'){for(const [table,rows] of Object.entries(args.p_payload)){const target={products:'products',variants:'product_variants',images:'product_images',categories:'categories'}[table];for(const r of rows)upsert(target,r)}}
 else if(name==='mc_v8_catalog_variants')for(const row of args.p_rows)upsert('product_variants',row);
 else if(name==='mc_v7_ledger')for(const row of args.p_rows)upsert('inventory_transactions',row);
 else if(name==='mc_v8_reuse_image')result={reused:false,ready:false};
 else if(name==='mc_v7_image')upsert('cloud_image_assets',{image_id:args.p_image,ready:true,source_present:true,sha256:args.p_sha,object_path:'v7/fake/'+args.p_image+'.jpg'});
 else if(name==='mc_v7_presence'){for(const p of args.p_images){const asset=a.tables.cloud_image_assets.find(i=>i.image_id===p.id);if(asset)asset.source_present=p.present}a.mobileStock.push(a.tables.cloud_image_assets.filter(i=>i.ready&&i.source_present!==false).length)}
 else if(name==='mc_v8_stock_integrity')result={ready:a.tables.cloud_image_assets.filter(i=>i.ready&&i.source_present!==false).length,missingOrInvalidFiles:0,sharedActivePaths:0,invalidHashes:0};
 return {data:result,error:null};
};
cloud.storage.from=()=>({upload:async(path,data)=>{a.uploads.push(path);if(a.blockId&&path.endsWith('/'+a.blockId+'.jpg')){a.blockId=0;await new Promise(r=>a.release=r)}return {error:null}},download:async()=>({data:{arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer},error:null}),remove:async()=>({error:null})});
window.fetch=async(url,options)=>{
 const route=String(url);let data={};
 if(route==='/api/cloud/state')data={enabled:true,instance:'fake',reconciled:[],live:{ready:true,phase:'READY',revision:a.revision,acknowledged:a.ack,pendingSync:a.ack<a.revision}};
 else if(route.includes('/catalog'))data={instance:'fake',products:[{id:1,name:'Test',product_code:'P1'}],variants:[{id:1,product_id:1,sku:'P1-S',size:'S'}],categories:[],images:a.images.map(i=>({...i})),transactions:a.images.map(i=>({id:i.id,variant_id:1,transaction_type:'IMPORT',quantity:1})),sourceState:a.images.map(i=>({id:i.id,present:a.present.includes(i.id)})),sourceGuard:{revision:a.revision,healthy:true,allMissingConfirmed:true},done:true};
 else if(route.includes('/images/'))return {ok:true,status:200,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer,headers:{get:()=>${JSON.stringify(sha)}}};
 else if(route==='/api/cloud/live/ack'){const r=JSON.parse(options.body).revision;a.ack=Math.max(a.ack,r);a.acks.push(r);data={revision:a.revision,acknowledged:a.ack}}
 else if(route==='/api/health')data={release:{stage:8},customWarehouse:true};
 return {ok:true,status:200,json:async()=>data};
};
const root=createRoot(document.getElementById('root'));a.act=act;a.mount=()=>root.render(<CloudSettings desktop autoSync/>);a.unmount=()=>root.unmount();`
try{
 fs.writeFileSync(path.join(temp,'entry.tsx'),entry)
 const bundle=await build({entryPoints:[path.join(temp,'entry.tsx')],bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"development"','import.meta.env.BASE_URL':'"/"','__APP_BUILD':'"fixture"'}})
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window;Object.defineProperty(w,'crypto',{value:webcrypto});w.TextEncoder=TextEncoder;w.eval(bundle.outputFiles[0].text)
 const a=w.audit,act=async fn=>a.act(async()=>{fn?.();await new Promise(r=>setTimeout(r,60))}),until=async check=>{for(let i=0;i<30&&!check();i++)await act();assert(check(),'React sync wait timed out: '+w.document.body.textContent+' · '+JSON.stringify(a.calls.slice(-4)))}
 await act(a.mount);await until(()=>a.ack===1);assert.equal(a.tables.cloud_image_assets.length,1,'Initial automatic upload; no manual sync click')
 a.revision=2;a.images.push({id:2,product_id:1,variant_id:1});a.present.push(2);a.blockId=2
 await act(()=>a.ticks.forEach(fn=>fn()));await until(()=>a.uploads.includes('v7/fake/2.jpg'))
 a.revision=3;a.images.push({id:3,product_id:1,variant_id:1});a.present.push(3);await act(()=>w.dispatchEvent(new w.Event('mecacao-cloud-sync-now')));await act(()=>a.release())
 assert(!a.acks.includes(2),'Changing folder during upload must not acknowledge an obsolete snapshot')
 await until(()=>a.ack===3)
 assert.equal(a.tables.cloud_image_assets.filter(i=>i.ready&&i.source_present!==false).length,3,'Queued upload catches the newest revision')
 assert.equal(a.uploads.filter(p=>p==='v7/fake/2.jpg').length,1,'Completed file not uploaded twice on retry')
 a.revision=4;a.present=[];a.online=false;await act(()=>a.ticks.forEach(fn=>fn()));assert.equal(a.ack,3,'Offline changes remain pending')
 a.online=true;await act(()=>w.dispatchEvent(new w.Event('online')));await until(()=>a.ack===4)
 assert.equal(a.tables.cloud_image_assets.filter(i=>i.ready&&i.source_present!==false).length,0,'Confirmed empty folder withdraws stock, preserving historical IDs')
 assert(a.mobileStock.includes(0),'Cloud event consumer sees empty stock');assert.equal(a.tables.product_images.length,3);assert.equal(a.tables.inventory_transactions.length,3)
 await act(a.unmount);w.close()
 console.log('LIVE_FOLDER_DOM PASS: automatic upload without clicks, folder change during upload, stale revision not acknowledged, verified retry without duplicate upload, offline pending and reconnect, empty-stock withdrawal with retained history; isolated transports')
}finally{fs.rmSync(temp,{recursive:true,force:true})}
