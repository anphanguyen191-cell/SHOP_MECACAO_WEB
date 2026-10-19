/** Serial runner: filesystem revisions remain pending on Windows until a verified
 * upload acknowledges them. Events received during an upload are never discarded. */
export function createLiveFolderSync(options:{online:()=>boolean;busy:()=>boolean;read:()=>Promise<any>;sync:()=>Promise<unknown>;onState:(state:any)=>void;onError:(message:string)=>void;clock?:()=>number}){
 const clock=options.clock??Date.now
 let queued=true,running=false,closed=false,nextAttempt=0,backoff=1000,lastFallback=clock(),requests=0,lastBusiness=''
 async function tick(){
  if(closed||running||!options.online())return
  running=true
  const started=requests
  try{
   const state=await options.read();if(closed)return;options.onState(state.live)
   if(state.business){const revision=JSON.stringify([state.business.epoch,state.business.revision]);if(revision!==lastBusiness){lastBusiness=revision;queued=true}}
   if(state.live?.pendingSync)queued=true
   if(clock()-lastFallback>=300000){queued=true;lastFallback=clock()}
   if(!queued||!(state.syncEnabled??state.enabled)||options.busy()||clock()<nextAttempt)return
   if(state.live&&!state.live.ready)return
   queued=false
   const success=await options.sync()
   if(success===false){queued=true;nextAttempt=requests>started?0:clock()+backoff;backoff=Math.min(backoff*2,30000)}else{backoff=1000;nextAttempt=0}
  }catch(e){queued=true;nextAttempt=clock()+backoff;backoff=Math.min(backoff*2,30000);if(!closed)options.onError((e as Error).message)}
  finally{running=false;if(!closed&&queued&&requests>started&&nextAttempt===0&&options.online()&&!options.busy())queueMicrotask(()=>void tick())}
 }
 return {tick,request:()=>{requests++;queued=true;nextAttempt=0;void tick()},close:()=>{closed=true},pending:()=>queued}
}
