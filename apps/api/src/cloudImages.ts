import sharp from 'sharp'
import {createHash} from 'node:crypto'
import fs from 'node:fs'
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
