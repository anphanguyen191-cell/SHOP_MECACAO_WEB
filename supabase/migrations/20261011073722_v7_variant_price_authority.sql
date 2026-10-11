ALTER TABLE public.products ADD COLUMN cloud_revision bigint NOT NULL DEFAULT 1 CHECK(cloud_revision>0);
ALTER TABLE public.product_variants ADD COLUMN cloud_revision bigint NOT NULL DEFAULT 1 CHECK(cloud_revision>0);
-- Existing Cloud prices/status are authoritative. A stale laptop catalog retry
-- must not overwrite a mobile edit. New identities still import normally.
DO $fix$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('private.mc_v7_catalog(text,uuid,jsonb)'::regprocedure);
 definition:=replace(definition,'cost_price=excluded.cost_price,sale_price=excluded.sale_price','cost_price=public.products.cost_price,sale_price=public.products.sale_price');
 definition:=replace(definition,'description=excluded.description,status=excluded.status','description=excluded.description,status=public.products.status');
 definition:=replace(definition,'status=excluded.status,cost_price=public.products.cost_price,sale_price=public.products.sale_price','status=public.product_variants.status,cost_price=public.product_variants.cost_price,sale_price=public.product_variants.sale_price');
 EXECUTE definition;
END $fix$;
CREATE FUNCTION public.mc_v7_catalog_command(p_request text,p_action text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; hash text; previous public.cloud_requests%ROWTYPE; result jsonb;
BEGIN
 r:=private.mc_v7_role();IF r NOT IN ('owner','inventory') THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED'; END IF;
 IF p_request IS NULL OR length(p_request) NOT BETWEEN 16 AND 100 OR p_action IS NULL OR p_action NOT IN ('variant.price','product.status') OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'CLOUD_INPUT_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mc-v7-write',0));
 hash:=encode(sha256(convert_to(jsonb_build_object('action',p_action,'payload',p_payload)::text,'UTF8')),'hex');
 SELECT * INTO previous FROM public.cloud_requests WHERE request_key=p_request;
 IF FOUND THEN IF previous.actor_id<>auth.uid() OR previous.input_hash<>hash THEN RAISE EXCEPTION 'CLOUD_REQUEST_CONFLICT';END IF;RETURN previous.result;END IF;
 IF p_action='variant.price' THEN
  IF (p_payload->>'costPrice')::bigint IS NULL OR (p_payload->>'salePrice')::bigint IS NULL OR (p_payload->>'costPrice')::bigint NOT BETWEEN 0 AND 9007199254740991 OR (p_payload->>'salePrice')::bigint NOT BETWEEN 0 AND 9007199254740991 THEN RAISE EXCEPTION 'CLOUD_PRICE_INVALID'; END IF;
  UPDATE public.product_variants SET cost_price=(p_payload->>'costPrice')::bigint,sale_price=(p_payload->>'salePrice')::bigint,cloud_revision=cloud_revision+1,updated_at=to_char(timezone('UTC',now()),'YYYY-MM-DD HH24:MI:SS') WHERE id=(p_payload->>'id')::bigint AND cloud_revision=(p_payload->>'version')::bigint RETURNING to_jsonb(product_variants.*) INTO result;
 ELSE
  IF p_payload->>'status' IS NULL OR p_payload->>'status' NOT IN ('active','inactive') THEN RAISE EXCEPTION 'CLOUD_INPUT_INVALID'; END IF;
  UPDATE public.products SET status=p_payload->>'status',cloud_revision=cloud_revision+1,updated_at=to_char(timezone('UTC',now()),'YYYY-MM-DD HH24:MI:SS') WHERE id=(p_payload->>'id')::bigint AND cloud_revision=(p_payload->>'version')::bigint RETURNING to_jsonb(products.*) INTO result;
 END IF;
 IF result IS NULL THEN RAISE EXCEPTION 'CLOUD_VERSION_CONFLICT'; END IF;
 INSERT INTO public.cloud_requests(request_key,input_hash,actor_id,status,result) VALUES(p_request,hash,auth.uid(),'COMMITTED',result);
 INSERT INTO public.cloud_sync_events(request_key,entity_type,entity_id,version,payload) VALUES(p_request,p_action,p_payload->>'id',(result->>'cloud_revision')::bigint,jsonb_build_object('id',result->'id','version',result->'cloud_revision'));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.mc_v7_catalog_command(text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_v7_catalog_command(text,text,jsonb) TO authenticated;
