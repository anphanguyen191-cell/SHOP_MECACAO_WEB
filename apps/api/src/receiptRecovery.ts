import fs from 'node:fs'
import path from 'node:path'
import { randomUUID,createHash } from 'node:crypto'
import { db, dbPath } from './db.js'

/**
 * Durable write-ahead receipt journal. Every copied destination is recorded and
 * fsynced BEFORE the first file is copied. On restart a fully committed SQLite
 * transaction wins; otherwise unreferenced copies are removed after validation.
 * This module never edits the source files or an existing registered image.
 */
export type ReceiptPlanFile={dest:string;sha256:string}
export type ReceiptPlan={storeRoot:string;files:ReceiptPlanFile[];createdDirs:string[]}
type ReceiptJournal=ReceiptPlan&{version:1;id:string;createdAt:string}

const journalDir=path.join(path.dirname(dbPath),'receipt-journals')
function digest(file:string){return createHash('sha256').update(fs.readFileSync(file)).digest('hex')}
function isInside(root:string,target:string){
 const rel=path.relative(root,target)
 return rel!==''&&rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel)
}
function syncDir(dir:string){try{const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}catch{/* directory fsync unavailable on some Windows volumes */}}
function safeJournal(j:ReceiptJournal){
 if(j.version!==1||!Array.isArray(j.files)||!Array.isArray(j.createdDirs)||!j.storeRoot)throw new Error('Receipt journal format invalid')
 const root=path.resolve(j.storeRoot)
 if(!fs.existsSync(root)||!fs.statSync(root).isDirectory())throw new Error('Cannot recover receipt: warehouse root not accessible: '+root)
 const canonicalRoot=fs.realpathSync(root)
 // Windows may normalize drive-letter case and symlink targets differently.
 // Actual destination parents still must resolve within the canonical root.
 const known=new Set<string>()
 for(const file of j.files){
  if(!file||typeof file.dest!=='string'||typeof file.sha256!=='string'||!/^[0-9a-f]{64}$/.test(file.sha256))throw new Error('Receipt journal file entry invalid')
  const dest=path.resolve(file.dest)
  if(dest!==file.dest||!isInside(root,dest)||known.has(dest))throw new Error('Unsafe or repeated receipt recovery destination')
  known.add(dest)
  if(fs.existsSync(path.dirname(dest))&&!isInside(canonicalRoot,fs.realpathSync(path.dirname(dest))))throw new Error('Receipt recovery directory escaped warehouse')
 }
 for(const dir of j.createdDirs){
  if(typeof dir!=='string'||dir!==path.resolve(dir)||!isInside(root,dir))throw new Error('Unsafe receipt recovery directory')
 }
 return root
}
export function createReceiptJournal(plan:ReceiptPlan){
 fs.mkdirSync(journalDir,{recursive:true})
 const j:ReceiptJournal={...plan,version:1,id:randomUUID(),createdAt:new Date().toISOString()}
 safeJournal(j)
 const temp=path.join(journalDir,j.id+'.tmp')
 const dest=path.join(journalDir,j.id+'.json')
 let fd:number|undefined
 try{
  fd=fs.openSync(temp,'wx',0o600)
  fs.writeFileSync(fd,JSON.stringify(j))
  fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined
  fs.renameSync(temp,dest);syncDir(journalDir)
  return dest
 }catch(e){
  if(fd!==undefined)try{fs.closeSync(fd)}catch{}
  try{fs.rmSync(temp,{force:true})}catch{}
  throw e
 }
}
export function finishReceiptJournal(file:string){
 fs.rmSync(file,{force:true});syncDir(journalDir)
}
export function recoverPendingGoodsReceipts(){
 if(!fs.existsSync(journalDir))return {journals:0,removedCopies:0,committed:0}
 const names=fs.readdirSync(journalDir).filter(x=>x.endsWith('.json')).sort()
 let removedCopies=0,committed=0
 const registered=db.prepare('SELECT 1 FROM product_images WHERE file_path=? LIMIT 1')
 for(const name of names){
  const file=path.join(journalDir,name)
  const j=JSON.parse(fs.readFileSync(file,'utf8')) as ReceiptJournal
  safeJournal(j)
  const registeredCount=j.files.filter(f=>Boolean(registered.get(f.dest))).length
  if(registeredCount===j.files.length && j.files.length>0){
   // Crash after DB commit: do not touch any warehouse file.
   finishReceiptJournal(file);committed++;continue
  }
  if(registeredCount!==0)throw new Error('Mixed committed receipt journal requires manual investigation: '+name)
  // Preflight ALL files before unlinking ANY file.
  for(const f of j.files){
   if(!fs.existsSync(f.dest))continue
   const st=fs.lstatSync(f.dest)
   if(!st.isFile()||digest(f.dest)!==f.sha256)throw new Error('Receipt recovery file has changed, refusing deletion: '+f.dest)
  }
  for(const f of j.files){
   if(fs.existsSync(f.dest)){fs.unlinkSync(f.dest);removedCopies++}
  }
  for(const dir of [...j.createdDirs].reverse()){
   if(fs.existsSync(dir)){
    if(fs.readdirSync(dir).length===0)fs.rmdirSync(dir)
   }
  }
  finishReceiptJournal(file)
 }
 return {journals:names.length,removedCopies,committed}
}
