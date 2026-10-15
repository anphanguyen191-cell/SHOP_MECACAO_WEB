import assert from 'node:assert/strict'
import sharp from 'sharp'
import {createHash} from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {optimizeCloudImage,cloudImageForSync} from './cloudImages.js'
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mc-cloud-fake-'))
try{
 const pixels=Buffer.alloc(1800*2400*3);for(let i=0;i<pixels.length;i++)pixels[i]=(i*37+(i>>8)*13)%256
 const source=await sharp(pixels,{raw:{width:1800,height:2400,channels:3}}).png().toBuffer(),file=path.join(dir,'fake.png');fs.writeFileSync(file,source)
 const before=createHash('sha256').update(source).digest('hex'),result=await optimizeCloudImage(file),meta=await sharp(result.data).metadata()
 assert.ok(result.bytes<=150000);assert.equal(meta.format,'jpeg');assert.ok(meta.width!<=1080&&meta.height!<=1080);assert.ok(Math.abs(meta.width!/meta.height!-1800/2400)<.01);assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),before)
 assert.equal((await optimizeCloudImage(result.data)).sha256,result.sha256)
 const small=await sharp({create:{width:50,height:80,channels:3,background:'#f088bb'}}).png().toBuffer(),tiny=await optimizeCloudImage(small),m=await sharp(tiny.data).metadata();assert.equal(m.width,50);assert.equal(m.height,80)
 await assert.rejects(()=>optimizeCloudImage(Buffer.from('invalid image')))
 const t0=performance.now(),first=await cloudImageForSync(file),coldMs=performance.now()-t0
 const t1=performance.now(),again=await cloudImageForSync(file,first.sha256),warmMs=performance.now()-t1
 assert.equal(again.data,null);assert.equal(again.sha256,first.sha256)
 const changed=path.join(dir,'mutable.bmp')
 const rawA=await sharp({create:{width:40,height:40,channels:3,background:'#ff0000'}}).png().toBuffer()
 const rawB=await sharp({create:{width:40,height:40,channels:3,background:'#0000ff'}}).png().toBuffer()
 fs.writeFileSync(changed,rawA);const a=await cloudImageForSync(changed),oldStat=fs.statSync(changed)
 fs.writeFileSync(changed,rawB);fs.utimesSync(changed,oldStat.atime,oldStat.mtime)
 const b=await cloudImageForSync(changed,a.sha256);assert.notEqual(b.data,null);assert.notEqual(b.sha256,a.sha256)
 assert.notEqual((await cloudImageForSync(file,'0'.repeat(64))).data,null)
 fs.unlinkSync(changed);await assert.rejects(()=>cloudImageForSync(changed,b.sha256))
 console.log('IMAGE_SYNC_BENCHMARK',JSON.stringify({coldMs:Math.round(coldMs),warmMs:Math.round(warmMs),repeatedJpegBytes:0,sourceBytes:source.length}))
 console.log('PASS Cloud JPEG <=150KB, aspect/no upscale, source unchanged, corrupt input')
}finally{fs.rmSync(dir,{recursive:true,force:true})}
