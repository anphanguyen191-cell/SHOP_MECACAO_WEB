import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import ts from 'typescript'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
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
const cases=[
 ['legacy marker with reused PID',x=>{fs.writeFileSync(x.marker,JSON.stringify(x.owner));fs.writeFileSync(x.lock,JSON.stringify({format:1,pid:process.pid,database:x.owner.database,configSha:x.owner.configSha}))}],
 ['malformed marker',x=>fs.writeFileSync(x.marker,'{broken')],
 ['BOM legacy marker',x=>fs.writeFileSync(x.marker,'\uFEFF'+JSON.stringify(x.owner))],
 ['mismatched marker path',x=>fs.writeFileSync(x.marker,JSON.stringify({...x.owner,warehouse:'old-path'}))],
 ['malformed orphan lock',x=>fs.writeFileSync(x.lock,'unknown format')],
 ['orphan reused PID',x=>fs.writeFileSync(x.lock,JSON.stringify({pid:process.pid,database:x.owner.database}))],
 ['orphan dead PID',x=>fs.writeFileSync(x.lock,JSON.stringify({pid:99999999,database:x.owner.database}))],
 ['stopped different V8 installation',x=>fs.writeFileSync(x.marker,JSON.stringify({format:8,home:path.join(x.base,'OldV8'),warehouse:x.root,database:path.join(x.base,'OldV8','data','shop-v8','database','shop-v8.db')}))],
 ['own marker with leftover lock',x=>{adoptWarehouse(x.root,x.home);fs.writeFileSync(x.lock,'{old')}],
]
for(const [name,prepare] of cases)test(name+': consent, archive, rollback, original images preserved',()=>{
 const x=tmp()
 try{
  prepare(x)
  const marker=fs.existsSync(x.marker)?fs.readFileSync(x.marker):null
  const lock=fs.existsSync(x.lock)?fs.readFileSync(x.lock):null
  assert.notEqual(inspectWarehouseOwner(x.root,x.home,true),'OWN')
  assert.throws(()=>adoptWarehouse(x.root,x.home),/xác nhận/)
  const undo=adoptWarehouse(x.root,x.home,true)
  assert.equal(inspectWarehouseOwner(x.root,x.home),'OWN')
  assert.equal(fs.readFileSync(x.image,'utf8'),'ORIGINAL_FILE_MUST_NOT_CHANGE')
  assert(!fs.existsSync(x.lock))
  const dir=path.join(x.home,'data','shop-v8','warehouse-handoffs')
  const saved=JSON.parse(fs.readFileSync(path.join(dir,fs.readdirSync(dir)[0])))
  assert.equal(saved.markerBase64,marker?.toString('base64')??null)
  assert.equal(saved.lockBase64,lock?.toString('base64')??null)
  assert.equal(saved.ownerConfirmed,true)
  undo()
  assert.deepEqual(fs.existsSync(x.marker)?fs.readFileSync(x.marker):null,marker)
  assert.deepEqual(fs.existsSync(x.lock)?fs.readFileSync(x.lock):null,lock)
  adoptWarehouse(x.root,x.home,true)
  assert.equal(fs.readdirSync(dir).length,2,'each handoff retains its own evidence')
 }finally{x.done()}
})
test('new and already owned warehouse are idempotent',()=>{
 const x=tmp()
 try{
  assert.equal(inspectWarehouseOwner(x.root,x.home),'NEW')
  adoptWarehouse(x.root,x.home)
  const original=fs.readFileSync(x.marker)
  adoptWarehouse(x.root,x.home)
  assert.deepEqual(fs.readFileSync(x.marker),original)
 }finally{x.done()}
})
test('verified live V8 writer blocks even with owner confirmation',{skip:process.platform!=='win32'&&!fs.existsSync('/proc/self/cmdline')?'This runner does not expose process command lines; mandatory Windows CI covers this case':false},async(t)=>{
 const x=tmp();let child
 try{
  const other=path.join(x.base,'OtherV8')
  const entry=path.join(other,'releases','current','apps','api','dist','server.js')
  fs.mkdirSync(path.dirname(entry),{recursive:true});fs.writeFileSync(entry,'setInterval(()=>{},1000)')
  const database=path.join(other,'data','shop-v8','database','shop-v8.db')
  fs.mkdirSync(path.dirname(database),{recursive:true})
  child=spawn(process.execPath,[entry],{stdio:'ignore'});await once(child,'spawn')
  if(process.platform!=='win32'&&!fs.existsSync(`/proc/${child.pid}/cmdline`)){t.skip('Process namespace unavailable here; live-writer check is mandatory on Windows CI');return}
  fs.writeFileSync(path.join(other,'data','shop-v8','.mecacao-local-runtime.lock'),JSON.stringify({format:1,pid:child.pid,database,configSha:'stage4-fresh'}))
  fs.writeFileSync(x.marker,JSON.stringify({format:8,home:other,warehouse:x.root,database}))
  const original=fs.readFileSync(x.marker)
  assert.throws(()=>inspectWarehouseOwner(x.root,x.home,true),/đã xác minh/)
  assert.throws(()=>adoptWarehouse(x.root,x.home,true),/đã xác minh/)
  assert.deepEqual(fs.readFileSync(x.marker),original)
  assert.equal(fs.readFileSync(x.image,'utf8'),'ORIGINAL_FILE_MUST_NOT_CHANGE')
 }finally{if(child){const stopped=once(child,'exit');child.kill();await stopped}x.done()}
})
