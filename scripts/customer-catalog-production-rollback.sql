-- Isolated synthetic rows, never committed and never exposed to public visitors.
BEGIN;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM public.cloud_members WHERE enabled AND role='owner' LIMIT 1),true);
INSERT INTO public.products(id,product_code,name,status) VALUES(900000001,'CATALOG_ROLLBACK_FIXTURE','Fixture catalog transaction','active');
INSERT INTO public.product_variants(id,product_id,sku,size,status,sale_price,sale_price_set) VALUES(900000001,900000001,'CATALOG_ROLLBACK_8','8','active',50000,true);
INSERT INTO public.product_images(id,product_id,variant_id,file_path) SELECT 900000000+i,900000001,900000001,'catalog-fixture/'||i||'.jpg' FROM generate_series(1,5) i;
INSERT INTO public.cloud_image_assets(image_id,object_path,bytes,sha256,revision,ready,source_present,source_checked_at) SELECT 900000000+i,'catalog-fixture/'||i||'.jpg',100,repeat('a',64),'fixture',true,true,now() FROM generate_series(1,5) i;
UPDATE public.customer_catalog_settings SET enabled=true WHERE id;
SELECT public.mc_catalog_admin('publish','{"product_id":900000001,"enabled":true}');
DO $test$
DECLARE data jsonb; result jsonb; second jsonb; inquiry jsonb; saved uuid; before_sold bigint; BEGIN
 SELECT count(*) INTO before_sold FROM public.sales_units;
 data:=public.mc_catalog_public('products','{"product_id":900000001}');
 IF (data->'products'->0->'sizes'->0->>'available_count')::integer<>5 THEN RAISE EXCEPTION 'TEST STOCK COUNT'; END IF;
 IF data::text LIKE '%cost_price%' THEN RAISE EXCEPTION 'TEST PRIVATE LEAK'; END IF;
 result:=public.mc_catalog_submit(repeat('b',64),repeat('c',64),'{"name":"Fixture guest","contact":"fixture@example.invalid","consent":true,"items":[{"product_id":900000001,"variant_id":900000001,"quick_quantity":3,"selected_image_ids":[900000001,900000002],"expected_price":50000}]}');
 second:=public.mc_catalog_submit(repeat('b',64),repeat('c',64),'{"name":"Fixture guest","contact":"fixture@example.invalid","consent":true,"items":[{"product_id":900000001,"variant_id":900000001,"quick_quantity":3,"selected_image_ids":[900000001,900000002],"expected_price":50000}]}');
 IF result<>second THEN RAISE EXCEPTION 'TEST RETRY'; END IF;
 SELECT id INTO saved FROM public.customer_catalog_inquiries WHERE token_hash=repeat('b',64);
 inquiry:=jsonb_build_object('id',saved,'version',1,'image_ids',jsonb_build_array(900000001,900000002,900000003,900000004,900000005),'price_snapshot',jsonb_build_array(jsonb_build_object('imageId',900000001,'unitPrice',50000),jsonb_build_object('imageId',900000002,'unitPrice',50000),jsonb_build_object('imageId',900000003,'unitPrice',50000),jsonb_build_object('imageId',900000004,'unitPrice',50000),jsonb_build_object('imageId',900000005,'unitPrice',50000)));
 result:=public.mc_catalog_admin('draft',inquiry);second:=public.mc_catalog_admin('draft',inquiry);
 IF result->>'id' IS DISTINCT FROM second->>'id' OR result->>'id'<>saved::text OR (SELECT count(*) FROM public.sales_order_images WHERE order_id=saved::text)<>5 THEN RAISE EXCEPTION 'TEST CORE DRAFT'; END IF;
 IF (SELECT count(*) FROM public.sales_units)<>before_sold THEN RAISE EXCEPTION 'TEST SOLD CHANGED'; END IF;
 IF (SELECT available_count FROM jsonb_to_recordset(public.mc_catalog_public('products','{"product_id":900000001}')->'products'->0->'sizes') AS x(available_count integer))<>5 THEN RAISE EXCEPTION 'TEST DRAFT RESERVED STOCK'; END IF;
END $test$;
SELECT jsonb_build_object('core_draft_bridge','PASS','idempotency','PASS','stock_unchanged','PASS','private_fields_excluded','PASS','transaction','ROLLBACK') evidence;
ROLLBACK;
