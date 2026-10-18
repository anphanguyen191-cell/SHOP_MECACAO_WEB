import sharp from 'sharp'
import {createHash} from 'node:crypto'
import fs from 'node:fs'
import type {DatabaseSync} from 'node:sqlite'
export const CLOUD_IMAGE_LIMIT=150000
/** One JPEG; no write to the source. Bound decoding prevents decompression bombs. */
export async function optimizeCloudImage(source:string|Buffer){
 const bytes=typeof source==='string'?fs.statSync(source).size:source.length
 if(bytes>32*1024*1024)throw Error('Ảnh nguồn vượt 32MB. Chọn ảnh nhỏ hơn.')
 const image=sharp(source,{limitInputPixels:40000000}),meta=await image.metadata()
 // A JPEG already optimized by the iPhone inbox remains the single Cloud file.
 // Reuse only metadata-free sRGB pixels; originals with EXIF are still stripped.
 if(bytes<=CLOUD_IMAGE_LIMIT&&meta.format==='jpeg'&&meta.space==='srgb'&&meta.width&&meta.height&&Math.max(meta.width,meta.height)<=1080&&!meta.exif&&!meta.icc&&!meta.iptc&&!meta.xmp){
  await image.stats();const data=typeof source==='string'?fs.readFileSync(source):source
  return {data,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),size:Math.max(meta.width,meta.height),quality:0}
 }
 for(const size of [1080,960,840,720])for(const quality of [82,76,70,64]){
  const data=await sharp(source,{limitInputPixels:40000000}).rotate().resize({width:size,height:size,fit:'inside',withoutEnlargement:true}).toColourspace('srgb').jpeg({quality,mozjpeg:true}).toBuffer()
  if(data.length<=CLOUD_IMAGE_LIMIT)return {data,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),size,quality}
 }
 throw Error('Ảnh chưa đạt 150KB với chất lượng phù hợp. Chọn ảnh khác hoặc kiểm tra ảnh nguồn.')
}

// Only digest pairs are cached (no source copies or JPEG copies). Re-read and
// hash source bytes on every request so same-size/mtime replacements are detected.
const verifiedDigests=new Map<string,string>()
// Version the digest pairs with the encoder. A new encoding policy must use a
// different key; old JPEG hashes must never certify bytes from another policy.
const encoding='jpeg-1080-150k-v1:sharp-'+sharp.versions.sharp+':vips-'+sharp.versions.vips
export function createCloudImageDigestCache(db:DatabaseSync){
 db.exec('CREATE TABLE IF NOT EXISTS cloud_image_digests(encoding TEXT NOT NULL,source_sha TEXT NOT NULL,jpeg_sha TEXT NOT NULL,PRIMARY KEY(encoding,source_sha))')
 const read=db.prepare('SELECT jpeg_sha FROM cloud_image_digests WHERE encoding=? AND source_sha=?')
 const write=db.prepare('INSERT INTO cloud_image_digests(encoding,source_sha,jpeg_sha) VALUES(?,?,?) ON CONFLICT(encoding,source_sha) DO UPDATE SET jpeg_sha=excluded.jpeg_sha')
 return {get:(sourceSha:string)=>{const value=read.get(encoding,sourceSha)?.jpeg_sha;return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)?value:undefined},set:(sourceSha:string,jpegSha:string)=>{write.run(encoding,sourceSha,jpegSha)}}
}
type DigestCache=ReturnType<typeof createCloudImageDigestCache>
export async function cloudImageForSync(source:string,knownSha?:string,cache?:DigestCache){
 if(fs.statSync(source).size>32*1024*1024)throw Error('Ảnh nguồn vượt 32MB.')
 const input=fs.readFileSync(source),sourceSha=createHash('sha256').update(input).digest('hex')
 if(knownSha===sourceSha){cache?.set(sourceSha,sourceSha);return {sha256:sourceSha,data:null,optimized:false}}
 const previous=cache?cache.get(sourceSha):verifiedDigests.get(sourceSha)
 if(knownSha&&previous===knownSha){
  verifiedDigests.delete(sourceSha);verifiedDigests.set(sourceSha,previous)
  return {sha256:previous,data:null,optimized:false}
 }
 const result=await optimizeCloudImage(input)
 cache?.set(sourceSha,result.sha256)
 verifiedDigests.delete(sourceSha);verifiedDigests.set(sourceSha,result.sha256)
 if(verifiedDigests.size>10000)verifiedDigests.delete(verifiedDigests.keys().next().value!)
 return {sha256:result.sha256,data:knownSha===result.sha256?null:result.data,optimized:true}
}
