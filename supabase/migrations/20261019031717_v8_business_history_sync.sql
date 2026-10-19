-- Owner-only bootstrap of existing LOCAL history before the shared Cloud workspace opens.
-- Every row keeps its identity. SOLD and financial evidence remain immutable.
CREATE FUNCTION private.mc_v8_business_import(p_instance uuid,p_request text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tables text[]:=ARRAY['shop_customers','product_images','sales_orders','sales_order_images','order_contacts','sales_operations','sales_confirmations','sales_units','sales_ledger','order_finance','finance_entries','aftercare_cases','stocktake_sessions','stocktake_rows'];
 tab text; item jsonb; existing jsonb; key_cols text[]; predicate text; columns text; values_sql text; updates text;
 hash text; previous public.cloud_requests%ROWTYPE; counts jsonb:='{}'; answer jsonb; total_rows integer:=0; final_sessions jsonb:='[]'; seen jsonb; identity_key text;
BEGIN
 IF private.mc_v7_role()<>'owner' THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED' USING errcode='42501'; END IF;
 IF p_instance IS NULL OR p_request IS NULL OR length(p_request) NOT BETWEEN 16 AND 200
 OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>16000000
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE NOT k=ANY(tables)) THEN RAISE EXCEPTION 'CLOUD_BUSINESS_INPUT_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mc-v7-write',0));
 IF (SELECT value FROM public.app_metadata WHERE key='cloud_instance') IS DISTINCT FROM p_instance::text THEN RAISE EXCEPTION 'CLOUD_WAREHOUSE_MISMATCH'; END IF;
 hash:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 SELECT * INTO previous FROM public.cloud_requests WHERE request_key=p_request;
 IF FOUND THEN
  IF previous.actor_id<>auth.uid() OR previous.input_hash<>hash THEN RAISE EXCEPTION 'CLOUD_REQUEST_CONFLICT'; END IF;
  RETURN previous.result;
 END IF;
 IF (SELECT value FROM public.app_metadata WHERE key='cloud_status')='CLOUD_TEST_READY' THEN RAISE EXCEPTION 'CLOUD_BUSINESS_ALREADY_ACTIVE'; END IF;
 IF EXISTS(SELECT 1 FROM public.cloud_sync_events WHERE entity_type IN ('customer.save','draft.save','draft.cancel','sale.confirm','finance.configure','finance.entry','aftercare.create','aftercare.resolve','stocktake.create','stocktake.save','stocktake.finish')) THEN RAISE EXCEPTION 'CLOUD_BUSINESS_EXISTING_HISTORY'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.app_metadata WHERE key='cloud_business_source') AND (EXISTS(SELECT 1 FROM public.shop_customers) OR EXISTS(SELECT 1 FROM public.sales_orders) OR EXISTS(SELECT 1 FROM public.finance_entries)) THEN RAISE EXCEPTION 'CLOUD_BUSINESS_EXISTING_HISTORY'; END IF;
 -- No Cloud business command can run before activation. Repeat imports may update
 -- a LOCAL draft that changed during an earlier upload, but never SOLD evidence.
 FOR tab IN SELECT unnest(tables) LOOP
  IF jsonb_typeof(p_payload->tab) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'CLOUD_BUSINESS_INPUT_INVALID'; END IF;
  total_rows:=total_rows+jsonb_array_length(p_payload->tab);
  counts:=counts||jsonb_build_object(tab,jsonb_array_length(p_payload->tab));
 END LOOP;
 IF total_rows>50000 THEN RAISE EXCEPTION 'CLOUD_BUSINESS_LIMIT'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'sales_operations') r WHERE r->>'status'<>'SOLD') THEN RAISE EXCEPTION 'CLOUD_BUSINESS_PENDING_SALE'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'sales_confirmations') c
 WHERE (c->>'subtotal')::bigint IS DISTINCT FROM (SELECT sum((i->>'unit_price')::bigint) FROM jsonb_array_elements(p_payload->'sales_order_images') i WHERE i->>'order_id'=c->>'order_id')
 OR (SELECT count(*) FROM jsonb_array_elements(p_payload->'sales_order_images') i WHERE i->>'order_id'=c->>'order_id')<>(SELECT count(*) FROM jsonb_array_elements(p_payload->'sales_units') u WHERE u->>'order_id'=c->>'order_id')
 OR (SELECT count(*) FROM jsonb_array_elements(p_payload->'sales_units') u WHERE u->>'order_id'=c->>'order_id')<>(SELECT count(*) FROM jsonb_array_elements(p_payload->'sales_ledger') l WHERE l->>'order_id'=c->>'order_id')
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'sales_operations') o WHERE o->>'id'=c->>'operation_id')) THEN RAISE EXCEPTION 'CLOUD_BUSINESS_SALE_MISMATCH'; END IF;
 -- Remove only obsolete DRAFT membership; imported SOLD rows are never rewritten.
 DELETE FROM public.sales_order_images i WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'sales_orders') o WHERE o->>'id'=i.order_id)
 AND NOT EXISTS(SELECT 1 FROM public.sales_confirmations c WHERE c.order_id=i.order_id)
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'sales_order_images') n WHERE n->>'order_id'=i.order_id AND (n->>'image_id')::bigint=i.image_id);
 FOR tab IN SELECT unnest(tables) LOOP
  seen:='{}';
  key_cols:=CASE WHEN tab='sales_order_images' THEN ARRAY['order_id','image_id'] WHEN tab='stocktake_rows' THEN ARRAY['session_id','variant_id'] WHEN tab IN ('sales_units','sales_ledger') THEN ARRAY['image_id'] WHEN tab IN ('order_contacts','sales_confirmations','order_finance') THEN ARRAY['order_id'] ELSE ARRAY['id'] END;
  SELECT string_agg(format('t.%I = (jsonb_populate_record(null::public.%I,$1)).%I',k,tab,k),' AND ') INTO predicate FROM unnest(key_cols) k;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->tab) LOOP
   IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM unnest(key_cols) k WHERE item->>k IS NULL) THEN RAISE EXCEPTION 'CLOUD_BUSINESS_INPUT_INVALID'; END IF;
   SELECT jsonb_agg(item->k ORDER BY k)::text INTO identity_key FROM unnest(key_cols) k;
   IF seen ? identity_key THEN RAISE EXCEPTION 'CLOUD_BUSINESS_DUPLICATE'; END IF;
   seen:=seen||jsonb_build_object(identity_key,true);
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=('public.'||tab)::regclass AND a.attname=k AND a.attnum>0 AND NOT a.attisdropped)) THEN RAISE EXCEPTION 'CLOUD_BUSINESS_SCHEMA'; END IF;
   IF tab='product_images' AND item->>'file_path' IS DISTINCT FROM ('v7/'||p_instance||'/'||(item->>'id')||'.jpg') THEN RAISE EXCEPTION 'CLOUD_BUSINESS_PATH'; END IF;
   EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE %s',tab,predicate) INTO existing USING item;
   -- Compare the supplied columns only; Cloud may carry additional metadata.
   IF existing IS NOT NULL AND existing @> item THEN CONTINUE; END IF;
   IF tab='stocktake_sessions' AND existing IS NULL AND item->>'status'<>'OPEN' THEN
    final_sessions:=final_sessions||jsonb_build_array(item);
    item:=item||jsonb_build_object('status','OPEN','version',(item->>'version')::bigint-1,'closed_at',null,'conclusion','');
   END IF;
   SELECT string_agg(format('%I',k),',' ORDER BY k),string_agg(format('r.%I',k),',' ORDER BY k),string_agg(format('%I=r.%I',k,k),',' ORDER BY k)
   INTO columns,values_sql,updates FROM jsonb_object_keys(item) k;
   IF existing IS NULL THEN
    -- Imported LOCAL SOLD evidence has already been archived. The same transaction
    -- excludes these images from every inventory reader before it becomes visible.
    IF tab='sales_units' THEN UPDATE public.cloud_image_assets SET source_present=true WHERE image_id=(item->>'image_id')::bigint; END IF;
    EXECUTE format('INSERT INTO public.%I(%s) SELECT %s FROM jsonb_populate_record(null::public.%I,$1) r',tab,columns,values_sql,tab) USING item;
   ELSIF tab IN ('shop_customers','sales_orders','sales_order_images','order_contacts','order_finance') THEN
    EXECUTE format('UPDATE public.%I t SET %s FROM jsonb_populate_record(null::public.%I,$1) r WHERE %s',tab,updates,tab,predicate) USING item;
   ELSIF tab='product_images' AND existing->'product_id'=item->'product_id' AND existing->'variant_id'=item->'variant_id' AND existing->'file_path'=item->'file_path' THEN
    CONTINUE;
   ELSE RAISE EXCEPTION 'CLOUD_BUSINESS_EVIDENCE_CONFLICT: %',tab;
   END IF;
  END LOOP;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(final_sessions) LOOP
  UPDATE public.stocktake_sessions SET status=item->>'status',version=(item->>'version')::bigint,closed_at=item->>'closed_at',conclusion=item->>'conclusion' WHERE id=item->>'id';
 END LOOP;
 -- Reject incomplete/altered SALE snapshots as a whole; no partial customer/order commit.
 IF EXISTS(SELECT 1 FROM public.sales_confirmations c WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'sales_confirmations') x WHERE x->>'order_id'=c.order_id)
 AND (c.subtotal IS DISTINCT FROM (SELECT sum(i.unit_price) FROM public.sales_order_images i WHERE i.order_id=c.order_id)
 OR (SELECT count(*) FROM public.sales_order_images i WHERE i.order_id=c.order_id)<>(SELECT count(*) FROM public.sales_units u WHERE u.order_id=c.order_id)
 OR (SELECT count(*) FROM public.sales_units u WHERE u.order_id=c.order_id)<>(SELECT count(*) FROM public.sales_ledger l WHERE l.order_id=c.order_id))) THEN RAISE EXCEPTION 'CLOUD_BUSINESS_SALE_MISMATCH'; END IF;
 UPDATE public.cloud_image_assets a SET source_present=false,source_checked_at=now() WHERE EXISTS(SELECT 1 FROM public.sales_units u WHERE u.image_id=a.image_id);
 INSERT INTO public.app_metadata(key,value) VALUES('cloud_business_source',p_instance::text) ON CONFLICT(key) DO UPDATE SET value=excluded.value;
 answer:=jsonb_build_object('instance',p_instance,'counts',counts);
 INSERT INTO public.cloud_requests(request_key,input_hash,actor_id,status,result) VALUES(p_request,hash,auth.uid(),'COMMITTED',answer);
 INSERT INTO public.cloud_sync_events(request_key,entity_type,entity_id,version,payload) VALUES(p_request,'business.import',p_instance::text,1,answer);
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION private.mc_v8_business_import(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.mc_v8_business_import(uuid,text,jsonb) TO authenticated;
CREATE FUNCTION public.mc_v8_business_import(p_instance uuid,p_request text,p_payload jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.mc_v8_business_import(p_instance,p_request,p_payload) $$;
REVOKE ALL ON FUNCTION public.mc_v8_business_import(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_v8_business_import(uuid,text,jsonb) TO authenticated;

-- Prevent a second business history while the LOCAL history is being handed off.
CREATE OR REPLACE FUNCTION public.mc_v7_command(p_request text,p_action text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 PERFORM private.mc_v7_role();
 IF (SELECT value FROM public.app_metadata WHERE key='cloud_status') IS DISTINCT FROM 'CLOUD_TEST_READY' THEN RAISE EXCEPTION 'CLOUD_BUSINESS_NOT_READY'; END IF;
 RETURN private.mc_v7_command(p_request,p_action,p_payload);
END $$;
REVOKE ALL ON FUNCTION public.mc_v7_command(text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_v7_command(text,text,jsonb) TO authenticated;

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') AND NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='sales_units') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_units;
 END IF;
END $$;
