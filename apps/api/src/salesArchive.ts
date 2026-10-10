import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import sharp from 'sharp'
import {DatabaseSync} from 'node:sqlite'
import {salesDraftService,SalesError} from './salesDrafts.js'
import {salesPreviewService,PREVIEW_POLICY} from './salesPreview.js'

export const ARCHIVE_FOLDER='.mecacao-v2-archive'
type Entry={imageId:number;sourceHash:string;optimizedHash:string;optimizedBytes:number;width:number;height:number}
type Plan={format:1;mode:'DRAFT_ARCHIVE_PROTOTYPE';keyHash:string;payloadHash:string;orderId:string;orderVersion:number;createdAt:string;policy:typeof PREVIEW_POLICY;items:Entry[]}
type Choice={version:number;images:Array<{imageId:number;sourceHash:string}>}
const hash=(data:Buffer|string)=>createHash('sha256').update(data).digest('hex')
const hex=(x:unknown):x is string=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)
function inside(root:string,file:string){const r=path.relative(root,file);return !!r&&!path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep)}
function syncDir(dir:string){try{const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}catch(e){if(process.platform!=='win32')throw e /* Windows does not offer directory fsync via node fs. */}}
function writeNew(file:string,data:Buffer|string){const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,data);fs.fsyncSync(fd)}finally{fs.closeSync(fd)};syncDir(path.dirname(file))}
function readFile(file:string,root:string){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||!inside(root,fs.realpathSync(file)))throw new SalesError('File thử lưu ảnh không an toàn. Cần kiểm tra thủ công.',409);return fs.readFileSync(file)}
/** Experimental durable derivatives only. Never stage, move or delete canonical originals. */
export function salesArchiveService(db:DatabaseSync,sandbox:string,checkpoint:(stage:string)=>void=()=>{}){
 const root=fs.realpathSync(sandbox),base=path.join(root,ARCHIVE_FOLDER),drafts=salesDraftService(db,root),preview=salesPreviewService(db,root)
 let busy=false
 function ensureBase(){if(!fs.existsSync(base)){fs.mkdirSync(base);syncDir(root)}if(fs.lstatSync(base).isSymbolicLink()||fs.realpathSync(base)!==base)throw new SalesError('Thư mục lưu thử ảnh không an toàn.',409)}
 function directory(keyHash:string){if(!hex(keyHash))throw new SalesError('Mã lưu thử không hợp lệ');return path.join(base,keyHash)}
 function readPlan(dir:string):Plan{
  const obj=JSON.parse(readFile(path.join(dir,'plan.json'),root).toString()) as Plan
  if(obj.format!==1||obj.mode!=='DRAFT_ARCHIVE_PROTOTYPE'||!hex(obj.keyHash)||directory(obj.keyHash)!==dir||!hex(obj.payloadHash)||typeof obj.orderId!=='string'||!Number.isSafeInteger(obj.orderVersion)||obj.orderVersion<1||JSON.stringify(obj.policy)!==JSON.stringify(PREVIEW_POLICY)||!Array.isArray(obj.items)||!obj.items.length||obj.items.length>100)throw new SalesError('Nhật ký lưu thử không hợp lệ. Cần kiểm tra thủ công.',409)
  const ids=new Set<number>()
  for(const e of obj.items){if(!Number.isSafeInteger(e.imageId)||e.imageId<1||ids.has(e.imageId)||!hex(e.sourceHash)||!hex(e.optimizedHash)||!Number.isSafeInteger(e.optimizedBytes)||e.optimizedBytes<1||e.optimizedBytes>32*1024*1024||!Number.isSafeInteger(e.width)||!Number.isSafeInteger(e.height)||e.width<1||e.height<1||e.width>1280||e.height>1280)throw new SalesError('Bản ghi ảnh lưu thử không hợp lệ.',409);ids.add(e.imageId)}
  return obj
 }
 function safeDir(dir:string){if(!inside(base,dir)||fs.lstatSync(dir).isSymbolicLink()||fs.realpathSync(dir)!==dir)throw new SalesError('Thư mục lưu thử đã bị thay đổi.',409)}
 function current(plan:Plan){const d=drafts.get(plan.orderId);if(d.status!=='DRAFT'||d.version!==plan.orderVersion||!d.available||d.items.length!==plan.items.length||d.items.some(i=>!plan.items.some(e=>e.imageId===i.image_id)))throw new SalesError('Nháp hoặc ảnh đã thay đổi. Giữ bộ thử cũ để đối chiếu; xem trước lại cho nháp mới.',409);return d}
 function originalsMatch(plan:Plan){current(plan);for(const e of plan.items){const row=db.prepare('SELECT file_path FROM product_images WHERE id=?').get(e.imageId) as {file_path:string};if(hash(readFile(row.file_path,root))!==e.sourceHash)throw new SalesError('Ảnh nguồn đã đổi. Giữ bộ thử cũ, không ghi đè.',409)}}
 async function verifyFiles(dir:string,plan:Plan,all:boolean){
  for(const e of plan.items){const file=path.join(dir,e.imageId+'.jpg');if(!fs.existsSync(file)){if(all)throw new SalesError('Thiếu ảnh lưu thử #'+e.imageId,409);continue}
   const data=readFile(file,root);if(data.length!==e.optimizedBytes||hash(data)!==e.optimizedHash)throw new SalesError('Ảnh lưu thử #'+e.imageId+' sai checksum; dừng để kiểm tra thủ công.',409)
   try{const m=await sharp(data).metadata();await sharp(data).stats();if(m.format!=='jpeg'||m.width!==e.width||m.height!==e.height)throw Error('wrong dimensions')}catch{throw new SalesError('Ảnh lưu thử không giải mã được; cần kiểm tra thủ công.',409)}
  }
 }
 function quickFiles(dir:string,plan:Plan){for(const e of plan.items){const file=path.join(dir,e.imageId+'.jpg'),s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size!==e.optimizedBytes||!inside(root,fs.realpathSync(file)))throw new SalesError('Ảnh lưu thử bị thiếu hoặc đổi kích thước; cần kiểm chứng đầy đủ.',409)}}
 function readReady(dir:string,plan:Plan){const marker=JSON.parse(readFile(path.join(dir,'ready.json'),root).toString());if(marker.planHash!==hash(readFile(path.join(dir,'plan.json'),root))||marker.mode!=='DRAFT_ARCHIVE_PROTOTYPE')throw new SalesError('Dấu hoàn tất lưu thử không hợp lệ.',409)}
 function summary(plan:Plan){return {archiveId:plan.keyHash,orderId:plan.orderId,version:plan.orderVersion,quantity:plan.items.length,optimizedBytes:plan.items.reduce((n,e)=>n+e.optimizedBytes,0),status:'READY',mode:plan.mode,originalsRetained:true,sold:false,policy:plan.policy}}
 async function finish(dir:string,plan:Plan){
  safeDir(dir)
  if(fs.existsSync(path.join(dir,'ready.json'))){readReady(dir,plan);await verifyFiles(dir,plan,true);return summary(plan)}
  originalsMatch(plan);await verifyFiles(dir,plan,false) // Preflight entire set before any new write.
  for(let n=0;n<plan.items.length;n++){
   const e=plan.items[n],file=path.join(dir,e.imageId+'.jpg')
   if(!fs.existsSync(file)){
    const out=await preview.derivative(plan.orderId,plan.orderVersion,e.imageId,e.sourceHash)
    if(hash(out.data)!==e.optimizedHash||out.data.length!==e.optimizedBytes)throw new SalesError('Bộ tối ưu đã khác kế hoạch. Không ghi đè ảnh thử.',409)
    originalsMatch(plan)
    safeDir(dir);writeNew(file,out.data);checkpoint('image:'+n)
   }
  }
  originalsMatch(plan);await verifyFiles(dir,plan,true);originalsMatch(plan);checkpoint('before-ready')
  safeDir(dir);writeNew(path.join(dir,'ready.json'),JSON.stringify({mode:plan.mode,planHash:hash(readFile(path.join(dir,'plan.json'),root)),completedAt:new Date().toISOString()}));checkpoint('ready')
  return summary(plan)
 }
 async function exclusive<T>(fn:()=>Promise<T>){if(busy)throw new SalesError('Đang kiểm chứng bộ lưu thử khác. Đợi hoàn tất.',429);busy=true;try{return await fn()}finally{busy=false}}
 function choice(raw:any):Choice{if(!raw||!Number.isSafeInteger(raw.version)||raw.version<1||!Array.isArray(raw.images)||!raw.images.length||raw.images.length>100)throw new SalesError('Thiếu kết quả xem trước hợp lệ');const ids=new Set<number>();for(const i of raw.images){if(!Number.isSafeInteger(i?.imageId)||i.imageId<1||ids.has(i.imageId)||!hex(i.sourceHash))throw new SalesError('Ảnh xem trước không hợp lệ');ids.add(i.imageId)}return {version:raw.version,images:[...raw.images].sort((a,b)=>a.imageId-b.imageId)}}
 return {
  prepare:(id:string,raw:unknown,key:unknown)=>exclusive(async()=>{
   if(typeof key!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(key))throw new SalesError('Thiếu mã yêu cầu lưu thử')
   const input=choice(raw),keyHash=hash(key),payloadHash=hash(JSON.stringify({id,...input}));ensureBase();const dir=directory(keyHash)
   if(fs.existsSync(dir)){
    safeDir(dir)
    if(!fs.existsSync(path.join(dir,'plan.json')))throw new SalesError('Nhật ký lưu thử chưa rõ; không ghi đè. Cần kiểm tra thủ công.',409)
    const plan=readPlan(dir);if(plan.payloadHash!==payloadHash||plan.orderId!==id)throw new SalesError('Mã yêu cầu đã dùng với nội dung khác',409)
    return finish(dir,plan)
   }
   const result=await preview.preview(id,input.version)
   if(result.items.length!==input.images.length||result.items.some(i=>input.images.find(e=>e.imageId===i.imageId)?.sourceHash!==i.sourceHash))throw new SalesError('Ảnh đã khác kết quả xem trước; xem trước lại trước khi lưu thử.',409)
   const plan:Plan={format:1,mode:'DRAFT_ARCHIVE_PROTOTYPE',keyHash,payloadHash,orderId:id,orderVersion:input.version,createdAt:new Date().toISOString(),policy:PREVIEW_POLICY,items:result.items.map(i=>({imageId:i.imageId,sourceHash:i.sourceHash,optimizedHash:i.optimizedHash,optimizedBytes:i.optimizedBytes,width:i.width,height:i.height}))}
   originalsMatch(plan);fs.mkdirSync(dir);syncDir(base);checkpoint('directory')
   writeNew(path.join(dir,'plan.json'),JSON.stringify(plan));checkpoint('plan')
   return finish(dir,plan)
  }),
  recover:(id:string,archiveId:string)=>exclusive(async()=>{ensureBase();const dir=directory(archiveId);safeDir(dir);const plan=readPlan(dir);if(plan.orderId!==id)throw new SalesError('Bộ lưu thử không thuộc đơn này',404);return finish(dir,plan)}),
  verify:(id:string,archiveId:string)=>exclusive(async()=>{ensureBase();const dir=directory(archiveId);safeDir(dir);const plan=readPlan(dir);if(plan.orderId!==id)throw new SalesError('Bộ lưu thử không thuộc đơn này',404);readReady(dir,plan);await verifyFiles(dir,plan,true);return summary(plan)}),
  list:(id:string)=>exclusive(async()=>{
   drafts.get(id);if(!fs.existsSync(base))return [];ensureBase();const rows=[]
   for(const name of fs.readdirSync(base).filter(hex).sort((a,b)=>fs.lstatSync(directory(b)).mtimeMs-fs.lstatSync(directory(a)).mtimeMs).slice(0,50)){
    const dir=directory(name)
    try{safeDir(dir);const plan=readPlan(dir);if(plan.orderId!==id)continue
     if(fs.existsSync(path.join(dir,'ready.json'))){readReady(dir,plan);quickFiles(dir,plan);rows.push({...summary(plan),verification:'AT_SAVE'})}
     else rows.push({...summary(plan),status:'INCOMPLETE',message:'Bộ thử chưa hoàn tất. Retry bằng cùng mã yêu cầu hoặc giữ để kiểm tra; chưa bán.'})
    }catch(e){rows.push({archiveId:name,status:'REVIEW_REQUIRED',message:e instanceof Error?e.message:'Nhật ký thử chưa rõ'})}
   }
   return rows
  })
 }
}
