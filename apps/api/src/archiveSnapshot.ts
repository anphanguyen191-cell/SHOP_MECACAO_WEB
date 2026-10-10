import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {ARCHIVE_FOLDER,hasArchiveOperation} from './salesArchive.js'
export type ExtraFile={relative_path:string;backup_path:string;sha256:string;size:number}
const hash=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const hex=(s:string)=>/^[a-f0-9]{64}$/.test(s)
/** Synchronous snapshot preflight. Incomplete/ambiguous derivative sets block a full backup. */
export function archiveSnapshot(root:string){
 if(hasArchiveOperation())throw Error('Đang xử lý bộ ảnh nhẹ. Đợi hoàn tất rồi sao lưu đầy đủ.')
 const base=path.join(fs.realpathSync(root),ARCHIVE_FOLDER),files:Array<{source:string;relative_path:string;sha256:string;size:number}>=[]
 if(!fs.existsSync(base))return files
 if(fs.realpathSync(base)!==base||!fs.lstatSync(base).isDirectory())throw Error('Thư mục ảnh nhẹ không an toàn')
 for(const name of fs.readdirSync(base)){
  if(!hex(name))throw Error('Bộ ảnh nhẹ chưa rõ; kiểm tra trước backup: '+name)
  const dir=path.join(base,name);if(fs.realpathSync(dir)!==dir||!fs.lstatSync(dir).isDirectory())throw Error('Thư mục bộ ảnh nhẹ không an toàn')
  const safe=(file:string)=>{if(!fs.lstatSync(file).isFile()||fs.realpathSync(file)!==file)throw Error('File bộ ảnh nhẹ không an toàn');return file}
  const planFile=safe(path.join(dir,'plan.json')),readyFile=safe(path.join(dir,'ready.json')),plan=JSON.parse(fs.readFileSync(planFile,'utf8')),ready=JSON.parse(fs.readFileSync(readyFile,'utf8'))
  if(plan.format!==1||plan.mode!=='DRAFT_ARCHIVE_PROTOTYPE'||plan.keyHash!==name||!Array.isArray(plan.items)||!plan.items.length||plan.items.length>100||ready.planHash!==hash(planFile)||ready.mode!==plan.mode)throw Error('Bộ ảnh nhẹ không hoàn chỉnh hoặc sai nhật ký')
  const names=['plan.json','ready.json'],ids=new Set<number>()
  for(const e of plan.items){if(!Number.isSafeInteger(e.imageId)||e.imageId<=0||ids.has(e.imageId)||!hex(e.optimizedHash)||!Number.isSafeInteger(e.optimizedBytes)||e.optimizedBytes<=0)throw Error('Bản ghi ảnh nhẹ không hợp lệ');ids.add(e.imageId);const file=safe(path.join(dir,e.imageId+'.jpg'));if(hash(file)!==e.optimizedHash||fs.statSync(file).size!==e.optimizedBytes)throw Error('Ảnh nhẹ sai checksum');names.push(e.imageId+'.jpg')}
  if(fs.readdirSync(dir).some(n=>!names.includes(n)))throw Error('Bộ ảnh nhẹ có file chưa rõ; không bỏ sót khi backup')
  for(const n of names){const source=path.join(dir,n);files.push({source,relative_path:path.join(name,n),sha256:hash(source),size:fs.statSync(source).size})}
 }
 return files
}
