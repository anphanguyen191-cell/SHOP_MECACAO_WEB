import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {once} from 'node:events'
import {DatabaseSync} from 'node:sqlite'
import express from 'express'
import sharp from 'sharp'
import {PGlite} from '@electric-sql/pglite'
import {bootstrapSalesDrafts} from '../apps/api/src/salesSchema.js'
import {bootstrapSalesExecution,salesExecutionService} from '../apps/api/src/salesExecution.js'
import {bootstrapCustomers,customerService} from '../apps/api/src/customers.js'
import {bootstrapFinance,financeService} from '../apps/api/src/orderFinance.js'
import {bootstrapStocktake,stocktakeService} from '../apps/api/src/stocktake.js'
import {bootstrapPriceBulk} from '../apps/api/src/priceBulk.js'
import {salesDraftService} from '../apps/api/src/salesDrafts.js'
import {salesPreflightService} from '../apps/api/src/salesPreflight.js'
import {readLocalBusiness} from '../apps/api/src/cloudBusiness.js'
import {cloudRouter} from '../apps/api/src/cloudRoutes.js'
import {salesRequestGuard} from '../apps/api/src/salesRequestGuard.js'
import {assessCloudSyncPreview,reconcileCloudImages} from '../apps/web/src/cloudSyncAudit.js'

// Production Windows-mode router + local services + PostgreSQL. Only the
// transport and image publication fixture are isolated; no live Cloud calls.
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cacao-continuous-')),db=new DatabaseSync(path.join(root,'shop.db')),pg=new PGlite()
const instance='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222'
const one=async(sql:string,args:any[]=[])=>((await pg.query(sql,args)).rows[0] as any)
const rows=async(table:string)=>(await pg.query('SELECT * FROM '+table)).rows as any[]
const available=async()=>Number((await one('SELECT count(*) n FROM cloud_image_assets a WHERE ready AND source_present AND NOT EXISTS(SELECT 1 FROM sales_units u WHERE u.image_id=a.image_id)')).n)
const realFetch=globalThis.fetch
let loseResponse=false,commands:string[]=[]
globalThis.fetch=async(input,init)=>{
 const url=String(input);if(url.startsWith('http://127.0.0.1:'))return realFetch(input,init)
 assert(url.startsWith('https://eyckwoewpomssjjggslr.supabase.co/rest/v1/rpc/'),'No live I/O')
 const name=url.split('/').pop()!,args=JSON.parse(String(init?.body||'{}'))
 try{
  if(name==='mc_v7_health')return Response.json({role:'owner',instance,status:(await one("SELECT value FROM app_metadata WHERE key='cloud_status'")).value})
  commands.push(args.p_request)
  const result=(await one(`SELECT public.${name}($1,$2,$3) data`,[args.p_instance,args.p_request,JSON.stringify(args.p_payload)])).data
  if(loseResponse&&name==='mc_v8_business_sync'){loseResponse=false;throw Error('Lost response after committed upload')}
  return Response.json(result)
 }catch(e){return Response.json({message:(e as Error).message},{status:409})}
}
const app=express();app.use(express.json());app.use('/api',salesRequestGuard(db,root,true));app.use('/api/cloud',cloudRouter(db,root,undefined,undefined,true))
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+(server.address() as any).port
const post=async()=>{const r=await fetch(base+'/api/cloud/business',{method:'POST',headers:{Authorization:'Bearer isolated','Content-Type':'application/json'},body:'{}'});return {status:r.status,data:await r.json()}}
const sync=async()=>{const r=await post();assert.equal(r.status,200,JSON.stringify(r));return r.data}
try{
 bootstrapSalesDrafts(db);bootstrapSalesExecution(db,root);bootstrapCustomers(db);bootstrapFinance(db);bootstrapStocktake(db);bootstrapPriceBulk(db)
 db.exec("INSERT INTO products(id,product_code,name) VALUES(1,'P1','Bộ tole');INSERT INTO product_variants(id,product_id,sku,size,cost_price,sale_price) VALUES(1,1,'P1-S','S',10000,45000);INSERT INTO inventory_transactions(variant_id,transaction_type,quantity) VALUES(1,'OPENING',3149)")
 db.prepare('INSERT INTO app_metadata(key,value) VALUES(?,?)').run('cloud-instance',instance)
 const png=await sharp({create:{width:40,height:50,channels:3,background:'#ffbbee'}}).png().toBuffer()
 db.exec('BEGIN');for(let id=1;id<=3149;id++){const file=path.join(root,id+'.png');fs.writeFileSync(file,png);db.prepare('INSERT INTO product_images(id,product_id,variant_id,file_path) VALUES(?,1,1,?)').run(id,file)}db.exec('COMMIT')
 await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE SCHEMA storage;CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${owner}');CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;CREATE TABLE storage.objects(bucket_id text,name text,metadata jsonb);`)
 await pg.exec(fs.readFileSync('supabase/migrations/20261011052324_reset_shop_mecacao_web_v7.sql','utf8').replace(/^ALTER PUBLICATION .*;$/m,''))
 await pg.exec(fs.readFileSync('supabase/migrations/20261011053317_v7_cloud_contract.sql','utf8'))
 await pg.exec(`ALTER TABLE cloud_image_assets ADD COLUMN source_present boolean NOT NULL DEFAULT true;ALTER TABLE cloud_image_assets ADD COLUMN source_checked_at timestamptz;CREATE FUNCTION private.mc_v7_command(text,text,jsonb) RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;SET request.jwt.claim.sub='${owner}';UPDATE app_metadata SET value='RPC_READY' WHERE key='cloud_status';INSERT INTO app_metadata(key,value) VALUES('cloud_instance','${instance}');INSERT INTO products(id,product_code,name) VALUES(1,'P1','Bộ tole');INSERT INTO product_variants(id,product_id,sku,size,cost_price,sale_price) VALUES(1,1,'P1-S','S',10000,45000);INSERT INTO inventory_transactions(variant_id,transaction_type,quantity) VALUES(1,'OPENING',3149);INSERT INTO product_images(id,product_id,variant_id,file_path) SELECT i,1,1,'v7/${instance}/'||i||'.jpg' FROM generate_series(1,3084) i;INSERT INTO cloud_image_assets(image_id,object_path,bytes,sha256,revision,ready) SELECT id,file_path,100,repeat('a',64),'1',true FROM product_images;`)
 await pg.exec(fs.readFileSync('supabase/migrations/20261019031717_v8_business_history_sync.sql','utf8'))
 await pg.exec(fs.readFileSync('supabase/migrations/20261020070109_windows_continuous_business_sync.sql','utf8'))
 await pg.exec(fs.readFileSync('supabase/migrations/20261020074627_continuous_mutable_history.sql','utf8'))
 await pg.exec('GRANT USAGE ON SCHEMA auth TO authenticated; SET ROLE authenticated')
 await sync();db.prepare("INSERT INTO app_metadata(key,value) VALUES('cloud-authority','enabled')").run()
 await pg.exec('RESET ROLE');await pg.exec("UPDATE app_metadata SET value='CLOUD_TEST_READY' WHERE key='cloud_status';SET ROLE authenticated")
 const customer=customerService(db).save({name:'Khách mới sau kích hoạt',phone:'0900000001',address:'Fixture',note:''})
 await sync();assert.equal((await one('SELECT name FROM shop_customers WHERE id=$1',[customer.id])).name,customer.name)
 const page=await (await fetch(base+'/api/cloud/catalog')).json();assert(page.instance,JSON.stringify(page))
 const remote=async()=>({products:await rows('products'),variants:await rows('product_variants'),images:await rows('product_images'),assets:await rows('cloud_image_assets'),sold:await rows('sales_units')})
 const before=assessCloudSyncPreview([page],await remote(),instance)
 assert.equal(before.local.stock,3149);assert.equal(before.cloud.ready,3084);assert.equal(before.differences.unregistered.length,65)
 // Publication fixture models the already tested image upload/reuse/presence
 // pipeline. The business POST above must no longer abort before this stage.
 await pg.exec('RESET ROLE');await pg.exec(`INSERT INTO product_images(id,product_id,variant_id,file_path) SELECT i,1,1,'v7/${instance}/'||i||'.jpg' FROM generate_series(3085,3149) i;INSERT INTO cloud_image_assets(image_id,object_path,bytes,sha256,revision,ready) SELECT id,file_path,100,repeat('a',64),'1',true FROM product_images WHERE id>3084;SET ROLE authenticated`)
 assert.equal(await available(),3149);const after=await remote();assert.equal(reconcileCloudImages(page.images,after.images,after.assets,after.sold,1).ready,3149)
 const draft=salesDraftService(db,root).create({items:[{imageId:3149,unitPrice:45000}],discount:0,note:'After activation'},'continuous-local-draft-001')
 await sync();assert.equal((await one('SELECT status FROM sales_orders WHERE id=$1',[draft.id])).status,'DRAFT')
 const token=(await salesPreflightService(db,root).check(draft.id,1)).token
 await salesExecutionService(db,root).confirm(draft.id,{version:1,token,confirmed:true,acknowledgeZeroPrice:false},'continuous-local-sale-001')
 await sync();assert.equal(await available(),3148);assert.equal((await rows('sales_confirmations')).length,1);assert.equal(fs.existsSync(path.join(root,'3149.png')),false)
 financeService(db).record(draft.id,{kind:'RECEIPT',amount:10000,method:'CASH',note:'New receipt',version:0,orderVersion:1},'continuous-local-payment-001')
 loseResponse=true;assert.equal((await post()).status,409);const request=commands.at(-1);assert(db.prepare("SELECT value FROM app_metadata WHERE key='cloud-business-pending'").get())
 await sync();assert.equal(commands.at(-1),request,'Retry uses durable request after committed response loss')
 await sync();assert.equal((await rows('finance_entries')).length,1);assert.equal((await rows('sales_ledger')).length,1);assert.equal(financeService(db).summary(draft.id).due,35000)
 const finance=financeService(db),beforeCase=finance.summary(draft.id)
 finance.createCase(draft.id,{kind:'SUPPORT',note:'Local support',version:beforeCase.version,orderVersion:beforeCase.orderVersion},'continuous-aftercare-001')
 await sync();const openCase=(db.prepare('SELECT * FROM aftercare_cases').get() as any),beforeResolve=finance.summary(draft.id)
 finance.resolveCase(draft.id,openCase.id,{resolution:'Resolved locally',caseVersion:openCase.version,version:beforeResolve.version,orderVersion:beforeResolve.orderVersion})
 await sync();assert.equal((await one('SELECT status FROM aftercare_cases')).status,'RESOLVED')
 const stock=stocktakeService(db,root);let counting=stock.create({title:'After activation'},'continuous-stocktake-001')
 await sync()
 for(let i=0;i<2;i++)counting=stock.save(counting.id,{version:counting.version,rows:counting.rows.map(r=>({variantId:r.variantId,counted:r.physical,note:'Checked'}))})
 counting=stock.finish(counting.id,{version:counting.version,confirmed:true,conclusion:'Physical count verified'})
 await sync();assert.equal((await one('SELECT status FROM stocktake_sessions')).status,'CLOSED');assert.equal(Number((await one('SELECT version FROM stocktake_sessions')).version),counting.version)
 const payload=readLocalBusiness(db,root).rows;payload.sales_ledger[0].unit_cost=1
 await assert.rejects(()=>one('SELECT public.mc_v8_business_sync($1,$2,$3) data',[instance,'continuous-evidence-conflict-001',JSON.stringify(payload)]),/EVIDENCE_CONFLICT/)
 assert.equal(await available(),3148);assert.equal(Number((await one('SELECT unit_cost FROM sales_ledger')).unit_cost),10000)
 assert.equal((await one("SELECT has_function_privilege('anon','public.mc_v8_business_sync(uuid,text,jsonb)','EXECUTE') allowed")).allowed,false)
 const pull=await fetch(base+'/api/cloud/business/pull',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(pull.status,409)
 console.log('WINDOWS_CONTINUOUS_SYNC PASS: production Windows router after activation, customer + draft + SOLD + payment + resolved aftercare + multi-save/closed stocktake, isolated 3084 -> 3149 -> 3148 inventory, durable lost-response retry, no duplicate receipt/SOLD, immutable conflict rollback, no reverse writes or anon access')
}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));globalThis.fetch=realFetch;db.close();await pg.close();fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
