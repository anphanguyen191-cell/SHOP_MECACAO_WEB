import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import ts from 'typescript'
const source=fs.readFileSync(new URL('../../apps/api/src/warehouseOwnership.ts',import.meta.url),'utf8')
const location=fs.mkdtempSync(path.join(os.tmpdir(),'mc-v8-ownership-'))
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
const modulePath=path.join(location,'owner.mjs')
fs.writeFileSync(modulePath,compiled)
const {inspectWarehouseOwner,adoptWarehouse}=await import(pathToFileURL(modulePath))
function tmp(){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'mc-v8-handoff-'))
 const home=path.join(base,'ShopMeCaCao'),root=path.join(base,'Old Photo Store')
 fs.mkdirSync(path.join(home,'data','shop-v8'),{recursive:true});fs.mkdirSync(root)
 const image=path.join(root,'original.jpg');fs.writeFileSync(image,'ORIGINAL_FILE_MUST_NOT_CHANGE')
 const owner={format:1,warehouse:root,database:path.join(base,'previous','shop.db'),configPath:path.join(base,'previous','config.json'),configSha:'a'.repeat(64)}
 return {base,home,root,image,owner,marker:path.join(root,'.mecacao-local-active.json'),lock:path.join(root,'.mecacao-local-runtime.lock'),done(){fs.rmSync(base,{recursive:true,force:true})}}
}
test('V8 accepts stopped LOCAL warehouse without modifying photos',()=>{
 const x=tmp()
 try{
  fs.writeFileSync(x.marker,JSON.stringify(x.owner))
  fs.writeFileSync(x.lock,JSON.stringify({format:1,pid:99999999,database:x.owner.database,configSha:x.owner.configSha}))
  assert.equal(inspectWarehouseOwner(x.root,x.home),'LEGACY')
  adoptWarehouse(x.root,x.home)
  assert.equal(inspectWarehouseOwner(x.root,x.home),'OWN')
  assert.equal(fs.readFileSync(x.image,'utf8'),'ORIGINAL_FILE_MUST_NOT_CHANGE')
  assert(!fs.existsSync(x.lock))
  assert.equal(fs.readdirSync(path.join(x.home,'data','shop-v8','warehouse-handoffs')).length,1)
 }finally{x.done()}
})
test('active older shop refuses V8 takeover',()=>{
 const x=tmp()
 try{
  fs.writeFileSync(x.marker,JSON.stringify(x.owner))
  fs.writeFileSync(x.lock,JSON.stringify({format:1,pid:process.pid,database:x.owner.database,configSha:x.owner.configSha}))
  assert.throws(()=>adoptWarehouse(x.root,x.home),/vẫn đang chạy/)
  assert.equal(JSON.parse(fs.readFileSync(x.marker)).format,1)
  assert.equal(fs.readFileSync(x.image,'utf8'),'ORIGINAL_FILE_MUST_NOT_CHANGE')
 }finally{x.done()}
})
test('V8 forbids two database owners on same photo directory',()=>{
 const x=tmp()
 try{
  assert.equal(inspectWarehouseOwner(x.root,x.home),'NEW')
  const undo=adoptWarehouse(x.root,x.home)
  assert.throws(()=>inspectWarehouseOwner(x.root,path.join(x.base,'OtherV8')),/V8 khác/)
  undo()
  assert.equal(inspectWarehouseOwner(x.root,x.home),'NEW')
 }finally{x.done()}
})

test('orphan LOCAL lock without owner marker can transfer safely when PID is dead',()=>{
 const x=tmp()
 try{
  const original={format:1,pid:99999999,database:x.owner.database,configSha:'stage4-fresh'}
  fs.writeFileSync(x.lock,JSON.stringify(original))
  assert.equal(inspectWarehouseOwner(x.root,x.home),'ORPHAN')
  adoptWarehouse(x.root,x.home)
  assert.equal(inspectWarehouseOwner(x.root,x.home),'OWN')
  assert.equal(fs.readFileSync(x.image,'utf8'),'ORIGINAL_FILE_MUST_NOT_CHANGE')
  assert(!fs.existsSync(x.lock))
  const saved=JSON.parse(fs.readFileSync(path.join(x.home,'data','shop-v8','warehouse-handoffs',fs.readdirSync(path.join(x.home,'data','shop-v8','warehouse-handoffs'))[0])))
  assert.equal(saved.marker,null)
  assert.deepEqual(JSON.parse(saved.lock),original)
 }finally{x.done()}
})
test('orphan lock belonging to live PID must block and retain original lock',()=>{
 const x=tmp()
 try{
  const content=JSON.stringify({format:1,pid:process.pid,database:x.owner.database,configSha:'stage4-fresh'})
  fs.writeFileSync(x.lock,content)
  assert.throws(()=>inspectWarehouseOwner(x.root,x.home),/còn hoạt động/)
  assert.throws(()=>adoptWarehouse(x.root,x.home),/còn hoạt động/)
  assert.equal(fs.readFileSync(x.lock,'utf8'),content)
  assert.equal(fs.readFileSync(x.image,'utf8'),'ORIGINAL_FILE_MUST_NOT_CHANGE')
 }finally{x.done()}
})
test('malformed orphan lock is preserved for manual inspection',()=>{
 const x=tmp()
 try{
  fs.writeFileSync(x.lock,'{"bad":"unknown"}')
  assert.throws(()=>adoptWarehouse(x.root,x.home),/không hợp lệ/)
  assert.equal(fs.readFileSync(x.lock,'utf8'),'{"bad":"unknown"}')
 }finally{x.done()}
})

test('an older running V8 can take over its own photo-folder runtime lock',()=>{
 const x=tmp()
 try{
  const payload={format:1,pid:process.pid,database:path.join(x.home,'data','shop-v8','database','shop-v8.db'),configSha:'stage4-fresh'}
  fs.writeFileSync(x.lock,JSON.stringify(payload))
  assert.equal(inspectWarehouseOwner(x.root,x.home),'ORPHAN')
  adoptWarehouse(x.root,x.home)
  assert.equal(inspectWarehouseOwner(x.root,x.home),'OWN')
  assert.equal(fs.readFileSync(x.image,'utf8'),'ORIGINAL_FILE_MUST_NOT_CHANGE')
  assert.equal(fs.existsSync(x.lock),false)
 }finally{x.done()}
})
test('live different owner cannot transfer, even if old version used stage4-fresh lock',()=>{
 const x=tmp()
 try{
  const payload={format:1,pid:process.pid,database:path.join(x.base,'foreign','shop-v8.db'),configSha:'stage4-fresh'}
  fs.writeFileSync(x.lock,JSON.stringify(payload))
  assert.throws(()=>adoptWarehouse(x.root,x.home),/còn hoạt động/)
  assert.equal(fs.readFileSync(x.lock,'utf8'),JSON.stringify(payload))
 }finally{x.done()}
})
