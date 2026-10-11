import assert from 'node:assert/strict'
import sharp from 'sharp'
import {createHash} from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {optimizeCloudImage} from './cloudImages.js'
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mc-cloud-fake-'))
try{
 const pixels=Buffer.alloc(1800*2400*3);for(let i=0;i<pixels.length;i++)pixels[i]=(i*37+(i>>8)*13)%256
 const source=await sharp(pixels,{raw:{width:1800,height:2400,channels:3}}).png().toBuffer(),file=path.join(dir,'fake.png');fs.writeFileSync(file,source)
 const before=createHash('sha256').update(source).digest('hex'),result=await optimizeCloudImage(file),meta=await sharp(result.data).metadata()
 assert.ok(result.bytes<=150000);assert.equal(meta.format,'jpeg');assert.ok(meta.width!<=1080&&meta.height!<=1080);assert.ok(Math.abs(meta.width!/meta.height!-1800/2400)<.01);assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),before)
 assert.equal((await optimizeCloudImage(result.data)).sha256,result.sha256)
 const small=await sharp({create:{width:50,height:80,channels:3,background:'#f088bb'}}).png().toBuffer(),tiny=await optimizeCloudImage(small),m=await sharp(tiny.data).metadata();assert.equal(m.width,50);assert.equal(m.height,80)
 await assert.rejects(()=>optimizeCloudImage(Buffer.from('invalid image')))
 console.log('PASS Cloud JPEG <=150KB, aspect/no upscale, source unchanged, corrupt input')
}finally{fs.rmSync(dir,{recursive:true,force:true})}
