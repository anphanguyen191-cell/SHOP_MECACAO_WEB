-- A mobile request is durable intent, never evidence that stock has been sold.
CREATE INDEX IF NOT EXISTS order_contacts_customer_history ON public.order_contacts(customer_id,order_id) WHERE customer_id IS NOT NULL;
CREATE TABLE private.mc_local_sales(
 request_key text PRIMARY KEY CHECK(length(request_key) BETWEEN 16 AND 100),
 input_hash text NOT NULL, order_id text NOT NULL REFERENCES public.sales_orders(id),
 instance text NOT NULL, actor_id uuid NOT NULL REFERENCES auth.users(id),
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','CONFIRMED','REJECTED')),
 snapshot jsonb NOT NULL, action text NOT NULL DEFAULT 'sale.confirm', payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 result jsonb, error text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
ALTER TABLE private.mc_local_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY mc_local_sales_no_direct_access ON private.mc_local_sales FOR ALL TO authenticated USING(false) WITH CHECK(false);
REVOKE ALL ON private.mc_local_sales FROM PUBLIC,anon,authenticated;
CREATE UNIQUE INDEX mc_local_sales_pending_order ON private.mc_local_sales(order_id) WHERE state='PENDING';
CREATE INDEX mc_local_sales_order ON private.mc_local_sales(order_id,created_at DESC);
CREATE INDEX mc_local_sales_actor ON private.mc_local_sales(actor_id);
CREATE INDEX mc_local_sales_worker ON private.mc_local_sales(created_at,request_key) WHERE state='PENDING';
CREATE INDEX mc_local_sales_status ON private.mc_local_sales((state='PENDING') DESC,created_at DESC,request_key);

CREATE FUNCTION private.mc_local_sale_snapshot(p_id text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object(
  'instance',(SELECT value FROM public.app_metadata WHERE key='cloud_instance'),
  'order',(SELECT to_jsonb(o) FROM public.sales_orders o WHERE id=p_id),
  'items',COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY position) FROM public.sales_order_images i WHERE order_id=p_id),'[]'::jsonb),
  'contact',(SELECT to_jsonb(c) FROM public.order_contacts c WHERE order_id=p_id),
  'customer',(SELECT to_jsonb(c) FROM public.shop_customers c JOIN public.order_contacts x ON x.customer_id=c.id WHERE x.order_id=p_id),
  'assets',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.image_id) FROM public.cloud_image_assets a JOIN public.sales_order_images i ON i.image_id=a.image_id WHERE i.order_id=p_id),'[]'::jsonb),
  'order_finance',COALESCE((SELECT jsonb_agg(to_jsonb(f)) FROM public.order_finance f WHERE order_id=p_id),'[]'::jsonb),
  'finance_entries',COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY sequence) FROM public.finance_entries f WHERE order_id=p_id),'[]'::jsonb),
  'aftercare_cases',COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY id) FROM public.aftercare_cases f WHERE order_id=p_id),'[]'::jsonb)
 )
$$;
REVOKE ALL ON FUNCTION private.mc_local_sale_snapshot(text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.mc_v8_local_sales(p_action text,p_key text,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; inst text; o public.sales_orders; q private.mc_local_sales; h text; s jsonb; answer jsonb; action text;
BEGIN
 r:=private.mc_v7_role();
 IF r NOT IN ('owner','cashier') THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mc-v7-write',0));
 SELECT value INTO inst FROM public.app_metadata WHERE key='cloud_instance';
 IF inst IS NULL OR (SELECT value FROM public.app_metadata WHERE key='cloud_status') IS DISTINCT FROM 'CLOUD_TEST_READY' THEN RAISE EXCEPTION 'CLOUD_BUSINESS_NOT_READY'; END IF;
 IF p_action='enable' THEN
  IF r<>'owner' OR p_payload->>'instance' IS DISTINCT FROM inst THEN RAISE EXCEPTION 'CLOUD_WAREHOUSE_MISMATCH'; END IF;
  INSERT INTO public.app_metadata(key,value) VALUES('cloud_local_final',inst) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE app_metadata.value IS DISTINCT FROM excluded.value;
  RETURN jsonb_build_object('enabled',true,'instance',inst);
 END IF;
 IF p_action='list' THEN
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY created_at DESC,request_key) FROM
   (SELECT request_key,order_id,mc_local_sales.action,CASE WHEN state='REJECTED' AND mc_local_sales.action='draft.save' THEN payload ELSE '{}'::jsonb END payload,state,error,created_at,completed_at FROM private.mc_local_sales ORDER BY (state='PENDING') DESC,created_at DESC,request_key LIMIT 200) t),'[]'::jsonb);
 END IF;
 IF (SELECT value FROM public.app_metadata WHERE key='cloud_local_final') IS DISTINCT FROM inst THEN RAISE EXCEPTION 'CLOUD_LOCAL_FINAL_UPDATE_REQUIRED'; END IF;
 IF p_action='request' THEN
  IF p_key IS NULL OR p_key !~ '^[A-Za-z0-9_-]{16,100}$' OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>32768 THEN RAISE EXCEPTION 'CLOUD_INPUT_INVALID'; END IF;
  h:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
  action:=COALESCE(p_payload->>'action','sale.confirm');
  IF action NOT IN ('sale.confirm','draft.save','draft.cancel','finance.configure','finance.entry','aftercare.create','aftercare.resolve') THEN RAISE EXCEPTION 'CLOUD_ACTION_INVALID'; END IF;
  SELECT * INTO q FROM private.mc_local_sales WHERE request_key=p_key;
  IF FOUND THEN
   IF q.input_hash<>h OR q.actor_id<>auth.uid() THEN RAISE EXCEPTION 'CLOUD_REQUEST_CONFLICT'; END IF;
   RETURN jsonb_build_object('queued',true,'requestKey',q.request_key,'state',q.state);
  END IF;
  SELECT * INTO o FROM public.sales_orders WHERE id=p_payload->>'id';
  IF NOT FOUND OR o.status<>'DRAFT' THEN RAISE EXCEPTION 'CLOUD_ORDER_NOT_DRAFT'; END IF;
  IF o.version IS DISTINCT FROM (p_payload->>CASE WHEN action IN ('sale.confirm','draft.save','draft.cancel') THEN 'version' ELSE 'orderVersion' END)::bigint THEN RAISE EXCEPTION 'CLOUD_VERSION_CONFLICT'; END IF;
  IF action='sale.confirm' THEN
  IF EXISTS(SELECT 1 FROM public.sales_confirmations WHERE order_id=o.id) THEN RAISE EXCEPTION 'CLOUD_ORDER_NOT_DRAFT'; END IF;
  IF p_payload->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'CLOUD_CONFIRM_REQUIRED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.sales_order_images WHERE order_id=o.id) OR
   (SELECT count(*) FROM public.sales_order_images WHERE order_id=o.id)>100 OR
   EXISTS(SELECT 1 FROM public.sales_order_images i LEFT JOIN public.cloud_image_assets a ON a.image_id=i.image_id WHERE i.order_id=o.id AND
    (a.image_id IS NULL OR NOT a.ready OR NOT a.source_present OR EXISTS(SELECT 1 FROM public.sales_units u WHERE u.image_id=i.image_id))) THEN RAISE EXCEPTION 'CLOUD_STOCK_UNAVAILABLE'; END IF;
  IF EXISTS(SELECT 1 FROM public.sales_order_images WHERE order_id=o.id AND unit_price=0) AND p_payload->'acknowledgeZeroPrice' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'CLOUD_ZERO_PRICE_ACK_REQUIRED'; END IF;
  ELSIF action IN ('draft.save','draft.cancel') THEN
   IF EXISTS(SELECT 1 FROM public.sales_confirmations WHERE order_id=o.id) THEN RAISE EXCEPTION 'CLOUD_ORDER_NOT_DRAFT'; END IF;
   IF action='draft.save' AND (jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 100) THEN RAISE EXCEPTION 'CLOUD_INPUT_INVALID'; END IF;
  ELSE
   IF COALESCE((SELECT version FROM public.order_finance WHERE order_id=o.id),0) IS DISTINCT FROM (p_payload->>'version')::bigint THEN RAISE EXCEPTION 'CLOUD_VERSION_CONFLICT'; END IF;
  END IF;
  s:=private.mc_local_sale_snapshot(o.id);
  IF EXISTS(SELECT 1 FROM private.mc_local_sales WHERE order_id=o.id AND state='PENDING') THEN RAISE EXCEPTION 'CLOUD_LOCAL_SALE_PENDING'; END IF;
  s:=s||jsonb_build_object('confirmation',(SELECT to_jsonb(c) FROM public.sales_confirmations c WHERE order_id=o.id));
  IF action='draft.save' THEN
   s:=s||jsonb_build_object('requestItems',COALESCE((SELECT jsonb_agg(jsonb_build_object('image_id',i.id,'product_id',i.product_id,'variant_id',i.variant_id,'product_name',p.name,'product_code',p.product_code,'size',v.size,'sku',v.sku,'unit_price',(x->>'unitPrice')::bigint,'asset',to_jsonb(a))) FROM jsonb_array_elements(p_payload->'items') x JOIN public.product_images i ON i.id=(x->>'imageId')::bigint JOIN public.products p ON p.id=i.product_id JOIN public.product_variants v ON v.id=i.variant_id LEFT JOIN public.cloud_image_assets a ON a.image_id=i.id),'[]'::jsonb),'contactCustomer',(SELECT to_jsonb(c) FROM public.shop_customers c WHERE c.id=p_payload->'contact'->>'customerId'));
  END IF;
  INSERT INTO private.mc_local_sales(request_key,input_hash,order_id,instance,actor_id,snapshot,action,payload) VALUES(p_key,h,o.id,inst,auth.uid(),s,action,p_payload);
  answer:=jsonb_build_object('queued',true,'requestKey',p_key,'state','PENDING');
 ELSIF p_action='next' THEN
  IF r<>'owner' OR p_payload->>'instance' IS DISTINCT FROM inst THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED'; END IF;
  SELECT * INTO q FROM private.mc_local_sales WHERE state='PENDING' AND instance=inst ORDER BY created_at,request_key LIMIT 1;
  IF NOT FOUND THEN RETURN 'null'::jsonb; END IF;
  RETURN jsonb_build_object('requestKey',q.request_key,'snapshot',q.snapshot,'action',q.action,'payload',q.payload);
 ELSIF p_action IN ('finish','reject') THEN
  IF r<>'owner' OR p_payload->>'instance' IS DISTINCT FROM inst THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED'; END IF;
  SELECT * INTO q FROM private.mc_local_sales WHERE request_key=p_key;
  IF NOT FOUND OR q.instance<>inst THEN RAISE EXCEPTION 'CLOUD_REQUEST_NOT_FOUND'; END IF;
  IF q.state<>'PENDING' THEN RETURN jsonb_build_object('state',q.state); END IF;
  IF p_action='finish' THEN
   IF q.action='sale.confirm' THEN
    IF NOT EXISTS(SELECT 1 FROM public.sales_confirmations c WHERE c.order_id=q.order_id AND c.operation_id=p_payload->>'operationId' AND c.version=(q.snapshot->'order'->>'version')::bigint) THEN RAISE EXCEPTION 'CLOUD_LOCAL_PROOF_REQUIRED'; END IF;
   ELSIF q.action IN ('draft.save','draft.cancel') THEN
    IF NOT EXISTS(SELECT 1 FROM public.sales_orders current_order WHERE current_order.id=q.order_id AND current_order.version=(q.payload->>'version')::bigint+1 AND current_order.status=CASE WHEN q.action='draft.cancel' THEN 'CANCELLED_DRAFT' ELSE 'DRAFT' END) THEN RAISE EXCEPTION 'CLOUD_LOCAL_PROOF_REQUIRED'; END IF;
   ELSIF COALESCE((SELECT version FROM public.order_finance WHERE order_id=q.order_id),0)<(q.payload->>'version')::bigint+1 THEN RAISE EXCEPTION 'CLOUD_LOCAL_PROOF_REQUIRED';
   END IF;
   IF q.action='finance.entry' AND NOT EXISTS(SELECT 1 FROM public.finance_entries WHERE order_id=q.order_id AND request_key=p_payload->>'localRequest') THEN RAISE EXCEPTION 'CLOUD_LOCAL_PROOF_REQUIRED'; END IF;
   IF q.action='aftercare.create' AND NOT EXISTS(SELECT 1 FROM public.aftercare_cases WHERE order_id=q.order_id AND request_key=p_payload->>'localRequest') THEN RAISE EXCEPTION 'CLOUD_LOCAL_PROOF_REQUIRED'; END IF;
   UPDATE private.mc_local_sales SET state='CONFIRMED',completed_at=now(),result=p_payload WHERE request_key=p_key;
  ELSE
   IF q.action='sale.confirm' AND EXISTS(SELECT 1 FROM public.sales_confirmations WHERE order_id=q.order_id) THEN RAISE EXCEPTION 'CLOUD_LOCAL_PROOF_REQUIRED'; END IF;
   IF length(p_payload->>'error') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'CLOUD_INPUT_INVALID'; END IF;
   UPDATE private.mc_local_sales SET state='REJECTED',completed_at=now(),error=p_payload->>'error' WHERE request_key=p_key;
  END IF;
  answer:=jsonb_build_object('state',CASE WHEN p_action='finish' THEN 'CONFIRMED' ELSE 'REJECTED' END);
 ELSE RAISE EXCEPTION 'CLOUD_ACTION_INVALID';
 END IF;
 INSERT INTO public.cloud_sync_events(request_key,entity_type,entity_id,version,payload) VALUES('local-sale:'||p_key||':'||p_action,'local.sale',COALESCE(q.order_id,o.id),1,answer);
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION private.mc_v8_local_sales(text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.mc_v8_local_sales(text,text,jsonb) TO authenticated;
CREATE FUNCTION public.mc_v8_local_sales(p_action text,p_key text DEFAULT '',p_payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.mc_v8_local_sales(p_action,p_key,p_payload) $$;
REVOKE ALL ON FUNCTION public.mc_v8_local_sales(text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_v8_local_sales(text,text,jsonb) TO authenticated;

-- Preserve all installed validation and snapshot fixes, including migrations
-- which have amended this function body since the original V7 definition.
DO $install$
DECLARE source text; needle text:=' id:=COALESCE(NULLIF(p_payload->>''id'',''''),gen_random_uuid()::text);'; BEGIN
 SELECT pg_get_functiondef('private.mc_v7_command(text,text,jsonb)'::regprocedure) INTO source;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'LOCAL_FINAL_COMMAND_CONTRACT_CHANGED'; END IF;
 source:=replace(source,needle,needle||$guard$
 IF p_action IN ('sale.confirm','finance.configure','finance.entry','aftercare.create','aftercare.resolve') AND (SELECT value FROM public.app_metadata WHERE key='cloud_local_final')=(SELECT value FROM public.app_metadata WHERE key='cloud_instance') THEN RAISE EXCEPTION 'CLOUD_LOCAL_FINAL_REQUIRED'; END IF;
 IF p_action IN ('draft.cancel','draft.save') AND (p_action='draft.cancel' OR EXISTS(SELECT 1 FROM public.sales_orders so WHERE so.id=id)) AND (SELECT value FROM public.app_metadata WHERE key='cloud_local_final')=(SELECT value FROM public.app_metadata WHERE key='cloud_instance') THEN RAISE EXCEPTION 'CLOUD_LOCAL_FINAL_REQUIRED'; END IF;
 IF p_action IN ('draft.save','draft.cancel','finance.configure','finance.entry','aftercare.create','aftercare.resolve') AND EXISTS(SELECT 1 FROM private.mc_local_sales q WHERE q.order_id=p_payload->>'id' AND q.state='PENDING') THEN RAISE EXCEPTION 'CLOUD_LOCAL_SALE_PENDING'; END IF;
$guard$);
 EXECUTE source;
END $install$;

CREATE FUNCTION public.mc_v8_customer_history(p_id text,p_offset integer DEFAULT 0,p_limit integer DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE answer jsonb; summary jsonb; BEGIN
 IF private.mc_v7_role() NOT IN ('owner','cashier','viewer') THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED'; END IF;
 IF p_id IS NULL OR length(p_id)>100 OR p_offset IS NULL OR p_offset<0 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'CLOUD_INPUT_INVALID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.shop_customers WHERE id=p_id) THEN RAISE EXCEPTION 'CLOUD_CUSTOMER_MISSING'; END IF;
 SELECT jsonb_build_object('soldOrders',count(*),'receipts',COALESCE(sum((f->>'receipts')::bigint),0),'refunds',COALESCE(sum((f->>'refunds')::bigint),0),'due',COALESCE(sum((f->>'due')::bigint),0),'refundDue',COALESCE(sum((f->>'refundDue')::bigint),0)) INTO summary
 FROM (SELECT private.mc_v7_finance(o.id) f FROM public.sales_orders o JOIN public.order_contacts c ON c.order_id=o.id JOIN public.sales_confirmations sc ON sc.order_id=o.id WHERE c.customer_id=p_id) t;
 IF EXISTS(SELECT 1 FROM jsonb_each_text(summary) x WHERE x.value::numeric>9007199254740991) THEN RAISE EXCEPTION 'CLOUD_MONEY_OVERFLOW'; END IF;
 SELECT jsonb_build_object('rows',COALESCE(jsonb_agg(to_jsonb(t) ORDER BY created_at DESC,id DESC),'[]'::jsonb),'offset',p_offset,'limit',p_limit,'total',(SELECT count(*) FROM public.order_contacts WHERE customer_id=p_id),'summary',summary) INTO answer
 FROM (SELECT o.id,CASE WHEN EXISTS(SELECT 1 FROM public.sales_confirmations sc WHERE sc.order_id=o.id) THEN 'SOLD' ELSE o.status END status,o.created_at,
 (SELECT count(*) FROM public.sales_order_images WHERE order_id=o.id) quantity,
 (SELECT COALESCE(sum(unit_price),0) FROM public.sales_order_images WHERE order_id=o.id)-o.discount+c.shipping_fee "payableTotal"
 FROM public.sales_orders o JOIN public.order_contacts c ON c.order_id=o.id WHERE c.customer_id=p_id ORDER BY o.created_at DESC,o.id DESC LIMIT p_limit OFFSET p_offset) t;
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.mc_v8_customer_history(text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_v8_customer_history(text,integer,integer) TO authenticated;

-- Owner-only global inquiry search. The 90-day redaction rule is unchanged.
CREATE FUNCTION private.mc_v8_catalog_inbox(p_q text,p_status text,p_offset integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE answer jsonb; BEGIN
 IF private.mc_v7_role()<>'owner' THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED'; END IF;
 IF p_q IS NULL OR length(p_q)>100 OR p_status IS NULL OR p_status NOT IN ('','NEW','CONTACTING','DRAFTED','REJECTED','CLOSED') OR p_offset IS NULL OR p_offset<0 THEN RAISE EXCEPTION 'CLOUD_INPUT_INVALID'; END IF;
 WITH visible AS (SELECT id,reference,CASE WHEN created_at<now()-interval '90 days' THEN '' ELSE customer_name END customer_name,CASE WHEN created_at<now()-interval '90 days' THEN '' ELSE contact END contact,CASE WHEN created_at<now()-interval '90 days' THEN '' ELSE note END note,items,status,order_id,version,created_at,updated_at FROM public.customer_catalog_inquiries),
 matched AS (SELECT * FROM visible WHERE (p_status='' OR status=p_status) AND (p_q='' OR strpos(lower(reference||' '||customer_name||' '||contact),lower(p_q))>0)),
 page AS (SELECT * FROM matched ORDER BY created_at DESC,id LIMIT 50 OFFSET p_offset)
 SELECT jsonb_build_object('rows',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY created_at DESC,id) FROM page p),'[]'::jsonb),'total',(SELECT count(*) FROM matched),'counts',(SELECT jsonb_object_agg(status,n) FROM (SELECT status,count(*) n FROM visible GROUP BY status) x)) INTO answer;
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION private.mc_v8_catalog_inbox(text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.mc_v8_catalog_inbox(text,text,integer) TO authenticated;
CREATE FUNCTION public.mc_v8_catalog_inbox(p_q text DEFAULT '',p_status text DEFAULT '',p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.mc_v8_catalog_inbox(p_q,p_status,p_offset) $$;
REVOKE ALL ON FUNCTION public.mc_v8_catalog_inbox(text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_v8_catalog_inbox(text,text,integer) TO authenticated;
