import fs from 'node:fs'
import path from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import sharp from 'sharp'
import {contained,digest,exactFile} from './salesExecution.js'

type SoldRow={
 imageId:number;orderId:string;snapshot:string;sourceHash:string;archivePath:string;archiveHash:string;
 soldAt:string;payload:string;payloadHash:string;operationStatus:string
}
type RetentionStatus='RETAINED_UNVERIFIED'|'REVIEW_REQUIRED'
export type RetentionRow={
 imageId:number;orderId:string;soldAt:string;productName:string;size:string;status:RetentionStatus;
 originalPresent:boolean;originalBytes:number;previewPresent:boolean;previewBytes:number;
 previewUrl:string;message:string
}

/**
 * Stage 5 / checkpoint 1: read-only physical evidence inventory.
 * No ALTER/INSERT/UPDATE/DELETE, no file movement, no cleanup scheduling.
 * The original SOLD bytes remain in the immutable transaction staging area.
 */
export function soldRetentionService(db:DatabaseSync,warehouseRoot:string){
 const root=fs.realpathSync(warehouseRoot)
 function at(relative:unknown){
  if(typeof relative!=='string'||!relative||path.isAbsolute(relative))throw Error('Đường dẫn chứng từ không hợp lệ')
  const target=path.resolve(root,relative)
  if(!contained(root,target)||path.relative(root,target)!==relative)throw Error('Đường dẫn ảnh nằm ngoài kho')
  return target
 }
 function rows(offset:number,limit:number):SoldRow[]{
  return db.prepare(`SELECT u.image_id AS imageId,u.order_id AS orderId,u.snapshot,u.source_hash AS sourceHash,
 u.archive_path AS archivePath,u.archive_hash AS archiveHash,c.created_at AS soldAt,
 o.payload,o.payload_hash AS payloadHash,o.status AS operationStatus
 FROM sales_units u JOIN sales_confirmations c ON c.order_id=u.order_id
 JOIN sales_operations o ON o.id=c.operation_id
 ORDER BY c.created_at DESC,u.image_id DESC LIMIT ? OFFSET ?`).all(limit,offset) as SoldRow[]
 }
 function plan(r:SoldRow){
  if(r.operationStatus!=='SOLD'||digest(r.payload)!==r.payloadHash)throw Error('Bằng chứng giao dịch cần đối soát')
  const parsed=JSON.parse(r.payload)
  if(parsed.format!==1||!Array.isArray(parsed.units))throw Error('Nhật ký lưu ảnh chưa hợp lệ')
  const entry=parsed.units.find((u:any)=>u.imageId===r.imageId)
  if(!entry||entry.sourceHash!==r.sourceHash||entry.archive!==r.archivePath||entry.archiveHash!==r.archiveHash)throw Error('Ảnh và nhật ký SOLD không khớp')
  return entry as {staged:string;archive:string;sourceHash:string;archiveHash:string}
 }
 function describe(r:SoldRow):RetentionRow{
  let snapshot:{product_name?:string;size?:string}={}
  try{snapshot=JSON.parse(r.snapshot)}catch{/* Corrupt historic snapshot must not block remaining evidence listings. */}
  const result:RetentionRow={
   imageId:r.imageId,orderId:r.orderId,soldAt:r.soldAt,productName:String(snapshot.product_name??'Bộ hàng'),
   size:String(snapshot.size??''),status:'REVIEW_REQUIRED',originalPresent:false,originalBytes:0,
   previewPresent:false,previewBytes:0,previewUrl:'/api/sales/drafts/'+encodeURIComponent(r.orderId)+'/sold-image/'+r.imageId,
   message:'Cần kiểm chứng chứng từ'
  }
  try{
   const p=plan(r)
   const original=at(p.staged),preview=at(p.archive)
   // Do not hash large originals during list reads. This is presence ONLY.
   const stat=(f:string)=>{const s=fs.lstatSync(f);if(!s.isFile()||s.isSymbolicLink()||fs.realpathSync(f)!==f)throw Error('Ảnh cần kiểm tra đường dẫn');return s.size}
   result.originalBytes=stat(original);result.originalPresent=true
   result.previewBytes=stat(preview);result.previewPresent=true
   result.status='RETAINED_UNVERIFIED';result.message='Đã tìm thấy ảnh gốc và ảnh chứng từ; chưa xác minh checksum'
  }catch{result.message='Thiếu ảnh hoặc bằng chứng SOLD không khớp; cần đối soát, không được xóa'}
  return result
 }
 function total(){return Number((db.prepare('SELECT COUNT(*) n FROM sales_units').get() as {n:number}).n)}
 function list(rawOffset:unknown=0){
  const offset=Number(rawOffset)
  if(!Number.isSafeInteger(offset)||offset<0)throw Error('Trang dữ liệu không hợp lệ')
  const limit=25
  return {policy:'RETAIN_ORIGINALS',deletionEnabled:false,archiveMoveEnabled:false,offset,limit,total:total(),rows:rows(offset,limit).map(describe)}
 }
 async function verify(rawId:unknown){
  const imageId=Number(rawId)
  if(!Number.isSafeInteger(imageId)||imageId<=0)throw Error('Mã ảnh không hợp lệ')
  const r=db.prepare(`SELECT u.image_id AS imageId,u.order_id AS orderId,u.snapshot,u.source_hash AS sourceHash,
 u.archive_path AS archivePath,u.archive_hash AS archiveHash,c.created_at AS soldAt,
 o.payload,o.payload_hash AS payloadHash,o.status AS operationStatus
 FROM sales_units u JOIN sales_confirmations c ON c.order_id=u.order_id
 JOIN sales_operations o ON o.id=c.operation_id WHERE u.image_id=?`).get(imageId) as SoldRow|undefined
  if(!r)throw Error('Không tìm thấy ảnh SOLD')
  const entry=plan(r)
  const original=exactFile(at(entry.staged),entry.sourceHash)
  const preview=exactFile(at(entry.archive),entry.archiveHash)
  await sharp(original).stats()
  await sharp(preview).stats()
  return {...describe(r),status:'VERIFIED',checksumVerified:true,previewDecoded:true,message:'Ảnh gốc và preview đã xác minh SHA-256, giải mã thành công; không xóa ảnh'} as const
 }
 return {list,verify}
}
