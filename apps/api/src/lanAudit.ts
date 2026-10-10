import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'

export type LanAuditEvent={
 event:'LOGIN_OK'|'LOGIN_DENIED'|'ACCESS_DENIED'|'WRITE_START'|'WRITE_RESULT'|'LOGOUT';
 actor:string;role:string;method:string;target:string;status:number
}
type JournalRow=LanAuditEvent&{sequence:number;time:string;previous:string;checksum:string}
const digest=(value:string)=>createHash('sha256').update(value).digest('hex')
const MAX_SIZE=32*1024*1024
const GENESIS='0'.repeat(64)

/** Append-only hash-linked evidence, separate from sales ledger and database.
 * Fail closed for new writes after any IO/integrity error; never logs tokens, passwords,
 * JSON request bodies, query strings, full remote IPs or customer contact data.
 */
export function createLanAudit(file:string){
 const absolute=path.resolve(file),directory=path.dirname(absolute)
 if(fs.realpathSync(directory)!==directory||!fs.lstatSync(directory).isDirectory())throw Error('LAN audit directory unsafe')
 if(fs.existsSync(absolute)){
  if(fs.realpathSync(absolute)!==absolute||!fs.lstatSync(absolute).isFile()||fs.lstatSync(absolute).isSymbolicLink())throw Error('LAN audit file unsafe')
 }else{
  const fd=fs.openSync(absolute,'wx',0o600);fs.closeSync(fd)
 }
 const stat=fs.statSync(absolute)
 if(stat.size>MAX_SIZE)throw Error('LAN audit has exceeded review limit')
 let previous=GENESIS,sequence=0,blocked=false
 const content=fs.readFileSync(absolute,'utf8')
 if(content&&!content.endsWith('\n'))throw Error('LAN audit has a partial record; review before restart')
 for(const line of content.split('\n').filter(Boolean)){
  let row:JournalRow
  try{row=JSON.parse(line) as JournalRow}catch{throw Error('LAN audit is corrupted')}
  const {checksum,...record}=row
  if(typeof checksum!=='string'||row.sequence!==++sequence||record.previous!==previous||digest(JSON.stringify(record))!==checksum)
   throw Error('LAN audit checksum mismatch; stop and review')
  previous=checksum
 }
 function append(event:LanAuditEvent){
  if(blocked)throw Error('LAN audit unavailable; writes disabled')
  const safe:LanAuditEvent={
   event:event.event,actor:event.actor.slice(0,40),role:event.role.slice(0,20),
   method:event.method.slice(0,8),target:event.target.slice(0,150),status:event.status
  }
  const record={...safe,sequence:sequence+1,time:new Date().toISOString(),previous}
  const checksum=digest(JSON.stringify(record))
  const line=JSON.stringify({...record,checksum})+'\n'
  try{
   if(fs.statSync(absolute).size+Buffer.byteLength(line)>MAX_SIZE)throw Error('LAN audit requires archive/review')
   const fd=fs.openSync(absolute,'a')
   try{fs.writeSync(fd,line);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
   previous=checksum;sequence++
  }catch(e){blocked=true;throw e}
 }
 return {append,readOnlyStatus:()=>({count:sequence,available:!blocked})}
}
