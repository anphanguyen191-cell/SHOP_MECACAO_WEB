import fs from 'node:fs'
import path from 'node:path'
import {createHash,randomUUID} from 'node:crypto'

export const STAGING_LAB='.mecacao-v2-recovery-lab'
type Entry={canonical:string;staged:string;sha256:string}
type Plan={format:1;id:string;files:Entry[]}
export type CommitDecision='UNCOMMITTED'|'COMMITTED'|'AMBIGUOUS'
const digest=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
function inside(root:string,p:string){const r=path.relative(root,p);return !!r&&!path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep)}
function syncDir(p:string){try{const fd=fs.openSync(p,'r');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}catch(e){if(process.platform!=='win32')throw e}}
function safeFile(p:string,root:string,sha?:string){const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||!inside(root,fs.realpathSync(p))||(sha&&digest(p)!==sha))throw Error('Staging lab file is unsafe or changed; manual review required');return s}
/** Prototype only: accepts cloned files exclusively under an isolated recovery lab, never shop warehouse paths. */
export function salesStagingLab(sandboxRoot:string){
 const root=fs.realpathSync(sandboxRoot),lab=path.join(root,STAGING_LAB),warehouse=path.join(lab,'warehouse'),stageRoot=path.join(lab,'staged')
 function safeParent(p:string,area:string){if(!inside(area,p)||fs.realpathSync(path.dirname(p))!==path.dirname(p))throw Error('Unsafe staging lab path')}
 function validate(plan:Plan){
  if(plan.format!==1||typeof plan.id!=='string'||!/^[a-f0-9-]{36}$/.test(plan.id)||!Array.isArray(plan.files)||!plan.files.length||plan.files.length>100)throw Error('Invalid staging lab journal')
  const known=new Set<string>()
  for(const e of plan.files){if(!e||!Number.isInteger(e.sha256?.length)||!/^[a-f0-9]{64}$/.test(e.sha256))throw Error('Invalid staging lab entry');for(const [p,area] of [[e.canonical,warehouse],[e.staged,stageRoot]] as const){if(typeof p!=='string'||path.resolve(p)!==p||known.has(p.toLowerCase()))throw Error('Repeated/invalid lab path');safeParent(p,area);known.add(p.toLowerCase())}}
 }
 function mark(id:string){return path.join(lab,id+'.json')}
 function preflight(plan:Plan){
  validate(plan)
  return plan.files.map(e=>{
   const a=fs.existsSync(e.canonical)?safeFile(e.canonical,warehouse,e.sha256):null,b=fs.existsSync(e.staged)?safeFile(e.staged,stageRoot,e.sha256):null
   if(!a&&!b)throw Error('Missing original and staged clone; manual review required')
   if(a&&b&&(a.dev!==b.dev||a.ino!==b.ino))throw Error('Ambiguous two copies; manual review required')
   return {e,a,b}
  })
 }
 return {
  plan(files:string[]){
   if(!fs.existsSync(warehouse)||fs.realpathSync(warehouse)!==warehouse)throw Error('Recovery lab must be created separately with cloned originals')
   if(!files.length||files.length>100||new Set(files).size!==files.length)throw Error('Invalid staging lab selection')
   if(!fs.existsSync(stageRoot))fs.mkdirSync(stageRoot);if(fs.realpathSync(stageRoot)!==stageRoot)throw Error('Unsafe staging root')
   const id=randomUUID(),items=files.map((canonical,n)=>{safeParent(canonical,warehouse);const st=safeFile(canonical,warehouse);if(st.dev!==fs.statSync(stageRoot).dev)throw Error('Staging must share the same volume; no cross-volume fallback');return {canonical,staged:path.join(stageRoot,id+'-'+n+'.original'),sha256:digest(canonical)}}),plan:Plan={format:1,id,files:items}
   validate(plan);const fd=fs.openSync(mark(id),'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(plan));fs.fsyncSync(fd)}finally{fs.closeSync(fd)};syncDir(lab);return plan
  },
  stage(plan:Plan,checkpoint:(point:string)=>void=()=>{}){
   const states=preflight(plan);if(states.some(s=>!s.a||s.b))throw Error('Lab staging is not in a pristine state')
   for(let n=0;n<plan.files.length;n++){
    const e=plan.files[n];safeFile(e.canonical,warehouse,e.sha256);safeParent(e.staged,stageRoot)
    // Hard link + unlink provides same-volume movement without overwriting any destination.
    fs.linkSync(e.canonical,e.staged);syncDir(stageRoot);checkpoint('linked:'+n)
    safeFile(e.staged,stageRoot,e.sha256);fs.unlinkSync(e.canonical);syncDir(path.dirname(e.canonical));checkpoint('staged:'+n)
   }
  },
  recover(id:string,decision:CommitDecision,checkpoint:(point:string)=>void=()=>{}){
   if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid lab operation ID')
   const file=mark(id);safeFile(file,lab);const plan=JSON.parse(fs.readFileSync(file,'utf8')) as Plan
   if(plan.id!==id)throw Error('Journal operation mismatch')
   if(!['UNCOMMITTED','COMMITTED','AMBIGUOUS'].includes(decision))throw Error('Unknown commit decision; no file changes allowed')
   if(decision==='AMBIGUOUS')throw Error('Database decision is ambiguous; no file changes allowed')
   const states=preflight(plan)
   if(decision==='COMMITTED'){
    if(states.some(s=>s.a||!s.b))throw Error('Committed lab state conflicts with original locations; manual review required')
    // Retain staged originals: prototype does not implement deletion after sale.
    return {status:'COMMITTED_RETAINED',originalsRetained:states.length}
   }
   for(let n=0;n<states.length;n++){
    const {e,a,b}=states[n]
    if(!a&&b){safeParent(e.canonical,warehouse);safeFile(e.staged,stageRoot,e.sha256);fs.linkSync(e.staged,e.canonical);syncDir(path.dirname(e.canonical));checkpoint('restored-link:'+n)}
    if(b){const current=fs.lstatSync(e.canonical),staged=fs.lstatSync(e.staged);if(current.dev!==staged.dev||current.ino!==staged.ino)throw Error('Concurrent lab edit detected');safeFile(e.canonical,warehouse,e.sha256);fs.unlinkSync(e.staged);syncDir(stageRoot)}
    checkpoint('restored:'+n)
   }
   for(const e of plan.files)safeFile(e.canonical,warehouse,e.sha256)
   // Keep journal for audit/repeat recovery; idempotent recovery sees canonical-only state.
   return {status:'RESTORED',originalsRetained:states.length}
  }
 }
}
