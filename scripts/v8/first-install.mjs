import {prepareV8Layout} from './install-layout.mjs'
import path from 'node:path'
if(process.platform!=='win32')throw Error('Chỉ dùng trình cài này trên Windows')
const home=process.argv[2]||'D:\\ShopMeCaCao'
const warehouse=process.argv[3]||'D:\\Me CaCao Store'
const result=prepareV8Layout({home:path.resolve(home),warehouse:path.resolve(warehouse)})
console.log(JSON.stringify({status:result.created?'V8_NEW_INSTALL_PREPARED':'V8_EXISTING_INSTALL_VERIFIED',...result},null,2))
console.log('Chưa import ảnh tự động. V8 Desktop launcher sẽ được bổ sung ở checkpoint 8.5.')
