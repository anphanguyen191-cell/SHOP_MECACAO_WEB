// Real React screens with an isolated Windows transport. Never touches shop data.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {build} from 'esbuild'
import {JSDOM} from 'jsdom'
const temp=fs.mkdtempSync(path.join(process.cwd(),'.warehouse-ready-test-'))
try{
 fs.writeFileSync(path.join(temp,'entry.tsx'),`import React,{act} from 'react';import {createRoot} from 'react-dom/client';import Warehouse from '../apps/web/src/WarehouseImport';import Update from '../apps/web/src/WindowsUpdate';window.IS_REACT_ACT_ENVIRONMENT=true;const root=createRoot(document.getElementById('root'));window.fixture={ready:false,scans:[],healthError:false,changed:0,act,mount:()=>root.render(<Warehouse isDemo={false} onChanged={()=>window.fixture.changed++}/>),update:()=>root.render(<Update/>),unmount:()=>root.unmount()};`)
 const bundle=await build({entryPoints:[path.join(temp,'entry.tsx')],bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'isolated-windows',setup(b){
  b.onResolve({filter:/^\.\/taskClient$/},()=>({path:'tasks',namespace:'fixture'}))
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export async function runTask(url,payload,onUpdate){window.fixture.scans.push({url,payload});await new Promise(r=>setTimeout(r,5));return {rootPath:payload.rootPath,products:[],missing:[],summary:{products:0,sizes:0,images:0,registeredProducts:0,registeredSizes:0,registeredImages:0,newProducts:0,newSizes:0,pendingImages:0,missingImages:0},scannedAt:new Date().toISOString()}};export function clearConfirmedTask(){}`,loader:'js'}))
 }}]})
 function setup(){
  const dom=new JSDOM('<div id="root"></div>',{url:'http://127.0.0.1:3000',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window
  const originalTimeout=w.setTimeout.bind(w);w.setTimeout=(fn,ms,...args)=>originalTimeout(fn,ms===500?2:ms,...args)
  const originalInterval=w.setInterval.bind(w);w.setInterval=(fn,ms,...args)=>originalInterval(fn,ms===2000?20:ms,...args)
  w.MessageChannel=class{constructor(){this.port1={onmessage:null};this.port2={postMessage:()=>setTimeout(()=>this.port1.onmessage?.(),0)}}}
  w.eval(bundle.outputFiles[0].text)
  const state=w.fixture
  w.fetch=async url=>{let data;if(url==='/api/health'){if(state.healthError)throw Error('offline');data={writeReady:state.ready,freshDevelopment:true,warehouse:'D:\\1-Me CaCao Store',release:{sourceCommit:'fixture-commit'}}}else if(url==='/api/local/update')data={managed:true,active:'fixture-commit',state:{phase:'SUCCEEDED',message:'Đã cập nhật'}};else if(url==='/api/warehouse/settings')data={rootPath:'D:\\1-Me CaCao Store'};else if(url==='/api/tasks')data=[];else throw Error('Unexpected request '+url);return {ok:true,status:200,json:async()=>data}}
  const act=fn=>state.act(async()=>{fn?.();await new Promise(r=>setTimeout(r,10))})
  const until=async predicate=>{for(let n=0;n<150;n++){await act();if(predicate())return}assert.fail(w.document.body.textContent)}
  return {w,state,act,until,close:async()=>{await act(state.unmount);dom.window.close()}}
 }
 const first=setup();await first.act(first.state.mount)
 assert.equal(first.state.scans.length,0,'Opening Import before Windows is enabled must not POST a scan')
 assert(first.w.document.body.textContent.includes('Chờ sẵn sàng'))
 first.state.ready=true;await first.until(()=>first.state.scans.length===1&&!first.w.document.querySelector('.warehouseConfig').disabled)
 assert.equal(first.state.scans[0].payload.rootPath,'D:\\1-Me CaCao Store')
 await first.act(()=>{const button=[...first.w.document.querySelectorAll('button')].find(b=>b.textContent==='QUÉT KHO');button.click();button.click()})
 assert.equal(first.state.scans.length,2,'Double click starts exactly one manual scan')
 await first.close()
 const blocked=setup();await blocked.act(blocked.state.mount)
 await blocked.until(()=>!!blocked.w.document.querySelector('[role=alert]'))
 assert.equal(blocked.state.scans.length,0,'Persistent fence must never be bypassed')
 assert(blocked.w.document.body.textContent.includes('khay hệ thống'))
 assert(!blocked.w.document.querySelector('.warehouseConfig').disabled,'Timeout releases UI lock for retry')
 blocked.state.ready=true;await blocked.act(()=>[...blocked.w.document.querySelectorAll('button')].find(b=>b.textContent==='QUÉT KHO').click())
 await blocked.until(()=>blocked.state.scans.length===1)
 await blocked.close()
 const gone=setup();await gone.act(gone.state.mount);await gone.close();gone.state.ready=true
 await new Promise(r=>setTimeout(r,25));assert.equal(gone.state.scans.length,0,'Leaving screen cancels readiness wait')
 const offline=setup();offline.state.healthError=true;await offline.act(offline.state.mount);await offline.until(()=>!!offline.w.document.querySelector('[role=alert]'));assert.equal(offline.state.scans.length,0);assert(!offline.w.document.querySelector('.warehouseConfig').disabled);await offline.close()
 const update=setup();await update.act(update.state.update);await update.until(()=>!!update.w.document.querySelector('.inventoryActions'))
 const reopen=()=>[...update.w.document.querySelectorAll('button')].find(b=>b.textContent==='Mở giao diện mới')
 assert(reopen().disabled,'Matching release commit alone must not claim Windows is ready')
 assert(update.w.document.body.textContent.includes('vẫn khóa thao tác'))
 update.state.ready=true;await update.until(()=>!reopen().disabled);assert(update.w.document.body.textContent.includes('Windows đã sẵn sàng'))
 await update.close()
 console.log('WAREHOUSE_READINESS_DOM PASS: deferred startup scan, exactly-once manual retry, persistent fence retained, bounded wait/unmount/offline recovery and updater requires write readiness')
}finally{fs.rmSync(temp,{recursive:true,force:true})}
