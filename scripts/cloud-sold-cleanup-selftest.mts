import assert from 'node:assert/strict'
import {cleanupVerifiedSold,type CleanupIO} from '../apps/web/src/verifiedSoldCleanup.ts'
function fake(n=1){
 const state={enabled:true,role:'owner',instance:'fake',events:[] as string[],files:new Set(Array.from({length:n+1},(_,i)=>'fake-'+(i+1)+'.jpg')),assets:Array.from({length:n+1},(_,i)=>({image_id:i+1,object_path:'fake-'+(i+1)+'.jpg',ready:true,cleanup_requested:false,deleted_at:null as string|null})),units:Array.from({length:n},(_,i)=>({image_id:i+1,order_id:'fake-order-'+i})),corrupt:false,removeLost:false,finalizeLost:false,badPrepare:false,ack:new Set<string>()}
 const io:CleanupIO={
  health:async()=>({role:state.role,instance:state.instance,contract:1,schema:130}),state:async()=>({enabled:state.enabled,instance:'fake'}),assets:async()=>state.assets,units:async()=>state.units,check:async()=>{},
  reconcile:async orders=>{state.events.push('verify:'+orders.length);if(state.corrupt)throw Error('local archive corrupt');orders.forEach(o=>state.ack.add(o))},
  prepare:async ids=>{assert(ids.length<=100);assert(ids.every(id=>state.units.some(u=>u.image_id===id&&state.ack.has(u.order_id))));state.events.push('prepare:'+ids.length);ids.forEach(id=>state.assets.find(a=>a.image_id===id)!.cleanup_requested=true);return {images:ids.map(id=>({imageId:id,path:state.badPrepare?'WRONG':state.assets.find(a=>a.image_id===id)!.object_path}))}},
  remove:async paths=>{state.events.push('remove:'+paths.length);paths.forEach(p=>state.files.delete(p));if(state.removeLost){state.removeLost=false;throw Error('lost remove response')}},
  finalize:async ids=>{state.events.push('finalize:'+ids.length);const images=ids.map(id=>{const a=state.assets.find(a=>a.image_id===id)!;assert(!state.files.has(a.object_path));a.ready=false;a.deleted_at='fake-verified-time';return {imageId:id,path:a.object_path,deletedAt:a.deleted_at}});if(state.finalizeLost){state.finalizeLost=false;throw Error('lost finalize response')}return {images}}
 }
 return {state,io}
}
{
 const {state,io}=fake();assert.equal(await cleanupVerifiedSold(io),1);assert.deepEqual(state.events,['verify:1','prepare:1','remove:1','finalize:1']);assert(state.files.has('fake-2.jpg'),'Unsold photo must remain');assert.equal(await cleanupVerifiedSold(io),0,'Second sweep must not delete twice')
}
for(const mode of ['disabled','cashier','wrong-instance'] as const){const {state,io}=fake();if(mode==='disabled')state.enabled=false;if(mode==='cashier')state.role='cashier';if(mode==='wrong-instance')state.instance='wrong';if(mode==='wrong-instance')await assert.rejects(()=>cleanupVerifiedSold(io));else assert.equal(await cleanupVerifiedSold(io),0);assert.deepEqual(state.events,[]);assert.equal(state.files.size,2)}
{
 const {state,io}=fake();state.corrupt=true;await assert.rejects(()=>cleanupVerifiedSold(io),/corrupt/);assert.equal(state.files.size,2);assert.deepEqual(state.events,['verify:1']);state.corrupt=false;assert.equal(await cleanupVerifiedSold(io),1,'Retry only after successful local verification')
}
for(const lost of ['removeLost','finalizeLost'] as const){const {state,io}=fake();state[lost]=true;await assert.rejects(()=>cleanupVerifiedSold(io),/lost/);assert(!state.files.has('fake-1.jpg'));assert.equal(await cleanupVerifiedSold(io),lost==='removeLost'?1:0);assert(state.assets[0].deleted_at);assert(state.files.has('fake-2.jpg'))}
{
 const {state,io}=fake();state.badPrepare=true;await assert.rejects(()=>cleanupVerifiedSold(io),/khớp/);assert.equal(state.files.size,2);assert(!state.events.some(e=>e.startsWith('remove')))
}
{
 const {state,io}=fake();await assert.rejects(()=>cleanupVerifiedSold(io,[2]),/SOLD/);assert.equal(state.files.size,2);assert.deepEqual(state.events,[])
}
{
 const {state,io}=fake(205);assert.equal(await cleanupVerifiedSold(io),205);assert.deepEqual(state.events.filter(e=>e.startsWith('remove')),['remove:100','remove:100','remove:5']);assert(state.files.has('fake-206.jpg'))
}
{
 const {state,io}=fake();io.check=async()=>{throw Error('signed out')};await assert.rejects(()=>cleanupVerifiedSold(io),/signed out/);assert.equal(state.files.size,2);assert.deepEqual(state.events,[])
}
console.log('PASS automatic SOLD cleanup: fresh archive verification, owner/instance/activation guards, unsold retention, <=100 batches, malformed response, offline/signout, lost remove/finalize response and restart retry (fake data only)')
