import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import sharp from 'sharp'
import type {DatabaseSync} from 'node:sqlite'
import {salesActivity} from './salesExecution.js'
import {rejectSoldSource} from './soldSource.js'
import {knownUnitCost} from './priceBulk.js'
import {reserveNamedImageSequences} from './imageNaming.js'
import {isInternalWarehousePath} from './warehouseAreas.js'

const extensions=new Set(['.jpg','.jpeg','.png','.webp','.heic'])
const hash=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex')
const stamp=(s:fs.Stats)=>[s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs].join(':')
type Photo={file:string;fingerprint:string;product:string;size:string}
type LiveState={root:string;revision:number;acknowledged:number;signature:string;ready:boolean;phase:string;error:string;registered:number;pending:number;changedAt:string|null}
export function createWarehouseLive(db:DatabaseSync,rootInput:string,blocked:()=>boolean,onChanged:()=>void,options:{settleMs?:number;clock?:()=>number}={}){
 const root=fs.realpathSync(rootInput),clock=options.clock??Date.now,settle=options.settleMs??1500
 db.exec(`CREATE TABLE IF NOT EXISTS warehouse_live_images(image_id INTEGER PRIMARY KEY REFERENCES product_images(id) ON DELETE CASCADE,file_path TEXT NOT NULL,sha256 TEXT NOT NULL,fingerprint TEXT NOT NULL);`)
 const saved=db.prepare("SELECT value FROM app_settings WHERE key='warehouse-live'").get()
 let state:LiveState={root,revision:0,acknowledged:0,signature:'',ready:false,phase:'CHECKING',error:'',registered:0,pending:0,changedAt:null}
 if(saved){const old=JSON.parse(String(saved.value));if(old.root===root)state={...state,...old,ready:false,phase:'CHECKING',error:''}}
 let candidate='',candidateSince=0,running=false,closed=false,lastProcessed='',lastCatalog='',nativeDirty=true,lastRead=0,generation=0,watcher:fs.FSWatcher|undefined,timer:ReturnType<typeof setInterval>|undefined
 const catalogSignature=()=>hash(JSON.stringify([db.prepare('SELECT id,variant_id,file_path FROM product_images ORDER BY id').all(),db.prepare('SELECT id,product_id,size,status,cost_price,sale_price FROM product_variants ORDER BY id').all(),db.prepare('SELECT id,name,status FROM products ORDER BY id').all(),db.prepare("SELECT 1 FROM sqlite_master WHERE name='sales_units'").get()?db.prepare('SELECT image_id FROM sales_units ORDER BY image_id').all():[]]))
 const anchor=stamp(fs.statSync(root)).split(':').slice(0,2).join(':'),cache=new Map<string,{fingerprint:string;sha:string}>()
 let paths=new Set<string>(),allMissingConfirmed=false
 const listeners=new Set<{send:(state:ReturnType<typeof snapshot>)=>void;close:()=>void}>()
 let lastWarnings=''
 const persist=()=>db.prepare("INSERT INTO app_settings(key,value) VALUES('warehouse-live',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=datetime('now')").run(JSON.stringify(state))
 function snapshot(){return {...state,enabled:true,pendingSync:state.revision>state.acknowledged,allMissingConfirmed}}
 function emit(){for(const listener of listeners)listener.send(snapshot())}
 function dirty(){generation++;nativeDirty=true;candidateSince=clock();candidate='';state.ready=false;state.phase='SETTLING'}
 function acknowledge(revision:number){
  if(!Number.isSafeInteger(revision)||revision<0||revision>state.revision)throw Error('Mốc đồng bộ folder không hợp lệ')
  state.acknowledged=Math.max(state.acknowledged,revision);persist();emit();return snapshot()
 }
 async function inspect(){
  if(closed||running)return snapshot()
  if(blocked()){if(!state.ready)state.phase='WAITING';return snapshot()}
  running=true
  const observedGeneration=generation
  try{
   const rootStat=await fs.promises.lstat(root)
   if(!rootStat.isDirectory()||rootStat.isSymbolicLink()||await fs.promises.realpath(root)!==root||stamp(rootStat).split(':').slice(0,2).join(':')!==anchor)throw Error('Kho ảnh đã mất hoặc đổi ổ/thư mục; chưa rút tồn Cloud')
   const photos:Photo[]=[],folders:string[]=[]
   for(const product of await fs.promises.readdir(root,{withFileTypes:true})){
    if(product.isSymbolicLink())throw Error('Folder Product có liên kết; cần kiểm tra đường dẫn kho')
    if(!product.isDirectory()||isInternalWarehousePath(path.join(root,product.name)))continue
    const productDir=path.join(root,product.name);if(await fs.promises.realpath(productDir)!==productDir)throw Error('Folder Product không được là liên kết')
    for(const size of await fs.promises.readdir(productDir,{withFileTypes:true})){
     if(size.isSymbolicLink())throw Error('Folder Size có liên kết; cần kiểm tra đường dẫn kho')
     if(!size.isDirectory())continue
     const dir=path.join(productDir,size.name);if(await fs.promises.realpath(dir)!==dir)throw Error('Folder Size không được là liên kết')
     folders.push(dir)
     const entries=await fs.promises.readdir(dir,{withFileTypes:true})
     const rows=await Promise.all(entries.filter(e=>e.isFile()&&extensions.has(path.extname(e.name).toLowerCase())).map(async e=>{const file=path.join(dir,e.name),s=await fs.promises.lstat(file);if(!s.isFile()||s.isSymbolicLink()||await fs.promises.realpath(file)!==file)throw Error('Ảnh không phải file vật lý trong kho');return {file,fingerprint:stamp(s),product:product.name,size:size.name}}))
     photos.push(...rows)
    }
   }
   photos.sort((a,b)=>a.file.localeCompare(b.file));folders.sort()
   const signature=hash(JSON.stringify([root,folders,photos.map(p=>[p.file,p.fingerprint])]))
   if(candidate!==signature){candidate=signature;candidateSince=clock();state.ready=false;state.phase='SETTLING';return snapshot()}
   if(clock()-candidateSince<settle){state.ready=false;state.phase='SETTLING';return snapshot()}
   const catalogBefore=catalogSignature()
   if(signature===lastProcessed&&catalogBefore===lastCatalog&&observedGeneration===generation){state.ready=true;state.phase='READY';state.error=lastWarnings;nativeDirty=false;lastRead=clock();return snapshot()}
   const registered=db.prepare('SELECT i.*,v.cost_price,p.status AS product_status,v.status AS variant_status FROM product_images i JOIN products p ON p.id=i.product_id JOIN product_variants v ON v.id=i.variant_id').all()
   const sold=new Set(db.prepare("SELECT 1 FROM sqlite_master WHERE name='sales_units'").get()?db.prepare('SELECT image_id FROM sales_units').all().map(r=>Number(r.image_id)):[])
   const byPath=new Map(registered.map(i=>[String(i.file_path).toLowerCase(),i])),actual=new Set(photos.map(p=>p.file.toLowerCase()))
   const variants=db.prepare('SELECT v.id,v.product_id,v.size,v.cost_price,v.status,p.name,p.status AS product_status FROM product_variants v JOIN products p ON p.id=v.product_id').all()
   const variantMap=new Map(variants.map(v=>[[v.name,v.size].join('\0').toLocaleLowerCase('vi'),v]))
   const known=db.prepare('SELECT * FROM warehouse_live_images').all(),evidence=new Map(known.map(i=>[Number(i.image_id),i]))
   const prepared:Array<Photo&{sha:string;owner?:any;variant?:any}>=[],warnings:string[]=[]
   for(const photo of photos){
    const owner=byPath.get(photo.file.toLowerCase()),variant=variantMap.get([photo.product,photo.size].join('\0').toLocaleLowerCase('vi'))
    if(!owner&&!variant)continue
    const prior=owner&&evidence.get(Number(owner.id))
    if(prior&&prior.file_path===photo.file&&prior.fingerprint===photo.fingerprint&&!cache.has(photo.file))cache.set(photo.file,{fingerprint:photo.fingerprint,sha:String(prior.sha256)})
    const cached=cache.get(photo.file),bytes=cached?.fingerprint===photo.fingerprint?null:await fs.promises.readFile(photo.file)
    const sha=bytes?hash(bytes):cached!.sha
    if(bytes)cache.set(photo.file,{fingerprint:photo.fingerprint,sha})
    if(stamp(await fs.promises.lstat(photo.file))!==photo.fingerprint){dirty();return snapshot()}
    if(owner&&sold.has(Number(owner.id))){warnings.push('Ảnh SOLD xuất hiện lại: '+path.basename(photo.file));continue}
    if(prior&&prior.sha256!==sha){warnings.push('Ảnh đã đăng ký bị thay nội dung: '+path.basename(photo.file));continue}
    if(!owner){
     if(variant!.status!=='active'||variant!.product_status!=='active')continue
     try{rejectSoldSource(db,sha);await sharp(bytes??await fs.promises.readFile(photo.file)).stats()}catch(e){warnings.push(path.basename(photo.file)+': '+(e as Error).message);continue}
    }
    prepared.push({...photo,sha,owner,variant})
   }
   if(blocked())return snapshot()
   if(observedGeneration!==generation)return snapshot()
   if(catalogSignature()!==catalogBefore){dirty();return snapshot()}
   // No await inside the transaction. A second stat rejects file changes during decoding.
   for(const p of prepared)if(stamp(fs.lstatSync(p.file))!==p.fingerprint){dirty();return snapshot()}
   let added=0,pending=0,changed=false
   const physicalHashes=new Map<string,number>()
   for(const p of prepared)if(p.owner)physicalHashes.set(p.owner.variant_id+':'+p.sha,Number(p.owner.id))
   const previous={...state}
   salesActivity.busy=true
   try{
    db.exec('BEGIN IMMEDIATE')
    const remember=db.prepare('INSERT INTO warehouse_live_images(image_id,file_path,sha256,fingerprint) VALUES(?,?,?,?) ON CONFLICT(image_id) DO UPDATE SET file_path=excluded.file_path,fingerprint=excluded.fingerprint WHERE file_path<>excluded.file_path OR fingerprint<>excluded.fingerprint')
    for(const p of prepared){
     if(p.owner){remember.run(p.owner.id,p.file,p.sha,p.fingerprint);continue}
     const v=p.variant!,identity=v.id+':'+p.sha
     if(physicalHashes.has(identity)){pending++;warnings.push('Ảnh trùng nội dung trong Size: '+path.basename(p.file));continue}
     const moved=known.filter(k=>k.sha256===p.sha).map(k=>registered.find(i=>i.id===k.image_id)).filter(i=>i&&i.variant_id===v.id&&!sold.has(Number(i.id))&&!actual.has(String(i.file_path).toLowerCase()))
     let imageId:number
     if(moved.length===1){imageId=Number(moved[0]!.id);db.prepare('UPDATE product_images SET file_path=? WHERE id=?').run(p.file,imageId)}
     else{
      imageId=Number(db.prepare('INSERT INTO product_images(product_id,variant_id,file_path,sort_order) VALUES(?,?,?,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM product_images WHERE variant_id=?))').run(v.product_id,v.id,p.file,v.id).lastInsertRowid)
      db.prepare("INSERT INTO inventory_transactions(variant_id,transaction_type,quantity,unit_cost,note) VALUES(?,'IMPORT',1,?,?)").run(v.id,knownUnitCost(db,Number(v.id),Number(v.cost_price)),'Tự nhận ảnh folder · ảnh #'+imageId+' · '+path.basename(p.file));added++
     }
     if(/^ShopMeCaCao_Tole_.*_\d{4,}\.[^.]+$/.test(path.basename(p.file)))reserveNamedImageSequences([p.file],db)
     remember.run(imageId,p.file,p.sha,p.fingerprint);physicalHashes.set(identity,imageId)
    }
    changed=state.signature!==signature||catalogBefore!==lastCatalog
    state={...state,signature,ready:true,phase:'READY',error:warnings.slice(0,5).join(' · '),registered:added,pending:photos.filter(p=>!byPath.has(p.file.toLowerCase())&&!prepared.some(x=>x.file===p.file)).length+pending,revision:state.revision+(changed?1:0),changedAt:changed?new Date().toISOString():state.changedAt}
    persist();db.exec('COMMIT')
   }catch(e){try{db.exec('ROLLBACK')}catch{}state=previous;throw e}finally{salesActivity.busy=false}
   paths=new Set(prepared.map(p=>p.file.toLowerCase()))
   lastProcessed=signature;lastCatalog=catalogSignature()
   nativeDirty=false;lastRead=clock()
   lastWarnings=state.error
   // Empty stock is authoritative only while all known Size directories remain readable.
   allMissingConfirmed=variants.every(v=>folders.includes(path.join(root,String(v.name),String(v.size))))
   for(const key of cache.keys())if(!actual.has(key.toLowerCase()))cache.delete(key)
   if(changed){onChanged();emit()}
   return snapshot()
  }catch(e){state.ready=false;state.phase='ERROR';state.error=(e as Error).message;allMissingConfirmed=false;candidate='';return snapshot()}
  finally{running=false}
 }
 function start(){
  try{watcher=fs.watch(root,{recursive:true,persistent:false},(_event,name)=>{if(name&&isInternalWarehousePath(path.join(root,String(name))))return;dirty()});watcher.on('error',()=>{watcher?.close();watcher=undefined;dirty()})}catch{/* A frequent complete read is also the fallback for unavailable native watches. */}
  void inspect();timer=setInterval(()=>{if(nativeDirty||!watcher||clock()-lastRead>=10000)void inspect()},1000);timer.unref()
 }
 return {start,inspect,snapshot,acknowledge,subscribe:(send:(state:ReturnType<typeof snapshot>)=>void,close:()=>void)=>{const listener={send,close};listeners.add(listener);return()=>listeners.delete(listener)},present:(file:string)=>{if(!state.ready)throw Error('Đang xác minh thay đổi folder; sẽ tự đồng bộ lại');return paths.has(file.toLowerCase())},close:()=>{closed=true;watcher?.close();if(timer)clearInterval(timer);for(const listener of listeners)listener.close();listeners.clear()}}
}
export type WarehouseLive=ReturnType<typeof createWarehouseLive>
