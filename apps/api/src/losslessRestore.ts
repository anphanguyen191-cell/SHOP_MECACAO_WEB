import {restoreSalesBackup} from './salesBackup.js'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {verifyLosslessBackup} from './losslessVerify.js'
import {assertDatabaseIntegrity,readSchemaVersion} from './schema.js'
import {ARCHIVE_FOLDER} from './salesArchive.js'

type Manifest={version:number;database:string;database_sha256:string;files:Array<{id:number;source_path:string;backup_path:string;sha256:string;size:number}>;archives?:Array<{relative_path:string;backup_path:string;sha256:string;size:number}>}
const hash=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const exists=(p:string)=>{try{fs.lstatSync(p);return true}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e}}
function syncDir(p:string){try{const fd=fs.openSync(p,'r');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}catch(e){if(process.platform!=='win32')throw e}}
function writeNew(file:string,value:unknown){const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value,null,2));fs.fsyncSync(fd)}finally{fs.closeSync(fd)};syncDir(path.dirname(file))}
function copyVerified(source:string,target:string,expected:string){fs.mkdirSync(path.dirname(target),{recursive:true});if(fs.realpathSync(path.dirname(target))!==path.dirname(target))throw Error('Đường dẫn restore đi qua symlink');fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);const fd=fs.openSync(target,'r+');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)};if(hash(source)!==expected||hash(target)!==expected)throw Error('File thay đổi trong khi restore; giữ bản dở để kiểm tra');syncDir(path.dirname(target))}
/** Restore only into a NEW directory. Never activates it or alters the running DB/warehouse. */
export function restoreLosslessBackup(directory:string,targetRoot:string,oldWarehouseRoot:string,checkpoint:(point:string)=>void=()=>{}){
 const bundle=fs.realpathSync(directory),verified=verifyLosslessBackup(bundle),manifest=JSON.parse(fs.readFileSync(path.join(bundle,'lossless-manifest.json'),'utf8')) as Manifest
 if(manifest.version===3)return restoreSalesBackup(bundle,targetRoot,oldWarehouseRoot,checkpoint)
 const target=path.resolve(targetRoot),parent=fs.realpathSync(path.dirname(target)),old=path.resolve(oldWarehouseRoot),warehouse=path.join(target,'warehouse'),database=path.join(target,'database','shop-restored.db')
 const overlaps=(base:string,p:string)=>{const rel=path.relative(base,p);return rel===''||(!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep))}
 if(overlaps(bundle,target)||overlaps(old,target)||overlaps(target,old))throw Error('Kho restore phải tách khỏi backup và kho gốc')
 if(parent!==path.dirname(target)||exists(target))throw Error('Restore chỉ tạo thư mục mới, không ghi đè đích đã tồn tại hoặc qua symlink')
 const plans=manifest.files.map(f=>{
  const rel=path.relative(old,path.resolve(f.source_path)),parts=rel.split(path.sep)
  if(path.isAbsolute(rel)||parts.length!==3||parts.some(p=>!p||p==='.'||p==='..')||rel.startsWith('..'+path.sep))throw Error('Ảnh không thuộc cấu trúc kho gốc Product / Size / ảnh đã chọn')
  return {...f,target:path.join(warehouse,rel)}
 })
 if(new Set(plans.map(p=>p.target.toLowerCase())).size!==plans.length)throw Error('Đường dẫn restore bị trùng; cần kiểm tra thủ công')
 const sourceDb=new DatabaseSync(path.join(bundle,'shop.db'),{readOnly:true});let schema:number,counts:Record<string,number>={}
 try{schema=readSchemaVersion(sourceDb);if(![110,120].includes(schema))throw Error('Restore chưa hỗ trợ schema này; không tự migration');for(const table of ['products','product_variants','product_images','inventory_transactions',...(schema===120?['sales_orders','sales_order_images']:[])])counts[table]=Number(sourceDb.prepare('SELECT COUNT(*) n FROM '+table).get()!.n)}finally{sourceDb.close()}
 // Marker is durable before first copy. An interrupted directory never has READY status.
 fs.mkdirSync(target);syncDir(parent);fs.mkdirSync(warehouse);writeNew(path.join(target,'restore-plan.json'),{format:1,bundle,database,oldWarehouseRoot:old,schema,counts,createdAt:new Date().toISOString(),images:plans.map(p=>({id:p.id,path:p.target,sha256:p.sha256})),archiveFiles:manifest.archives?.length??0});checkpoint('plan')
 for(let n=0;n<plans.length;n++){const p=plans[n];copyVerified(path.resolve(bundle,p.backup_path),p.target,p.sha256);checkpoint('image:'+n)}
 for(const e of manifest.archives??[])copyVerified(path.resolve(bundle,e.backup_path),path.join(target,ARCHIVE_FOLDER,e.relative_path),e.sha256)
 checkpoint('archives')
 copyVerified(path.join(bundle,'shop.db'),database,manifest.database_sha256);checkpoint('database-copy')
 const restored=new DatabaseSync(database)
 try{
  restored.exec('PRAGMA foreign_keys=ON;PRAGMA synchronous=FULL;BEGIN IMMEDIATE')
  try{
   const update=restored.prepare('UPDATE product_images SET file_path=? WHERE id=?')
   for(const p of plans)if(Number(update.run(p.target,p.id).changes)!==1)throw Error('Ảnh restore không đúng ID')
   const row=restored.prepare("SELECT value FROM app_settings WHERE key='warehouse-watch'").get() as {value:string}|undefined
   if(row){const settings=JSON.parse(row.value);if(settings.rootPath&&path.resolve(settings.rootPath)!==old)throw Error('Kho cấu hình không khớp kho gốc restore');restored.prepare("UPDATE app_settings SET value=? WHERE key='warehouse-watch'").run(JSON.stringify({...settings,rootPath:warehouse,startup:false,periodic:false,autoRename:false}))}
   restored.prepare("DELETE FROM app_settings WHERE key IN ('warehouse-last-scan','warehouse-notices')").run() // Cached paths are invalid in the new location; business history is preserved.
   assertDatabaseIntegrity(restored);checkpoint('before-db-commit');restored.exec('COMMIT')
  }catch(e){restored.exec('ROLLBACK');throw e}
  checkpoint('db-commit');assertDatabaseIntegrity(restored)
  for(const [table,count] of Object.entries(counts))if(Number(restored.prepare('SELECT COUNT(*) n FROM '+table).get()!.n)!==count)throw Error('Số bản ghi restore không khớp backup')
  if(readSchemaVersion(restored)!==schema)throw Error('Schema restore đã thay đổi ngoài kế hoạch')
  for(const p of plans)if(fs.realpathSync(p.target)!==p.target||!fs.lstatSync(p.target).isFile()||hash(p.target)!==p.sha256)throw Error('Ảnh restore sai checksum')
 }finally{restored.close()}
 for(const e of manifest.archives??[]){const file=path.join(target,ARCHIVE_FOLDER,e.relative_path);if(fs.realpathSync(file)!==file||!fs.lstatSync(file).isFile()||hash(file)!==e.sha256)throw Error('Ảnh nhẹ restore sai checksum hoặc đường dẫn')}
 // Revalidate source bundle too; copying must never damage it.
 verifyLosslessBackup(bundle)
 writeNew(path.join(target,'restore-ready.json'),{format:1,status:'READY',schema,database,warehouse,imagesVerified:plans.length,archiveFilesVerified:verified.archiveFilesVerified,counts,database_sha256:hash(database),completedAt:new Date().toISOString()});checkpoint('ready')
 return {ok:true,targetRoot:target,database,warehouse,schema,imagesVerified:plans.length,archiveFilesVerified:verified.archiveFilesVerified,counts,status:'READY',activated:false}
}
