import fs from 'node:fs'
import path from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
const MARKER='.mecacao-local-active.json',LOCK='.mecacao-local-runtime.lock'
function contents(file:string){
 if(fs.realpathSync(file)!==file||!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())throw Error('Dấu kho không an toàn')
 return fs.readFileSync(file)
}
function parse(file:string){try{return JSON.parse(contents(file).toString())}catch{throw Error('Dấu kho bị lỗi; không thay đổi ảnh hoặc quyền kho')}}
function own(home:string,root:string){return {format:8,home,warehouse:root,database:path.join(home,'data','shop-v8','database','shop-v8.db')}}
export function inspectWarehouseOwner(root:string,home:string):'NEW'|'OWN'|'LEGACY'{
 const m=path.join(root,MARKER),l=path.join(root,LOCK)
 if(!fs.existsSync(m)){
  if(fs.existsSync(l))throw Error('Kho có khóa LOCAL không rõ chủ, không thể chuyển quyền')
  return 'NEW'
 }
 const o=parse(m)
 if(o.format===8){
  const expected=own(home,root)
  if(o.home!==expected.home||o.warehouse!==expected.warehouse||o.database!==expected.database)throw Error('Kho thuộc bản V8 khác; không dùng chung database')
  return 'OWN'
 }
 if(o.format!==1||o.warehouse!==root||typeof o.database!=='string'||!path.isAbsolute(o.database)||typeof o.configPath!=='string'||!path.isAbsolute(o.configPath)||typeof o.configSha!=='string'||!/^[a-f0-9]{64}$/i.test(o.configSha))
  throw Error('Dấu LOCAL cũ không hợp lệ; cần đối soát trước khi chuyển kho')
 if(fs.existsSync(l)){
  const lock=parse(l)
  if(lock.format!==1||!Number.isSafeInteger(lock.pid)||lock.pid<=0||lock.database!==o.database||lock.configSha!==o.configSha)throw Error('Khóa LOCAL cũ không khớp. Không tự xóa.')
  try{process.kill(lock.pid,0)}catch(e){
   if((e as NodeJS.ErrnoException).code==='ESRCH')return 'LEGACY'
   throw Error('Không xác định được tiến trình LOCAL cũ; hãy thoát hẳn phần mềm cũ')
  }
  throw Error('Phần mềm LOCAL cũ vẫn đang chạy. Thoát bản cũ trước khi dùng kho này trên V8.')
 }
 return 'LEGACY'
}
export function adoptWarehouse(root:string,home:string){
 const kind=inspectWarehouseOwner(root,home)
 if(kind==='OWN')return ()=>{}
 const marker=path.join(root,MARKER),lock=path.join(root,LOCK)
 const previous=fs.existsSync(marker)?contents(marker):null
 const priorLock=fs.existsSync(lock)?contents(lock):null
 if(kind==='LEGACY'){
  const archive=path.join(home,'data','shop-v8','warehouse-handoffs')
  fs.mkdirSync(archive,{recursive:true})
  const target=path.join(archive,createHash('sha256').update(root).digest('hex')+'.json')
  if(!fs.existsSync(target))fs.writeFileSync(target,JSON.stringify({root,marker:previous!.toString(),lock:priorLock?.toString()??null,at:new Date().toISOString()}),{flag:'wx'})
 }
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
