CREATE FUNCTION private.mc_v7_stock_snapshot() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t."variantId"),'[]') FROM (
 SELECT v.id "variantId",v.sku,v.size,p.name "productName",p.product_code "productCode",v.status "variantStatus",p.status "productStatus",COALESCE(s.stock,0) ledger,
 (SELECT count(*) FROM public.product_images i JOIN public.cloud_image_assets a ON a.image_id=i.id AND a.ready WHERE i.variant_id=v.id AND NOT EXISTS(SELECT 1 FROM public.sales_units u WHERE u.image_id=i.id)) physical,
 (SELECT count(*) FROM public.product_images i WHERE i.variant_id=v.id AND NOT EXISTS(SELECT 1 FROM public.sales_units u WHERE u.image_id=i.id) AND NOT EXISTS(SELECT 1 FROM public.cloud_image_assets a WHERE a.image_id=i.id AND a.ready)) missing,
 (SELECT count(*) FROM public.sales_units u WHERE u.variant_id=v.id) retired,
 (SELECT COALESCE(jsonb_agg(jsonb_build_array(i.id,a.sha256) ORDER BY i.id),'[]') FROM public.product_images i JOIN public.cloud_image_assets a ON a.image_id=i.id AND a.ready WHERE i.variant_id=v.id AND NOT EXISTS(SELECT 1 FROM public.sales_units u WHERE u.image_id=i.id)) evidence
 FROM public.product_variants v JOIN public.products p ON p.id=v.product_id LEFT JOIN public.inventory_stock s ON s.variant_id=v.id) t;
$$;
REVOKE ALL ON FUNCTION private.mc_v7_stock_snapshot() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.mc_v7_stock_snapshot() TO authenticated;
CREATE FUNCTION public.mc_v7_stocktake(p_request text,p_action text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE r text; inputhash text; previous public.cloud_requests%ROWTYPE; id text; s public.stocktake_sessions%ROWTYPE; snap jsonb; fingerprint text; item jsonb; result jsonb; title text; conclusion text; finishstatus text;
BEGIN
 r:=private.mc_v7_role();IF r NOT IN ('owner','inventory') THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED'; END IF;
 IF p_action NOT IN ('stocktake.create','stocktake.row','stocktake.finish') OR length(p_request) NOT BETWEEN 16 AND 100 OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'CLOUD_INPUT_INVALID'; END IF;
 inputhash:=encode(sha256(convert_to(jsonb_build_object('action',p_action,'payload',p_payload)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('mc-v7-write',0));
 SELECT * INTO previous FROM public.cloud_requests WHERE request_key=p_request;
 IF FOUND THEN IF previous.actor_id<>auth.uid() OR previous.input_hash<>inputhash THEN RAISE EXCEPTION 'CLOUD_REQUEST_CONFLICT'; END IF;RETURN previous.result; END IF;
 id:=COALESCE(NULLIF(p_payload->>'id',''),gen_random_uuid()::text);IF length(id)>100 THEN RAISE EXCEPTION 'CLOUD_INPUT_INVALID'; END IF;
 IF p_action='stocktake.create' THEN
  title:=trim(COALESCE(p_payload->>'title',''));IF length(title) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'CLOUD_INPUT_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM public.stocktake_sessions WHERE status='OPEN') THEN RAISE EXCEPTION 'CLOUD_STOCKTAKE_OPEN'; END IF;
  snap:=private.mc_v7_stock_snapshot();IF jsonb_array_length(snap)=0 THEN RAISE EXCEPTION 'CLOUD_STOCK_EMPTY'; END IF;
  fingerprint:=encode(sha256(convert_to(snap::text,'UTF8')),'hex');
  INSERT INTO public.stocktake_sessions(id,request_key,input_hash,title,status,version,fingerprint,snapshot_hash) VALUES(id,p_request,encode(sha256(convert_to(title,'UTF8')),'hex'),title,'OPEN',1,fingerprint,fingerprint);
  FOR item IN SELECT value FROM jsonb_array_elements(snap) LOOP INSERT INTO public.stocktake_rows(session_id,variant_id,snapshot) VALUES(id,(item->>'variantId')::bigint,item::text); END LOOP;
 ELSE
  SELECT * INTO s FROM public.stocktake_sessions WHERE stocktake_sessions.id=id FOR UPDATE;
  IF NOT FOUND OR s.status<>'OPEN' OR s.version IS DISTINCT FROM (p_payload->>'version')::bigint THEN RAISE EXCEPTION 'CLOUD_VERSION_CONFLICT'; END IF;
  IF p_action='stocktake.row' THEN
   IF (p_payload->>'counted')::bigint IS NULL OR (p_payload->>'counted')::bigint NOT BETWEEN 0 AND 1000000 OR length(COALESCE(p_payload->>'note',''))>500 THEN RAISE EXCEPTION 'CLOUD_INPUT_INVALID'; END IF;
   UPDATE public.stocktake_rows SET counted=(p_payload->>'counted')::bigint,note=COALESCE(p_payload->>'note','') WHERE session_id=id AND variant_id=(p_payload->>'variantId')::bigint;
   IF NOT FOUND THEN RAISE EXCEPTION 'CLOUD_STOCKTAKE_ROW_MISSING'; END IF;
   UPDATE public.stocktake_sessions SET version=stocktake_sessions.version+1 WHERE stocktake_sessions.id=id;
  ELSE
   conclusion:=trim(COALESCE(p_payload->>'conclusion',''));IF length(conclusion) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'CLOUD_INPUT_INVALID'; END IF;
   finishstatus:=CASE WHEN COALESCE((p_payload->>'cancel')::boolean,false) THEN 'CANCELLED' ELSE 'CLOSED' END;
   IF finishstatus='CLOSED' THEN
    IF COALESCE((p_payload->>'confirmed')::boolean,false)=false OR EXISTS(SELECT 1 FROM public.stocktake_rows WHERE session_id=id AND (counted IS NULL OR (counted<>(snapshot::jsonb->>'physical')::bigint AND length(trim(note))=0))) THEN RAISE EXCEPTION 'CLOUD_STOCKTAKE_INCOMPLETE'; END IF;
    IF encode(sha256(convert_to(private.mc_v7_stock_snapshot()::text,'UTF8')),'hex')<>s.fingerprint THEN RAISE EXCEPTION 'CLOUD_STOCKTAKE_CHANGED'; END IF;
   END IF;
   UPDATE public.stocktake_sessions SET status=finishstatus,version=stocktake_sessions.version+1,conclusion=conclusion,closed_at=to_char(timezone('UTC',now()),'YYYY-MM-DD HH24:MI:SS') WHERE stocktake_sessions.id=id;
  END IF;
 END IF;
 SELECT to_jsonb(t) INTO result FROM public.stocktake_sessions t WHERE t.id=id;
 INSERT INTO public.cloud_requests(request_key,input_hash,actor_id,status,result) VALUES(p_request,inputhash,auth.uid(),'COMMITTED',result);
 INSERT INTO public.cloud_sync_events(request_key,entity_type,entity_id,version,payload) VALUES(p_request,p_action,id,(result->>'version')::bigint,jsonb_build_object('id',id,'version',result->'version'));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.mc_v7_stocktake(text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_v7_stocktake(text,text,jsonb) TO authenticated;
