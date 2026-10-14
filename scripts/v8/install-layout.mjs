import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'

/**
 * Purely local, fresh V8 directory allocation. It never imports V7 data, clones
 * files, deletes an existing warehouse or modifies a Supabase project.
 */
const inside=(a,b)=>{
 const r=path.relative(a,b)
 return r===''||(!path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep))
}
function safeDirectory(p){
 const resolved=path.resolve(p)
 let current=resolved
 while(!fs.existsSync(current)){
  const parent=path.dirname(current)
  if(parent===current)throw Error('Không xác nhận được đường dẫn ổ đĩa')
  current=parent
 }
 if(fs.realpathSync(current)!==current)throw Error('Đường dẫn có liên kết đến thư mục khác: '+current)
 if(fs.lstatSync(current).isSymbolicLink())throw Error('Không chấp nhận symlink: '+current)
 if(!fs.statSync(current).isDirectory())throw Error('Đường dẫn không phải thư mục: '+current)
 return resolved
}
function writeJsonAtomic(target,value){
 const temp=target+'.'+randomUUID()+'.tmp'
 fs.writeFileSync(temp,JSON.stringify(value,null,2),{flag:'wx'})
 fs.renameSync(temp,target)
}
export function prepareV8Layout({home,warehouse,fixture=false}){
 if(!path.isAbsolute(home)||!path.isAbsolute(warehouse))throw Error('V8 cần đường dẫn tuyệt đối')
 home=safeDirectory(home);warehouse=safeDirectory(warehouse)
 if(!fixture){
  if(process.platform!=='win32')throw Error('Trình cài chính thức chỉ chạy trên Windows')
  if(path.parse(home).root.toUpperCase()!=='D:\\'||path.parse(warehouse).root.toUpperCase()!=='D:\\')
   throw Error('Cần chọn ổ D: cho chương trình và kho ảnh')
 }
 if(home===path.parse(home).root||warehouse===path.parse(warehouse).root||inside(home,warehouse)||inside(warehouse,home))
  throw Error('Dữ liệu chương trình và kho ảnh phải là hai vùng độc lập')
 const installFile=path.join(home,'installation.json')
 if(fs.existsSync(home)){
  if(!fs.statSync(home).isDirectory())throw Error('Thư mục cài đặt không hợp lệ')
  if(!fs.existsSync(installFile)){
   if(fs.readdirSync(home).length)throw Error('Thư mục chương trình đã có dữ liệu, không nhận làm bản V8 mới')
  }else{
   const old=JSON.parse(fs.readFileSync(installFile,'utf8'))
   if(old.format!==8||old.home!==home||old.warehouse!==warehouse||old.schema!==130)
    throw Error('Cấu hình V8 không khớp; không ghi đè dữ liệu')
   const db=path.join(home,'data','shop-v8','database','shop-v8.db')
   if(fs.existsSync(path.join(path.dirname(db),'.initialized.json'))&&!fs.existsSync(db))
    throw Error('Database V8 bị thiếu; từ chối tự tạo mới')
   return {home,warehouse,database:db,created:false}
  }
 }
 fs.mkdirSync(home,{recursive:true})
 for(const part of ['data/shop-v8/database','data/shop-v8/warehouse','runtime','releases','updates','cache','logs','staging']){
  const directory=path.join(home,...part.split('/'))
  fs.mkdirSync(directory,{recursive:true})
  if(fs.realpathSync(directory)!==directory)throw Error('Phát hiện liên kết thư mục trong V8')
 }
 // Existing photo folders are never cleared or renamed.
 fs.mkdirSync(warehouse,{recursive:true})
 const data=path.join(home,'data','shop-v8'),db=path.join(data,'database','shop-v8.db')
 const config=path.join(data,'warehouse-config.json')
 writeJsonAtomic(config,{format:1,warehouse})
 writeJsonAtomic(installFile,{format:8,mode:'FRESH',home,warehouse,data,schema:130,createdAt:new Date().toISOString()})
 return {home,warehouse,database:db,created:true}
}
