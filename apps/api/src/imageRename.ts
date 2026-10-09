import fs from 'node:fs'
import path from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {db,dbPath} from './db.js'
import {createBackup} from './backup.js'
import {imagePrefix,nextNamedImage} from './imageNaming.js'
import {validateWarehouseRoot} from './warehouseWatch.js'
import {recoverPendingGoodsReceipts} from './receiptRecovery.js'

type RenameFile={id:number;oldPath:string;newPath:string;sha256:string;product:string;size:string}
type Journal={version:1;id:string;rootPath:string;files:RenameFile[];backup:string;createdAt:string}
const journalDir=path.join(path.dirname(dbPath),'rename-journals'),logDir=path.join(path.dirname(dbPath),'rename-logs')
const hash=(file:string)=>createHash('sha256').update(fs.readFileSync(file)).digest('hex')
function inside(root:string,file:string){const r=path.relative(root,file);return !!r&&!path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep)}
function syncWrite(file:string,value:unknown){const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
function validateFile(root:string,file:string){
 if(!inside(root,path.resolve(file)))throw Error('Đường dẫn rename nằm ngoài kho')
 const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||!inside(root,fs.realpathSync(file)))throw Error('Ảnh không phải file vật lý an toàn: '+file)
}
export function previewImageRename(inputRoot:string,selectedIds?:number[]){
 const rootPath=validateWarehouseRoot(inputRoot)
 if(selectedIds&&(!Array.isArray(selectedIds)||!selectedIds.length||selectedIds.some(id=>!Number.isSafeInteger(id)||id<=0)))throw Error('Chọn ảnh hợp lệ trước khi rename')
 const selected=selectedIds?new Set(selectedIds):null,reserved=new Set<string>(),files:RenameFile[]=[],unchanged:number[]=[],missing:number[]=[]
 const rows=db.prepare('SELECT i.id,i.file_path,p.name,v.size FROM product_images i JOIN products p ON p.id=i.product_id JOIN product_variants v ON v.id=i.variant_id ORDER BY i.id').all() as {id:number;file_path:string;name:string;size:string}[]
 const found=new Set<number>()
 for(const row of rows){
  if(!inside(rootPath,path.resolve(row.file_path))||(selected&&!selected.has(row.id)))continue
  found.add(row.id)
  if(!fs.existsSync(row.file_path)){missing.push(row.id);continue}
  validateFile(rootPath,row.file_path)
  const prefix=imagePrefix(row.name,row.size),ext=path.extname(row.file_path).toLowerCase()
  const basename=path.basename(row.file_path),suffix=basename.slice(prefix.length,-ext.length)
  if(basename.startsWith(prefix)&&/^\d{4,}$/.test(suffix)&&basename.endsWith(ext)){unchanged.push(row.id);continue}
  const target=nextNamedImage(path.dirname(row.file_path),row.name,row.size,ext,reserved)
  files.push({id:row.id,oldPath:row.file_path,newPath:target,sha256:hash(row.file_path),product:row.name,size:row.size})
 }
 if(selected&&[...selected].some(id=>!found.has(id)))throw Error('Ảnh được chọn không thuộc kho đã duyệt')
 const token=createHash('sha256').update(JSON.stringify({rootPath,files,unchanged,missing})).digest('hex')
 return {rootPath,files,unchanged,missing,token,summary:{registered:files.length+unchanged.length+missing.length,correct:unchanged.length,pending:files.length,missing:missing.length}}
}
function validateJournal(j:Journal){
 if(j.version!==1||!j.rootPath||!Array.isArray(j.files)||!j.files.length||typeof j.id!=='string')throw Error('Nhật ký rename không hợp lệ')
 const root=validateWarehouseRoot(j.rootPath),ids=new Set<number>(),paths=new Set<string>()
 for(const f of j.files){
  if(!Number.isSafeInteger(f.id)||f.id<=0||ids.has(f.id)||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('Nhật ký rename bị trùng hoặc sai checksum')
  ids.add(f.id)
  for(const p of [f.oldPath,f.newPath]){if(typeof p!=='string'||p!==path.resolve(p)||!inside(root,p)||paths.has(p.toLowerCase()))throw Error('Nhật ký rename có đường dẫn không an toàn');paths.add(p.toLowerCase());const parent=fs.realpathSync(path.dirname(p));if(!inside(root,parent))throw Error('Thư mục rename nằm ngoài kho')}
  if(path.dirname(f.oldPath)!==path.dirname(f.newPath))throw Error('Rename không được đổi thư mục')
 }
 return root
}
export function recoverImageRenames(){
 if(!fs.existsSync(journalDir))return {recovered:0}
 let recovered=0
 for(const name of fs.readdirSync(journalDir).filter(n=>n.endsWith('.json')).sort()){
  const file=path.join(journalDir,name),j=JSON.parse(fs.readFileSync(file,'utf8')) as Journal,root=validateJournal(j)
  const owners=j.files.map(f=>(db.prepare('SELECT file_path FROM product_images WHERE id=?').get(f.id) as {file_path:string}|undefined)?.file_path)
  const old=owners.every((p,i)=>p===j.files[i].oldPath),committed=owners.every((p,i)=>p===j.files[i].newPath)
  if(!old&&!committed)throw Error('Rename trạng thái database không rõ; cần kiểm tra thủ công: '+name)
  // Verify every file before removing any duplicate. Never guess after corruption.
  for(const f of j.files){
   const required=committed?f.newPath:f.oldPath;validateFile(root,required);if(hash(required)!==f.sha256)throw Error('Ảnh rename đã thay đổi; dừng phục hồi: '+required)
   const duplicate=committed?f.oldPath:f.newPath;if(fs.existsSync(duplicate)){validateFile(root,duplicate);if(hash(duplicate)!==f.sha256)throw Error('File rename nghi ngờ; không xóa: '+duplicate)}
  }
  fs.mkdirSync(logDir,{recursive:true});const log=path.join(logDir,j.id+'.json')
  if(!fs.existsSync(log))syncWrite(log,{...j,outcome:committed?'COMMITTED':'ROLLED_BACK',completedAt:new Date().toISOString()})
  for(const f of j.files){const duplicate=committed?f.oldPath:f.newPath;if(fs.existsSync(duplicate))fs.unlinkSync(duplicate)}
  fs.unlinkSync(file);recovered++
 }
 return {recovered}
}
export function commitImageRename(rootPath:string,ids:number[],token:string,confirmed:boolean,onPhase?:(phase:string)=>void){
 if(confirmed!==true)throw Error('Rename phải được xác nhận sau xem trước')
 recoverPendingGoodsReceipts()
 recoverImageRenames()
 const plan=previewImageRename(rootPath,ids)
 if(plan.token!==token)throw Error('Kho hoặc lựa chọn đã thay đổi; hãy xem trước lại trước khi rename')
 if(plan.missing.length)throw Error('Có ảnh bị thiếu; kiểm tra trước khi rename')
 if(!plan.files.length)return {renamed:0,log:null}
 const backup=createBackup() as any
 fs.mkdirSync(journalDir,{recursive:true});const id=randomUUID(),journal=path.join(journalDir,id+'.json')
 const j:Journal={version:1,id,rootPath:plan.rootPath,files:plan.files,backup:JSON.stringify(backup),createdAt:new Date().toISOString()}
 validateJournal(j);syncWrite(journal,j)
 try{
  // Keep old paths intact until SQLite commits, allowing safe rollback after a crash.
  for(const f of plan.files){fs.copyFileSync(f.oldPath,f.newPath,fs.constants.COPYFILE_EXCL);const fd=fs.openSync(f.newPath,'r+');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}if(hash(f.newPath)!==f.sha256)throw Error('Copy rename không toàn vẹn');onPhase?.('COPIED')}
  db.exec('BEGIN IMMEDIATE')
  try{for(const f of plan.files){if(hash(f.oldPath)!==f.sha256)throw Error('Ảnh nguồn kho thay đổi trong khi rename');const r=db.prepare('UPDATE product_images SET file_path=? WHERE id=? AND file_path=?').run(f.newPath,f.id,f.oldPath);if(Number(r.changes)!==1)throw Error('Metadata ảnh đã thay đổi');}db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
  onPhase?.('COMMITTED');recoverImageRenames();return {renamed:plan.files.length,log:id,backup}
 }catch(e){
  // A post-commit cleanup failure is NOT a rollback of committed DB paths.
  try{recoverImageRenames()}catch(recovery){throw Error('Rename cần phục hồi thủ công: '+(recovery instanceof Error?recovery.message:String(recovery)))}
  throw e
 }
}
export function getRenameLogs(){if(!fs.existsSync(logDir))return [];return fs.readdirSync(logDir).filter(n=>/^[a-f0-9-]+\.json$/.test(n)).map(n=>JSON.parse(fs.readFileSync(path.join(logDir,n),'utf8'))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,50)}
