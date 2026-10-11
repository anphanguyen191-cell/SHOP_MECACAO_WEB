CREATE FUNCTION public.mc_v7_ledger(p_request text,p_instance uuid,p_rows jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role text; hash text; previous public.cloud_requests%ROWTYPE; row jsonb; saved jsonb; result jsonb;
BEGIN
 role:=private.mc_v7_role();IF role NOT IN ('owner','inventory') THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED'; END IF;
 IF p_request IS NULL OR length(p_request) NOT BETWEEN 8 AND 200 OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows)>100 THEN RAISE EXCEPTION 'CLOUD_INPUT_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mc-v7-write',0));
 IF (SELECT value FROM public.app_metadata WHERE key='cloud_instance') IS DISTINCT FROM p_instance::text THEN RAISE EXCEPTION 'CLOUD_WAREHOUSE_MISMATCH'; END IF;
 hash:=encode(sha256(convert_to(p_rows::text,'UTF8')),'hex');
 SELECT * INTO previous FROM public.cloud_requests WHERE request_key=p_request;
 IF FOUND THEN IF previous.actor_id<>auth.uid() OR previous.input_hash<>hash THEN RAISE EXCEPTION 'CLOUD_REQUEST_CONFLICT';END IF;RETURN previous.result;END IF;
 FOR row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF (row->>'id')::bigint IS NULL OR (row->>'id')::bigint<1 THEN RAISE EXCEPTION 'CLOUD_INPUT_INVALID'; END IF;
  SELECT jsonb_build_object('variant_id',variant_id,'transaction_type',transaction_type,'quantity',quantity,'unit_cost',unit_cost,'note',COALESCE(note,'')) INTO saved FROM public.inventory_transactions WHERE id=(row->>'id')::bigint;
  IF FOUND THEN
   IF saved IS DISTINCT FROM jsonb_build_object('variant_id',(row->>'variant_id')::bigint,'transaction_type',row->>'transaction_type','quantity',(row->>'quantity')::bigint,'unit_cost',(row->>'unit_cost')::bigint,'note',COALESCE(row->>'note','')) THEN RAISE EXCEPTION 'CLOUD_LEDGER_ID_CONFLICT';END IF;
  ELSE
   INSERT INTO public.inventory_transactions(id,variant_id,transaction_type,quantity,unit_cost,note,created_at) VALUES((row->>'id')::bigint,(row->>'variant_id')::bigint,row->>'transaction_type',(row->>'quantity')::bigint,(row->>'unit_cost')::bigint,COALESCE(row->>'note',''),COALESCE(row->>'created_at',to_char(timezone('UTC',now()),'YYYY-MM-DD HH24:MI:SS')));
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.inventory_stock WHERE stock<0 AND variant_id IN (SELECT (value->>'variant_id')::bigint FROM jsonb_array_elements(p_rows))) THEN RAISE EXCEPTION 'CLOUD_LEDGER_NEGATIVE'; END IF;
 result:=jsonb_build_object('registered',jsonb_array_length(p_rows));
 INSERT INTO public.cloud_requests(request_key,input_hash,actor_id,status,result) VALUES(p_request,hash,auth.uid(),'COMMITTED',result);
 INSERT INTO public.cloud_sync_events(request_key,entity_type,entity_id,version,payload) VALUES(p_request,'inventory.ledger',p_instance::text,1,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.mc_v7_ledger(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_v7_ledger(text,uuid,jsonb) TO authenticated;
