import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import https from 'node:https'
import {execFileSync} from 'node:child_process'
import express from 'express'
import {makeLanCredential,createLanSessionManager} from '../apps/api/src/lanSecurity.ts'
import {installLanGuard} from '../apps/api/src/lanServer.ts'
import {createLanAudit} from '../apps/api/src/lanAudit.ts'

const root=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-lan-http-'))
const key=path.join(root,'key.pem'),cert=path.join(root,'cert.pem')
let server,checks=0
const test=(ok,msg)=>{assert.ok(ok,msg);checks++}
try{
 execFileSync('openssl',['req','-x509','-nodes','-newkey','rsa:2048','-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1','-keyout',key,'-out',cert],{stdio:'ignore'})
 const users=[makeLanCredential('owner','owner-test-567890','owner'),makeLanCredential('viewer','viewer-test-123456','viewer')]
 const lan={address:'127.0.0.1',port:0,key:fs.readFileSync(key),cert:fs.readFileSync(cert),sessions:createLanSessionManager(users),audit:createLanAudit(path.join(root,'audit.jsonl'))}
 const app=express()
 app.use(express.json())
 installLanGuard(app,lan)
 let writes=0
 app.get('/api/health',(_req,res)=>res.json({ok:true}))
 app.post('/api/sales/drafts',(_req,res)=>{writes++;res.status(201).json({ok:true})})
 server=https.createServer({key:lan.key,cert:lan.cert},app)
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 lan.port=server.address().port
 const base='https://127.0.0.1:'+lan.port
 async function request(method,p,data={},cookie='',origin=''){
  const body=method==='POST'?JSON.stringify(data):undefined
  return await new Promise((resolve,reject)=>{
   const headers={...(body?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}:{}),...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{})}
   const req=https.request(base+p,{method,rejectUnauthorized:false,headers},res=>{
    let text='';res.setEncoding('utf8');res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text),cookie:res.headers['set-cookie']?.[0]?.split(';')[0]}))
   })
   req.once('error',reject);if(body)req.write(body);req.end()
  })
 }
 const origin=base
 test((await request('GET','/api/lan/status')).status===200,'Status visible without token')
 test((await request('GET','/api/health')).status===401,'Protected health requires login')
 test((await request('POST','/api/lan/login',{username:'owner',password:'owner-test-567890'})).status===403,'Login Origin required')
 test((await request('POST','/api/lan/login',{username:'owner',password:'wrong'},'',origin)).status===401,'Wrong password')
 const owner=await request('POST','/api/lan/login',{username:'owner',password:'owner-test-567890'},'',origin)
 test(owner.status===200&&!!owner.cookie,'Owner gets Secure session cookie')
 test((await request('GET','/api/health',{},owner.cookie)).status===200,'Authenticated health')
 test((await request('GET','/api/fs/roots',{},owner.cookie)).status===403,'Windows filesystem API blocked')
 test((await request('POST','/api/sales/drafts',{},owner.cookie)).status===403,'Cross-site request without Origin refused')
 test((await request('POST','/api/sales/drafts',{},owner.cookie,'https://evil.invalid')).status===403,'Different Origin refused')
 test((await request('POST','/api/sales/drafts',{},owner.cookie,origin)).status===201&&writes===1,'Owner authorized single write')
 const viewer=await request('POST','/api/lan/login',{username:'viewer',password:'viewer-test-123456'},'',origin)
 test(viewer.status===200,'Viewer logs in')
 test((await request('POST','/api/sales/drafts',{},viewer.cookie,origin)).status===403&&writes===1,'Viewer cannot mutate')
 test((await request('POST','/api/lan/logout',{},owner.cookie,origin)).status===200,'Owner logout')
 test((await request('GET','/api/health',{},owner.cookie)).status===401,'Revoked cookie rejected')
 const evidence=fs.readFileSync(path.join(root,'audit.jsonl'),'utf8')
 test(evidence.includes('WRITE_START')&&evidence.includes('WRITE_RESULT'),'Transactions are audited')
 test(evidence.includes('ACCESS_DENIED'),'Rejected requests are audited')
 test(!evidence.includes('owner-test-567890')&&!evidence.includes('mecacao_lan='),'Audit excludes secrets')
 console.log('STAGE6 LAN HTTPS HTTP PASS',checks)
}finally{
 if(server)await new Promise(resolve=>server.close(resolve))
 fs.rmSync(root,{recursive:true,force:true})
}
