-- Run ONLY inside BEGIN/ROLLBACK. All products/customers/orders below are disposable fixtures.
DO $$ DECLARE actor uuid; instance text; snap jsonb; row jsonb; input jsonb; result jsonb; replay jsonb; draft jsonb; previous bigint; BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('mc-v7-write',0));
 SELECT user_id INTO actor FROM public.cloud_members WHERE enabled AND role='owner' LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'Fixture needs an existing authorized owner'; END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 SELECT value INTO instance FROM public.app_metadata WHERE key='cloud_instance';
 INSERT INTO public.products(id,product_code,name) VALUES(915000000000011,'__PRICE_ROLLBACK_TEST__','Fixture price rollback');
 INSERT INTO public.product_variants(id,product_id,sku,size,cost_price,sale_price) VALUES(915000000000011,915000000000011,'__PRICE_ROLLBACK_SIZE__','Size test',0,80000);
 INSERT INTO public.product_images(id,product_id,variant_id,file_path) VALUES(915000000000011,915000000000011,915000000000011,'v7/'||instance||'/fixture-price.jpg');
 INSERT INTO public.cloud_image_assets(image_id,object_path,bytes,sha256,revision,ready) VALUES(915000000000011,'v7/'||instance||'/fixture-price.jpg',100,repeat('a',64),'fixture',true);
 snap:=public.mc_v7_price_snapshot(); SELECT value INTO row FROM jsonb_array_elements(snap->'rows') WHERE value->>'id'='915000000000011';
 IF row IS NULL THEN RAISE EXCEPTION 'Fixture missing from physical snapshot'; END IF;
 input:=jsonb_build_object('scope','CLOUD','instance',instance,'rows',jsonb_build_array(row||jsonb_build_object('cost',50000,'sale',85000)));
 result:=public.mc_v7_prices('price-rollback-preview-0001','prices.preview',input);
 IF (result->>'costCount')::int<>1 OR (result->>'saleCount')::int<>0 OR (SELECT cost_price FROM public.product_variants WHERE id=915000000000011)<>0 THEN RAISE EXCEPTION 'Preview changed data or overwrote existing sale'; END IF;
 result:=public.mc_v7_prices('price-rollback-commit-0001','prices.commit',input);
 replay:=public.mc_v7_prices('price-rollback-commit-0001','prices.commit',input);
 IF result<>replay OR (SELECT cost_price FROM public.product_variants WHERE id=915000000000011)<>50000 OR (SELECT sale_price FROM public.product_variants WHERE id=915000000000011)<>80000 THEN RAISE EXCEPTION 'Fill-only/replay failed'; END IF;
 result:=public.mc_v7_prices('price-rollback-stale-0001','prices.preview',input);IF (result->>'costCount')::int<>0 THEN RAISE EXCEPTION 'Stale file applied'; END IF;
 BEGIN PERFORM public.mc_v7_prices('price-rollback-other-0001','prices.commit',input||jsonb_build_object('instance','wrong'));RAISE EXCEPTION 'Wrong instance accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CLOUD_WAREHOUSE_MISMATCH' THEN RAISE;END IF;END;
 UPDATE public.product_variants SET cost_price=0,cost_price_set=false WHERE id=915000000000011;
 snap:=public.mc_v7_price_snapshot();SELECT value INTO row FROM jsonb_array_elements(snap->'rows') WHERE value->>'id'='915000000000011';
 input:=jsonb_build_object('scope','CLOUD','instance',instance,'rows',jsonb_build_array(row||jsonb_build_object('cost',0,'sale',NULL)));
 PERFORM public.mc_v7_prices('price-rollback-zero-0001','prices.commit',input);
 IF NOT (SELECT cost_price_set FROM public.product_variants WHERE id=915000000000011) THEN RAISE EXCEPTION 'Explicit zero not retained'; END IF;
 SELECT count(*) INTO previous FROM public.shop_customers;
 draft:=jsonb_build_object('id','price-rollback-draft-0001','version',0,'items',jsonb_build_array(jsonb_build_object('imageId',915000000000011,'unitPrice',80000)),'discount',0,'contact',jsonb_build_object('recipientName','Fixture customer','phone','0999999901','address','Fixture','shippingFee',0,'saveCustomer',true));
 result:=public.mc_v7_command('price-rollback-draft-request-0001','draft.save',draft);
 replay:=public.mc_v7_command('price-rollback-draft-request-0001','draft.save',draft);
 IF result<>replay OR (SELECT count(*) FROM public.shop_customers)<>previous+1 OR (SELECT customer_id FROM public.order_contacts WHERE order_id='price-rollback-draft-0001') IS NULL THEN RAISE EXCEPTION 'Atomic customer/replay failed'; END IF;
 PERFORM public.mc_v7_command('price-rollback-sale-request-0001','sale.confirm',jsonb_build_object('id','price-rollback-draft-0001','version',1,'confirmed',true));
 IF (SELECT unit_cost FROM public.sales_order_images WHERE order_id='price-rollback-draft-0001') IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Known zero sale cost lost'; END IF;
 BEGIN PERFORM private.mc_v7_draft_customer(jsonb_build_object('recipientName','Duplicate','phone','+84 999999901','saveCustomer',true));RAISE EXCEPTION 'Duplicate accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CLOUD_CUSTOMER_DUPLICATE' THEN RAISE;END IF;END;
 BEGIN PERFORM private.mc_v7_draft_customer(jsonb_build_object('recipientName','No phone','phone','','saveCustomer',true));RAISE EXCEPTION 'No-phone accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CLOUD_CUSTOMER_NO_PHONE' THEN RAISE;END IF;END;
 -- Other roles cannot read/import costs through the new endpoint.
 SELECT user_id INTO actor FROM public.cloud_members WHERE enabled AND role<>'owner' AND role<>'inventory' LIMIT 1;
 IF actor IS NOT NULL THEN PERFORM set_config('request.jwt.claim.sub',actor::text,true);BEGIN PERFORM public.mc_v7_price_snapshot();RAISE EXCEPTION 'Wrong role accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END IF;
END $$;
