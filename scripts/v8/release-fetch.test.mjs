import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {zipSync} from 'fflate'
import {stageLatest} from './release-fetch.mjs'

test('V8 refuses an unverified or unsigned GitHub release asset',async()=>{
 const old=globalThis.fetch
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mc-v8-reject-'))
 globalThis.fetch=async()=>new Response(JSON.stringify({tag_name:'v8.0.0-stable',draft:false,prerelease:false,assets:[{name:'ShopMeCaCao-V8-STABLE-win-x64.zip',digest:null}]}),{status:200,headers:{'Content-Type':'application/json'}})
 try{await assert.rejects(stageLatest(root,'a'.repeat(40)),/SHA-256/)}
 finally{globalThis.fetch=old;fs.rmSync(root,{recursive:true,force:true})}
})
test('V8 stages a checksum-verified stable candidate without changing shop data',{skip:process.platform!=='win32'},async()=>{
 const old=globalThis.fetch,root=fs.mkdtempSync(path.join(os.tmpdir(),'mc-v8-updater-'))
 const sha='b'.repeat(40),original=path.join(root,'data','shop-v8','database','shop-v8.db')
 fs.mkdirSync(path.dirname(original),{recursive:true});fs.writeFileSync(original,'DATABASE_MUST_NOT_CHANGE')
 const files={
  'manifest.json':JSON.stringify({format:8,channel:'STABLE',sourceCommit:sha}),
  'releases/current/apps/api/dist/server.js':'console.log("mock")',
  'releases/current/apps/web/dist/index.html':'<html>mock</html>',
  'releases/current/apps/api/package.json':'{"type":"module"}',
  'releases/current/node_modules/express/package.json':'{"name":"express"}'
 }
 const zip=zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,new TextEncoder().encode(v)])))
 const digest='sha256:'+createHash('sha256').update(zip).digest('hex')
 globalThis.fetch=async url=>String(url).includes('/releases/latest')
  ?new Response(JSON.stringify({tag_name:'v8.0.0-stable',prerelease:false,draft:false,assets:[{name:'ShopMeCaCao-V8-STABLE-win-x64.zip',digest,browser_download_url:'https://example.test/v8.zip'}]}),{status:200,headers:{'Content-Type':'application/json'}})
  :new Response(zip,{status:200})
 try{
  const states=[],result=await stageLatest(root,'a'.repeat(40),(phase)=>states.push(phase))
  assert.equal(result.current,false);assert.equal(result.sha,sha)
  assert.deepEqual(states,['DOWNLOADING','VERIFYING'])
  assert.equal(fs.readFileSync(original,'utf8'),'DATABASE_MUST_NOT_CHANGE')
  assert(fs.statSync(path.join(result.program,'apps/api/dist/server.js')).isFile())
 }finally{globalThis.fetch=old;fs.rmSync(root,{recursive:true,force:true})}
})
