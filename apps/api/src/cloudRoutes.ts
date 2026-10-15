import {Router} from 'express'
import {DatabaseSync} from 'node:sqlite'
import {randomUUID} from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import {salesExecutionService} from './salesExecution.js'
import {soldProofImage} from './soldProofImage.js'
import {cloudImageForSync} from './cloudImages.js'
import {isInternalWarehousePath} from './warehouseAreas.js'
import {reconcileCloudSale} from './cloudReconcile.js'
const cloudUrl='https://eyckwoewpomssjjggslr.supabase.co'
const publishable='sb_publishable_iyEI25gFfU4pXxmdFJ823Q_YYG-ViGJ'
export function cloudRouter(db:DatabaseSync,root:string){
 const router=Router()
 router.use((req,res,next)=>{
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||'')||res.locals.lanUser)return res.status(403).json({error:'Kết nối Cloud của kho chỉ thiết lập trên Windows chủ shop.'})
  res.set('Cache-Control','no-store'); next()
 })
 router.get('/state',(_req,res)=>res.json({instance:db.prepare("SELECT value FROM app_metadata WHERE key='cloud-instance'").get()?.value,enabled:!!db.prepare("SELECT 1 FROM app_metadata WHERE key='cloud-authority' AND value='enabled'").get(),reconciled:db.prepare("SELECT substr(key,12) id FROM app_metadata WHERE key LIKE 'cloud-sold:%'").all().map(r=>r.id)}))
 async function rpc(token:string,name:string,args:unknown){const response=await fetch(cloudUrl+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:publishable,Authorization:token,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(20000)});const result=await response.json();if(!response.ok)throw Error(result.message||'Không xác minh được Cloud.');return result}
 router.post('/activate',async(req,res)=>{
  try{
   const token=req.get('authorization')||'';if(!token.startsWith('Bearer '))throw Error('Thiếu phiên Cloud.')
   const health=await rpc(token,'mc_v7_health',{}),instance=db.prepare("SELECT value FROM app_metadata WHERE key='cloud-instance'").get()?.value
   if(health.role!=='owner'||health.instance!==instance||!instance)throw Error('Cloud chưa khớp kho Windows hoặc chưa có quyền chủ shop.')
   if(db.prepare("SELECT 1 FROM sales_confirmations c WHERE NOT EXISTS(SELECT 1 FROM app_metadata m WHERE m.key='cloud-sold:'||c.order_id)").get())throw Error('Kho có giao dịch SOLD độc lập trước Cloud. Hãy dùng kho phát triển mới để kết nối.')
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
   const results=[];for(const id of ids){const proof=await rpc(token,'mc_v7_sold_proof',{p_id:id}),result=await reconcileCloudSale(db,root,proof);const operation='operationId' in result?result.operationId:undefined;if(!operation)throw Error('Chưa xác minh giao dịch Windows.');await rpc(token,'mc_v7_archive_ack',{p_id:id,p_instance:proof.instance,p_cloud_operation:proof.confirmation.operation_id,p_local_operation:operation});results.push(result)}
   res.json({results})
  }catch(e){res.status(409).json({error:e instanceof Error?e.message:'Chưa đối soát được SOLD Cloud.'})}
 })
 router.get('/catalog',(req,res)=>{
  try{
   const offset=Number(req.query.offset??0);if(!Number.isSafeInteger(offset)||offset<0)throw Error('Trang không hợp lệ')
   const old=db.prepare("SELECT value FROM app_metadata WHERE key='cloud-instance'").get()
   const instance=old?String(old.value):randomUUID();if(!old)db.prepare("INSERT INTO app_metadata(key,value) VALUES('cloud-instance',?)").run(instance)
   const products=db.prepare('SELECT * FROM products ORDER BY id LIMIT 100 OFFSET ?').all(offset)
   const ids=products.map(p=>Number(p.id)); const marks=ids.map(()=>'?').join(',')
   const variants=ids.length?db.prepare(`SELECT * FROM product_variants WHERE product_id IN (${marks}) ORDER BY id`).all(...ids):[]
   const images=ids.length?db.prepare(`SELECT id,product_id,variant_id,sort_order,is_primary FROM product_images WHERE product_id IN (${marks}) AND NOT EXISTS(SELECT 1 FROM sales_units WHERE image_id=product_images.id) ORDER BY id`).all(...ids):[]
   const transactions=ids.length?db.prepare(`SELECT t.* FROM inventory_transactions t JOIN product_variants v ON v.id=t.variant_id WHERE v.product_id IN (${marks}) ORDER BY t.id`).all(...ids):[]
   const sourceState=images.map(image=>{const source=db.prepare('SELECT file_path FROM product_images WHERE id=?').get(image.id);try{return {id:Number(image.id),present:fs.statSync(String(source?.file_path)).isFile()}}catch(e){if(['ENOENT','ENOTDIR'].includes((e as NodeJS.ErrnoException).code||''))return {id:Number(image.id),present:false};throw Error('Không đọc được ảnh nguồn #'+image.id+'. Kiểm tra quyền ổ đĩa; chưa tự rút ảnh Cloud.')}})
   res.json({instance,products,variants:variants.map(v=>{const s=db.prepare('SELECT * FROM variant_price_state WHERE variant_id=?').get(v.id);return {...v,cost_price_set:Number(v.cost_price)>0||s?.cost_set===1,sale_price_set:Number(v.sale_price)>0||s?.sale_set===1}}),images,transactions,sourceState,categories:offset===0?db.prepare('SELECT * FROM categories ORDER BY id').all():[],nextOffset:offset+products.length,done:products.length<100})
  }catch(e){res.status(400).json({error:e instanceof Error?e.message:'Không đọc được kho'})}
 })
 router.get('/proof-images/:id',async(req,res)=>{
  try{const token=req.get('authorization')||'',health=await rpc(token,'mc_v7_health',{}),instance=db.prepare("SELECT value FROM app_metadata WHERE key='cloud-instance'").get()?.value;if(health.role!=='owner'||health.instance!==instance||!instance)throw Error('Chỉ chủ shop của kho đã kết nối được đọc ảnh chứng từ.');const id=Number(req.params.id),order=String(req.query.order||'');if(!Number.isSafeInteger(id)||id<1||!/^[-A-Za-z0-9_]{1,100}$/.test(order)||!db.prepare('SELECT 1 FROM sales_units WHERE image_id=? AND order_id=?').get(id,order))throw Error('Ảnh chứng từ không thuộc đơn đã bán.');const image=await salesExecutionService(db,root).image(order,id),proof=await soldProofImage(image);res.set('X-Proof-Sha256',proof.sha256).set('X-Warehouse-Instance',String(instance)).type('jpeg').send(proof.data)}catch(e){res.status(409).json({error:e instanceof Error?e.message:'Chưa đọc được ảnh chứng từ'})}
 })
 router.get('/images/:id',async(req,res)=>{
  try{
   const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)throw Error('Ảnh không hợp lệ')
   const row=db.prepare('SELECT file_path FROM product_images WHERE id=? AND NOT EXISTS(SELECT 1 FROM sales_units WHERE image_id=product_images.id)').get(id)
   if(!row)throw Error('Ảnh đã bán hoặc không còn trong kho')
   const file=fs.realpathSync(String(row.file_path)),base=fs.realpathSync(root),rel=path.relative(base,file)
   if(path.isAbsolute(rel)||rel==='..'||rel.startsWith('..'+path.sep)||isInternalWarehousePath(file)||!fs.statSync(file).isFile())throw Error('Ảnh không nằm trong kho hiện tại')
   const result=await cloudImageForSync(file,typeof req.query.knownSha==='string'?req.query.knownSha:undefined)
   res.set('X-Image-Sha256',result.sha256)
   if(result.data===null){res.status(204).end();return}
   res.type('jpeg').send(result.data)
  }catch(e){res.status(400).json({error:e instanceof Error?e.message:'Không tối ưu được ảnh'})}
 })
 return router
}
