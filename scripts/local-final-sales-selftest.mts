import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import sharp from 'sharp'
import express from 'express'
import {once} from 'node:events'
import type {Server} from 'node:http'
import {PGlite} from '@electric-sql/pglite'
import {bootstrapSalesDrafts} from '../apps/api/src/salesSchema.js'
import {bootstrapSalesExecution,salesExecutionService} from '../apps/api/src/salesExecution.js'
import {bootstrapCustomers} from '../apps/api/src/customers.js'
import {bootstrapFinance} from '../apps/api/src/orderFinance.js'
import {bootstrapStocktake} from '../apps/api/src/stocktake.js'
import {bootstrapPriceBulk} from '../apps/api/src/priceBulk.js'
import {optimizeCloudImage} from '../apps/api/src/cloudImages.js'
import {processLocalCloudSale} from '../apps/api/src/localCloudSales.js'
import {salesHistory} from '../apps/api/src/salesHistory.js'
import {financeService} from '../apps/api/src/orderFinance.js'
import {cloudRouter} from '../apps/api/src/cloudRoutes.js'
import {salesRequestGuard} from '../apps/api/src/salesRequestGuard.js'

const root=fs.mkdtempSync(path.join(os.tmpdir(),'cacao-local-final-')),db=new DatabaseSync(path.join(root,'shop.db')),pg=new PGlite()
const instance='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222'
const one=async(sql:string,args:any[]=[])=>((await pg.query(sql,args)).rows[0] as any)
let loseUpload=false,loseFinish=false
let server:Server|undefined
const realFetch=globalThis.fetch
const rpc=async(name:string,args:any={})=>{
 if(name==='mc_v7_health')return {role:'owner',instance,status:'CLOUD_TEST_READY'}
 if(name==='mc_v8_stock_integrity')return {ready:Number((await one('SELECT count(*) n FROM cloud_image_assets a WHERE ready AND source_present AND NOT EXISTS(SELECT 1 FROM sales_units u WHERE u.image_id=a.image_id)')).n),missingOrInvalidFiles:0,sharedActivePaths:0,invalidHashes:0}
 const values=name==='mc_v8_local_sales'?[args.p_action,args.p_key||'',JSON.stringify(args.p_payload||{})]:[args.p_instance,args.p_request,JSON.stringify(args.p_payload)]
 const result=(await one(`SELECT public.${name}($1,$2,$3) data`,values)).data
 if(name==='mc_v8_business_sync'&&loseUpload){loseUpload=false;throw Error('Lost upload reply after Cloud commit')}
 if(name==='mc_v8_local_sales'&&args.p_action==='finish'&&loseFinish){loseFinish=false;throw Error('Lost finish reply after Cloud commit')}
 return result
}
const request=async(id:string,key:string,version=1)=>rpc('mc_v8_local_sales',{p_action:'request',p_key:key,p_payload:{id,version,confirmed:true,acknowledgeZeroPrice:false}})
const command=async(action:string,id:string)=>one('SELECT public.mc_v7_command($1,$2,$3) data',['legacy-request-key-001',action,JSON.stringify({id,version:1})])
try{
 bootstrapSalesDrafts(db);bootstrapSalesExecution(db,root);bootstrapCustomers(db);bootstrapFinance(db);bootstrapStocktake(db);bootstrapPriceBulk(db)
 db.exec(`INSERT INTO products(id,product_code,name) VALUES(1,'P1','Bộ tole');INSERT INTO product_variants(id,product_id,sku,size,cost_price,sale_price) VALUES(1,1,'P1-S','S',10000,45000);INSERT INTO inventory_transactions(variant_id,transaction_type,quantity) VALUES(1,'OPENING',4)`)
 db.prepare('INSERT INTO app_metadata(key,value) VALUES(?,?)').run('cloud-instance',instance)
 db.exec("INSERT INTO app_metadata(key,value) VALUES('cloud-authority','enabled')")
 const files:string[]=[],hashes:string[]=[]
 for(let id=1;id<=4;id++){const file=path.join(root,id+'.png');await sharp({create:{width:40,height:50,channels:3,background:'#ffbbee'}}).png().toFile(file);files.push(file);hashes.push((await optimizeCloudImage(file)).sha256);db.prepare('INSERT INTO product_images(id,product_id,variant_id,file_path) VALUES(?,1,1,?)').run(id,file)}
 await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE SCHEMA storage;CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${owner}');CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;CREATE TABLE storage.objects(bucket_id text,name text,metadata jsonb);`)
 await pg.exec(fs.readFileSync('supabase/migrations/20261011052324_reset_shop_mecacao_web_v7.sql','utf8').replace(/^ALTER PUBLICATION .*;$/m,''))
 await pg.exec(fs.readFileSync('supabase/migrations/20261011053317_v7_cloud_contract.sql','utf8'))
 await pg.exec(fs.readFileSync('supabase/migrations/20261011054032_v7_business_rpc.sql','utf8').split('CREATE FUNCTION private.mc_v7_command')[0])
 await pg.exec(`ALTER TABLE cloud_image_assets ADD COLUMN source_present boolean NOT NULL DEFAULT true;ALTER TABLE cloud_image_assets ADD COLUMN source_checked_at timestamptz;CREATE FUNCTION private.mc_v7_command(text,text,jsonb) RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;SET request.jwt.claim.sub='${owner}';UPDATE app_metadata SET value='RPC_READY' WHERE key='cloud_status';INSERT INTO app_metadata(key,value) VALUES('cloud_instance','${instance}');INSERT INTO products(id,product_code,name) VALUES(1,'P1','Bộ tole');INSERT INTO product_variants(id,product_id,sku,size,cost_price,sale_price) VALUES(1,1,'P1-S','S',10000,45000);INSERT INTO inventory_transactions(variant_id,transaction_type,quantity) VALUES(1,'OPENING',4);INSERT INTO product_images(id,product_id,variant_id,file_path) SELECT i,1,1,'v7/${instance}/'||i||'.jpg' FROM generate_series(1,4) i;`)
 for(let id=1;id<=4;id++)await pg.query('INSERT INTO cloud_image_assets(image_id,object_path,bytes,sha256,revision,ready) VALUES($1,$2,100,$3,1,true)',[id,'v7/'+instance+'/'+id+'.jpg',hashes[id-1]])
 for(const file of ['20261019031717_v8_business_history_sync.sql','20261020070109_windows_continuous_business_sync.sql','20261020074627_continuous_mutable_history.sql'])await pg.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'))
 await pg.exec(fs.readFileSync('supabase/migrations/20261011070333_v7_command_variable_scope.sql','utf8'))
 await pg.exec(fs.readFileSync('supabase/migrations/20261020135932_local_final_workflow.sql','utf8'))
 await pg.exec(`UPDATE app_metadata SET value='CLOUD_TEST_READY' WHERE key='cloud_status';INSERT INTO app_metadata(key,value) VALUES('cloud_business_source','${instance}');GRANT USAGE ON SCHEMA auth TO authenticated;SET ROLE authenticated`)
 await rpc('mc_v8_local_sales',{p_action:'enable',p_payload:{instance}})
 const app=express();app.use(express.json());app.use('/api',salesRequestGuard(db,root,true));app.use('/api/cloud',cloudRouter(db,root,undefined,undefined,true));server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+(server.address() as any).port
 globalThis.fetch=async(input,init)=>{const url=String(input);if(url.startsWith(base))return realFetch(input,init);assert(url.startsWith('https://eyckwoewpomssjjggslr.supabase.co/rest/v1/rpc/'),'No live transport');try{return Response.json(await rpc(url.split('/').pop()!,JSON.parse(String(init?.body||'{}'))))}catch(e){return Response.json({message:(e as Error).message},{status:409})}}
 const post=async(route:string,body:any={})=>{const response=await fetch(base+'/api/cloud'+route,{method:'POST',headers:{Authorization:'Bearer isolated-owner','Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()}}
 async function draft(id:string,image:number){await pg.exec('RESET ROLE');await pg.query("INSERT INTO sales_orders(id,request_key,request_hash,discount,note) VALUES($1,$2,'cloud-hash',0,'Mobile')",[id,'cloud-draft-'+id]);await pg.query("INSERT INTO sales_order_images(order_id,image_id,product_id,variant_id,product_name,product_code,size,sku,unit_price,unit_cost,position) VALUES($1,$2,1,1,'Bộ tole','P1','S','P1-S',45000,10000,0)",[id,image]);await pg.exec('SET ROLE authenticated')}
 await draft('mobile-order-1',1)
 const key='mobile-request-first-001'
 assert.equal((await request('mobile-order-1',key)).state,'PENDING')
 assert.equal((await request('mobile-order-1',key)).state,'PENDING','lost request reply is idempotent')
 assert.equal(Number((await one('SELECT count(*) n FROM sales_confirmations')).n),0,'laptop off: no SOLD')
 assert.equal(Number(db.prepare('SELECT count(*) n FROM sales_confirmations').get()!.n),0)
 await assert.rejects(()=>command('sale.confirm','mobile-order-1'),/CLOUD_LOCAL_FINAL_REQUIRED/)
 for(const action of ['draft.save','draft.cancel'])await assert.rejects(()=>command(action,'mobile-order-1'),/CLOUD_LOCAL_FINAL_REQUIRED/)
 await assert.rejects(()=>command('finance.entry','mobile-order-1'),/CLOUD_LOCAL_FINAL_REQUIRED/)
 await assert.rejects(()=>rpc('mc_v8_local_sales',{p_action:'finish',p_key:key,p_payload:{instance,operationId:'invented'}}),/CLOUD_LOCAL_PROOF_REQUIRED/)
 loseUpload=true
 const lost=await post('/local-sales');assert.equal(lost.status,409);assert.match(lost.data.error,/Lost upload reply/)
 assert.equal(Number(db.prepare('SELECT count(*) n FROM sales_confirmations').get()!.n),1)
 assert.equal((await rpc('mc_v8_local_sales',{p_action:'list'}))[0].state,'PENDING')
 const resumed=await post('/local-sales');assert.equal(resumed.status,200);assert.equal(resumed.data.state,'CONFIRMED','production HTTP guard must not count the coordinator as its own reader')
 assert.equal(Number(db.prepare('SELECT count(*) n FROM sales_units').get()!.n),1,'retry never sells twice')
 assert.equal((await processLocalCloudSale(db,root,rpc)).pending,false)
 assert.equal(Number((await one('SELECT count(*) n FROM sales_confirmations')).n),1)
 const ack=await post('/sync-status',{phase:'COMPLETE'});assert.equal(ack.status,200,JSON.stringify(ack));assert.equal(ack.data.stock,3)
 const successfulAt=ack.data.at
 await draft('mobile-order-2',2);fs.unlinkSync(files[1]);await request('mobile-order-2','mobile-request-missing-02')
 assert.equal((await processLocalCloudSale(db,root,rpc)).state,'REJECTED')
 assert.equal(Number(db.prepare('SELECT count(*) n FROM sales_confirmations').get()!.n),1,'missing source never sold')
 assert.equal((await post('/sync-status',{phase:'COMPLETE'})).status,409,'stock mismatch must not be recorded as completion')
 await post('/sync-status',{phase:'ERROR',error:'Fixture stock mismatch'})
 const syncStatus=await (await fetch(base+'/api/cloud/sync-status')).json();assert.equal(syncStatus.lastSuccess.at,successfulAt);assert.equal(syncStatus.lastAttempt.phase,'ERROR')
 // A valid photo can be replaced after matching Cloud but before preflight.
 // The original byte proof must remain bound through the final LOCAL gate.
 fs.writeFileSync(files[1],await sharp({create:{width:40,height:50,channels:3,background:'#ffbbee'}}).png().toBuffer())
 const changedPhoto=await sharp({create:{width:40,height:50,channels:3,background:'#00ff00'}}).png().toBuffer()
 await draft('mobile-order-race',2);await request('mobile-order-race','mobile-source-race-request')
 const raced=await processLocalCloudSale(db,root,rpc,point=>{if(point==='source-verified')fs.writeFileSync(files[1],changedPhoto)})
 assert.equal(raced.state,'REJECTED');assert.match(raced.error!,/Ảnh đã thay đổi/)
 assert.equal(Number(db.prepare('SELECT count(*) n FROM sales_confirmations').get()!.n),1)
 fs.unlinkSync(files[1])
 await draft('mobile-order-3',3);await request('mobile-order-3','mobile-request-finish-003');loseFinish=true
 await assert.rejects(()=>processLocalCloudSale(db,root,rpc),/Lost finish reply/)
 assert.equal((await processLocalCloudSale(db,root,rpc)).pending,false)
 assert.equal(Number(db.prepare('SELECT count(*) n FROM sales_units').get()!.n),2)
 assert.equal(Number((await one('SELECT count(*) n FROM sales_units')).n),2)
 assert.equal(salesExecutionService(db,root).pending(),false)
 // A deposit is intent until LOCAL commits it. Exercise all money/aftercare
 // services, including a lost upload reply and a later sale of the same draft.
 const customer='33333333-3333-4333-8333-333333333333'
 await draft('mobile-order-4',4)
 await pg.exec('RESET ROLE');await pg.query("INSERT INTO shop_customers(id,name,phone,phone_key,address,note) VALUES($1,'Khách trùng tên','','','','')",[customer]);await pg.query("INSERT INTO order_contacts(order_id,customer_id,recipient_name,phone,address,shipping_fee) VALUES('mobile-order-4',$1,'Khách trùng tên','','',0)",[customer]);await pg.exec('SET ROLE authenticated')
 const financial=async(action:string,key:string,payload:any)=>rpc('mc_v8_local_sales',{p_action:'request',p_key:key,p_payload:{id:'mobile-order-4',orderVersion:Number(db.prepare("SELECT version FROM sales_orders WHERE id='mobile-order-4'").get()?.version||1),action,...payload}})
 await financial('finance.entry','mobile-deposit-request-01',{version:0,kind:'RECEIPT',amount:10000,method:'CASH',note:'Cọc'})
 assert.equal(Number((await one('SELECT count(*) n FROM finance_entries')).n),0)
 loseUpload=true;await assert.rejects(()=>processLocalCloudSale(db,root,rpc),/Lost upload reply/)
 assert.equal((await processLocalCloudSale(db,root,rpc)).state,'CONFIRMED')
 assert.equal(Number(db.prepare('SELECT count(*) n FROM finance_entries').get()!.n),1,'deposit is not duplicated after retry')
 await rpc('mc_v8_local_sales',{p_action:'request',p_key:'mobile-draft-after-deposit',p_payload:{action:'draft.save',id:'mobile-order-4',version:1,items:[{imageId:4,unitPrice:45000}],discount:0,note:'Đã sửa sau cọc',contact:{customerId:customer,recipientName:'Khách trùng tên',phone:'',address:'',shippingFee:0}}})
 assert.equal((await processLocalCloudSale(db,root,rpc)).state,'CONFIRMED')
 assert.equal(db.prepare("SELECT note FROM sales_orders WHERE id='mobile-order-4'").get()!.note,'Đã sửa sau cọc')
 await request('mobile-order-4','mobile-sale-with-deposit-01',2)
 assert.equal((await processLocalCloudSale(db,root,rpc)).state,'CONFIRMED')
 assert.equal(financeService(db).summary('mobile-order-4').due,35000)
 await financial('finance.entry','mobile-refund-request-001',{version:1,kind:'REFUND',amount:5000,method:'CASH',note:'Hoàn một phần'})
 assert.equal((await processLocalCloudSale(db,root,rpc)).state,'CONFIRMED')
 await financial('aftercare.create','mobile-support-request-01',{version:2,kind:'SUPPORT',note:'Kiểm tra hàng'})
 assert.equal((await processLocalCloudSale(db,root,rpc)).state,'CONFIRMED')
 const caseId=String(db.prepare("SELECT id FROM aftercare_cases WHERE order_id='mobile-order-4'").get()!.id)
 await financial('aftercare.resolve','mobile-resolve-request-01',{version:3,caseId,caseVersion:1,resolution:'Đã xử lý'})
 assert.equal((await processLocalCloudSale(db,root,rpc)).state,'CONFIRMED')
 await financial('finance.configure','mobile-delivery-request-1',{version:4,method:'CASH',delivery:'SHIPPED',tracking:'TRACK-1'})
 assert.equal((await processLocalCloudSale(db,root,rpc)).state,'CONFIRMED')
 await financial('finance.entry','mobile-invalid-request-01',{version:5,kind:'RECEIPT',amount:100000,method:'CASH',note:'Không hợp lệ'})
 assert.equal((await processLocalCloudSale(db,root,rpc)).state,'REJECTED')
 assert.equal(financeService(db).summary('mobile-order-4').due,40000)
 assert.equal(Number(db.prepare('SELECT count(*) n FROM finance_entries').get()!.n),2)
 const history=salesHistory(db,{customerId:customer})
 assert.equal(history.total,1);assert.equal(history.summary.due,40000)
 const remoteHistory=(await one('SELECT public.mc_v8_customer_history($1,0,50) data',[customer])).data
 assert.equal(remoteHistory.total,1);assert.deepEqual(remoteHistory.summary,history.summary)
 for(let i=0;i<251;i++){const id='older-order-'+String(i).padStart(3,'0');db.prepare("INSERT INTO sales_orders(id,request_key,request_hash,discount,note,created_at) VALUES(?,?,?,0,'','2020-01-01')").run(id,'local-history-'+id,'h');db.prepare("INSERT INTO order_contacts(order_id,customer_id,recipient_name) VALUES(?,?,'Khách trùng tên')").run(id,customer)}
 assert.equal(salesHistory(db,{customerId:customer,offset:250}).rows.length,2)
 assert.equal(salesHistory(db,{q:'older-order-000'}).total,1,'global search finds an order outside the first 200')
 assert.equal(salesHistory(db,{customerId:customer}).summary.due,40000,'debt total is independent of page and drafts')
 await draft('mobile-order-cancel',2)
 await rpc('mc_v8_local_sales',{p_action:'request',p_key:'mobile-cancel-request-001',p_payload:{action:'draft.cancel',id:'mobile-order-cancel',version:1}})
 assert.equal((await processLocalCloudSale(db,root,rpc)).state,'CONFIRMED','cancellation does not require a missing source file')
 assert.equal(db.prepare("SELECT status FROM sales_orders WHERE id='mobile-order-cancel'").get()!.status,'CANCELLED_DRAFT')
 await pg.exec(`RESET ROLE;CREATE TABLE public.customer_catalog_inquiries(id uuid DEFAULT gen_random_uuid(),reference text,customer_name text,contact text,note text,items jsonb,status text,order_id text,version integer,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());INSERT INTO customer_catalog_inquiries(reference,customer_name,contact,note,items,status,version) SELECT 'CC-'||i,'Tên '||i,'090-'||i,'','[]','NEW',1 FROM generate_series(1,251) i;INSERT INTO customer_catalog_inquiries(reference,customer_name,contact,note,items,status,version,created_at) VALUES('OLD-REF','OLD-SECRET','OLD-SECRET','','[]','CLOSED',1,now()-interval '100 days');SET ROLE authenticated`)
 const inbox=async(q:string,status='',offset=0)=>(await one('SELECT public.mc_v8_catalog_inbox($1,$2,$3) data',[q,status,offset])).data
 assert.equal((await inbox('090-251')).total,1)
 assert.equal((await inbox('OLD-SECRET')).total,0,'redacted personal data cannot be searched')
 assert.equal((await inbox('','NEW',250)).rows.length,1)
 assert.equal((await inbox('')).counts.NEW,251)
 await pg.exec('RESET ROLE');await pg.query("UPDATE cloud_members SET role='viewer' WHERE user_id=$1",[owner]);await pg.exec('SET ROLE authenticated')
 await assert.rejects(()=>rpc('mc_v8_local_sales',{p_action:'next',p_payload:{instance}}),/CLOUD_ROLE_DENIED/)
 await pg.exec('RESET ROLE;SET ROLE anon')
 await assert.rejects(()=>rpc('mc_v8_local_sales',{p_action:'list'}),/permission denied/)
 console.log('PASS local-final sales: offline queue, LOCAL archives, retries, deposit/refund/delivery/aftercare, customer debt, >200-order search, global inquiries and redaction, owner/anonymous gates')
}catch(e){console.error('FAIL local-final sales:',(e as Error).message);process.exitCode=1}
finally{globalThis.fetch=realFetch;if(server)await new Promise<void>((resolve,reject)=>server!.close(e=>e?reject(e):resolve()));db.close();await pg.close();fs.rmSync(root,{recursive:true,force:true})}
