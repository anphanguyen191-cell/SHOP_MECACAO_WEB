import assert from 'node:assert/strict'
import sharp from 'sharp'
import {createHash} from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {spawnSync} from 'node:child_process'
import {optimizeCloudImage,cloudImageForSync,createCloudImageDigestCache} from './cloudImages.js'
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
 // A fresh process has no RAM cache. It must verify original bytes and reuse
 // the durable digest pair without another JPEG encode or JPEG response.
 const dbPath=path.join(dir,'cache.sqlite'),db=new DatabaseSync(dbPath),cache=createCloudImageDigestCache(db)
 const seeded=await cloudImageForSync(file,first.sha256,cache)
 assert.equal(seeded.data,null);assert.equal(seeded.optimized,true)
 db.close()
 const child=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',`import {DatabaseSync} from 'node:sqlite';import {cloudImageForSync,createCloudImageDigestCache} from ${JSON.stringify(new URL('./cloudImages.ts',import.meta.url).href)};const db=new DatabaseSync(process.argv[1]);const before=performance.now();const r=await cloudImageForSync(process.argv[2],process.argv[3],createCloudImageDigestCache(db));console.log(JSON.stringify({optimized:r.optimized,noJpeg:r.data===null,sha:r.sha256,ms:performance.now()-before}));db.close();`,dbPath,file,first.sha256],{encoding:'utf8'})
 assert.equal(child.status,0,child.stderr);const restarted=JSON.parse(child.stdout.trim());assert.equal(restarted.optimized,false);assert.equal(restarted.noJpeg,true);assert.equal(restarted.sha,first.sha256)
 const reopened=new DatabaseSync(dbPath),againCache=createCloudImageDigestCache(reopened)
 const cachedA=await cloudImageForSync(changed,undefined,againCache)
 fs.writeFileSync(changed,rawA);fs.utimesSync(changed,oldStat.atime,oldStat.mtime)
 const replaced=await cloudImageForSync(changed,cachedA.sha256,againCache);assert.notEqual(replaced.sha256,cachedA.sha256);assert.equal(replaced.optimized,true)
 reopened.close()
 console.log('IMAGE_RESTART_BENCHMARK',JSON.stringify({coldMs:Math.round(coldMs),restartMs:Math.round(restarted.ms),restartJpegEncodes:0,repeatedJpegBytes:0}))
 fs.unlinkSync(changed);await assert.rejects(()=>cloudImageForSync(changed,b.sha256))
 console.log('IMAGE_SYNC_BENCHMARK',JSON.stringify({coldMs:Math.round(coldMs),warmMs:Math.round(warmMs),repeatedJpegBytes:0,sourceBytes:source.length}))
 console.log('PASS Cloud JPEG <=150KB, aspect/no upscale, source unchanged, corrupt input')
}finally{fs.rmSync(dir,{recursive:true,force:true})}
