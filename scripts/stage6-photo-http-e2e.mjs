import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import https from 'node:https'
import {execFileSync} from 'node:child_process'
import express from 'express'
import sharp from 'sharp'
import {createLanSessionManager,makeLanCredential} from '../apps/api/src/lanSecurity.ts'
import {createLanAudit} from '../apps/api/src/lanAudit.ts'
import {installLanGuard} from '../apps/api/src/lanServer.ts'
import {createPhonePhotoInbox,requireApprovedPhoneReceiptSource} from '../apps/api/src/lanPhotoInbox.ts'
import {createPhotoRouterForInbox} from '../apps/api/src/lanPhotoRoutes.ts'

const root=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-photo-http-'))
let lanServer=null,localServer=null,n=0
const must=(v,msg)=>{assert.ok(v,msg);n++}
const oldPort=process.env.PORT
try{
 const key=path.join(root,'key.pem'),cert=path.join(root,'cert.pem')
 execFileSync('openssl',['req','-x509','-nodes','-newkey','rsa:2048','-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1','-keyout',key,'-out',cert],{stdio:'ignore'})
 const inbox=createPhonePhotoInbox(path.join(root,'lan','phone-pending'),path.join(root,'lan','phone-reviewed'))
 const users=[
  makeLanCredential('owner','owner-photo-123456789','owner'),
  makeLanCredential('inventory1','inventory-photo-123456789','inventory'),
  makeLanCredential('cashier1','cashier-photo-123456789','cashier')
 ]
 const lan={address:'127.0.0.1',port:0,cert:fs.readFileSync(cert),key:fs.readFileSync(key),
  sessions:createLanSessionManager(users),audit:createLanAudit(path.join(root,'audit.jsonl'))}
 const remote=express()
 remote.use(express.json({limit:'6mb'}))
 installLanGuard(remote,lan)
 remote.use('/api/lan/photos',createPhotoRouterForInbox(inbox))
 lanServer=https.createServer({key:lan.key,cert:lan.cert},remote)
 await new Promise((resolve,reject)=>lanServer.listen(0,'127.0.0.1',e=>e?reject(e):resolve()))
 lan.port=lanServer.address().port
 const lanBase='https://127.0.0.1:'+lan.port

 const local=express()
 local.use(express.json({limit:'6mb'}))
 local.use('/api/lan/photos',createPhotoRouterForInbox(inbox))
 localServer=http.createServer(local)
 await new Promise((resolve,reject)=>localServer.listen(0,'127.0.0.1',e=>e?reject(e):resolve()))
 process.env.PORT=String(localServer.address().port)
 const localBase='http://127.0.0.1:'+process.env.PORT

 async function request(base,method,route,body,cookie='',origin='',binary=false){
  const payload=body===undefined?undefined:JSON.stringify(body)
  const isTls=base.startsWith('https:')
  const headers={
   ...(payload?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}:{}),
   ...(cookie?{Cookie:cookie}:{}),
   ...(origin?{Origin:origin}:{})
  }
  return await new Promise((resolve,reject)=>{
   const req=(isTls?https:http).request(base+route,{method,headers,...(isTls?{rejectUnauthorized:false}:{})},res=>{
    const bytes=[]
    res.on('data',c=>bytes.push(c))
    res.on('end',()=>{
     const data=Buffer.concat(bytes)
     if(binary){resolve({status:res.statusCode,bytes:data,headers:res.headers});return}
     let parsed
     try{parsed=JSON.parse(data.toString('utf8'))}
     catch{reject(Error('Unexpected HTTP payload: '+data.toString('utf8').slice(0,200)));return}
     resolve({status:res.statusCode,body:parsed,cookie:res.headers['set-cookie']?.[0]?.split(';')[0]})
    })
   })
   req.on('error',reject)
   if(payload)req.write(payload)
   req.end()
  })
 }
 must((await request(lanBase,'GET','/api/lan/photos')).status===401,'LAN inbox needs login')
 const owner=await request(lanBase,'POST','/api/lan/login',{username:'owner',password:'owner-photo-123456789'},'',lanBase)
 const worker=await request(lanBase,'POST','/api/lan/login',{username:'inventory1',password:'inventory-photo-123456789'},'',lanBase)
 const cashier=await request(lanBase,'POST','/api/lan/login',{username:'cashier1',password:'cashier-photo-123456789'},'',lanBase)
 must(owner.status===200&&!!owner.cookie,'Owner HTTPS login')
 must(worker.status===200&&!!worker.cookie,'Inventory HTTPS login')
 must(cashier.status===200&&!!cashier.cookie,'Cashier HTTPS login')
 const photo=await sharp({create:{width:440,height:660,channels:3,background:'#ddf0dd'}}).jpeg().toBuffer()
 const body={filename:'Áo mẫu chụp iPhone.jpg',mime:'image/jpeg',base64:photo.toString('base64')}
 must((await request(lanBase,'POST','/api/lan/photos/upload',body,cashier.cookie,lanBase)).status===403,'Cashier forbidden from inventory upload')
 const uploaded=await request(lanBase,'POST','/api/lan/photos/upload',body,worker.cookie,lanBase)
 must(uploaded.status===201&&uploaded.body.registeredStock===false,'Inventory can stage but not register')
 const record=uploaded.body.photo
 must(record.status==='PENDING_REVIEW'&&!!record.sha256,'Server keeps review status and SHA')
 must((await request(lanBase,'POST','/api/lan/photos/upload',body,worker.cookie,lanBase)).status===409,'Repeat upload rejected by hash')
 const listed=await request(lanBase,'GET','/api/lan/photos',undefined,owner.cookie)
 must(listed.status===200&&listed.body.rows.length===1,'Owner can view shared inbox')
 const preview=await request(lanBase,'GET','/api/lan/photos/'+record.id+'/preview',undefined,worker.cookie,'',true)
 must(preview.status===200&&preview.bytes.length>100,'Inventory can inspect preview')
 const reviewRoute='/api/lan/photos/'+record.id+'/review'
 must((await request(lanBase,'POST',reviewRoute,{sha256:record.sha256,confirmed:true},owner.cookie,lanBase)).status===403,'LAN owner may not approve')
 must((await request(lanBase,'GET','/api/lan/photos/'+record.id+'/approved',undefined,owner.cookie)).status===403,'LAN cannot learn approved Windows file path')
 must((await request(localBase,'GET','/api/lan/photos/'+record.id+'/approved')).status===409,'Windows cannot handoff before review')
 must((await request(localBase,'POST',reviewRoute,{sha256:record.sha256,confirmed:true},'','http://other.local')).status===403,'Windows review requires matching Origin')
 const reviewed=await request(localBase,'POST',reviewRoute,{sha256:record.sha256,confirmed:true},'',localBase)
 must(reviewed.status===200&&reviewed.body.registeredStock===false,'Windows review copies without registering stock')
 const approved=await request(localBase,'GET','/api/lan/photos/'+record.id+'/approved')
 must(approved.status===200&&approved.body.intakeFolder===reviewed.body.intakeFolder,'Windows can reopen verified approved source')
 requireApprovedPhoneReceiptSource(root,approved.body.intakeFolder)
 n++
 must(fs.existsSync(path.join(root,'lan','phone-pending',record.id+'.jpg')),'Original phone bytes retained')
 must(fs.existsSync(path.join(approved.body.intakeFolder,'source.jpg')),'Approved source is separately retained')
 must(fs.readdirSync(approved.body.intakeFolder).length===1,'No duplicate physical source created')
 const journal=fs.readFileSync(path.join(root,'audit.jsonl'),'utf8')
 must(journal.includes('WRITE_RESULT')&&journal.includes('ACCESS_DENIED'),'LAN upload and denial recorded')
 must(!journal.includes('owner-photo-123456789')&&!journal.includes(photo.toString('base64')),'Journal excludes passwords and image bytes')
 const target=path.join(approved.body.intakeFolder,'source.jpg')
 fs.writeFileSync(target,Buffer.from('tampered'))
 must((await request(localBase,'GET','/api/lan/photos/'+record.id+'/approved')).status===409,'Tampered approved source cannot be selected')
 assert.throws(()=>requireApprovedPhoneReceiptSource(root,target),/checksum/);n++
 console.log('STAGE6 PHOTO DUAL-LISTENER HTTP PASS',n)
}finally{
 if(lanServer)await new Promise(resolve=>lanServer.close(resolve))
 if(localServer)await new Promise(resolve=>localServer.close(resolve))
 if(oldPort===undefined)delete process.env.PORT;else process.env.PORT=oldPort
 fs.rmSync(root,{recursive:true,force:true})
}
