import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import sharp,{type OutputInfo} from 'sharp'
import {DatabaseSync} from 'node:sqlite'
import {salesDraftService,SalesError} from './salesDrafts.js'

export const PREVIEW_POLICY={maxDimension:1280,jpegQuality:82,proposed:true}
/** Read-only prototype: no archive, staging, database writes or original deletion. */
export function salesPreviewService(db:DatabaseSync,root:string){
 const drafts=salesDraftService(db,root),realRoot=fs.realpathSync(root)
 let busy=false
 function current(id:string,version:number){
  const d=drafts.get(id)
  if(d.status!=='DRAFT'||d.version!==version)throw new SalesError('Đơn đã thay đổi hoặc đã hủy. Mở lại và xem trước lần nữa.',409)
  if(!d.available)throw new SalesError('Có ảnh không còn hợp lệ. Kiểm tra lại đơn trước khi xem trước.',409)
  return d
 }
 function source(imageId:number){
  const row=db.prepare('SELECT file_path FROM product_images WHERE id=?').get(imageId) as {file_path:string}|undefined
  if(!row)throw new SalesError('Ảnh không còn đăng ký',409)
  const file=fs.realpathSync(row.file_path),rel=path.relative(realRoot,file)
  if(!rel||path.isAbsolute(rel)||rel==='..'||rel.startsWith('..'+path.sep))throw new SalesError('Ảnh nằm ngoài sandbox',409)
  if(!fs.statSync(file).isFile()||fs.statSync(file).size>32*1024*1024)throw new SalesError('Ảnh không hợp lệ hoặc lớn hơn 32 MB',409)
  const bytes=fs.readFileSync(file)
  if(bytes.length>32*1024*1024)throw new SalesError('Ảnh lớn hơn 32 MB',409)
  return bytes
 }
 const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex')
 async function encoded(id:string,version:number,imageId:number){
  const d=current(id,version),item=d.items.find(i=>i.image_id===imageId)
  if(!item)throw new SalesError('Ảnh không thuộc đơn này',404)
  const original=source(imageId),sourceHash=digest(original)
  let data:Buffer,info:OutputInfo
  try{
   const out=await sharp(original,{limitInputPixels:40_000_000,failOn:'warning'}).rotate().resize({width:1280,height:1280,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:82}).toBuffer({resolveWithObject:true})
   data=out.data;info=out.info
   await sharp(data).stats() // Decode output before presenting it as valid.
  }catch{throw new SalesError('Ảnh #'+imageId+' không giải mã được để tạo bản nhẹ. Ảnh gốc vẫn giữ nguyên.',422)}
  current(id,version)
  if(digest(source(imageId))!==sourceHash)throw new SalesError('Ảnh đã thay đổi trong lúc xem trước. Quét lại trước khi tiếp tục.',409)
  return {data,summary:{imageId,productName:item.product_name,size:item.size,originalBytes:original.length,optimizedBytes:data.length,width:info.width,height:info.height,sourceHash,optimizedHash:digest(data)}}
 }
 async function exclusive<T>(fn:()=>Promise<T>){if(busy)throw new SalesError('Đang chuẩn bị ảnh xem trước. Đợi hoàn tất rồi thử lại.',429);busy=true;try{return await fn()}finally{busy=false}}
 return {
  slipImage:(id:string,version:number,imageId:number)=>exclusive(()=>encoded(id,version,imageId)),
  verifySlipSources:(id:string,version:number,items:Array<{imageId:number;sourceHash:string}>)=>{current(id,version);for(const i of items)if(digest(source(i.imageId))!==i.sourceHash)throw new SalesError('Ảnh đã thay đổi trong lúc xuất phiếu. Tạo lại PNG.',409)},
  derivative:(id:string,version:number,imageId:number,hash:string)=>exclusive(async()=>{const out=await encoded(id,version,imageId);if(out.summary.sourceHash!==hash)throw new SalesError('Ảnh đã đổi sau lần xem trước. Xem trước lại.',409);return out}),
  preview:(id:string,version:number)=>exclusive(async()=>{
   const d=current(id,version),items=[]
   for(const i of d.items)items.push((await encoded(id,version,i.image_id)).summary)
   current(id,version)
   // Revalidate every source after the entire batch, including the first image.
   for(const i of items)if(digest(source(i.imageId))!==i.sourceHash)throw new SalesError('Ảnh đã thay đổi trong lúc xem trước. Thử lại.',409)
   return {orderId:id,version,policy:PREVIEW_POLICY,quantity:d.quantity,subtotal:d.subtotal,discount:d.discount,total:d.total,conflicts:d.conflicts,zeroPriceCount:d.items.filter(i=>i.unit_price===0).length,originalBytes:items.reduce((n,i)=>n+i.originalBytes,0),optimizedBytes:items.reduce((n,i)=>n+i.optimizedBytes,0),items,readOnly:true}
  }),
  image:(id:string,version:number,imageId:number,hash:string)=>exclusive(async()=>{
   const out=await encoded(id,version,imageId)
   if(out.summary.sourceHash!==hash)throw new SalesError('Ảnh đã đổi sau lần xem trước. Xem trước lại.',409)
   return out.data
  })
 }
}
