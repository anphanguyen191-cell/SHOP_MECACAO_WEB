import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
export const freshDevelopment=process.env.SHOP_FRESH_DEVELOPMENT==='1'
export const freshRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../data/stage2')
export const freshWarehouse=path.join(freshRoot,'warehouse')
if(freshDevelopment){
 if(process.env.SHOP_LOCAL_V2_CONFIG||process.env.SHOP_LOCAL_V2_RESTORE_READY)throw Error('Bản mới không mở cấu hình dữ liệu phiên bản cũ')
 fs.mkdirSync(freshWarehouse,{recursive:true});fs.mkdirSync(path.join(freshRoot,'database'),{recursive:true})
 if(fs.realpathSync(freshRoot)!==freshRoot||fs.realpathSync(freshWarehouse)!==freshWarehouse||fs.realpathSync(path.join(freshRoot,'database'))!==path.join(freshRoot,'database'))throw Error('Thư mục dữ liệu bản mới không được là liên kết')
 process.env.SHOP_SANDBOX_ROOT=freshRoot;process.env.SHOP_DB_PATH=path.join(freshRoot,'database','shop-stage2.db')
 process.env.SHOP_ENABLE_V2_DRAFTS='1';process.env.SHOP_ENABLE_V2_SALES='1';process.env.SHOP_HOST='127.0.0.1'
}
