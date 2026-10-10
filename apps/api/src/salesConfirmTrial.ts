import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import sharp from 'sharp'
import {DatabaseSync} from 'node:sqlite'
import {SalesError} from './salesDrafts.js'
import {salesPreflightService} from './salesPreflight.js'
import {bootstrapCommitLab,salesCommitLab,type CommitLabInput} from './salesCommitLab.js'
import {salesStagingLab,STAGING_LAB} from './salesStagingLab.js'
import {readSchemaVersion,assertDatabaseIntegrity} from './schema.js'

const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex')
const active=new Set<string>()
function durable(file:string,data:unknown){const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(data));fs.fsyncSync(fd)}finally{fs.closeSync(fd)};try{const d=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(d)}finally{fs.closeSync(d)}}catch(e){if(process.platform!=='win32')throw e}}
type TrialInput={version:number;token:string;confirmed:true;acknowledgeZeroPrice:boolean}
type Intent={format:1;mode:'COPIED_ORDER_CONFIRM_TRIAL';orderId:string;keyHash:string;inputHash:string;input:TrialInput;createdAt:string}
export type ConfirmTrialResult={status:string;labOnly:boolean;sourceUnchanged:boolean;createdAt?:string;message?:string;canRecover?:boolean;canConfirmSale?:boolean;quantity?:number;total?:number;originalBytes?:number;optimizedBytes?:number}

/** User-facing rehearsal, never an operational sale: copies DB/selected originals before invoking the commit contract. */
export function salesConfirmTrialService(source:DatabaseSync,sandboxRoot:string){
 const root=fs.realpathSync(sandboxRoot),base=path.join(root,STAGING_LAB,'confirm-runs'),preflight=salesPreflightService(source,root)
 if(readSchemaVersion(source)!==120)throw Error('Confirmation trial only accepts the draft sandbox schema120')
 function key(value:unknown){if(typeof value!=='string'||! /^[A-Za-z0-9_-]{16,100}$/.test(value))throw new SalesError('Thiếu mã yêu cầu thử hợp lệ');return hash(value)}
 function safeDirectory(dir:string,create=false){
  if(create&&!fs.existsSync(dir)){if(fs.realpathSync(path.dirname(dir))!==path.dirname(dir))throw Error('Unsafe trial parent');fs.mkdirSync(dir)}
  if(fs.realpathSync(dir)!==dir||!fs.lstatSync(dir).isDirectory())throw Error('Unsafe trial directory')
 }
 function safeFile(file:string){if(fs.realpathSync(path.dirname(file))!==path.dirname(file)||fs.realpathSync(file)!==file||!fs.lstatSync(file).isFile())throw Error('Unsafe trial file');return fs.readFileSync(file)}
 function location(k:string){return path.join(base,k)}
 function intent(id:string,k:string){
  const dir=location(k);safeDirectory(dir)
  const i=JSON.parse(safeFile(path.join(dir,'intent.json')).toString()) as Intent
  if(i.format!==1||i.mode!=='COPIED_ORDER_CONFIRM_TRIAL'||i.orderId!==id||i.keyHash!==k||i.inputHash!==hash(JSON.stringify({orderId:id,input:i.input})))throw new SalesError('Nhật ký bản thử không khớp; cần kiểm tra thủ công',409)
  return i
 }
 function open(k:string){const dir=location(k),dbFile=path.join(dir,STAGING_LAB,'commit-lab.db');safeDirectory(dir);safeFile(dbFile);const db=new DatabaseSync(dbFile);try{if(readSchemaVersion(db)!==129)throw Error('Bản thử chưa hoàn tất migration');assertDatabaseIntegrity(db);return {db,service:salesCommitLab(db,dir)}}catch(e){db.close();throw e}}
 async function status(id:string,requestKey:unknown):Promise<ConfirmTrialResult>{
  const k=key(requestKey),dir=location(k)
  if(active.has(dir))return {status:'RUNNING',labOnly:true,sourceUnchanged:true}
  if(!fs.existsSync(dir))throw new SalesError('Chưa tìm thấy lần thử này',404)
  const i=intent(id,k)
  let opened:ReturnType<typeof open>|undefined
  try{
   opened=open(k)
   const op=opened.db.prepare('SELECT id,payload FROM lab_sale_operations WHERE request_key=?').get('commit-'+k) as {id:string;payload:string}|undefined
   if(!op)return {status:'INCOMPLETE',labOnly:true,sourceUnchanged:true,createdAt:i.createdAt,message:'Bản sao chưa chuẩn bị xong. Giữ nguyên để kiểm tra; có thể tạo lần thử mới.'}
   const state=opened.service.status(op.id)
   if(state.databaseDecision==='UNCOMMITTED'&&fs.existsSync(path.join(dir,'restored.json'))){
    const marker=JSON.parse(safeFile(path.join(dir,'restored.json')).toString()),saved=JSON.parse(op.payload) as {staged:Array<{canonical:string;staged:string;sha256:string}>}
    if(marker.operationId!==op.id||marker.inputHash!==i.inputHash)throw Error('Nhật ký phục hồi bản sao không khớp')
    for(const s of saved.staged){if(hash(safeFile(s.canonical))!==s.sha256)throw Error('Ảnh bản sao phục hồi đã đổi');try{fs.lstatSync(s.staged);throw Error('Staging vẫn có file cần kiểm tra')}catch(e:any){if(e.code!=='ENOENT')throw e}}
    return {status:'RESTORED_TRIAL',labOnly:true,sourceUnchanged:true,canRecover:false,message:'Ảnh bản sao đã phục hồi và kiểm chứng. Chưa commit bán.'}
   }
   if(state.status!=='SOLD')return {...state,createdAt:i.createdAt,sourceUnchanged:true,canRecover:state.databaseDecision==='UNCOMMITTED',message:state.databaseDecision==='UNCOMMITTED'?'Chưa commit. Có thể phục hồi ảnh bản sao.':'Bằng chứng chưa rõ. Dừng để kiểm tra thủ công.'}
   const saved=JSON.parse(op.payload) as {input:CommitLabInput;snapshot:{total:number;items:unknown[]};staged:Array<{staged:string}>}
   // Confirm retained cloned originals and every linked derivative before showing a successful rehearsal.
   opened.service.recover(op.id)
   let optimizedBytes=0
   for(const item of saved.input.items){const bytes=safeFile(item.archivePath);if(hash(bytes)!==item.archiveHash)throw Error('Ảnh nhẹ bản thử đổi checksum');const img=sharp(bytes,{limitInputPixels:40_000_000,failOn:'warning'});const m=await img.metadata();if(m.format!=='jpeg'||!m.width||!m.height||m.width>1280||m.height>1280)throw Error('Ảnh nhẹ không hợp lệ');await img.stats();optimizedBytes+=bytes.length}
   opened.service.recover(op.id)
   for(const item of saved.input.items)if(hash(safeFile(item.archivePath))!==item.archiveHash)throw Error('Ảnh nhẹ đã đổi trong lúc kiểm chứng')
   const originalBytes=saved.staged.reduce((n,s)=>n+fs.statSync(s.staged).size,0)
   return {...state,status:'SOLD_TRIAL',createdAt:i.createdAt,quantity:saved.input.items.length,total:saved.snapshot.total,originalBytes,optimizedBytes,sourceUnchanged:true,canRecover:false,canConfirmSale:false,message:'Bản sao đã commit và kiểm chứng. Nháp, ảnh và tồn đang dùng giữ nguyên.'}
  }catch(e){return {status:'RECOVERY_REQUIRED',labOnly:true,sourceUnchanged:true,canRecover:false,createdAt:i.createdAt,message:e instanceof Error?e.message:'Cần kiểm tra bản thử'}}finally{opened?.db.close()}
 }
 return {
  status,
  async confirm(id:string,raw:any,requestKey:unknown,checkpoint:(point:string)=>void=()=>{}){
   const k=key(requestKey)
   if(!raw||!Number.isSafeInteger(raw.version)||raw.version<1||typeof raw.token!=='string'||! /^[a-f0-9]{64}$/.test(raw.token)||raw.confirmed!==true||typeof raw.acknowledgeZeroPrice!=='boolean')throw new SalesError('Kiểm tra đơn và xác nhận chỉ dùng bản sao trước khi thử')
   const input:TrialInput={version:raw.version,token:raw.token,confirmed:true,acknowledgeZeroPrice:raw.acknowledgeZeroPrice},inputHash=hash(JSON.stringify({orderId:id,input})),dir=location(k)
   if(active.has(dir))throw new SalesError('Lần thử đang chạy. Kiểm tra trạng thái bằng cùng mã yêu cầu.',409)
   if(fs.existsSync(dir)){if(intent(id,k).inputHash!==inputHash)throw new SalesError('Mã thử đã dùng với nội dung khác',409);return status(id,requestKey)}
   if([...active].some(d=>d.startsWith(base+path.sep)))throw new SalesError('Đang xử lý lần thử khác. Đợi hoàn tất để giảm tải ảnh.',429)
   active.add(dir)
   let copy:DatabaseSync|undefined
   try{
    const check=await preflight.check(id,input.version,input.token)
    if(!check.checksPassed)throw new SalesError('Có ảnh chưa đủ điều kiện. Kiểm tra lại từng bộ.',409)
    if(check.zeroPriceCount&&!input.acknowledgeZeroPrice)throw new SalesError('Cần xác nhận các bộ giá 0 đồng',409)
    safeDirectory(path.join(root,STAGING_LAB),true);safeDirectory(base,true);safeDirectory(dir,true)
    durable(path.join(dir,'intent.json'),{format:1,mode:'COPIED_ORDER_CONFIRM_TRIAL',orderId:id,keyHash:k,inputHash,input,createdAt:new Date().toISOString()} satisfies Intent);checkpoint('intent')
    const lab=path.join(dir,STAGING_LAB);safeDirectory(lab,true);const warehouse=path.join(lab,'warehouse');safeDirectory(warehouse,true);const archive=path.join(lab,'archive');safeDirectory(archive,true)
    const dbFile=path.join(lab,'commit-lab.db');source.exec("VACUUM INTO '"+dbFile.replace(/'/g,"''")+"'");copy=new DatabaseSync(dbFile);bootstrapCommitLab(copy,dir);checkpoint('database')
    const files:string[]=[],images:CommitLabInput['items']=[]
    for(let n=0;n<check.items.length;n++){
     const item=check.items[n],e=item.evidence!
     const bytes=safeFile(e.sourcePath);if(bytes.length>32*1024*1024||hash(bytes)!==e.sourceHash)throw new SalesError('Ảnh nguồn đã đổi. Kiểm tra lại đơn.',409)
     const target=path.join(warehouse,item.imageId+path.extname(e.sourcePath).toLowerCase()),fd=fs.openSync(target,'wx',0o600)
     try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
     if(hash(safeFile(target))!==e.sourceHash)throw Error('Bản sao ảnh không khớp nguồn')
     copy.prepare('UPDATE product_images SET file_path=? WHERE id=?').run(target,item.imageId);files.push(target);checkpoint('clone:'+n)
     // Trusted orchestration makes the derivative from those exact source bytes; paths/hashes never come from the client.
     const light=await sharp(bytes,{limitInputPixels:40_000_000,failOn:'warning'}).rotate().resize({width:1280,height:1280,fit:'inside',withoutEnlargement:true}).flatten({background:'#fff'}).jpeg({quality:82}).toBuffer()
     await sharp(light).stats();const out=path.join(archive,item.imageId+'.jpg'),af=fs.openSync(out,'wx',0o600);try{fs.writeFileSync(af,light);fs.fsyncSync(af)}finally{fs.closeSync(af)}
     images.push({imageId:item.imageId,sourceHash:e.sourceHash,archivePath:out,archiveHash:hash(light)});checkpoint('archive:'+n)
    }
    await preflight.check(id,input.version,input.token)
    const staging=salesStagingLab(dir),plan=staging.plan(files),service=salesCommitLab(copy,dir)
    service.prepare({operationId:plan.id,requestKey:'commit-'+k,orderId:id,version:input.version,planHash:hash(safeFile(path.join(lab,plan.id+'.json'))),acknowledgeZeroPrice:input.acknowledgeZeroPrice,items:images});checkpoint('prepared')
    staging.stage(plan,checkpoint)
    await service.commit(plan.id,service.payloadHash(plan.id),checkpoint)
    durable(path.join(dir,'ready.json'),{format:1,mode:'COPIED_ORDER_CONFIRM_TRIAL',operationId:plan.id,inputHash});checkpoint('ready')
   }finally{copy?.close();active.delete(dir)}
   return status(id,requestKey)
  },
  async recover(id:string,requestKey:unknown,confirmed:unknown){
   if(confirmed!==true)throw new SalesError('Cần xác nhận phục hồi chỉ ảnh bản sao')
   const k=key(requestKey),dir=location(k);if(active.has(dir))throw new SalesError('Lần thử đang chạy',409);intent(id,k)
   const opened=open(k)
   try{const op=opened.db.prepare('SELECT id FROM lab_sale_operations WHERE request_key=?').get('commit-'+k) as {id:string}|undefined;if(!op)throw new SalesError('Chưa có bằng chứng chuẩn bị. Giữ nguyên để kiểm tra thủ công.',409);const result=opened.service.recover(op.id);if(result.status==='RESTORED'&&!fs.existsSync(path.join(dir,'restored.json')))durable(path.join(dir,'restored.json'),{operationId:op.id,inputHash:intent(id,k).inputHash});return {...result,status:result.status==='RESTORED'?'RESTORED_TRIAL':result.status,labOnly:true,sourceUnchanged:true}}finally{opened.db.close()}
  }
 }
}
