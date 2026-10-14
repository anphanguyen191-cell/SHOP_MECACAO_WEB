import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {prepareV8Layout} from './install-layout.mjs'
function environment(){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'mc-v8-'))
 return {base,home:path.join(base,'ShopMeCaCao'),warehouse:path.join(base,'Me CaCao Store')}
}
test('fresh install allocates isolated app, data and photo areas',()=>{
 const x=environment()
 try{
  const r=prepareV8Layout({...x,fixture:true})
  assert.equal(r.created,true)
  assert.equal(fs.existsSync(r.database),false)
  assert.equal(fs.readFileSync(path.join(x.home,'installation.json'),'utf8').includes('"format": 8'),true)
  assert.equal(JSON.parse(fs.readFileSync(path.join(x.home,'data/shop-v8/warehouse-config.json'))).warehouse,x.warehouse)
  fs.writeFileSync(path.join(x.warehouse,'original.jpg'),'original')
  fs.writeFileSync(r.database,'REAL_DATA_SENTINEL')
  assert.equal(prepareV8Layout({...x,fixture:true}).created,false)
  assert.equal(fs.readFileSync(r.database,'utf8'),'REAL_DATA_SENTINEL')
  assert.equal(fs.readFileSync(path.join(x.warehouse,'original.jpg'),'utf8'),'original')
 }finally{fs.rmSync(x.base,{recursive:true,force:true})}
})
test('rejects nested paths and refuses to adopt a previous app folder',()=>{
 const x=environment()
 try{
  assert.throws(()=>prepareV8Layout({home:x.home,warehouse:path.join(x.home,'photos'),fixture:true}),/độc lập/)
  fs.mkdirSync(x.home)
  fs.writeFileSync(path.join(x.home,'old-test.db'),'do not touch')
  assert.throws(()=>prepareV8Layout({...x,fixture:true}),/đã có dữ liệu/)
  assert.equal(fs.readFileSync(path.join(x.home,'old-test.db'),'utf8'),'do not touch')
 }finally{fs.rmSync(x.base,{recursive:true,force:true})}
})
test('missing initialized database is never silently recreated',()=>{
 const x=environment()
 try{
  const r=prepareV8Layout({...x,fixture:true})
  fs.writeFileSync(path.join(path.dirname(r.database),'.initialized.json'),'{}')
  assert.throws(()=>prepareV8Layout({...x,fixture:true}),/Database V8 bị thiếu/)
 }finally{fs.rmSync(x.base,{recursive:true,force:true})}
})
