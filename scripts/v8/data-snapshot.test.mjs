import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {snapshotV8Data,restoreV8Data} from './data-snapshot.mjs'
test('snapshot protects new official database and restores it after candidate startup failure',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'mc-v8-rollback-'))
 const dbDir=path.join(home,'data','shop-v8','database')
 try{
  fs.mkdirSync(dbDir,{recursive:true})
  fs.mkdirSync(path.join(home,'staging'))
  fs.writeFileSync(path.join(dbDir,'shop-v8.db'),'ORIGINAL_TEST_DATABASE')
  fs.writeFileSync(path.join(dbDir,'.initialized.json'),'{"format":8}')
  fs.writeFileSync(path.join(home,'data','shop-v8','warehouse-config.json'),'{"warehouse":"D:"}')
  const snapshot=snapshotV8Data(home)
  fs.writeFileSync(path.join(dbDir,'shop-v8.db'),'BROKEN_CANDIDATE_DATA')
  const failed=restoreV8Data(home,snapshot)
  assert.equal(fs.readFileSync(path.join(dbDir,'shop-v8.db'),'utf8'),'ORIGINAL_TEST_DATABASE')
  assert.equal(fs.readFileSync(path.join(failed,'database','shop-v8.db'),'utf8'),'BROKEN_CANDIDATE_DATA')
 }finally{fs.rmSync(home,{recursive:true,force:true})}
})
test('refuses incomplete database or tampered rollback snapshot',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'mc-v8-block-'))
 const dir=path.join(home,'data','shop-v8','database')
 try{
  fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(path.join(home,'staging'))
  fs.writeFileSync(path.join(dir,'shop-v8.db'),'DB')
  assert.throws(()=>snapshotV8Data(home),/chưa hoàn tất/)
  fs.writeFileSync(path.join(dir,'.initialized.json'),'{}')
  const snapshot=snapshotV8Data(home)
  fs.writeFileSync(path.join(snapshot.directory,'database','shop-v8.db'),'CORRUPT')
  assert.throws(()=>restoreV8Data(home,snapshot),/không hợp lệ/)
  assert.equal(fs.readFileSync(path.join(dir,'shop-v8.db'),'utf8'),'DB')
 }finally{fs.rmSync(home,{recursive:true,force:true})}
})
