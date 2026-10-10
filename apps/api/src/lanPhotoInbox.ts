import fs from 'node:fs'
import path from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import sharp from 'sharp'

export const PHONE_PHOTO_MAX_BYTES=4*1024*1024
export const PHONE_PHOTO_MAX_COUNT=200
type PhotoMime='image/jpeg'|'image/png'|'image/webp'
export type PhonePhoto={
 id:string;sha256:string;mime:PhotoMime;bytes:number;width:number;height:number;
 sourceName:string;receivedBy:string;receivedAt:string;
 status:'PENDING_REVIEW'|'REVIEWED_NOT_REGISTERED';reviewedAt?:string
}
const allowed:Record<PhotoMime,{ext:string;format:string}>={
 'image/jpeg':{ext:'.jpg',format:'jpeg'},
 'image/png':{ext:'.png',format:'png'},
 'image/webp':{ext:'.webp',format:'webp'}
}
const validId=(id:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex')
function safeFolder(dir:string){
 const full=path.resolve(dir)
 fs.mkdirSync(full,{recursive:true})
 if(fs.realpathSync(full)!==full||fs.lstatSync(full).isSymbolicLink()||!fs.lstatSync(full).isDirectory())throw Error('Thư mục ảnh chờ không an toàn')
 return full
}
export class PhonePhotoError extends Error{constructor(message:string,public status=400){super(message)}}
/**
 * Quarantined inbox is outside the canonical warehouse, stock and ledger.
 * Only reviewed immutable COPIES are eligible for the existing Windows
 * Goods Receipt workflow; no approval here writes to products or stock.
 */
export function createPhonePhotoInbox(inboxRoot:string,approvedRoot:string,rejectKnownHash?:(sha256:string,bytes:number)=>void){
 const inbox=safeFolder(inboxRoot),approved=safeFolder(approvedRoot)
 if(inbox===approved||inbox.startsWith(approved+path.sep)||approved.startsWith(inbox+path.sep))throw Error('Khu ảnh chờ và khu đã duyệt phải tách biệt')
 const metaFile=(id:string)=>path.join(inbox,id+'.json')
 function get(id:string):PhonePhoto{
  if(!validId(id))throw new PhonePhotoError('Mã ảnh không hợp lệ',404)
  const file=metaFile(id)
  if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink()||fs.realpathSync(file)!==file)throw new PhonePhotoError('Không có ảnh trong hộp chờ',404)
  let record:PhonePhoto
  try{record=JSON.parse(fs.readFileSync(file,'utf8'))}catch{throw new PhonePhotoError('Metadata ảnh bị hỏng; dừng xử lý',409)}
  if(record?.id!==id||!Object.prototype.hasOwnProperty.call(allowed,record.mime)||!/^[a-f0-9]{64}$/.test(record.sha256)||!['PENDING_REVIEW','REVIEWED_NOT_REGISTERED'].includes(record.status))throw new PhonePhotoError('Metadata ảnh không hợp lệ; dừng xử lý',409)
  return record
 }
 function list(){
  const names=fs.readdirSync(inbox).filter(name=>/^[0-9a-f-]{36}\.json$/.test(name))
  if(names.length>PHONE_PHOTO_MAX_COUNT)throw new PhonePhotoError('Hộp chờ đã vượt giới hạn, cần kiểm tra trên Windows',409)
  return names.map(n=>get(n.slice(0,-5))).sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt))
 }
 function sourcePath(record:PhonePhoto){
  const file=path.join(inbox,record.id+allowed[record.mime].ext)
  if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink()||fs.realpathSync(file)!==file)throw new PhonePhotoError('Ảnh gốc không còn nguyên vẹn',409)
  return file
 }
 function writeMeta(record:PhonePhoto,exclusive:boolean){
  const target=metaFile(record.id)
  if(exclusive){
   const fd=fs.openSync(target,'wx',0o600)
   try{fs.writeFileSync(fd,JSON.stringify(record)+'\n');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
  }else{
   const temp=target+'.tmp-'+randomUUID()
   const fd=fs.openSync(temp,'wx',0o600)
   try{fs.writeFileSync(fd,JSON.stringify(record)+'\n');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
   fs.renameSync(temp,target)
  }
 }
 let stageQueue:Promise<unknown>=Promise.resolve()
 async function stage(body:unknown,actor:string){
  if(!body||typeof body!=='object')throw new PhonePhotoError('Thiếu ảnh gửi từ điện thoại')
  const b=body as {filename?:unknown;mime?:unknown;base64?:unknown}
  if(typeof b.mime!=='string'||!Object.prototype.hasOwnProperty.call(allowed,b.mime))throw new PhonePhotoError('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP. Ảnh HEIC cần chuyển sang JPEG trước khi tải lên.')
  const mime=b.mime as PhotoMime
  if(typeof b.base64!=='string'||!b.base64.length||b.base64.length>Math.ceil(PHONE_PHOTO_MAX_BYTES*4/3)+4||!/^[a-zA-Z0-9+/]+={0,2}$/.test(b.base64))throw new PhonePhotoError('Nội dung ảnh hoặc dung lượng không hợp lệ (tối đa 4 MB)')
  const bytes=Buffer.from(b.base64,'base64')
  if(bytes.length===0||bytes.length>PHONE_PHOTO_MAX_BYTES)throw new PhonePhotoError('Ảnh vượt 4 MB, chưa đưa vào hộp chờ',413)
  const metadata=await sharp(bytes,{limitInputPixels:32_000_000}).metadata().catch(()=>{throw new PhonePhotoError('Ảnh không giải mã được hoặc quá lớn')})
  if(metadata.format!==allowed[mime].format||!metadata.width||!metadata.height||metadata.width<160||metadata.height<160||metadata.width*metadata.height>32_000_000)throw new PhonePhotoError('Định dạng thực tế hoặc kích thước ảnh không đạt')
  // Full pixel decode catches truncated/invalid compressed payloads before persistent write.
  const preview=await sharp(bytes,{limitInputPixels:32_000_000}).rotate().resize({width:720,height:720,fit:'inside',withoutEnlargement:true}).jpeg({quality:78}).toBuffer().catch(()=>{throw new PhonePhotoError('Ảnh giải mã không hoàn chỉnh')})
  const hash=sha(bytes)
  const commit=()=>{
  for(const r of list())if(r.sha256===hash)throw new PhonePhotoError('Ảnh trùng trong hộp chờ ('+r.id.slice(0,8)+'). Không tạo bản sao.',409)
  rejectKnownHash?.(hash,bytes.length)
  const current=list()
  if(current.length>=PHONE_PHOTO_MAX_COUNT)throw new PhonePhotoError('Hộp chờ tối đa 200 ảnh. Cần đối soát trước khi nhận tiếp.',409)
  const id=randomUUID()
  const record:PhonePhoto={id,sha256:hash,mime,bytes:bytes.length,width:metadata.width,height:metadata.height,
   sourceName:typeof b.filename==='string'?b.filename.replace(/[\\/<>:"|?*\x00-\x1f]/g,'_').slice(0,100):'Ảnh iPhone',receivedBy:actor.slice(0,40),
   receivedAt:new Date().toISOString(),status:'PENDING_REVIEW'}
  const original=path.join(inbox,id+allowed[mime].ext),thumb=path.join(inbox,id+'-preview.jpg')
  try{
   for(const [file,payload] of [[original,bytes],[thumb,preview]] as const){
    const fd=fs.openSync(file,'wx',0o600)
    try{fs.writeFileSync(fd,payload);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
   }
   writeMeta(record,true)
   return record
  }catch(e){
   // Only cleanup freshly created unpublished files. Never remove originals after publication.
   if(!fs.existsSync(metaFile(id))){for(const file of [original,thumb])try{fs.unlinkSync(file)}catch{}}
   throw e
  }
  }
  // Serialize publication after decoding so concurrent identical uploads cannot bypass SHA dedupe.
  const job=stageQueue.then(commit,commit)
  stageQueue=job.then(()=>undefined,()=>undefined)
  return await job
 }
 function preview(id:string){
  const record=get(id),original=sourcePath(record)
  if(sha(fs.readFileSync(original))!==record.sha256)throw new PhonePhotoError('Checksum ảnh gốc không khớp; dừng xem ảnh',409)
  const file=path.join(inbox,id+'-preview.jpg')
  if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink()||fs.realpathSync(file)!==file)throw new PhonePhotoError('Ảnh xem trước không còn',409)
  return fs.readFileSync(file)
 }
 function review(id:string,hash:string,confirmed:boolean){
  if(confirmed!==true)throw new PhonePhotoError('Cần xác nhận đối chiếu ảnh trên Windows')
  const r=get(id),source=sourcePath(r)
  if(hash!==r.sha256||sha(fs.readFileSync(source))!==r.sha256)throw new PhonePhotoError('Checksum đã thay đổi. Không chuyển bản sao ảnh.',409)
  const destDir=safeFolder(path.join(approved,r.id))
  const target=path.join(destDir,'source'+allowed[r.mime].ext)
  if(fs.existsSync(target)){
   if(fs.lstatSync(target).isSymbolicLink()||fs.realpathSync(target)!==target||sha(fs.readFileSync(target))!==r.sha256)throw new PhonePhotoError('Bản sao đã duyệt có thay đổi. Dừng xử lý.',409)
  }else{
   fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL)
   const fd=fs.openSync(target,'r')
   try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
   if(sha(fs.readFileSync(target))!==r.sha256)throw new PhonePhotoError('Bản sao không đạt checksum',409)
  }
  if(r.status==='PENDING_REVIEW'){r.status='REVIEWED_NOT_REGISTERED';r.reviewedAt=new Date().toISOString();writeMeta(r,false)}
  return {...r,intakeFolder:destDir,registeredStock:false}
 }
 return {stage,list,get,preview,review}
}
