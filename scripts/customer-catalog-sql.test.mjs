// Runs the actual migration and PL/pgSQL validation in isolated PostgreSQL WASM.
// CORE draft bridge is stubbed here; the production rollback smoke verifies real CORE.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite()
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE SCHEMA private; CREATE SCHEMA extensions;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_setting('request.jwt.claim.role',true)$$;
 CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS $$SELECT decode(substr(replace(gen_random_uuid()::text,'-',''),1,n*2),'hex')$$;
 CREATE TABLE public.products(id bigint PRIMARY KEY,name text,product_code text,status text,updated_at text);
 CREATE TABLE public.product_variants(id bigint PRIMARY KEY,product_id bigint,size text,status text,sale_price bigint,sale_price_set boolean);
 CREATE TABLE public.product_images(id bigint PRIMARY KEY,product_id bigint,variant_id bigint);
 CREATE TABLE public.cloud_image_assets(image_id bigint PRIMARY KEY,object_path text,source_checked_at timestamptz,ready boolean,source_present boolean,cleanup_requested boolean,deleted_at timestamptz);
 CREATE TABLE public.sales_units(image_id bigint PRIMARY KEY);
 CREATE TABLE public.sales_orders(id text PRIMARY KEY);
 CREATE FUNCTION private.mc_v7_role() RETURNS text LANGUAGE sql AS $$SELECT current_setting('test.member_role',true)$$;
 CREATE FUNCTION private.mc_v7_command(p_request text,p_action text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$BEGIN INSERT INTO public.sales_orders(id) VALUES(p_payload->>'id'); RETURN jsonb_build_object('id',p_payload->>'id');END$$;
`)
await db.exec(fs.readFileSync('supabase/migrations/20261018125303_customer_catalog_v1.sql','utf8'))
const call=async(fn,args)=>(await db.query(`SELECT public.${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS data`,args)).rows[0].data
const read=(action,p={})=>call('mc_catalog_public',[action,JSON.stringify(p)])
const admin=(action,p={})=>call('mc_catalog_admin',[action,JSON.stringify(p)])
await db.exec(`SET request.jwt.claim.role='service_role'; SET test.member_role='owner'; INSERT INTO auth.users VALUES('11111111-1111-4111-8111-111111111111');SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';`)
assert.equal((await read('config')).enabled,false);await assert.rejects(()=>read('products'),/CATALOG_DISABLED/)
await db.exec(`INSERT INTO public.products VALUES(1,'Mẫu test','P1','active','2026-10-18');INSERT INTO public.product_variants VALUES(1,1,'8','active',50000,true),(2,1,'9','active',0,false);INSERT INTO public.product_images SELECT i,1,1 FROM generate_series(1,8) i;INSERT INTO public.cloud_image_assets SELECT i,'test/'||i||'.jpg',now(),i<>6,i<>7,i=8,null FROM generate_series(1,8) i; INSERT INTO public.sales_units VALUES(5); UPDATE public.customer_catalog_settings SET enabled=true;`)
assert.equal((await read('products')).products.length,0)
await admin('publish',{product_id:1,enabled:true})
const product=(await read('products')).products[0];assert.equal(product.sizes[0].available_count,4);assert.equal(product.sizes[1].sale_price,null);assert.equal(JSON.stringify(product).includes('cost_price'),false)
assert.equal((await read('photos',{product_id:1,variant_id:1})).photos.length,4)
await assert.rejects(()=>read('image',{image_id:5}),/CATALOG_UNAVAILABLE/)
const payload={name:'Fixture',contact:'0900000000',note:'',consent:true,items:[{product_id:1,variant_id:1,quick_quantity:2,selected_image_ids:[1,2],expected_price:50000}]}
let token=1;const submit=(p=payload,t=String(token++).padStart(64,'0'),ip='a'.repeat(64))=>call('mc_catalog_submit',[t,ip,JSON.stringify(p),false])
const first=await submit(payload,'1'.repeat(64));const retry=await submit(payload,'1'.repeat(64));assert.deepEqual(first,retry)
await assert.rejects(()=>submit({...payload,note:'changed'},'1'.repeat(64)),/CATALOG_RETRY_CONFLICT/)
await assert.rejects(()=>submit({...payload,items:[{...payload.items[0],quick_quantity:3}]}),/CATALOG_STOCK_CHANGED/)
await assert.rejects(()=>submit({...payload,items:[{...payload.items[0],selected_image_ids:[1,1]}]}),/CATALOG_INPUT/)
await assert.rejects(()=>submit({...payload,items:[{...payload.items[0],selected_image_ids:[1,5]}]}),/CATALOG_STOCK_CHANGED/)
await assert.rejects(()=>submit({...payload,items:[{...payload.items[0],expected_price:49999}]}),/CATALOG_PRICE_CHANGED/)
await assert.rejects(()=>submit({...payload,consent:false}),/CATALOG_CONTACT/)
assert.equal((await read('products',{size:'99',in_stock:'true'})).products.length,0)
await admin('publish',{product_id:1,enabled:false});await assert.rejects(()=>read('image',{image_id:1}),/CATALOG_UNAVAILABLE/);await assert.rejects(()=>submit(),/CATALOG_STOCK_CHANGED/);await admin('publish',{product_id:1,enabled:true})
let inbox=await admin('inbox');const inquiry=inbox[0];assert.equal(inquiry.reference,first.reference)
const price_snapshot=[1,2,3,4].map(imageId=>({imageId,unitPrice:50000}))
await assert.rejects(()=>admin('draft',{id:inquiry.id,version:inquiry.version,image_ids:[1,2],price_snapshot:price_snapshot.slice(0,2)}),/CATALOG_ALLOCATION/)
const draft=await admin('draft',{id:inquiry.id,version:inquiry.version,image_ids:[1,2,3,4],price_snapshot})
assert.equal(draft.id,inquiry.id);assert.deepEqual(await admin('draft',{id:inquiry.id,version:inquiry.version,image_ids:[1,2,3,4],price_snapshot}),draft)
assert.equal((await db.query('select count(*) n from public.sales_orders')).rows[0].n,1)
assert.equal((await db.query('select count(*) n from public.sales_units')).rows[0].n,1)
await db.exec("SET test.member_role='cashier'");await assert.rejects(()=>admin('inbox'),/CATALOG_DENIED/)
await db.exec("SET test.member_role='owner';SET request.jwt.claim.role='anon'");await assert.rejects(()=>read('products'),/CATALOG_DENIED/)
const grants=await db.query("select has_function_privilege('anon','public.mc_catalog_public(text,jsonb)','execute') allowed,has_table_privilege('anon','public.customer_catalog_inquiries','select') pii")
assert.equal(grants.rows[0].allowed,false);assert.equal(grants.rows[0].pii,false)
await db.close();console.log('CATALOG_SQL PASS: default hidden/off, eligibility, unknown price, scoped reads, mixed cart, stale stock/price, duplicate/retry, owner permissions, exact allocation, single draft and no SOLD')
