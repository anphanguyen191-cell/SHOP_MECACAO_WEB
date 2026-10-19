import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import sharp from 'sharp'
import {PGlite} from '@electric-sql/pglite'
import {bootstrapSalesDrafts} from '../apps/api/src/salesSchema.js'
import {bootstrapSalesExecution,salesExecutionService} from '../apps/api/src/salesExecution.js'
import {salesDraftService} from '../apps/api/src/salesDrafts.js'
import {salesPreflightService} from '../apps/api/src/salesPreflight.js'
import {bootstrapCustomers,customerService} from '../apps/api/src/customers.js'
import {bootstrapFinance,financeService,validateFinance} from '../apps/api/src/orderFinance.js'
import {readLocalBusiness,uploadLocalBusiness,assertBusinessUploaded,verifyImportedLocalSale,pullCloudBusiness} from '../apps/api/src/cloudBusiness.js'
import {createLiveFolderSync} from '../apps/web/src/liveFolderSync.js'
import {cloudInventory} from '../apps/web/src/cloudInventory.js'
import {optimizeCloudImage} from '../apps/api/src/cloudImages.js'
import {bootstrapStocktake,stocktakeService} from '../apps/api/src/stocktake.js'

const root=fs.mkdtempSync(path.join(os.tmpdir(),'cacao-business-')),db=new DatabaseSync(path.join(root,'shop.db')),pg=new PGlite()
const instance='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222'
const one=async(sql:string,args:any[]=[])=>((await pg.query(sql,args)).rows[0] as any)
const call=async(name:string,args:any)=>{
 if(name==='mc_v7_health')return {role:'owner',instance,status:'CLOUD_TEST_READY',sequence:Number((await one('SELECT coalesce(max(sequence),0) n FROM cloud_sync_events')).n)}
 if(name==='mc_v7_rows'){const rows=(await pg.query('SELECT * FROM '+args.p_table+' ORDER BY 1 LIMIT $1 OFFSET $2',[args.p_limit,Number(args.p_after)])).rows;return {rows,nextOffset:Number(args.p_after)+rows.length}}
 if(name==='mc_v7_sold_proof')return proof(args.p_id)
 return (await one(`SELECT public.${name}($1,$2,$3) data`,[args.p_instance,args.p_request,JSON.stringify(args.p_payload)])).data
}
const proof=async(id:string)=>({instance,order:await one('SELECT * FROM sales_orders WHERE id=$1',[id]),confirmation:await one('SELECT * FROM sales_confirmations WHERE order_id=$1',[id]),items:(await pg.query('SELECT * FROM sales_order_images WHERE order_id=$1 ORDER BY position',[id])).rows,assets:(await pg.query('SELECT a.* FROM cloud_image_assets a JOIN sales_units u ON u.image_id=a.image_id WHERE u.order_id=$1',[id])).rows})
try{
 bootstrapSalesDrafts(db);bootstrapSalesExecution(db,root);bootstrapCustomers(db);bootstrapFinance(db)
 db.exec("INSERT INTO products(id,product_code,name) VALUES(1,'P1','Bộ tole');INSERT INTO product_variants(id,product_id,sku,size,cost_price,sale_price) VALUES(1,1,'P1-S','S',12000,50000);INSERT INTO inventory_transactions(variant_id,transaction_type,quantity) VALUES(1,'OPENING',3106)")
 db.prepare('INSERT INTO app_metadata(key,value) VALUES(?,?)').run('cloud-instance',instance)
 for(let i=1;i<=6;i++){const file=path.join(root,'photo-'+i+'.png');await sharp({create:{width:40,height:50,channels:3,background:{r:i*30,g:80,b:90}}}).png().toFile(file);db.prepare('INSERT INTO product_images(id,product_id,variant_id,file_path) VALUES(?,1,1,?)').run(i,file)}
 const customer=customerService(db).save({name:'Khách kiểm thử',phone:'0900000000',address:'Địa chỉ kiểm thử',note:''})
 const draft=salesDraftService(db,root).create({items:[1,2,3,4].map(imageId=>({imageId,unitPrice:50000})),discount:1000,note:'Lịch sử laptop',contact:{customerId:customer.id,recipientName:customer.name,phone:customer.phone,address:customer.address,shippingFee:10000}},'business-draft-fixture-001')
 const token=(await salesPreflightService(db,root).check(draft.id,1)).token
 await salesExecutionService(db,root).confirm(draft.id,{version:1,token,confirmed:true,acknowledgeZeroPrice:false},'business-sale-fixture-001')
 financeService(db).record(draft.id,{kind:'RECEIPT',amount:100000,method:'CASH',note:'Đã thu',version:0,orderVersion:1},'business-receipt-fixture-001')
 bootstrapStocktake(db)
 const stocktake=stocktakeService(db,root),counting=stocktake.create({title:'Kiểm kê kiểm thử'},'business-stocktake-fixture-001'),counted=stocktake.save(counting.id,{version:counting.version,rows:counting.rows.map(r=>({variantId:r.variantId,counted:r.physical,note:'Đối chiếu ảnh thực'}))})
 stocktake.finish(counted.id,{version:counted.version,confirmed:true,conclusion:'Đã đối chiếu'})
 const snapshot=readLocalBusiness(db,root),serialized=JSON.stringify(snapshot.rows)
 assert.equal(serialized.includes(root),false,'Machine paths are not sent to Cloud')
 assert.equal(snapshot.counts.sales_units,4);assert.equal(snapshot.counts.shop_customers,1)
 assert.throws(()=>assertBusinessUploaded(db,root),/chưa đồng bộ/)
 await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE SCHEMA storage;CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${owner}');CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;CREATE TABLE storage.objects(bucket_id text,name text,metadata jsonb);`)
 const base=fs.readFileSync('supabase/migrations/20261011052324_reset_shop_mecacao_web_v7.sql','utf8').replace(/^ALTER PUBLICATION .*;$/m,'')
 await pg.exec(base)
 await pg.exec(fs.readFileSync('supabase/migrations/20261011053317_v7_cloud_contract.sql','utf8'))
 await pg.exec(`ALTER TABLE cloud_image_assets ADD COLUMN source_present boolean NOT NULL DEFAULT true;ALTER TABLE cloud_image_assets ADD COLUMN source_checked_at timestamptz;CREATE FUNCTION private.mc_v7_command(text,text,jsonb) RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;SET request.jwt.claim.sub='${owner}';UPDATE app_metadata SET value='RPC_READY' WHERE key='cloud_status';INSERT INTO app_metadata(key,value) VALUES('cloud_instance','${instance}');INSERT INTO products(id,product_code,name) VALUES(1,'P1','Bộ tole');INSERT INTO product_variants(id,product_id,sku,size,cost_price,sale_price) VALUES(1,1,'P1-S','S',12000,50000);INSERT INTO inventory_transactions(variant_id,transaction_type,quantity) VALUES(1,'OPENING',3106);INSERT INTO product_images(id,product_id,variant_id,file_path) SELECT i,1,1,'v7/${instance}/'||i||'.jpg' FROM generate_series(1,3106) i;INSERT INTO cloud_image_assets(image_id,object_path,bytes,sha256,revision,ready) SELECT id,file_path,100,repeat('a',64),'1',true FROM product_images;`)
 await pg.exec(fs.readFileSync('supabase/migrations/20261019031717_v8_business_history_sync.sql','utf8'))
 const originalPresence=fs.readFileSync('supabase/migrations/20261013154949_audit_inventory_proof_safety.sql','utf8')
 await pg.exec(originalPresence.slice(originalPresence.indexOf('CREATE FUNCTION private.mc_v7_presence'),originalPresence.indexOf('CREATE FUNCTION private.mc_v7_proof_register')))
 const presence=()=>one('SELECT public.mc_v7_presence($1,$2,$3) data',[instance,'presence-status-fixture-001',JSON.stringify([{id:6,present:false}])])
 await assert.rejects(presence,/null value in column "status"/)
 assert.equal((await one('SELECT source_present FROM cloud_image_assets WHERE image_id=6')).source_present,true,'Failed request rolled back availability')
 await pg.exec(fs.readFileSync('supabase/migrations/20261019051545_fix_cloud_presence_request_status.sql','utf8'))
 assert.equal((await presence()).data.changed,1)
 assert.equal((await one("SELECT status FROM cloud_requests WHERE request_key='presence-status-fixture-001'")).status,'COMMITTED')
 assert.deepEqual(await presence(),{data:{changed:1}},'Retry returns the committed result')
 assert.equal(Number((await one("SELECT count(*) n FROM cloud_sync_events WHERE request_key='presence-status-fixture-001'")).n),1)
 await one('SELECT public.mc_v7_presence($1,$2,$3) data',[instance,'presence-restore-fixture-001',JSON.stringify([{id:6,present:true}])])
 assert.equal((await one("SELECT has_function_privilege('anon','public.mc_v8_business_import(uuid,text,jsonb)','EXECUTE') allowed")).allowed,false)
 assert.equal((await one("SELECT has_table_privilege('authenticated','public.sales_confirmations','INSERT') allowed")).allowed,false)
 const available=async()=>Number((await one('SELECT count(*) n FROM cloud_image_assets a WHERE ready AND source_present AND NOT EXISTS(SELECT 1 FROM sales_units u WHERE u.image_id=a.image_id)')).n)
 assert.equal(await available(),3106)
 await assert.rejects(()=>pg.query("SELECT public.mc_v7_command('fixture-before-activation','customer.save','{}')"),/NOT_READY/)
 let lost=true
 await pg.exec('GRANT USAGE ON SCHEMA auth TO authenticated;SET ROLE authenticated')
 await assert.rejects(()=>uploadLocalBusiness(db,root,async(n,a)=>{const result=await call(n,a);if(lost){lost=false;throw Error('Lost response after commit')}return result}),/Lost response/)
 await pg.exec('RESET ROLE')
 assert.equal(await available(),3102,'All four LOCAL SOLD disappear atomically from Cloud stock')
 const result=await uploadLocalBusiness(db,root,call);assert.equal(result.counts.sales_units,4);assertBusinessUploaded(db,root)
 await uploadLocalBusiness(db,root,call)
 assert.equal(Number((await one('SELECT count(*) n FROM finance_entries')).n),1,'Retry never duplicates receipt')
 assert.equal(Number((await one('SELECT count(*) n FROM sales_ledger')).n),4)
 assert.equal(Number((await one('SELECT sum(total) n FROM sales_confirmations')).n),199000)
 assert.equal((await one('SELECT status FROM stocktake_sessions')).status,'CLOSED')
 const cloudData:any={};for(const table of ['products','product_variants','product_images','cloud_image_assets','sales_units','inventory_transactions'])cloudData[table]=(await pg.query('SELECT * FROM '+table)).rows
 assert.equal(cloudInventory(cloudData).dashboard.stock,3102,'Actual mobile inventory projection excludes SOLD')
 const localProof=await proof(draft.id);assert.equal(verifyImportedLocalSale(db,root,localProof)?.sold,true)
 await assert.rejects(async()=>verifyImportedLocalSale(db,root,{...localProof,confirmation:{...localProof.confirmation,total:1}}),/khác laptop/)
 const changed=structuredClone(snapshot.rows);changed.sales_ledger[0].unit_cost=1
 await assert.rejects(()=>call('mc_v8_business_import',{p_instance:instance,p_request:'business-evidence-conflict-001',p_payload:changed}),/EVIDENCE_CONFLICT/)
 assert.equal(Number((await one('SELECT unit_cost FROM sales_ledger ORDER BY image_id LIMIT 1')).unit_cost),12000)
 const malformed=structuredClone(snapshot.rows);malformed.sales_units.pop()
 await assert.rejects(()=>call('mc_v8_business_import',{p_instance:instance,p_request:'business-incomplete-fixture-001',p_payload:malformed}),/SALE_MISMATCH/)
 assert.equal(await available(),3102)
 await assert.rejects(()=>call('mc_v8_business_import',{p_instance:'33333333-3333-4333-8333-333333333333',p_request:'business-wrong-instance-001',p_payload:snapshot.rows}),/WAREHOUSE_MISMATCH/)
 await pg.exec("UPDATE cloud_members SET role='viewer'")
 await assert.rejects(()=>call('mc_v8_business_import',{p_instance:instance,p_request:'business-viewer-fixture-001',p_payload:snapshot.rows}),/ROLE_DENIED/)
 await pg.exec("UPDATE cloud_members SET role='owner';UPDATE app_metadata SET value='CLOUD_TEST_READY' WHERE key='cloud_status'")
 db.prepare("INSERT INTO app_metadata(key,value) VALUES('cloud-authority','enabled')").run()
 await pg.query("UPDATE shop_customers SET name='Tên sửa từ mobile',version=version+1 WHERE id=$1",[customer.id])
 await pullCloudBusiness(db,root,call)
 assert.equal(customerService(db).get(String(customer.id)).name,'Tên sửa từ mobile')
 assert.equal(financeService(db).summary(draft.id).due,109000,'Same receipt/shipping/discount and debt after Cloud mirror')
 await pullCloudBusiness(db,root,call);assert.equal(Number(db.prepare('SELECT count(*) n FROM finance_entries').get()!.n),1)
 const payment={id:draft.id,kind:'RECEIPT',amount:50000,method:'TRANSFER',note:'Thu từ mobile',version:1,orderVersion:1},payload=JSON.stringify(payment)
 await pg.query("INSERT INTO finance_entries(id,order_id,request_key,input_hash,payload,sequence,kind,amount,method,note) VALUES('mobile-receipt',$1,'mobile-receipt-fixture-001',encode(sha256(convert_to($2,'UTF8')),'hex'),$2,2,'RECEIPT',50000,'TRANSFER','Thu từ mobile')",[draft.id,payload])
 await pg.query("INSERT INTO aftercare_cases(id,order_id,request_key,input_hash,kind,note,status) VALUES('mobile-case',$1,'mobile-case-fixture-001','cloud-command-hash','SUPPORT','Yêu cầu mobile','OPEN')",[draft.id])
 await pg.query('UPDATE order_finance SET version=3 WHERE order_id=$1',[draft.id])
 await pullCloudBusiness(db,root,call);validateFinance(db)
 assert.equal(financeService(db).summary(draft.id).due,59000)
 await pullCloudBusiness(db,root,call);assert.equal(Number(db.prepare('SELECT count(*) n FROM finance_entries').get()!.n),2)
 await pg.exec("INSERT INTO sales_orders(id,request_key,request_hash,discount,note) VALUES('new-mobile-draft','new-mobile-request','new-mobile-hash',0,'Tạo từ mobile');INSERT INTO sales_order_images(order_id,image_id,product_id,variant_id,product_name,product_code,size,sku,unit_price,unit_cost,position) VALUES('new-mobile-draft',5,1,1,'Bộ tole','P1','S','P1-S',50000,12000,0)")
 await pullCloudBusiness(db,root,call)
 assert.equal(db.prepare("SELECT request_key FROM sales_orders WHERE id='new-mobile-draft'").get()!.request_key,'cloud-import-new-mobile-draft')
 const photo5=await optimizeCloudImage(path.join(root,'photo-5.png'))
 await pg.query('UPDATE cloud_image_assets SET sha256=$1 WHERE image_id=5',[photo5.sha256])
 await pg.exec("INSERT INTO sales_operations(id,request_key,input_hash,payload,payload_hash,status) VALUES('new-mobile-op','new-mobile-sale','hash','{}','hash','SOLD');INSERT INTO sales_confirmations(order_id,operation_id,version,subtotal,discount,total,note) VALUES('new-mobile-draft','new-mobile-op',1,50000,0,50000,'Tạo từ mobile');INSERT INTO sales_units(image_id,order_id,variant_id,snapshot,source_hash,archive_path,archive_hash) SELECT 5,'new-mobile-draft',1,'{}',sha256,object_path,sha256 FROM cloud_image_assets WHERE image_id=5;INSERT INTO sales_ledger(image_id,order_id,variant_id,transaction_type,quantity,unit_cost) VALUES(5,'new-mobile-draft',1,'SALE',1,12000)")
 await pullCloudBusiness(db,root,call)
 assert.equal(Number(db.prepare('SELECT count(*) n FROM sales_units').get()!.n),5,'A mirrored mobile draft can later become SOLD on the same laptop')
 assert.equal(fs.existsSync(path.join(root,'photo-5.png')),false)
 // Business changes trigger sync before activation, without waiting for folder changes.
 let revision=0,syncs=0,online=true,time=0,fail=false
 const runner=createLiveFolderSync({clock:()=>time,online:()=>online,busy:()=>false,read:async()=>({enabled:false,syncEnabled:true,business:{epoch:'first',revision},live:{ready:true,pendingSync:false}}),onState:()=>{},onError:()=>{},sync:async()=>{syncs++;if(fail){fail=false;return false}return true}})
 await runner.tick();assert.equal(syncs,1);await runner.tick();assert.equal(syncs,1)
 revision++;await runner.tick();assert.equal(syncs,2);online=false;revision++;await runner.tick();assert.equal(syncs,2);online=true;fail=true;await runner.tick();assert.equal(syncs,3);time+=1000;await runner.tick();assert.equal(syncs,4);runner.close()
 console.log('BUSINESS_SYNC PASS: real LOCAL SOLD/archive to PostgreSQL, 3106 -> 3102 mobile stock, customers/orders/receipts/debt, atomic rejection, lost-response/restart retry, immutable evidence, role/instance guards, mobile customer back to LOCAL, pre-activation change signal and offline retry')
}finally{db.close();await pg.close();fs.rmSync(root,{recursive:true,force:true})}
