import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
export const freshDevelopment=process.env.SHOP_FRESH_DEVELOPMENT==='1'
export const release={version:process.env.SHOP_V8_HOME?(process.env.SHOP_RELEASE_CHANNEL==='STABLE'?'8.0.0':'8.0.0-preview'):'7.3.0',channel:process.env.SHOP_V8_HOME?(process.env.SHOP_RELEASE_CHANNEL==='STABLE'?'stable':'preview'):'release',stage:process.env.SHOP_V8_HOME?8:7,status:process.env.SHOP_V8_HOME?(process.env.SHOP_RELEASE_CHANNEL==='STABLE'?'RELEASED':'DEVELOPMENT'):'RELEASED',next:'Windows và iPhone dùng chung dữ liệu Cloud'}
const legacyRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../data/stage6-main-test')
export const managedHome=process.env.SHOP_MANAGED_HOME?path.resolve(process.env.SHOP_MANAGED_HOME):null
// V8 is a fresh, isolated installation. Never infer it from a V7 test directory.
export const v8Home=process.env.SHOP_V8_HOME?path.resolve(process.env.SHOP_V8_HOME):null
if(v8Home){
 if(!freshDevelopment||managedHome)throw Error('V8 chỉ chạy trong fresh mode và không nhận V7 managed home')
 const markerPath=path.join(v8Home,'installation.json')
 const marker=JSON.parse(fs.readFileSync(markerPath,'utf8'))
 if(marker.format!==8||marker.home!==v8Home||marker.schema!==130||marker.data!==path.join(v8Home,'data','shop-v8'))throw Error('Cài đặt V8 chưa hợp lệ; không tự tạo kho hoặc database')
}
export const freshRoot=v8Home?path.join(v8Home,'data','shop-v8'):managedHome?path.join(managedHome,'data','stage6-main-test'):legacyRoot
if(freshDevelopment&&managedHome){
 const c=JSON.parse(fs.readFileSync(path.join(managedHome,'installation.json'),'utf8'))
 if(c.format!==1||c.home!==managedHome||c.data!==path.join(managedHome,'data')||c.schema!=='130'||!fs.existsSync(path.join(freshRoot,'database','shop-stage6-main-test.db')))throw Error('Dữ liệu cố định chưa được xác minh. Không tạo database rỗng.')
}
if(freshDevelopment&&!managedHome&&!v8Home&&fs.existsSync(path.join(legacyRoot,'managed-installation.json')))throw Error('Dữ liệu đã chuyển sang vùng cố định. Mở biểu tượng Shop hoặc START_SHOP mới.')
export const warehouseConfig=path.join(freshRoot,'warehouse-config.json')
function contains(a:string,b:string){const r=path.relative(a,b);return r===''||(!path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep))}
export function validateNewWarehouse(value:unknown){
 if(typeof value!=='string'||!path.isAbsolute(value))throw Error('Chọn thư mục kho có sẵn trên máy')
 const root=path.resolve(value)
 if(fs.realpathSync(root)!==root||!fs.lstatSync(root).isDirectory()||fs.lstatSync(root).isSymbolicLink())throw Error('Kho phải là thư mục vật lý, không dùng liên kết')
 if(root===path.parse(root).root||contains(root,freshRoot)||contains(freshRoot,root))throw Error('Chọn thư mục kho riêng, không chọn cả ổ đĩa hoặc thư mục dữ liệu ứng dụng')
 if(fs.existsSync(path.join(root,'.mecacao-local-active.json'))||fs.existsSync(path.join(root,'.mecacao-local-runtime.lock')))throw Error('Kho đang thuộc bản cài khác; chọn thư mục chưa được bản khác sử dụng')
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
 process.env.SHOP_SANDBOX_ROOT=selected??freshRoot;process.env.SHOP_DB_PATH=path.join(freshRoot,'database',v8Home?'shop-v8.db':'shop-stage6-main-test.db')
 process.env.SHOP_ENABLE_V2_DRAFTS='1';process.env.SHOP_ENABLE_V2_SALES='1';process.env.SHOP_HOST='127.0.0.1'
}
export const customWarehouse=selected!==null
export const freshWarehouse=selected??path.join(freshRoot,'warehouse')
