import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import https from 'node:https'
import {execFileSync} from 'node:child_process'
import {randomUUID,createHash} from 'node:crypto'
import express from 'express'
import sharp from 'sharp'
import {DatabaseSync} from 'node:sqlite'
import {bootstrapSalesDrafts} from '../apps/api/src/salesSchema.ts'
import {bootstrapSalesExecution} from '../apps/api/src/salesExecution.ts'
import {salesDraftService} from '../apps/api/src/salesDrafts.ts'
import {salesDraftRouter} from '../apps/api/src/salesRoutes.ts'
import {makeLanCredential,createLanSessionManager} from '../apps/api/src/lanSecurity.ts'
import {installLanGuard} from '../apps/api/src/lanServer.ts'
import {createLanAudit} from '../apps/api/src/lanAudit.ts'

const root=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-lan-sold-'))
let db=null,server=null,checks=0
const must=(condition,message)=>{assert.ok(condition,message);checks++}
const sha=(b)=>createHash('sha256').update(b).digest('hex')
try{
 const cert=path.join(root,'cert.pem'),key=path.join(root,'key.pem')
 execFileSync('openssl',['req','-x509','-nodes','-newkey','rsa:2048','-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1','-keyout',key,'-out',cert],{stdio:'ignore'})
 const databaseFile=path.join(root,'database','shop.db')
 fs.mkdirSync(path.dirname(databaseFile),{recursive:true})
 db=new DatabaseSync(databaseFile)
 bootstrapSalesDrafts(db)
 db.exec("INSERT INTO products(id,product_code,name) VALUES(1,'T01','Bộ test LAN');INSERT INTO product_variants(id,product_id,sku,size,cost_price,sale_price) VALUES(1,1,'T01-01','Size 1',12000,50000);INSERT INTO inventory_transactions(variant_id,transaction_type,quantity) VALUES(1,'OPENING',1)")
 const photo=path.join(root,'warehouse','Bộ test LAN','Size 1','image.jpg')
 fs.mkdirSync(path.dirname(photo),{recursive:true})
 const bytes=await sharp({create:{width:120,height:180,channels:3,background:'#ecc7dc'}}).jpeg().toBuffer()
 fs.writeFileSync(photo,bytes)
 db.prepare('INSERT INTO product_images(id,product_id,variant_id,file_path) VALUES(1,1,1,?)').run(photo)
 const draft=salesDraftService(db,root).create({items:[{imageId:1,unitPrice:50000}],discount:0,note:'LAN hai thiết bị'},'stage6-concurrent-draft-key-0001')
 bootstrapSalesExecution(db,root)
 const lan={address:'127.0.0.1',port:0,key:fs.readFileSync(key),cert:fs.readFileSync(cert),
  sessions:createLanSessionManager([
   makeLanCredential('owner','owner-password-112233','owner'),
   makeLanCredential('cashier','cashier-password-778899','cashier')
  ]),audit:createLanAudit(path.join(root,'lan-audit.jsonl'))}
 const app=express()
 app.use(express.json({limit:'2mb'}))
 installLanGuard(app,lan)
 app.use('/api/sales/drafts',salesDraftRouter(db,root,0))
 server=https.createServer({key:lan.key,cert:lan.cert},app)
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 lan.port=server.address().port
 const origin='https://127.0.0.1:'+lan.port
 async function request(method,route,body,cookie='',key=''){
  return await new Promise((resolve,reject)=>{
   const payload=body===undefined?undefined:JSON.stringify(body)
   const headers={Origin:origin,...(payload?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}:{}),...(cookie?{Cookie:cookie}:{}),...(key?{'Idempotency-Key':key}:{})}
   const req=https.request(origin+route,{method,headers,rejectUnauthorized:false},res=>{
    let text='';res.setEncoding('utf8');res.on('data',x=>text+=x);res.on('end',()=>{
     try{resolve({status:res.statusCode,data:JSON.parse(text),cookie:res.headers['set-cookie']?.[0]?.split(';')[0]})}catch(e){reject(Error('Bad HTTP JSON: '+text.slice(0,250)))}
    })
   })
   req.once('error',reject);if(payload)req.write(payload);req.end()
  })
 }
 const owner=await request('POST','/api/lan/login',{username:'owner',password:'owner-password-112233'})
 // TLS endpoint must not admit login without an Origin.
 must(owner.status===200,'Owner login via same-origin HTTPS')
 const cashier=await request('POST','/api/lan/login',{username:'cashier',password:'cashier-password-778899'})
 must(cashier.status===200,'Cashier login via same-origin HTTPS')
 const pre=await request('POST','/api/sales/drafts/'+draft.id+'/preflight',{version:1},owner.cookie)
 must(pre.status===200&&!!pre.data.token,'Real image SALE preflight through LAN')
 const body={version:1,token:pre.data.token,confirmed:true,acknowledgeZeroPrice:false}
 const a='/api/sales/drafts/'+draft.id+'/confirm'
 const [one,two]=await Promise.all([
  request('POST',a,body,owner.cookie,'concurrent-lan-confirm-owner-0001'),
  request('POST',a,body,cashier.cookie,'concurrent-lan-confirm-cashier-0001')
 ])
 const succeeded=[one,two].filter(x=>x.status===200&&x.data.status==='SOLD')
 must(succeeded.length===1,'Two authenticated devices must not both sell the image')
 must([one,two].some(x=>x.status!==200),'Second concurrent transaction must be rejected')
 must(Number(db.prepare('SELECT COUNT(*) AS n FROM sales_units').get().n)===1,'Exactly one SOLD unit committed')
 must(Number(db.prepare('SELECT COUNT(*) AS n FROM sales_ledger').get().n)===1,'Exactly one immutable SALE ledger entry')
 must(!fs.existsSync(photo),'Canonical SOLD photo no longer counted in live stock')
 const sold=await request('GET','/api/sales/drafts/'+draft.id+'/sold',undefined,cashier.cookie)
 must(sold.status===200&&sold.data.quantity===1&&sold.data.originalsRetained,'SOLD proof remains readable to authorized cashier')
 const replay=one.status===200
  ?await request('POST',a,body,owner.cookie,'concurrent-lan-confirm-owner-0001')
  :await request('POST',a,body,cashier.cookie,'concurrent-lan-confirm-cashier-0001')
 must(replay.status===200&&replay.data.status==='SOLD','Retry of confirmed request is idempotent')
 must(Number(db.prepare('SELECT COUNT(*) AS n FROM sales_ledger').get().n)===1,'Retry does not duplicate ledger')
 must(sha(bytes).length===64,'Source test hash captured')
 const log=fs.readFileSync(path.join(root,'lan-audit.jsonl'),'utf8')
 must(log.includes('WRITE_START')&&log.includes('WRITE_RESULT'),'Financial write audit persisted')
 console.log('STAGE6 REAL LAN CONCURRENT SOLD PASS',checks)
}finally{
 if(server)await new Promise(resolve=>server.close(resolve))
 if(db)db.close()
 fs.rmSync(root,{recursive:true,force:true})
}
