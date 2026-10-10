import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import sharp from 'sharp'
import {soldRetentionService} from './soldRetention.js'
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex')
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mecacao-stage5-'))
const db=new DatabaseSync(':memory:')
let checks=0
const verify=(v:unknown,m:string)=>{assert.ok(v,m);checks++}
try{
 db.exec(`CREATE TABLE sales_operations(id TEXT PRIMARY KEY,payload TEXT NOT NULL,payload_hash TEXT NOT NULL,status TEXT NOT NULL);
 CREATE TABLE sales_confirmations(order_id TEXT PRIMARY KEY,operation_id TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE sales_units(image_id INTEGER PRIMARY KEY,order_id TEXT NOT NULL,snapshot TEXT NOT NULL,source_hash TEXT NOT NULL,archive_path TEXT NOT NULL,archive_hash TEXT NOT NULL);`)
 const photo=await sharp({create:{width:8,height:8,channels:3,background:'#ffcad9'}}).jpeg().toBuffer()
 const original=path.join('.mecacao-v2-sales','op1','staged','11.jpg'),preview=path.join('.mecacao-v2-sales','op1','archive','11.jpg')
 for(const f of [original,preview]){const absolute=path.join(root,f);fs.mkdirSync(path.dirname(absolute),{recursive:true});fs.writeFileSync(absolute,photo)}
 const payload=JSON.stringify({format:1,units:[{imageId:11,staged:original,archive:preview,sourceHash:hash(photo),archiveHash:hash(photo)}]})
 db.prepare('INSERT INTO sales_operations VALUES(?,?,?,?)').run('op1',payload,hash(payload),'SOLD')
 db.prepare('INSERT INTO sales_confirmations VALUES(?,?,?)').run('order1','op1','2026-10-10 10:00:00')
 db.prepare('INSERT INTO sales_units VALUES(?,?,?,?,?,?)').run(11,'order1',JSON.stringify({product_name:'Bộ gái hoa',size:'Size 1'}),hash(photo),preview,hash(photo))
 const service=soldRetentionService(db,root)
 const first=service.list(0)
 verify(first.total===1&&first.rows[0].status==='RETAINED_UNVERIFIED','List must not claim hashes were verified')
 verify(first.policy==='RETAIN_ORIGINALS'&&!first.deletionEnabled&&!first.archiveMoveEnabled,'No destructive operation may be enabled')
 const ok=await service.verify(11)
 verify(ok.status==='VERIFIED'&&ok.checksumVerified&&ok.previewDecoded,'Both evidence files must verify and decode')
 verify(ok.originalPresent&&fs.existsSync(path.join(root,original)),'Original must remain untouched')
 fs.writeFileSync(path.join(root,original),Buffer.from('tampered'))
 await assert.rejects(service.verify(11));checks++
 verify(service.list(0).rows[0].status==='RETAINED_UNVERIFIED','Presence alone must not claim integrity')
 fs.unlinkSync(path.join(root,original))
 verify(service.list(0).rows[0].status==='REVIEW_REQUIRED','Missing original must force review')
 await assert.rejects(service.verify(11));checks++
 assert.throws(()=>service.list(-1));checks++
 console.log('STAGE5 SELF TEST PASS',checks)
}finally{db.close();fs.rmSync(root,{recursive:true,force:true})}
