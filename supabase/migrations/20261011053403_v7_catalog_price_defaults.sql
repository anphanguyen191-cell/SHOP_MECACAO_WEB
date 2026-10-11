CREATE OR REPLACE FUNCTION private.mc_v7_catalog(p_request text,p_instance uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; hash text; previous public.cloud_requests%ROWTYPE; item jsonb; bound text; answer jsonb; n integer:=0; BEGIN
 r:=private.mc_v7_role();
 IF r NOT IN ('owner','inventory') THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED' USING ERRCODE='42501'; END IF;
 IF length(p_request) NOT BETWEEN 8 AND 200 OR p_instance IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>1500000 THEN RAISE EXCEPTION 'CLOUD_INPUT_INVALID'; END IF;
 hash:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('mc-v7-write',0));
 SELECT * INTO previous FROM public.cloud_requests WHERE request_key=p_request;
 IF FOUND THEN
  IF previous.actor_id<>auth.uid() OR previous.input_hash<>hash THEN RAISE EXCEPTION 'CLOUD_REQUEST_CONFLICT'; END IF;
  RETURN previous.result;
 END IF;
 SELECT value INTO bound FROM public.app_metadata WHERE key='cloud_instance';
 IF bound IS NULL THEN
  IF r<>'owner' THEN RAISE EXCEPTION 'CLOUD_OWNER_BOOTSTRAP_REQUIRED'; END IF;
  INSERT INTO public.app_metadata(key,value) VALUES('cloud_instance',p_instance::text);
 ELSIF bound<>p_instance::text THEN RAISE EXCEPTION 'CLOUD_WAREHOUSE_MISMATCH'; END IF;
 IF COALESCE(jsonb_array_length(p_payload->'categories'),0)+COALESCE(jsonb_array_length(p_payload->'products'),0)+COALESCE(jsonb_array_length(p_payload->'variants'),0)+COALESCE(jsonb_array_length(p_payload->'images'),0)>500 THEN RAISE EXCEPTION 'CLOUD_BATCH_TOO_LARGE'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'categories','[]')) LOOP
  INSERT INTO public.categories(id,name,status) VALUES((item->>'id')::bigint,item->>'name',COALESCE(item->>'status','active')) ON CONFLICT(id) DO UPDATE SET name=excluded.name,status=excluded.status; n:=n+1;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'products','[]')) LOOP
  INSERT INTO public.products(id,product_code,name,category_id,cost_price,sale_price,description,status) VALUES((item->>'id')::bigint,item->>'product_code',item->>'name',(item->>'category_id')::bigint,COALESCE((item->>'cost_price')::bigint,0),COALESCE((item->>'sale_price')::bigint,0),COALESCE(item->>'description',''),COALESCE(item->>'status','active')) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category_id=excluded.category_id,cost_price=excluded.cost_price,sale_price=excluded.sale_price,description=excluded.description,status=excluded.status WHERE public.products.product_code=excluded.product_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'CLOUD_PRODUCT_ID_CONFLICT'; END IF; n:=n+1;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'variants','[]')) LOOP
  INSERT INTO public.product_variants(id,product_id,sku,size,status,cost_price,sale_price) VALUES((item->>'id')::bigint,(item->>'product_id')::bigint,item->>'sku',item->>'size',COALESCE(item->>'status','active'),COALESCE((item->>'cost_price')::bigint,0),COALESCE((item->>'sale_price')::bigint,0)) ON CONFLICT(id) DO UPDATE SET status=excluded.status,cost_price=excluded.cost_price,sale_price=excluded.sale_price WHERE public.product_variants.product_id=excluded.product_id AND public.product_variants.sku=excluded.sku AND public.product_variants.size=excluded.size;
  IF NOT FOUND THEN RAISE EXCEPTION 'CLOUD_VARIANT_ID_CONFLICT'; END IF; n:=n+1;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'images','[]')) LOOP
  -- Paths on Windows are never sent to mobile; cloud path is derived by server.
  INSERT INTO public.product_images(id,product_id,variant_id,file_path,sort_order,is_primary) VALUES((item->>'id')::bigint,(item->>'product_id')::bigint,(item->>'variant_id')::bigint,'v7/'||p_instance::text||'/'||(item->>'id')||'.jpg',COALESCE((item->>'sort_order')::bigint,0),COALESCE((item->>'is_primary')::bigint,0)) ON CONFLICT(id) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.product_images WHERE id=(item->>'id')::bigint AND product_id=(item->>'product_id')::bigint AND variant_id=(item->>'variant_id')::bigint AND file_path='v7/'||p_instance::text||'/'||(item->>'id')||'.jpg') THEN RAISE EXCEPTION 'CLOUD_IMAGE_ID_CONFLICT'; END IF;
  n:=n+1;
 END LOOP;
 answer:=jsonb_build_object('count',n,'instance',p_instance,'request',p_request);
 INSERT INTO public.cloud_requests(request_key,input_hash,actor_id,status,result) VALUES(p_request,hash,auth.uid(),'COMMITTED',answer);
 INSERT INTO public.cloud_sync_events(request_key,entity_type,entity_id,version,payload) VALUES(p_request,'catalog',p_instance::text,1,answer);
 RETURN answer;
END $$;
