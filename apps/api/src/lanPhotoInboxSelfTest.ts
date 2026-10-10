import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import {createPhonePhotoInbox,PHONE_PHOTO_MAX_BYTES} from './lanPhotoInbox.js'
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-phone-inbox-'))
let n=0
const check=(value:unknown,msg:string)=>{assert.ok(value,msg);n++}
try{
 const inbox=createPhonePhotoInbox(path.join(root,'inbox'),path.join(root,'approved'))
 const jpg=await sharp({create:{width:440,height:660,channels:3,background:'#fae4d4'}}).jpeg().toBuffer()
 const b={filename:'Ảnh áo mẫu.jpg',mime:'image/jpeg',base64:jpg.toString('base64')}
 const first=await inbox.stage(b,'inventory1')
 check(first.status==='PENDING_REVIEW'&&first.width===440,'Photo remains pending and dimensions checked')
 check(inbox.list().length===1,'Listed in sandbox inbox')
 check(inbox.preview(first.id).length>0,'Preview generated')
 await assert.rejects(inbox.stage(b,'inventory1'),/trùng/);n++
 await assert.rejects(inbox.stage({...b,mime:'image/png'},'inventory1'),/Định dạng/);n++
 await assert.rejects(inbox.stage({...b,base64:'abc'},'inventory1'),/giải mã|Nội dung/);n++
 await assert.rejects(inbox.stage({...b,base64:Buffer.alloc(PHONE_PHOTO_MAX_BYTES+1).toString('base64')},'inventory1'),/4 MB/);n++
 assert.throws(()=>inbox.review(first.id,'0'.repeat(64),true),/Checksum/);n++
 check(inbox.list()[0].status==='PENDING_REVIEW','Failed verification does not approve')
 const reviewed=inbox.review(first.id,first.sha256,true)
 check(reviewed.status==='REVIEWED_NOT_REGISTERED'&&reviewed.registeredStock===false,'Review does not register inventory')
 check(fs.existsSync(path.join(reviewed.intakeFolder,'source.jpg')),'Approved copy available to Windows receipt')
 check(fs.existsSync(path.join(root,'inbox',first.id+'.jpg')),'Immutable staged source retained')
 check(inbox.review(first.id,first.sha256,true).registeredStock===false,'Review retry idempotent')
 check(inbox.approvedSource(first.id).intakeFolder===reviewed.intakeFolder,'Previously approved source can be reopened after review')
 assert.throws(()=>inbox.approvedSource('not-an-id'),/Mã ảnh/);n++
 const reopen=createPhonePhotoInbox(path.join(root,'inbox'),path.join(root,'approved'))
 check(reopen.approvedSource(first.id).sha256===first.sha256,'Approved source available after application restart')

 const bytes2=await sharp({create:{width:500,height:500,channels:3,background:'#d3e1f3'}}).jpeg().toBuffer()
 const concur={filename:'second.jpg',mime:'image/jpeg',base64:bytes2.toString('base64')}
 const concurrent=await Promise.allSettled([inbox.stage(concur,'inventory1'),inbox.stage(concur,'inventory1')])
 check(concurrent.filter(r=>r.status==='fulfilled').length===1,'Concurrent duplicate upload permits exactly one record')
 check(concurrent.filter(r=>r.status==='rejected').length===1,'Concurrent duplicate is rejected')
 check(inbox.list().length===2,'Only two unique photos staged')

 check(fs.readdirSync(reviewed.intakeFolder).length===1,'One approved physical image')
 const copy=path.join(reviewed.intakeFolder,'source.jpg')
 const originalCopy=fs.readFileSync(copy)
 fs.writeFileSync(copy,Buffer.from('tampered'))
 assert.throws(()=>inbox.approvedSource(first.id),/checksum/);n++
 fs.writeFileSync(copy,originalCopy)
 check(inbox.approvedSource(first.id).registeredStock===false,'Reopening approval never registers inventory')

 const sold=createPhonePhotoInbox(path.join(root,'sold-inbox'),path.join(root,'sold-approved'),()=>{throw Error('Ảnh SOLD')})
 await assert.rejects(sold.stage(b,'inventory1'),/SOLD/);n++
 check(sold.list().length===0,'Sold image not staged')
 console.log('STAGE6 PHONE INBOX PASS',n)
}finally{fs.rmSync(root,{recursive:true,force:true})}
