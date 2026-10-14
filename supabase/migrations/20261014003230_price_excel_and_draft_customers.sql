-- Additive V7.3 pricing workflow. No reset, business-row rewrite or historical-cost change.
ALTER TABLE public.product_variants ADD COLUMN cost_price_set boolean NOT NULL DEFAULT false;
ALTER TABLE public.product_variants ADD COLUMN sale_price_set boolean NOT NULL DEFAULT false;
CREATE TABLE private.price_imports(id text PRIMARY KEY,actor uuid NOT NULL,input_hash text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE private.price_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.price_imports FROM PUBLIC,anon,authenticated;
CREATE INDEX price_imports_created ON private.price_imports(created_at DESC);

CREATE FUNCTION private.mc_v7_price_snapshot() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rows jsonb; history jsonb; instance text; BEGIN
 IF private.mc_v7_role() NOT IN ('owner','inventory') THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED' USING ERRCODE='42501'; END IF;
 SELECT value INTO instance FROM public.app_metadata WHERE key='cloud_instance';
 IF instance IS NULL THEN RAISE EXCEPTION 'CLOUD_WAREHOUSE_MISMATCH'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb) INTO rows FROM (
  SELECT v.id,p.product_code AS "productCode",v.sku,p.name,v.size,count(i.id) AS stock,v.cost_price AS cost,v.sale_price AS sale,(v.cost_price>0 OR v.cost_price_set) AS "costSet",(v.sale_price>0 OR v.sale_price_set) AS "saleSet",v.cloud_revision AS version
  FROM public.product_variants v JOIN public.products p ON p.id=v.product_id
  JOIN public.product_images i ON i.variant_id=v.id JOIN public.cloud_image_assets a ON a.image_id=i.id AND a.ready AND a.source_present
  WHERE p.status='active' AND v.status='active' AND NOT EXISTS(SELECT 1 FROM public.sales_units u WHERE u.image_id=i.id)
  GROUP BY v.id,p.product_code,p.name ORDER BY v.id LIMIT 5001
 )t;
 IF jsonb_array_length(rows)>5000 THEN RAISE EXCEPTION 'CLOUD_PRICE_FILE_LIMIT'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) INTO history FROM (SELECT id,jsonb_build_object('costCount',result->'costCount','saleCount',result->'saleCount') AS result,created_at FROM private.price_imports ORDER BY created_at DESC,id LIMIT 20)t;
 RETURN jsonb_build_object('scope','CLOUD','instance',instance,'exportedAt',now(),'rows',rows,'history',history);
END $$;
REVOKE ALL ON FUNCTION private.mc_v7_price_snapshot() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.mc_v7_price_snapshot() TO authenticated;
CREATE FUNCTION public.mc_v7_price_snapshot() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.mc_v7_price_snapshot() $$;
REVOKE ALL ON FUNCTION public.mc_v7_price_snapshot() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_v7_price_snapshot() TO authenticated;
CREATE FUNCTION private.mc_v7_price_import_result(p_id text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; BEGIN
 IF private.mc_v7_role() NOT IN ('owner','inventory') THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED' USING ERRCODE='42501'; END IF;
 SELECT r.result INTO result FROM private.price_imports r WHERE r.id=p_id;
 IF result IS NULL THEN RAISE EXCEPTION 'CLOUD_PRICE_FILE_INVALID'; END IF;RETURN result;
END $$;
REVOKE ALL ON FUNCTION private.mc_v7_price_import_result(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.mc_v7_price_import_result(text) TO authenticated;
CREATE FUNCTION public.mc_v7_price_import_result(p_id text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.mc_v7_price_import_result(p_id) $$;
REVOKE ALL ON FUNCTION public.mc_v7_price_import_result(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_v7_price_import_result(text) TO authenticated;

CREATE FUNCTION private.mc_v7_prices(p_request text,p_action text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snap jsonb; lookup jsonb; row jsonb; current jsonb; rows jsonb:='[]'; result jsonb; hash text; field text; previous public.cloud_requests%ROWTYPE; seen bigint[]:='{}'; cost bigint; sale bigint; stale boolean; costs integer:=0; sales integer:=0; BEGIN
 IF private.mc_v7_role() NOT IN ('owner','inventory') THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED' USING ERRCODE='42501'; END IF;
 IF p_request IS NULL OR length(p_request) NOT BETWEEN 16 AND 100 OR p_action NOT IN ('prices.preview','prices.commit') OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>1500000 THEN RAISE EXCEPTION 'CLOUD_INPUT_INVALID'; END IF;
 IF jsonb_typeof(p_payload->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'rows') NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'CLOUD_PRICE_FILE_LIMIT'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mc-v7-write',0));
 hash:=encode(sha256(convert_to(jsonb_build_object('action',p_action,'payload',p_payload)::text,'UTF8')),'hex');
 SELECT * INTO previous FROM public.cloud_requests WHERE request_key=p_request;
 IF FOUND THEN IF previous.actor_id<>auth.uid() OR previous.input_hash<>hash THEN RAISE EXCEPTION 'CLOUD_REQUEST_CONFLICT'; END IF; RETURN previous.result; END IF;
 snap:=private.mc_v7_price_snapshot();
 SELECT jsonb_object_agg(value->>'id',value) INTO lookup FROM jsonb_array_elements(snap->'rows');
 IF p_payload->>'scope' IS DISTINCT FROM 'CLOUD' OR p_payload->>'instance' IS DISTINCT FROM snap->>'instance' THEN RAISE EXCEPTION 'CLOUD_WAREHOUSE_MISMATCH'; END IF;
 FOR row IN SELECT value FROM jsonb_array_elements(p_payload->'rows') LOOP
  IF row->>'id' IS NULL OR (row->>'id')!~'^[0-9]+$' OR (row->>'id')::bigint=ANY(seen) OR (row->>'version') IS NULL OR (row->>'version')!~'^[0-9]+$' OR (row->>'version')::bigint<1 THEN RAISE EXCEPTION 'CLOUD_PRICE_FILE_INVALID'; END IF;
  seen:=array_append(seen,(row->>'id')::bigint);
  current:=lookup->(row->>'id');
  IF current IS NULL OR current->>'sku' IS DISTINCT FROM row->>'sku' OR current->>'productCode' IS DISTINCT FROM row->>'productCode' OR current->>'size' IS DISTINCT FROM row->>'size' THEN RAISE EXCEPTION 'CLOUD_PRICE_FILE_IDENTITY'; END IF;
  FOR field IN SELECT value FROM unnest(ARRAY['cost','sale']) value LOOP
   IF row->>field IS NOT NULL AND ((row->>field)!~'^[0-9]+$' OR (row->>field)::numeric NOT BETWEEN 0 AND 9007199254740991) THEN RAISE EXCEPTION 'CLOUD_PRICE_INVALID'; END IF;
  END LOOP;
  stale:=current->>'version' IS DISTINCT FROM row->>'version';cost:=NULL;sale:=NULL;
  IF NOT stale AND NOT (current->>'costSet')::boolean THEN cost:=(row->>'cost')::bigint; END IF;
  IF NOT stale AND NOT (current->>'saleSet')::boolean THEN sale:=(row->>'sale')::bigint; END IF;
  IF cost IS NOT NULL THEN costs:=costs+1; END IF;IF sale IS NOT NULL THEN sales:=sales+1; END IF;
  rows:=rows||jsonb_build_array(current||jsonb_build_object('applyCost',cost,'applySale',sale,'status',CASE WHEN stale THEN 'Giá đã thay đổi — bỏ qua' WHEN cost IS NOT NULL OR sale IS NOT NULL THEN 'Sẽ bổ sung' ELSE 'Giữ giá hiện có / ô trống' END));
 END LOOP;
 result:=jsonb_build_object('rows',rows,'costCount',costs,'saleCount',sales);
 IF p_action='prices.commit' THEN
  FOR row IN SELECT value FROM jsonb_array_elements(rows) LOOP
   IF row->>'applyCost' IS NOT NULL OR row->>'applySale' IS NOT NULL THEN
    UPDATE public.product_variants SET cost_price=COALESCE((row->>'applyCost')::bigint,cost_price),sale_price=COALESCE((row->>'applySale')::bigint,sale_price),cost_price_set=cost_price_set OR row->>'applyCost' IS NOT NULL,sale_price_set=sale_price_set OR row->>'applySale' IS NOT NULL,cloud_revision=cloud_revision+1,updated_at=to_char(timezone('UTC',now()),'YYYY-MM-DD HH24:MI:SS') WHERE id=(row->>'id')::bigint;
   END IF;
  END LOOP;
  hash:=encode(sha256(convert_to(jsonb_build_object('action',p_action,'payload',p_payload)::text,'UTF8')),'hex');
  INSERT INTO public.cloud_requests(request_key,input_hash,actor_id,status,result) VALUES(p_request,hash,auth.uid(),'COMMITTED',result);
  INSERT INTO private.price_imports(id,actor,input_hash,result) VALUES(p_request,auth.uid(),hash,result);
  INSERT INTO public.cloud_sync_events(request_key,entity_type,entity_id,version,payload) VALUES(p_request,'variant.price',snap->>'instance',1,jsonb_build_object('costCount',costs,'saleCount',sales));
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION private.mc_v7_prices(text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.mc_v7_prices(text,text,jsonb) TO authenticated;
CREATE FUNCTION public.mc_v7_prices(p_request text,p_action text,p_payload jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.mc_v7_prices(p_request,p_action,p_payload) $$;
REVOKE ALL ON FUNCTION public.mc_v7_prices(text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_v7_prices(text,text,jsonb) TO authenticated;

CREATE FUNCTION private.mc_v7_draft_customer(contact jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE name text; phone text; key text; id text; BEGIN
 IF private.mc_v7_role() NOT IN ('owner','cashier') THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED' USING ERRCODE='42501'; END IF;
 IF COALESCE((contact->>'saveCustomer')::boolean,false)=false OR NULLIF(contact->>'customerId','') IS NOT NULL THEN RETURN contact; END IF;
 name:=trim(COALESCE(contact->>'recipientName',''));phone:=trim(COALESCE(contact->>'phone',''));
 IF name='' THEN RETURN contact; END IF;
 IF length(name)>100 OR length(phone)>30 OR length(COALESCE(contact->>'address',''))>500 OR (phone<>'' AND phone !~'^[+0-9().[:space:]-]{5,30}$') THEN RAISE EXCEPTION 'CLOUD_CUSTOMER_INVALID'; END IF;
 IF phone='' AND COALESCE((contact->>'confirmNoPhone')::boolean,false)=false THEN RAISE EXCEPTION 'CLOUD_CUSTOMER_NO_PHONE'; END IF;
 key:=regexp_replace(phone,'[^0-9]','','g');IF left(key,2)='84' THEN key:='0'||substr(key,3); END IF;
 IF key<>'' AND EXISTS(SELECT 1 FROM public.shop_customers WHERE phone_key=key) AND COALESCE((contact->>'allowDuplicateCustomer')::boolean,false)=false THEN RAISE EXCEPTION 'CLOUD_CUSTOMER_DUPLICATE'; END IF;
 id:=gen_random_uuid()::text;
 INSERT INTO public.shop_customers(id,name,phone,phone_key,address,note) VALUES(id,name,phone,key,COALESCE(contact->>'address',''),'');
 RETURN contact||jsonb_build_object('customerId',id);
END $$;
REVOKE ALL ON FUNCTION private.mc_v7_draft_customer(jsonb) FROM PUBLIC,anon,authenticated;

DO $fix$ DECLARE d text; old text; BEGIN
 d:=pg_get_functiondef('private.mc_v7_catalog_command(text,text,jsonb)'::regprocedure);
 old:='SET cost_price=(p_payload->>''costPrice'')::bigint,sale_price=(p_payload->>''salePrice'')::bigint,cloud_revision=';
 IF strpos(d,old)=0 THEN RAISE EXCEPTION 'Catalog price patch target missing'; END IF;
 d:=replace(d,old,'SET cost_price=(p_payload->>''costPrice'')::bigint,sale_price=(p_payload->>''salePrice'')::bigint,cost_price_set=true,sale_price_set=true,cloud_revision=');EXECUTE d;
 d:=pg_get_functiondef('private.mc_v7_catalog(text,uuid,jsonb)'::regprocedure);
 old:='public.product_variants(id,product_id,sku,size,status,cost_price,sale_price) VALUES';
 IF strpos(d,old)=0 THEN RAISE EXCEPTION 'Catalog creation patch target missing'; END IF;
 d:=replace(d,old,'public.product_variants(id,product_id,sku,size,status,cost_price,sale_price,cost_price_set,sale_price_set) VALUES');
 d:=replace(d,'(item->>''sale_price'')::bigint) ON CONFLICT(id)','(item->>''sale_price'')::bigint,COALESCE((item->>''cost_price_set'')::boolean,false),COALESCE((item->>''sale_price_set'')::boolean,false)) ON CONFLICT(id)');EXECUTE d;
 d:=pg_get_functiondef('private.mc_v7_command(text,text,jsonb)'::regprocedure);
 IF strpos(d,'CASE WHEN v.cost_price>0 THEN v.cost_price ELSE NULL END')=0 THEN RAISE EXCEPTION 'Sale cost snapshot patch target missing'; END IF;
 d:=replace(d,'CASE WHEN v.cost_price>0 THEN v.cost_price ELSE NULL END','CASE WHEN v.cost_price>0 OR v.cost_price_set THEN v.cost_price ELSE NULL END');
 old:='   INSERT INTO public.order_contacts';
 IF strpos(d,old)=0 THEN RAISE EXCEPTION 'Draft contact patch target missing'; END IF;
 d:=replace(d,old,'   contact:=private.mc_v7_draft_customer(contact);'||chr(10)||old);EXECUTE d;
END $fix$;
