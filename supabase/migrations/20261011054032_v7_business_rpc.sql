CREATE FUNCTION private.mc_v7_finance(p_id text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE o public.sales_orders%ROWTYPE; cfg public.order_finance%ROWTYPE; original bigint; receipts bigint; refunds bigint; credit bigint; BEGIN
 SELECT * INTO o FROM public.sales_orders WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'CLOUD_ORDER_MISSING'; END IF;
 SELECT * INTO cfg FROM public.order_finance WHERE order_id=p_id;
 SELECT COALESCE(sum(unit_price),0)-o.discount+COALESCE((SELECT shipping_fee FROM public.order_contacts WHERE order_id=p_id),0) INTO original FROM public.sales_order_images WHERE order_id=p_id;
 SELECT COALESCE(sum(amount) FILTER(WHERE kind='RECEIPT'),0),COALESCE(sum(amount) FILTER(WHERE kind='REFUND'),0),COALESCE(sum(amount) FILTER(WHERE kind='CREDIT'),0) INTO receipts,refunds,credit FROM public.finance_entries WHERE order_id=p_id;
 IF original<credit OR refunds>receipts OR greatest(original,receipts,refunds,credit)>9007199254740991 THEN RAISE EXCEPTION 'CLOUD_FINANCE_INVALID'; END IF;
 RETURN jsonb_build_object('orderId',p_id,'orderVersion',o.version,'orderStatus',CASE WHEN EXISTS(SELECT 1 FROM public.sales_confirmations WHERE order_id=p_id) THEN 'SOLD' ELSE o.status END,'version',COALESCE(cfg.version,0),'method',COALESCE(cfg.method,'COD'),'delivery',COALESCE(cfg.delivery,'NEW'),'tracking',COALESCE(cfg.tracking,''),'originalTotal',original,'receipts',receipts,'refunds',refunds,'credit',credit,'netCollected',receipts-refunds,'adjustedTotal',original-credit,'due',greatest(0,original-credit-receipts+refunds),'refundDue',greatest(0,receipts-refunds-original+credit));
END $$;
REVOKE ALL ON FUNCTION private.mc_v7_finance(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.mc_v7_finance(text) TO authenticated;
CREATE FUNCTION public.mc_v7_finance(p_id text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$ BEGIN PERFORM private.mc_v7_role(); RETURN private.mc_v7_finance(p_id); END $$;
REVOKE ALL ON FUNCTION public.mc_v7_finance(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_v7_finance(text) TO authenticated;

CREATE FUNCTION private.mc_v7_command(p_request text,p_action text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; hash text; previous public.cloud_requests%ROWTYPE; id text; o public.sales_orders%ROWTYPE; c public.shop_customers%ROWTYPE; row record; item jsonb; cfg jsonb; result jsonb; subtotal bigint; total bigint; discount bigint; net bigint; credit bigint; ids bigint[]; cnt integer; op text; payload text; method text; delivery text; tracking text; kind text; amount bigint; version bigint; phone text; phonekey text; name text; note text; contact jsonb; data jsonb; nowtext text:=to_char(timezone('UTC',now()),'YYYY-MM-DD HH24:MI:SS'); BEGIN
 r:=private.mc_v7_role();
 IF r NOT IN ('owner','cashier') THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED' USING ERRCODE='42501'; END IF;
 IF p_action NOT IN ('customer.save','draft.save','draft.cancel','sale.confirm','finance.configure','finance.entry','aftercare.create','aftercare.resolve') THEN RAISE EXCEPTION 'CLOUD_ACTION_INVALID'; END IF;
 IF length(p_request) NOT BETWEEN 16 AND 100 OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>200000 THEN RAISE EXCEPTION 'CLOUD_INPUT_INVALID'; END IF;
 hash:=encode(sha256(convert_to(jsonb_build_object('action',p_action,'payload',p_payload)::text,'UTF8')),'hex');
 -- Deterministic global transaction lock serializes catalog, sale and payment mutations.
 PERFORM pg_advisory_xact_lock(hashtextextended('mc-v7-write',0));
 SELECT * INTO previous FROM public.cloud_requests WHERE request_key=p_request;
 IF FOUND THEN
  IF previous.actor_id<>auth.uid() OR previous.input_hash<>hash THEN RAISE EXCEPTION 'CLOUD_REQUEST_CONFLICT'; END IF;
  RETURN previous.result;
 END IF;
 id:=COALESCE(NULLIF(p_payload->>'id',''),gen_random_uuid()::text);
 IF length(id)>100 THEN RAISE EXCEPTION 'CLOUD_ID_INVALID'; END IF;
 IF p_action='customer.save' THEN
  name:=trim(COALESCE(p_payload->>'name','')); phone:=trim(COALESCE(p_payload->>'phone',''));note:=trim(COALESCE(p_payload->>'note',''));
  IF name='' OR length(name)>100 OR length(phone)>30 OR length(note)>500 OR length(COALESCE(p_payload->>'address',''))>500 OR (phone<>'' AND phone !~ '^[+0-9().[:space:]-]{5,30}$') THEN RAISE EXCEPTION 'CLOUD_CUSTOMER_INVALID'; END IF;
  phonekey:=regexp_replace(phone,'[^0-9]','','g'); IF left(phonekey,2)='84' THEN phonekey:='0'||substr(phonekey,3); END IF;
  IF phonekey<>'' AND EXISTS(SELECT 1 FROM public.shop_customers WHERE phone_key=phonekey AND shop_customers.id<>id) AND COALESCE((p_payload->>'allowDuplicate')::boolean,false)=false THEN RAISE EXCEPTION 'CLOUD_CUSTOMER_DUPLICATE'; END IF;
  SELECT * INTO c FROM public.shop_customers WHERE shop_customers.id=id FOR UPDATE;
  IF FOUND THEN
   IF c.version IS DISTINCT FROM (p_payload->>'version')::bigint THEN RAISE EXCEPTION 'CLOUD_VERSION_CONFLICT'; END IF;
   UPDATE public.shop_customers SET name=mc_v7_command.name,phone=mc_v7_command.phone,phone_key=phonekey,address=COALESCE(p_payload->>'address',''),note=mc_v7_command.note,version=version+1,updated_at=nowtext WHERE shop_customers.id=id;
  ELSE
   IF COALESCE((p_payload->>'version')::bigint,0)<>0 THEN RAISE EXCEPTION 'CLOUD_VERSION_CONFLICT'; END IF;
   INSERT INTO public.shop_customers(id,name,phone,phone_key,address,note) VALUES(id,name,phone,phonekey,COALESCE(p_payload->>'address',''),note);
  END IF;
  SELECT to_jsonb(t) INTO result FROM public.shop_customers t WHERE t.id=id;
 ELSE
  SELECT * INTO o FROM public.sales_orders WHERE sales_orders.id=id FOR UPDATE;
  IF p_action='draft.save' AND NOT FOUND THEN
   IF COALESCE((p_payload->>'version')::bigint,0)<>0 THEN RAISE EXCEPTION 'CLOUD_VERSION_CONFLICT'; END IF;
   INSERT INTO public.sales_orders(id,request_key,request_hash,discount) VALUES(id,p_request,hash,0);
   SELECT * INTO o FROM public.sales_orders WHERE sales_orders.id=id;
  ELSIF NOT FOUND THEN RAISE EXCEPTION 'CLOUD_ORDER_MISSING'; END IF;
  IF p_action IN ('draft.save','draft.cancel','sale.confirm') THEN
   IF o.status<>'DRAFT' OR EXISTS(SELECT 1 FROM public.sales_confirmations WHERE order_id=id) THEN RAISE EXCEPTION 'CLOUD_ORDER_TERMINAL'; END IF;
   IF (p_action<>'draft.save' OR (p_payload->>'version')::bigint<>0) AND o.version IS DISTINCT FROM (p_payload->>'version')::bigint THEN RAISE EXCEPTION 'CLOUD_VERSION_CONFLICT'; END IF;
  END IF;
  cfg:=private.mc_v7_finance(id); net:=(cfg->>'netCollected')::bigint;credit:=(cfg->>'credit')::bigint;
  IF p_action='draft.save' THEN
   data:=p_payload->'items';discount:=COALESCE((p_payload->>'discount')::bigint,0);note:=COALESCE(p_payload->>'note','');contact:=COALESCE(p_payload->'contact','{}');
   IF jsonb_typeof(data)<>'array' OR jsonb_array_length(data) NOT BETWEEN 1 AND 100 OR length(note)>1000 THEN RAISE EXCEPTION 'CLOUD_DRAFT_INVALID'; END IF;
   SELECT array_agg((value->>'imageId')::bigint ORDER BY (value->>'imageId')::bigint),count(DISTINCT (value->>'imageId')::bigint),sum((value->>'unitPrice')::bigint) INTO ids,cnt,subtotal FROM jsonb_array_elements(data);
   IF cnt<>jsonb_array_length(data) OR subtotal NOT BETWEEN 0 AND 9007199254740991 OR discount<0 OR discount>subtotal OR EXISTS(SELECT 1 FROM jsonb_array_elements(data) WHERE (value->>'unitPrice')::bigint NOT BETWEEN 0 AND 9007199254740991) THEN RAISE EXCEPTION 'CLOUD_PRICE_INVALID'; END IF;
   PERFORM 1 FROM public.product_images WHERE product_images.id=ANY(ids) ORDER BY product_images.id FOR UPDATE;
   SELECT count(*) INTO cnt FROM public.product_images i JOIN public.product_variants v ON v.id=i.variant_id JOIN public.products p ON p.id=i.product_id JOIN public.cloud_image_assets a ON a.image_id=i.id AND a.ready WHERE i.id=ANY(ids) AND p.status='active' AND v.status='active' AND NOT EXISTS(SELECT 1 FROM public.sales_units WHERE image_id=i.id);
   IF cnt<>array_length(ids,1) THEN RAISE EXCEPTION 'CLOUD_STOCK_UNAVAILABLE'; END IF;
   IF EXISTS(SELECT 1 FROM public.sales_order_images si JOIN public.sales_orders so ON so.id=si.order_id WHERE si.image_id=ANY(ids) AND si.order_id<>id AND so.status='DRAFT' AND NOT EXISTS(SELECT 1 FROM public.sales_confirmations WHERE order_id=so.id)) AND COALESCE((p_payload->>'acknowledgeDraftConflict')::boolean,false)=false THEN RAISE EXCEPTION 'CLOUD_DRAFT_CONFLICT'; END IF;
   total:=subtotal-discount+COALESCE((contact->>'shippingFee')::bigint,0);
   IF total NOT BETWEEN 0 AND 9007199254740991 OR COALESCE((contact->>'shippingFee')::bigint,0)<0 OR total<net+credit OR length(COALESCE(contact->>'recipientName',''))>100 OR length(COALESCE(contact->>'phone',''))>30 OR length(COALESCE(contact->>'address',''))>500 THEN RAISE EXCEPTION 'CLOUD_CONTACT_OR_TOTAL_INVALID'; END IF;
   UPDATE public.sales_orders SET discount=mc_v7_command.discount,note=mc_v7_command.note,version=CASE WHEN (p_payload->>'version')::bigint=0 THEN version ELSE version+1 END,updated_at=nowtext WHERE sales_orders.id=id;
   DELETE FROM public.sales_order_images WHERE order_id=id;
   cnt:=0; FOR item IN SELECT value FROM jsonb_array_elements(data) LOOP
    INSERT INTO public.sales_order_images(order_id,image_id,product_id,variant_id,product_name,product_code,size,sku,unit_price,unit_cost,position) SELECT id,i.id,i.product_id,i.variant_id,p.name,p.product_code,v.size,v.sku,(item->>'unitPrice')::bigint,v.cost_price,cnt FROM public.product_images i JOIN public.products p ON p.id=i.product_id JOIN public.product_variants v ON v.id=i.variant_id WHERE i.id=(item->>'imageId')::bigint;cnt:=cnt+1;
   END LOOP;
   INSERT INTO public.order_contacts(order_id,customer_id,recipient_name,phone,address,shipping_fee) VALUES(id,NULLIF(contact->>'customerId',''),COALESCE(contact->>'recipientName',''),COALESCE(contact->>'phone',''),COALESCE(contact->>'address',''),COALESCE((contact->>'shippingFee')::bigint,0)) ON CONFLICT(order_id) DO UPDATE SET customer_id=excluded.customer_id,recipient_name=excluded.recipient_name,phone=excluded.phone,address=excluded.address,shipping_fee=excluded.shipping_fee;
   result:=jsonb_build_object('id',id,'version',(SELECT sales_orders.version FROM public.sales_orders WHERE sales_orders.id=id));
  ELSIF p_action='draft.cancel' THEN
   IF net>0 THEN RAISE EXCEPTION 'CLOUD_REFUND_REQUIRED'; END IF;
   UPDATE public.sales_orders SET status='CANCELLED_DRAFT',version=version+1,updated_at=nowtext WHERE sales_orders.id=id;result:=jsonb_build_object('id',id,'status','CANCELLED_DRAFT');
  ELSIF p_action='sale.confirm' THEN
   IF COALESCE((p_payload->>'confirmed')::boolean,false)=false THEN RAISE EXCEPTION 'CLOUD_CONFIRM_REQUIRED'; END IF;
   SELECT array_agg(image_id ORDER BY image_id),count(*),sum(unit_price) INTO ids,cnt,subtotal FROM public.sales_order_images WHERE order_id=id;
   IF cnt NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'CLOUD_DRAFT_INVALID'; END IF;
   IF EXISTS(SELECT 1 FROM public.sales_order_images WHERE order_id=id AND unit_price=0) AND COALESCE((p_payload->>'acknowledgeZeroPrice')::boolean,false)=false THEN RAISE EXCEPTION 'CLOUD_ZERO_PRICE_ACK_REQUIRED'; END IF;
   PERFORM 1 FROM public.product_images WHERE product_images.id=ANY(ids) ORDER BY product_images.id FOR UPDATE;
   SELECT count(*) INTO cnt FROM public.product_images i JOIN public.product_variants v ON v.id=i.variant_id JOIN public.products p ON p.id=i.product_id JOIN public.cloud_image_assets a ON a.image_id=i.id AND a.ready WHERE i.id=ANY(ids) AND p.status='active' AND v.status='active' AND NOT EXISTS(SELECT 1 FROM public.sales_units WHERE image_id=i.id);
   IF cnt<>array_length(ids,1) THEN RAISE EXCEPTION 'CLOUD_STOCK_UNAVAILABLE'; END IF;
   op:=gen_random_uuid()::text;payload:=jsonb_build_object('cloud',true,'orderId',id,'version',o.version,'request',p_request,'items',(SELECT jsonb_agg(to_jsonb(si) ORDER BY image_id) FROM public.sales_order_images si WHERE order_id=id))::text;
   INSERT INTO public.sales_operations(id,request_key,input_hash,payload,payload_hash,status) VALUES(op,p_request,hash,payload,encode(sha256(convert_to(payload,'UTF8')),'hex'),'PREPARED');
   INSERT INTO public.sales_confirmations(order_id,operation_id,version,subtotal,discount,total,note) VALUES(id,op,o.version,subtotal,o.discount,subtotal-o.discount,o.note);
   INSERT INTO public.sales_units(image_id,order_id,variant_id,snapshot,source_hash,archive_path,archive_hash) SELECT si.image_id,id,si.variant_id,to_jsonb(si)::text,a.sha256,a.object_path,a.sha256 FROM public.sales_order_images si JOIN public.cloud_image_assets a ON a.image_id=si.image_id WHERE si.order_id=id;
   INSERT INTO public.sales_ledger(image_id,order_id,variant_id,transaction_type,quantity,unit_cost) SELECT image_id,id,variant_id,'SALE',1,unit_cost FROM public.sales_order_images WHERE order_id=id;
   UPDATE public.sales_operations SET status='SOLD' WHERE sales_operations.id=op;
   result:=jsonb_build_object('id',id,'operationId',op,'status','SOLD','version',o.version);
  ELSE
   IF o.status='CANCELLED_DRAFT' THEN RAISE EXCEPTION 'CLOUD_ORDER_TERMINAL'; END IF;
   IF (cfg->>'version')::bigint IS DISTINCT FROM (p_payload->>'version')::bigint OR o.version IS DISTINCT FROM (p_payload->>'orderVersion')::bigint THEN RAISE EXCEPTION 'CLOUD_VERSION_CONFLICT'; END IF;
   version:=(cfg->>'version')::bigint+1;method:=cfg->>'method';delivery:=cfg->>'delivery';tracking:=cfg->>'tracking';
   IF p_action='finance.configure' THEN
    method:=p_payload->>'method';delivery:=p_payload->>'delivery';tracking:=COALESCE(p_payload->>'tracking','');
    IF method NOT IN ('COD','TRANSFER','CASH') OR delivery NOT IN ('NEW','SHIPPED','DELIVERED','FAILED') OR length(tracking)>150 OR ((cfg->>'orderStatus')<>'SOLD' AND delivery<>'NEW') THEN RAISE EXCEPTION 'CLOUD_FINANCE_CONFIG_INVALID'; END IF;
   ELSIF p_action='finance.entry' THEN
    kind:=p_payload->>'kind';amount:=(p_payload->>'amount')::bigint;note:=trim(COALESCE(p_payload->>'note',''));method:=p_payload->>'method';
    IF kind NOT IN ('RECEIPT','REFUND','CREDIT') OR amount NOT BETWEEN 1 AND 9007199254740991 OR method NOT IN ('COD','TRANSFER','CASH') OR note='' OR length(note)>500 THEN RAISE EXCEPTION 'CLOUD_FINANCE_ENTRY_INVALID'; END IF;
    IF (kind='RECEIPT' AND amount>(cfg->>'due')::bigint) OR (kind='REFUND' AND amount>net) OR (kind='CREDIT' AND ((cfg->>'orderStatus')<>'SOLD' OR amount>(cfg->>'adjustedTotal')::bigint)) THEN RAISE EXCEPTION 'CLOUD_FINANCE_AMOUNT_INVALID'; END IF;
    IF (CASE kind WHEN 'RECEIPT' THEN (cfg->>'receipts')::numeric WHEN 'REFUND' THEN (cfg->>'refunds')::numeric ELSE (cfg->>'credit')::numeric END)+amount>9007199254740991 THEN RAISE EXCEPTION 'CLOUD_MONEY_OVERFLOW'; END IF;
    payload:=jsonb_build_object('id',id,'kind',kind,'amount',amount,'method',method,'note',note,'version',version-1,'orderVersion',o.version)::text;
    INSERT INTO public.finance_entries(id,order_id,request_key,input_hash,payload,sequence,kind,amount,method,note) VALUES(gen_random_uuid()::text,id,p_request,encode(sha256(convert_to(payload,'UTF8')),'hex'),payload,version,kind,amount,method,note);
    method:=cfg->>'method';
   ELSIF p_action='aftercare.create' THEN
    kind:=p_payload->>'kind';note:=trim(COALESCE(p_payload->>'note',''));
    IF (cfg->>'orderStatus')<>'SOLD' OR kind NOT IN ('RETURN','EXCHANGE','SUPPORT') OR note='' OR length(note)>500 THEN RAISE EXCEPTION 'CLOUD_AFTERCARE_INVALID'; END IF;
    INSERT INTO public.aftercare_cases(id,order_id,request_key,input_hash,kind,note,status) VALUES(gen_random_uuid()::text,id,p_request,hash,kind,note,'OPEN');
   ELSE
    note:=trim(COALESCE(p_payload->>'resolution',''));
    IF note='' OR length(note)>500 THEN RAISE EXCEPTION 'CLOUD_AFTERCARE_INVALID'; END IF;
    UPDATE public.aftercare_cases SET status='RESOLVED',resolution=mc_v7_command.note,version=version+1,updated_at=nowtext WHERE aftercare_cases.id=p_payload->>'caseId' AND order_id=id AND status='OPEN' AND aftercare_cases.version=(p_payload->>'caseVersion')::bigint;
    IF NOT FOUND THEN RAISE EXCEPTION 'CLOUD_VERSION_CONFLICT'; END IF;
   END IF;
   INSERT INTO public.order_finance(order_id,version,method,delivery,tracking) VALUES(id,version,method,delivery,tracking) ON CONFLICT(order_id) DO UPDATE SET version=excluded.version,method=excluded.method,delivery=excluded.delivery,tracking=excluded.tracking;
   result:=private.mc_v7_finance(id);
  END IF;
 END IF;
 INSERT INTO public.cloud_requests(request_key,input_hash,actor_id,status,result) VALUES(p_request,hash,auth.uid(),'COMMITTED',result);
 INSERT INTO public.cloud_sync_events(request_key,entity_type,entity_id,version,payload) VALUES(p_request,p_action,id,COALESCE((result->>'version')::bigint,1),result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION private.mc_v7_command(text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.mc_v7_command(text,text,jsonb) TO authenticated;
CREATE FUNCTION public.mc_v7_command(p_request text,p_action text,p_payload jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.mc_v7_command(p_request,p_action,p_payload) $$;
REVOKE ALL ON FUNCTION public.mc_v7_command(text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_v7_command(text,text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
