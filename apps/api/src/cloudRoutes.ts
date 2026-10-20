import {Router} from 'express'
import type {WarehouseLive} from './warehouseLive.js'
import {DatabaseSync} from 'node:sqlite'
import {randomUUID} from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import {v8Home} from './freshDevelopment.js'
import {salesExecutionService} from './salesExecution.js'
import {soldProofImage} from './soldProofImage.js'
import {cloudImageForSync,createCloudImageDigestCache} from './cloudImages.js'
import {isInternalWarehousePath} from './warehouseAreas.js'
import {reconcileCloudSale} from './cloudReconcile.js'
import {uploadLocalBusiness,assertBusinessUploaded,verifyImportedLocalSale,pullCloudBusiness} from './cloudBusiness.js'
const cloudUrl='https://eyckwoewpomssjjggslr.supabase.co'
const publishable='sb_publishable_iyEI25gFfU4pXxmdFJ823Q_YYG-ViGJ'
export function cloudRouter(db:DatabaseSync,root:string,live?:WarehouseLive,businessChanges?:()=>unknown){
 const router=Router()
 const digestCache=createCloudImageDigestCache(db)
 router.use((req,res,next)=>{
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||'')||res.locals.lanUser)return res.status(403).json({error:'Kết nối Cloud của kho chỉ thiết lập trên Windows chủ shop.'})
  res.set('Cache-Control','no-store'); next()
 })
 router.get('/state',(_req,res)=>res.json({imageDigestBatch:true,businessHistorySync:true,business:businessChanges?.(),syncEnabled:!!db.prepare("SELECT 1 FROM app_metadata WHERE key='cloud-instance'").get(),instance:db.prepare("SELECT value FROM app_metadata WHERE key='cloud-instance'").get()?.value,enabled:!!db.prepare("SELECT 1 FROM app_metadata WHERE key='cloud-authority' AND value='enabled'").get(),live:live?.snapshot(),reconciled:db.prepare("SELECT substr(key,12) id FROM app_metadata WHERE key LIKE 'cloud-sold:%' UNION SELECT substr(key,18) id FROM app_metadata WHERE key LIKE 'cloud-local-sold:%'").all().map(r=>r.id)}))
 router.post('/live/ack',async(req,res)=>{
  try{
   if(!live)throw Error('Kho chưa bật theo dõi folder')
   const health=await rpc(req.get('authorization')||'','mc_v7_health',{}),instance=db.prepare("SELECT value FROM app_metadata WHERE key='cloud-instance'").get()?.value
   if(health.role!=='owner'||!instance||health.instance!==instance)throw Error('Chỉ chủ shop của đúng kho được xác nhận đồng bộ folder')
   res.json(live.acknowledge(req.body.revision))
  }catch(e){res.status(409).json({error:e instanceof Error?e.message:'Chưa xác nhận đồng bộ folder'})}
 })
 router.get('/live/events',(req,res)=>{
  if(!live)return res.status(404).json({error:'Kho chưa bật theo dõi folder'})
  res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.flushHeaders()
  const send=(state:ReturnType<WarehouseLive['snapshot']>)=>{const {root,...publicState}=state;if(!res.destroyed)res.write('data: '+JSON.stringify(publicState)+'\n\n')}
  send(live.snapshot());const unsubscribe=live.subscribe(send,()=>res.end()),heartbeat=setInterval(()=>{if(!res.destroyed)res.write(': keepalive\n\n')},15000)
  req.on('close',()=>{clearInterval(heartbeat);unsubscribe()})
 })
 async function rpc(token:string,name:string,args:unknown){const response=await fetch(cloudUrl+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:publishable,Authorization:token,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(20000)});const result=await response.json();if(!response.ok)throw Error(result.message||'Không xác minh được Cloud.');return result}
 let businessInFlight=false
 router.post('/business/pull',async(req,res)=>{
  if(v8Home)return res.status(409).json({code:'WINDOWS_LOCAL_AUTHORITY',error:'Không nhập nghiệp vụ Cloud ghi ngược vào CORE laptop.'})
  if(businessInFlight)return res.status(409).json({error:'Đang đối soát hồ sơ nghiệp vụ.'})
  businessInFlight=true
  try{const token=req.get('authorization')||'';res.json(await pullCloudBusiness(db,root,(name,args)=>rpc(token,name,args)))}catch(e){res.status(409).json({error:e instanceof Error?e.message:'Chưa nhận được hồ sơ Cloud'})}finally{businessInFlight=false}
 })
 router.post('/business',async(req,res)=>{
  if(businessInFlight)return res.status(409).json({error:'Đang đồng bộ hồ sơ nghiệp vụ. Chờ lượt hiện tại hoàn tất.'})
  businessInFlight=true
  try{
   const token=req.get('authorization')||'',health=await rpc(token,'mc_v7_health',{}),instance=db.prepare("SELECT value FROM app_metadata WHERE key='cloud-instance'").get()?.value
   if(health.role!=='owner'||!instance||health.instance!==instance)throw Error('Cloud chưa khớp kho laptop hoặc chưa có quyền chủ shop.')
   if(health.status==='CLOUD_TEST_READY'&&db.prepare("SELECT 1 FROM app_metadata WHERE key='cloud-authority' AND value='enabled'").get()){if(v8Home)assertBusinessUploaded(db,root);return res.json({active:true})}
   res.json(await uploadLocalBusiness(db,root,(name,args)=>rpc(token,name,args)))
  }catch(e){res.status(409).json({error:e instanceof Error?e.message:'Chưa đồng bộ được hồ sơ'})}finally{businessInFlight=false}
 })
 router.post('/activate',async(req,res)=>{
  try{
   const token=req.get('authorization')||'';if(!token.startsWith('Bearer '))throw Error('Thiếu phiên Cloud.')
   const health=await rpc(token,'mc_v7_health',{}),instance=db.prepare("SELECT value FROM app_metadata WHERE key='cloud-instance'").get()?.value
   if(health.role!=='owner'||health.instance!==instance||!instance)throw Error('Cloud chưa khớp kho Windows hoặc chưa có quyền chủ shop.')
   if(!db.prepare("SELECT 1 FROM app_metadata WHERE key='cloud-authority' AND value='enabled'").get())assertBusinessUploaded(db,root)
   // Fence first: if the network result is uncertain, Windows remains protected.
   db.prepare("INSERT INTO app_metadata(key,value) VALUES('cloud-authority','enabled') ON CONFLICT(key) DO UPDATE SET value='enabled'").run()
   const result=await rpc(token,'mc_v7_activate',{p_instance:instance});res.json(result)
  }catch(e){res.status(409).json({error:e instanceof Error?e.message:'Chưa bật được Cloud.'})}
 })
 router.post('/prices',async(req,res)=>{
  try{
   const token=req.get('authorization')||'';if(!token.startsWith('Bearer '))throw Error('Thiếu phiên Cloud.')
   const health=await rpc(token,'mc_v7_health',{}),instance=db.prepare("SELECT value FROM app_metadata WHERE key='cloud-instance'").get()?.value
   if(health.role!=='owner'||health.instance!==instance||!instance)throw Error('Cloud chưa khớp kho Windows.')
   if(v8Home)return res.json({updated:0,authority:'WINDOWS_LOCAL'})
   const variants:any[]=[],products:any[]=[]
   for(const [table,rows] of [['products',products],['product_variants',variants]] as const){let offset=0;for(;;){const page=await rpc(token,'mc_v7_rows',{p_table:table,p_after:String(offset),p_limit:200});rows.push(...page.rows);if(page.rows.length<200)break;offset=page.nextOffset}}
   const after=await rpc(token,'mc_v7_health',{});if(after.sequence!==health.sequence)throw Error('Cloud vừa thay đổi. Đọc lại để cập nhật giá đồng nhất.')
   db.exec('BEGIN IMMEDIATE')
   try{
    for(const p of products)db.prepare('UPDATE products SET status=? WHERE id=? AND product_code=?').run(p.status,p.id,p.product_code)
    for(const v of variants){
     db.prepare('UPDATE product_variants SET cost_price=?,sale_price=?,status=? WHERE id=? AND product_id=? AND sku=? AND (cost_price<>? OR sale_price<>? OR status<>?)').run(v.cost_price,v.sale_price,v.status,v.id,v.product_id,v.sku,v.cost_price,v.sale_price,v.status)
     if(v.cost_price_set!==undefined)db.prepare('INSERT INTO variant_price_state(variant_id,cost_set,sale_set) SELECT id,?,? FROM product_variants WHERE id=? AND sku=? ON CONFLICT(variant_id) DO UPDATE SET cost_set=excluded.cost_set,sale_set=excluded.sale_set,revision=revision+1 WHERE cost_set<>excluded.cost_set OR sale_set<>excluded.sale_set').run(v.cost_price_set?1:0,v.sale_price_set?1:0,v.id,v.sku)
    }
    db.exec('COMMIT')
   }catch(e){db.exec('ROLLBACK');throw e}
   res.json({updated:variants.length})
  }catch(e){res.status(409).json({error:e instanceof Error?e.message:'Chưa cập nhật được giá Cloud.'})}
 })
 router.post('/reconcile',async(req,res)=>{
  try{
   const token=req.get('authorization')||'';if(!token.startsWith('Bearer '))throw Error('Thiếu phiên đăng nhập Cloud.')
   const ids=req.body.orders;if(!Array.isArray(ids)||ids.length>100||ids.some(id=>typeof id!=='string'||id.length>100))throw Error('Danh sách đơn không hợp lệ.')
   const results=[];for(const id of ids){const proof=await rpc(token,'mc_v7_sold_proof',{p_id:id}),result=verifyImportedLocalSale(db,root,proof)??(v8Home?null:await reconcileCloudSale(db,root,proof));if(!result)throw Error('Không ghi đè đơn SOLD Cloud lên CORE laptop.');const operation='operationId' in result?result.operationId:undefined;if(!operation)throw Error('Chưa xác minh giao dịch Windows.');await rpc(token,'mc_v7_archive_ack',{p_id:id,p_instance:proof.instance,p_cloud_operation:proof.confirmation.operation_id,p_local_operation:operation});results.push(result)}
   res.json({results})
  }catch(e){res.status(409).json({error:e instanceof Error?e.message:'Chưa đối soát được SOLD Cloud.'})}
 })
 router.get('/catalog',(req,res)=>{
  try{
   const sourceGuard=live?.snapshot();if(sourceGuard&&!sourceGuard.ready)throw Error(sourceGuard.error||'Đang xác minh thay đổi folder; sẽ tự đồng bộ lại')
   const offset=Number(req.query.offset??0);if(!Number.isSafeInteger(offset)||offset<0)throw Error('Trang không hợp lệ')
   const old=db.prepare("SELECT value FROM app_metadata WHERE key='cloud-instance'").get()
   const instance=old?String(old.value):randomUUID();if(!old)db.prepare("INSERT INTO app_metadata(key,value) VALUES('cloud-instance',?)").run(instance)
   const products=db.prepare('SELECT * FROM products ORDER BY id LIMIT 100 OFFSET ?').all(offset)
   const ids=products.map(p=>Number(p.id)); const marks=ids.map(()=>'?').join(',')
   const variants=ids.length?db.prepare(`SELECT * FROM product_variants WHERE product_id IN (${marks}) ORDER BY id`).all(...ids):[]
   const images=ids.length?db.prepare(`SELECT id,product_id,variant_id,sort_order,is_primary FROM product_images WHERE product_id IN (${marks}) AND NOT EXISTS(SELECT 1 FROM sales_units WHERE image_id=product_images.id) ORDER BY id`).all(...ids):[]
   const transactions=ids.length?db.prepare(`SELECT t.* FROM inventory_transactions t JOIN product_variants v ON v.id=t.variant_id WHERE v.product_id IN (${marks}) ORDER BY t.id`).all(...ids):[]
   const sourceState=images.map(image=>{const source=db.prepare('SELECT file_path FROM product_images WHERE id=?').get(image.id);if(live)return {id:Number(image.id),present:live.present(String(source?.file_path))};try{return {id:Number(image.id),present:fs.statSync(String(source?.file_path)).isFile()}}catch(e){if(['ENOENT','ENOTDIR'].includes((e as NodeJS.ErrnoException).code||''))return {id:Number(image.id),present:false};throw Error('Không đọc được ảnh nguồn #'+image.id+'. Kiểm tra quyền ổ đĩa; chưa tự rút ảnh Cloud.')}})
   res.json({instance,products,variants:variants.map(v=>{const s=db.prepare('SELECT * FROM variant_price_state WHERE variant_id=?').get(v.id);return {...v,cost_price_set:Number(v.cost_price)>0||s?.cost_set===1,sale_price_set:Number(v.sale_price)>0||s?.sale_set===1}}),images,transactions,sourceState,sourceGuard:sourceGuard?{revision:sourceGuard.revision,healthy:sourceGuard.ready,allMissingConfirmed:sourceGuard.allMissingConfirmed}:undefined,categories:offset===0?db.prepare('SELECT * FROM categories ORDER BY id').all():[],nextOffset:offset+products.length,done:products.length<100})
  }catch(e){res.status(400).json({error:e instanceof Error?e.message:'Không đọc được kho'})}
 })
 router.get('/proof-images/:id',async(req,res)=>{
  try{const token=req.get('authorization')||'',health=await rpc(token,'mc_v7_health',{}),instance=db.prepare("SELECT value FROM app_metadata WHERE key='cloud-instance'").get()?.value;if(health.role!=='owner'||health.instance!==instance||!instance)throw Error('Chỉ chủ shop của kho đã kết nối được đọc ảnh chứng từ.');const id=Number(req.params.id),order=String(req.query.order||'');if(!Number.isSafeInteger(id)||id<1||!/^[-A-Za-z0-9_]{1,100}$/.test(order)||!db.prepare('SELECT 1 FROM sales_units WHERE image_id=? AND order_id=?').get(id,order))throw Error('Ảnh chứng từ không thuộc đơn đã bán.');const image=await salesExecutionService(db,root).image(order,id),proof=await soldProofImage(image);res.set('X-Proof-Sha256',proof.sha256).set('X-Warehouse-Instance',String(instance)).type('jpeg').send(proof.data)}catch(e){res.status(409).json({error:e instanceof Error?e.message:'Chưa đọc được ảnh chứng từ'})}
 })
 function sourceImage(id:number){
  if(!Number.isSafeInteger(id)||id<1)throw Error('Ảnh không hợp lệ')
  const row=db.prepare('SELECT file_path FROM product_images WHERE id=? AND NOT EXISTS(SELECT 1 FROM sales_units WHERE image_id=product_images.id)').get(id)
  if(!row)throw Error('Ảnh đã bán hoặc không còn trong kho')
  const file=fs.realpathSync(String(row.file_path)),base=fs.realpathSync(root),rel=path.relative(base,file)
  if(path.isAbsolute(rel)||rel==='..'||rel.startsWith('..'+path.sep)||isInternalWarehousePath(file)||!fs.statSync(file).isFile())throw Error('Ảnh không nằm trong kho hiện tại')
  return file
 }
 // Local-only bulk digest verification: bounded memory/CPU, no JPEG transfer,
 // no Cloud mutation. Every source is read and hashed, even after a restart.
 router.post('/images/verify',async(req,res)=>{
  try{
   const images=req.body.images
   if(!Array.isArray(images)||images.length>64||new Set(images.map(i=>i?.id)).size!==images.length||images.some(i=>!i||!Number.isSafeInteger(i.id)||i.id<1||typeof i.sha256!=='string'||!/^[a-f0-9]{64}$/.test(i.sha256)))throw Error('Danh sách xác minh ảnh không hợp lệ')
   const results:Array<{id:number;sha256:string}>=[];let cursor=0
   const jobs=await Promise.allSettled(Array.from({length:Math.min(2,images.length)},async()=>{
    for(;;){const i=images[cursor++];if(!i)return;const result=await cloudImageForSync(sourceImage(i.id),i.sha256,digestCache);results.push({id:i.id,sha256:result.sha256})}
   }))
   const failed=jobs.find(j=>j.status==='rejected');if(failed?.status==='rejected')throw failed.reason
   res.json({images:results})
  }catch(e){res.status(400).json({error:e instanceof Error?e.message:'Không xác minh được ảnh'})}
 })
 router.get('/images/:id',async(req,res)=>{
  try{
   const file=sourceImage(Number(req.params.id))
   const result=await cloudImageForSync(file,typeof req.query.knownSha==='string'?req.query.knownSha:undefined,digestCache)
   res.set('X-Image-Sha256',result.sha256)
   if(result.data===null){res.status(204).end();return}
   res.type('jpeg').send(result.data)
  }catch(e){res.status(400).json({error:e instanceof Error?e.message:'Không tối ưu được ảnh'})}
 })
 return router
}
