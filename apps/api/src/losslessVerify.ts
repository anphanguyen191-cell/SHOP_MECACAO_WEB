import {verifySalesBackup} from './salesBackup.js'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
/** Safe verification only. Does not restore or overwrite any warehouse file. */
export function verifyLosslessBackup(directory:string){
 const dir=fs.realpathSync(path.resolve(directory)),manifestPath=path.join(dir,'lossless-manifest.json')
 if(!fs.lstatSync(manifestPath).isFile()||fs.realpathSync(manifestPath)!==manifestPath)throw Error('Manifest không phải file vật lý an toàn')
 const obj=JSON.parse(fs.readFileSync(manifestPath,'utf8')) as {version:number;archives?:Array<{relative_path:string;backup_path:string;sha256:string;size:number}>;database:string;database_sha256:string;files:Array<{id:number;source_path:string;backup_path:string;sha256:string;size:number}>}
 if(obj.version===3)return verifySalesBackup(dir)
 if(![1,2].includes(obj.version)||obj.database!=='shop.db'||!Array.isArray(obj.files))throw new Error('Manifest sao lưu không hợp lệ')
 const hash=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
 const snapshot=path.join(dir,'shop.db')
 if(!fs.lstatSync(snapshot).isFile()||fs.realpathSync(snapshot)!==snapshot)throw Error('Snapshot SQLite không an toàn')
 if(hash(snapshot)!==obj.database_sha256)throw new Error('Backup database sai checksum')
 const checked=new Set<string>()
 const ids=new Set<number>()
 for(const rec of obj.files){
  if(!Number.isInteger(rec.id)||rec.id<=0||ids.has(rec.id)||typeof rec.backup_path!=='string'||typeof rec.source_path!=='string'||!Number.isInteger(rec.size)||rec.size<0||!/^[0-9a-f]{64}$/.test(rec.sha256))throw new Error('Bản ghi ảnh sao lưu không hợp lệ hoặc trùng ID')
  ids.add(rec.id)
  const target=path.resolve(dir,rec.backup_path)
  const rel=path.relative(dir,target)
  if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel)||checked.has(target))throw new Error('Đường dẫn file sao lưu không an toàn')
  checked.add(target)
  if(!fs.existsSync(target)||!fs.lstatSync(target).isFile()||fs.statSync(target).size!==rec.size||hash(target)!==rec.sha256)throw new Error('Ảnh sao lưu bị thiếu hoặc sai checksum: '+rec.backup_path)
  const physicalRel=path.relative(fs.realpathSync(dir),fs.realpathSync(target))
  if(path.isAbsolute(physicalRel)||physicalRel==='..'||physicalRel.startsWith('..'+path.sep))throw new Error('Ảnh sao lưu tham chiếu ra ngoài bundle')
 }
 const archiveFiles=obj.archives??[],archivePaths=new Set<string>()
 if(!Array.isArray(archiveFiles)||(obj.version===1&&archiveFiles.length))throw Error('Manifest ảnh nhẹ không hợp lệ')
 const groups=new Map<string,Map<string,string>>()
 for(const e of archiveFiles){
  if(typeof e.relative_path!=='string'||typeof e.backup_path!=='string'||!Number.isSafeInteger(e.size)||e.size<0||!/^[a-f0-9]{64}$/.test(e.sha256))throw Error('Bản ghi backup ảnh nhẹ không hợp lệ')
  const rel=e.relative_path.split(/[\\/]/);if(rel.length!==2||!/^[a-f0-9]{64}$/.test(rel[0])||!(/^(plan|ready)\.json$/.test(rel[1])||/^[1-9]\d*\.jpg$/.test(rel[1]))||archivePaths.has(rel.join('/')))throw Error('Đường dẫn archive không an toàn hoặc trùng')
  archivePaths.add(rel.join('/'));const file=path.resolve(dir,e.backup_path),relative=path.relative(dir,file)
  if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)||checked.has(file)||!fs.lstatSync(file).isFile()||fs.realpathSync(file)!==file||hash(file)!==e.sha256||fs.statSync(file).size!==e.size)throw Error('Ảnh nhẹ backup thiếu hoặc sai checksum')
  checked.add(file);const group=groups.get(rel[0])??new Map<string,string>();group.set(rel[1],file);groups.set(rel[0],group)
 }
 for(const [id,group] of groups){
  const plan=JSON.parse(group.has('plan.json')?fs.readFileSync(group.get('plan.json')!,'utf8'):'null'),ready=JSON.parse(group.has('ready.json')?fs.readFileSync(group.get('ready.json')!,'utf8'):'null')
  if(!plan||!ready||plan.format!==1||plan.mode!=='DRAFT_ARCHIVE_PROTOTYPE'||plan.keyHash!==id||!Array.isArray(plan.items)||!plan.items.length||plan.items.length>100||ready.mode!==plan.mode||ready.planHash!==hash(group.get('plan.json')!)||group.size!==plan.items.length+2)throw Error('Backup archive chưa bao phủ đầy đủ bộ ảnh')
  const ids=new Set<number>()
  for(const item of plan.items){const data=group.get(item.imageId+'.jpg');if(!Number.isSafeInteger(item.imageId)||item.imageId<1||ids.has(item.imageId)||!data||fs.statSync(data).size!==item.optimizedBytes||hash(data)!==item.optimizedHash)throw Error('Ảnh nhẹ sai checksum hoặc trùng ID');ids.add(item.imageId)}
 }
 const restored=new DatabaseSync(snapshot,{readOnly:true})
 try{
  const integrity=(restored.prepare('PRAGMA integrity_check').get() as {integrity_check:string}).integrity_check
  if(integrity!=='ok'||restored.prepare('PRAGMA foreign_key_check').all().length)throw new Error('SQLite backup không toàn vẹn')
  const registered=restored.prepare('SELECT id,file_path FROM product_images ORDER BY id').all() as Array<{id:number;file_path:string}>
  const byId=new Map(obj.files.map(file=>[file.id,file]))
  for(const group of groups.values()){const plan=JSON.parse(fs.readFileSync(group.get('plan.json')!,'utf8'));if(!restored.prepare('SELECT 1 FROM sales_orders WHERE id=?').get(plan.orderId)||plan.items.some((i:any)=>!byId.has(i.imageId)))throw Error('Archive không liên kết đúng database backup')}
  if(registered.length!==byId.size||registered.some(row=>byId.get(row.id)?.source_path!==row.file_path))throw new Error('Manifest sao lưu không bao phủ đầy đủ ảnh trong database')
 }finally{restored.close()}
 return {ok:true,imagesVerified:obj.files.length,dbVerified:true,archiveFilesVerified:archiveFiles.length}
}
