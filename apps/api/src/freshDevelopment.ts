import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
export const freshDevelopment=process.env.SHOP_FRESH_DEVELOPMENT==='1'
export const release={version:'3.5.0-stage6-main-test',channel:'main-test',stage:6,status:'MAIN TEST — Stage 5A + Stage 6 LAN + UI Checkpoint 6.1–6.6; chưa STABLE',next:'UI 6: panel góc phải, ba cỡ hiển thị, điều hướng gọn, phiếu banner; chờ nghiệm thu Windows/iPhone thật.'}
export const freshRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../data/stage6-main-test')
export const warehouseConfig=path.join(freshRoot,'warehouse-config.json')
function contains(a:string,b:string){const r=path.relative(a,b);return r===''||(!path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep))}
export function validateNewWarehouse(value:unknown){
 if(typeof value!=='string'||!path.isAbsolute(value))throw Error('Chọn thư mục kho có sẵn trên máy')
 const root=path.resolve(value)
 if(fs.realpathSync(root)!==root||!fs.lstatSync(root).isDirectory()||fs.lstatSync(root).isSymbolicLink())throw Error('Kho phải là thư mục vật lý, không dùng liên kết')
 if(root===path.parse(root).root||contains(root,freshRoot)||contains(freshRoot,root))throw Error('Chọn thư mục kho riêng, không chọn cả ổ đĩa hoặc thư mục dữ liệu ứng dụng')
 if(fs.existsSync(path.join(root,'.mecacao-local-active.json'))||fs.existsSync(path.join(root,'.mecacao-local-runtime.lock')))throw Error('Kho đang thuộc bản cài khác; chọn kho thử riêng')
 return root
}
let selected:string|null=null
if(freshDevelopment){
 if(process.env.SHOP_LOCAL_V2_CONFIG||process.env.SHOP_LOCAL_V2_RESTORE_READY)throw Error('Bản mới không mở cấu hình dữ liệu phiên bản cũ')
 fs.mkdirSync(path.join(freshRoot,'warehouse'),{recursive:true});fs.mkdirSync(path.join(freshRoot,'database'),{recursive:true})
 for(const dir of [freshRoot,path.join(freshRoot,'warehouse'),path.join(freshRoot,'database')])if(fs.realpathSync(dir)!==dir)throw Error('Thư mục dữ liệu bản mới không được là liên kết')
 if(fs.existsSync(warehouseConfig)){
  if(fs.realpathSync(warehouseConfig)!==warehouseConfig||!fs.lstatSync(warehouseConfig).isFile())throw Error('Cấu hình kho không an toàn')
  const c=JSON.parse(fs.readFileSync(warehouseConfig,'utf8'));if(c.format!==1)throw Error('Cấu hình kho không hợp lệ')
  // Runtime lock is checked separately against this installation's database.
  selected=path.resolve(c.warehouse)
  if(!path.isAbsolute(c.warehouse)||fs.realpathSync(selected)!==selected||!fs.lstatSync(selected).isDirectory()||selected===path.parse(selected).root||contains(selected,freshRoot)||contains(freshRoot,selected)||fs.existsSync(path.join(selected,'.mecacao-local-active.json')))throw Error('Kho đã chọn không còn hợp lệ; giữ nguyên cấu hình để kiểm tra')
 }
 process.env.SHOP_SANDBOX_ROOT=selected??freshRoot;process.env.SHOP_DB_PATH=path.join(freshRoot,'database','shop-stage6-main-test.db')
 process.env.SHOP_ENABLE_V2_DRAFTS='1';process.env.SHOP_ENABLE_V2_SALES='1';process.env.SHOP_HOST='127.0.0.1'
}
export const customWarehouse=selected!==null
export const freshWarehouse=selected??path.join(freshRoot,'warehouse')
