import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8')
test('V8 does not auto-bind fresh Windows installation to old warehouse location',()=>{
 const launcher=read('desktop/Program.cs')
 assert(!launcher.includes('WriteOnce(Path.Combine(root, "warehouse-config.json")'))
 const data=read('apps/api/src/db.ts')
 assert(data.includes("v8Home&&!customWarehouse?'':freshWarehouse"))
})
test('V8 warehouse is selected directly from Import and scan options are in Settings',()=>{
 const warehouse=read('apps/web/src/WarehouseImport.tsx')
 assert(warehouse.includes('CHỌN THƯ MỤC'))
 assert(warehouse.includes('QUÉT KHO'))
 assert(!warehouse.includes('className="watchOptions"'))
 const settings=read('apps/web/src/SettingsView.tsx')
 assert(settings.includes('WarehouseWatchSettings'))
 const server=read('apps/api/src/server.ts')
 assert(server.includes('if(!v8Home&&(customWarehouse||fs.existsSync(warehouseConfig)))'))
 assert(server.includes("process.exit(75)"))
 const runner=read('scripts/v8/node-runner.mjs')
 assert(runner.includes('code===75'))
})
test('V8 makes Cloud connection a dedicated navigation destination',()=>{
 const local=read('apps/web/src/App.tsx')
 const cloud=read('apps/web/src/CloudWorkspace.tsx')
 assert(local.includes("'Kết nối Cloud'"))
 assert(local.includes("active!=='Kết nối Cloud'"))
 assert(cloud.includes("key:'connect',label:'Kết nối Cloud'"))
 assert(cloud.includes("tab!=='connect'"))
})
