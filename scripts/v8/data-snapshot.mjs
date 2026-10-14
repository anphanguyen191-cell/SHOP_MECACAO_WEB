import fs from 'node:fs'
import path from 'node:path'
import {createHash,randomUUID} from 'node:crypto'

const dataPath=home=>path.join(home,'data','shop-v8')
const fingerprint=dir=>{
 const result=[]
 function walk(dirName,relative=''){
  for(const entry of fs.readdirSync(dirName,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
   const name=path.join(relative,entry.name),file=path.join(dirName,entry.name)
   if(entry.isSymbolicLink())throw Error('Dữ liệu Shop không được chứa symlink khi cập nhật: '+name)
   if(entry.isDirectory())walk(file,name)
   else if(entry.isFile())result.push([name.replaceAll('\\','/'),createHash('sha256').update(fs.readFileSync(file)).digest('hex')])
   else throw Error('File dữ liệu Shop không hợp lệ: '+name)
  }
 }
 walk(dir)
 return result
}
export function snapshotV8Data(home){
 const source=dataPath(home),db=path.join(source,'database','shop-v8.db')
 if(!fs.existsSync(db)||!fs.existsSync(path.join(path.dirname(db),'.initialized.json')))throw Error('Không có database V8 đã hoàn tất khởi tạo')
 const before=fingerprint(source)
 const directory=path.join(home,'staging','rollback-'+randomUUID())
 fs.cpSync(source,directory,{recursive:true,force:false,errorOnExist:true})
 if(JSON.stringify(before)!==JSON.stringify(fingerprint(directory))){
  fs.rmSync(directory,{recursive:true,force:true})
  throw Error('Snapshot cập nhật không khớp dữ liệu Shop, giữ bản cũ')
 }
 return {directory,before}
}
export function restoreV8Data(home,snapshot){
 const original=dataPath(home),directory=snapshot.directory
 if(!fs.existsSync(directory)||JSON.stringify(snapshot.before)!==JSON.stringify(fingerprint(directory)))
  throw Error('Snapshot phục hồi không hợp lệ. Giữ dữ liệu hiện có.')
 const failed=path.join(home,'staging','failed-data-'+randomUUID())
 fs.renameSync(original,failed)
 try{fs.renameSync(directory,original)}catch(error){fs.renameSync(failed,original);throw error}
 if(JSON.stringify(snapshot.before)!==JSON.stringify(fingerprint(original)))
  throw Error('Phục hồi database chưa khớp; cần đối soát trước khi sử dụng.')
 return failed
}
