-- V7 authenticated contract. Raw business-table writes remain revoked.
CREATE FUNCTION private.mc_v7_role() RETURNS text LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE r text; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'CLOUD_LOGIN_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT role INTO r FROM public.cloud_members WHERE user_id=auth.uid() AND enabled;
 IF r IS NULL THEN RAISE EXCEPTION 'CLOUD_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION private.mc_v7_role() FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.mc_v7_role() TO authenticated;
CREATE FUNCTION public.mc_v7_health() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE r text; BEGIN
 r:=private.mc_v7_role();
 RETURN jsonb_build_object('contract',1,'schema',130,'role',r,'bucket','shop-mobile-images','maxImageBytes',150000,'serverTime',now(),'status','RPC_READY');
END $$;
REVOKE ALL ON FUNCTION public.mc_v7_health() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_v7_health() TO authenticated;
CREATE FUNCTION public.mc_v7_rows(p_table text,p_after text DEFAULT '',p_limit integer DEFAULT 200) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE k text; result jsonb; BEGIN
 PERFORM private.mc_v7_role();
 IF p_table NOT IN ('categories','products','product_variants','product_images','cloud_image_assets','shop_customers','sales_orders','sales_order_images','order_contacts','sales_confirmations','sales_units','sales_ledger','sales_operations','order_finance','finance_entries','aftercare_cases','stocktake_sessions','stocktake_rows','inventory_transactions') THEN RAISE EXCEPTION 'CLOUD_TABLE_INVALID'; END IF;
 IF p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'CLOUD_PAGE_INVALID'; END IF;
 k:=CASE WHEN p_table IN ('sales_order_images','order_contacts','sales_confirmations','order_finance') THEN 'order_id' WHEN p_table IN ('sales_units','sales_ledger','cloud_image_assets') THEN 'image_id' WHEN p_table='stocktake_rows' THEN 'session_id' ELSE 'id' END;
 -- Offset pagination uses opaque numeric cursor; composite tables have deterministic secondary keys.
 IF p_after<>'' AND p_after !~ '^[0-9]{1,9}$' THEN RAISE EXCEPTION 'CLOUD_CURSOR_INVALID'; END IF;
 EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(t)),''[]''::jsonb) FROM (SELECT * FROM public.%I ORDER BY %I%s LIMIT $1 OFFSET $2) t',p_table,k,CASE WHEN p_table='sales_order_images' THEN ',image_id' WHEN p_table='stocktake_rows' THEN ',variant_id' ELSE '' END) INTO result USING p_limit,COALESCE(NULLIF(p_after,'')::integer,0);
 RETURN jsonb_build_object('rows',result,'nextOffset',COALESCE(NULLIF(p_after,'')::integer,0)+jsonb_array_length(result));
END $$;
REVOKE ALL ON FUNCTION public.mc_v7_rows(text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_v7_rows(text,text,integer) TO authenticated;
CREATE FUNCTION public.mc_v7_changes(p_after bigint DEFAULT 0,p_limit integer DEFAULT 200) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb; BEGIN
 PERFORM private.mc_v7_role();
 IF p_after<0 OR p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'CLOUD_CURSOR_INVALID'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) INTO result FROM (SELECT * FROM public.cloud_sync_events WHERE sequence>p_after ORDER BY sequence LIMIT p_limit) t;
 RETURN jsonb_build_object('events',result);
END $$;
REVOKE ALL ON FUNCTION public.mc_v7_changes(bigint,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_v7_changes(bigint,integer) TO authenticated;

-- The narrowly privileged dispatcher requires membership and validates each action;
-- no caller-controlled relation names or SQL are executed.
CREATE FUNCTION private.mc_v7_catalog(p_request text,p_instance uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
  INSERT INTO public.product_variants(id,product_id,sku,size,status,cost_price,sale_price) VALUES((item->>'id')::bigint,(item->>'product_id')::bigint,item->>'sku',item->>'size',COALESCE(item->>'status','active'),(item->>'cost_price')::bigint,(item->>'sale_price')::bigint) ON CONFLICT(id) DO UPDATE SET status=excluded.status,cost_price=excluded.cost_price,sale_price=excluded.sale_price WHERE public.product_variants.product_id=excluded.product_id AND public.product_variants.sku=excluded.sku AND public.product_variants.size=excluded.size;
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
REVOKE ALL ON FUNCTION private.mc_v7_catalog(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.mc_v7_catalog(text,uuid,jsonb) TO authenticated;
CREATE FUNCTION public.mc_v7_catalog(p_request text,p_instance uuid,p_payload jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.mc_v7_catalog(p_request,p_instance,p_payload) $$;
REVOKE ALL ON FUNCTION public.mc_v7_catalog(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_v7_catalog(text,uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
