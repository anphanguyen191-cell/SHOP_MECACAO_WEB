import fs from 'node:fs'
import path from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {execFileSync} from 'node:child_process'
const MARKER='.mecacao-local-active.json',LOCK='.mecacao-local-runtime.lock'
function contents(file:string){
 if(fs.realpathSync(file)!==file||!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())throw Error('Dấu kho không phải file vật lý an toàn; không ghi đè liên kết hoặc thư mục')
 return fs.readFileSync(file)
}
function read(file:string){
 if(!fs.existsSync(file))return null
 const bytes=contents(file)
 try{return JSON.parse(bytes.toString().replace(/^\uFEFF/,''))}catch{return null}
}
function own(home:string,root:string){return {format:8,home,warehouse:root,database:path.join(home,'data','shop-v8','database','shop-v8.db')}}
type Ownership='NEW'|'OWN'|'LEGACY'|'ORPHAN'|'ORPHAN_UNVERIFIED'
// A live PID alone is not evidence: Windows reuses PIDs. Only block a V8
// writer when its runtime lock AND live command line identify that installation.
export function verifiedV8Writer(database:unknown,lock:any){
 if(typeof database!=='string'||!path.isAbsolute(database)||lock?.database!==database||!Number.isSafeInteger(lock?.pid)||lock.pid<=0||lock.pid===process.pid)return false
 const home=path.resolve(database,'../../../..')
 if(database!==own(home,'').database)return false
 try{
  process.kill(lock.pid,0)
  const command=process.platform==='win32'
   ?execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',`(Get-CimInstance Win32_Process -Filter "ProcessId = ${lock.pid}").CommandLine`],{encoding:'utf8',windowsHide:true,timeout:20000})
   :fs.readFileSync(`/proc/${lock.pid}/cmdline`,'utf8').replace(/\0/g,' ')
  const normalized=command.replace(/\\/g,'/').toLowerCase()
  const prefix=path.join(home,'releases').replace(/\\/g,'/').toLowerCase()+'/'
  return normalized.includes(prefix)&&/\/apps\/api\/dist\/server\.js(?:["\s]|$)/.test(normalized)
 }catch{return false}
}
function assertNoOtherWriter(root:string,home:string,owner:any,photoLock:any){
 const candidates=new Set<string>()
 if(typeof owner?.database==='string')candidates.add(owner.database)
 if(typeof photoLock?.database==='string')candidates.add(photoLock.database)
 for(const database of candidates){
  if(!path.isAbsolute(database)||database===own(home,root).database)continue
  const runtime=path.join(path.dirname(path.dirname(database)),LOCK)
  // Do not interpret a marker path as authority to write any other DB.
  const lock=read(runtime)
  if(verifiedV8Writer(database,lock)||verifiedV8Writer(database,photoLock))
   throw Error(`Một tiến trình V8 đã xác minh đang sử dụng kho (PID ${lock?.pid??photoLock?.pid}, database ${database}). Thoát bản V8 đó rồi tiếp nhận lại; ảnh và database được giữ nguyên.`)
 }
}
export function inspectWarehouseOwner(root:string,home:string,_allowUnverified=false):Ownership{
 const m=path.join(root,MARKER),l=path.join(root,LOCK)
 const owner=read(m),lock=read(l)
 assertNoOtherWriter(root,home,owner,lock)
 if(!fs.existsSync(m))return fs.existsSync(l)?'ORPHAN_UNVERIFIED':'NEW'
 const expected=own(home,root)
 if(owner?.format===8&&owner.home===expected.home&&owner.warehouse===expected.warehouse&&owner.database===expected.database&&!fs.existsSync(l))return 'OWN'
 // Malformed, mismatched and old markers are evidence to archive, never an
 // ownership veto. The POST endpoint requires the shop owner's confirmation.
 return 'LEGACY'
}
export function adoptWarehouse(root:string,home:string,ownerConfirmed=false){
 const kind=inspectWarehouseOwner(root,home)
 if(kind==='OWN')return ()=>{}
 if(kind!=='NEW'&&!ownerConfirmed)throw Error('Kho có dấu phiên bản cũ. Chủ shop cần xác nhận tiếp nhận kho tại Import kho.')
 const marker=path.join(root,MARKER),lock=path.join(root,LOCK)
 const previous=fs.existsSync(marker)?contents(marker):null
 const priorLock=fs.existsSync(lock)?contents(lock):null
 if(previous||priorLock){
  const archive=path.join(home,'data','shop-v8','warehouse-handoffs')
  fs.mkdirSync(archive,{recursive:true})
  const target=path.join(archive,createHash('sha256').update(root).digest('hex')+'-'+randomUUID()+'.json')
  fs.writeFileSync(target,JSON.stringify({root,marker:previous?.toString()??null,lock:priorLock?.toString()??null,markerBase64:previous?.toString('base64')??null,lockBase64:priorLock?.toString('base64')??null,at:new Date().toISOString(),recoveryType:kind,ownerConfirmed}),{flag:'wx'})
 }
 // Recheck immediately before writing, including changes since preflight.
 inspectWarehouseOwner(root,home)
 if(priorLock)fs.unlinkSync(lock)
 const temp=marker+'.'+randomUUID()+'.tmp'
 try{
  fs.writeFileSync(temp,JSON.stringify({...own(home,root),at:new Date().toISOString()}),{flag:'wx'})
  fs.renameSync(temp,marker)
 }catch(error){
  try{fs.unlinkSync(temp)}catch{}
  if(priorLock&&!fs.existsSync(lock))fs.writeFileSync(lock,priorLock,{flag:'wx'})
  throw error
 }
 return ()=>{
  if(previous)fs.writeFileSync(marker,previous)
  else fs.unlinkSync(marker)
  if(priorLock&&!fs.existsSync(lock))fs.writeFileSync(lock,priorLock,{flag:'wx'})
 }
}
