-- Additive catalog contract. No CORE business table or storage permission changes.
CREATE TABLE public.customer_catalog_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT false,
 config jsonb NOT NULL DEFAULT '{"banner_url":"","zalo_url":"","messenger_url":"","size_image_url":"","guide":[["4",9,10,80,80],["5",10,11,80,85],["6",12,13,85,90],["7",14,15,90,95],["8",16,17,95,100],["9",18,20,100,105],["10",21,23,105,110],["11",24,27,110,117],["12",28,30,118,125],["S",31,36,125,132],["M",37,42,133,138],["L",43,50,140,150]]}',
 version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.customer_catalog_settings(id) VALUES(true);
CREATE TABLE public.customer_catalog_products (
 product_id bigint PRIMARY KEY REFERENCES public.products(id), public_enabled boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.customer_catalog_inquiries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference text NOT NULL UNIQUE DEFAULT ('CC-'||upper(encode(extensions.gen_random_bytes(8),'hex'))),
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'), input_hash text NOT NULL,
 customer_name text NOT NULL, contact text NOT NULL, note text NOT NULL DEFAULT '', items jsonb NOT NULL,
 status text NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','CONTACTING','DRAFTED','REJECTED','CLOSED')),
 order_id text UNIQUE REFERENCES public.sales_orders(id), version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_catalog_inquiries_created ON public.customer_catalog_inquiries(created_at DESC,id);
CREATE TABLE public.customer_catalog_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, inquiry_id uuid REFERENCES public.customer_catalog_inquiries(id),
 actor uuid REFERENCES auth.users(id), action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_catalog_audit_inquiry ON public.customer_catalog_audit(inquiry_id);
CREATE INDEX customer_catalog_audit_actor ON public.customer_catalog_audit(actor);
CREATE TABLE public.customer_catalog_rate (
 key text PRIMARY KEY, window_start timestamptz NOT NULL, hits integer NOT NULL
);
ALTER TABLE public.customer_catalog_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_catalog_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_catalog_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_catalog_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_catalog_rate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_catalog_settings,public.customer_catalog_products,public.customer_catalog_inquiries,public.customer_catalog_audit,public.customer_catalog_rate FROM anon,authenticated;

-- Internal eligibility view is not exposed. Both reads and writes use this predicate.
CREATE VIEW private.customer_catalog_available AS
 SELECT i.id,i.product_id,i.variant_id,a.object_path,a.source_checked_at
 FROM public.product_images i
 JOIN public.products p ON p.id=i.product_id AND p.status='active'
 JOIN public.product_variants v ON v.id=i.variant_id AND v.product_id=p.id AND v.status='active'
 JOIN public.customer_catalog_products cp ON cp.product_id=p.id AND cp.public_enabled
 JOIN public.cloud_image_assets a ON a.image_id=i.id
 WHERE a.ready AND a.source_present AND NOT a.cleanup_requested AND a.deleted_at IS NULL
 AND NOT EXISTS(SELECT 1 FROM public.sales_units s WHERE s.image_id=i.id);
REVOKE ALL ON private.customer_catalog_available FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.customer_catalog_limit(p_key text,p_max integer) RETURNS void
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE n integer; BEGIN
 INSERT INTO public.customer_catalog_rate AS r(key,window_start,hits) VALUES(p_key,date_trunc('hour',now()),1)
 ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN r.window_start=date_trunc('hour',now()) THEN r.hits+1 ELSE 1 END,window_start=date_trunc('hour',now()) RETURNING hits INTO n;
 IF n>p_max THEN RAISE EXCEPTION 'CATALOG_RATE_LIMIT'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.customer_catalog_limit(text,integer) FROM PUBLIC,anon,authenticated;

-- Only the Edge Function service identity may call the public-read dispatcher.
CREATE FUNCTION public.mc_catalog_public(p_action text,p_payload jsonb DEFAULT '{}') RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg public.customer_catalog_settings%ROWTYPE; result jsonb; pid bigint; vid bigint; offset_n integer; BEGIN
 IF COALESCE(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'CATALOG_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO cfg FROM public.customer_catalog_settings WHERE id;
 IF p_action='config' THEN RETURN jsonb_build_object('enabled',cfg.enabled,'config',cfg.config,'version',cfg.version); END IF;
 IF NOT cfg.enabled THEN RAISE EXCEPTION 'CATALOG_DISABLED'; END IF;
 pid:=NULLIF(p_payload->>'product_id','')::bigint;
 offset_n:=COALESCE((p_payload->>'offset')::integer,0);
 IF offset_n<0 OR offset_n>100000 OR length(COALESCE(p_payload->>'query',''))>100 THEN RAISE EXCEPTION 'CATALOG_INPUT'; END IF;
 IF p_action='image' THEN
  SELECT jsonb_build_object('path',a.object_path) INTO result FROM private.customer_catalog_available a WHERE a.id=(p_payload->>'image_id')::bigint;
  IF result IS NULL THEN RAISE EXCEPTION 'CATALOG_UNAVAILABLE'; END IF;
  RETURN result;
 ELSIF p_action='photos' THEN
  vid:=(p_payload->>'variant_id')::bigint;
  SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') INTO result FROM (
   SELECT a.id,a.variant_id FROM private.customer_catalog_available a WHERE a.product_id=pid AND a.variant_id=vid ORDER BY a.id LIMIT 40 OFFSET offset_n
  ) t;
  RETURN jsonb_build_object('photos',result,'next_offset',offset_n+jsonb_array_length(result));
 ELSIF p_action='products' THEN
  SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') INTO result FROM (
   SELECT p.id public_product_id,p.name,p.product_code public_code,p.updated_at,
    (SELECT min(a.source_checked_at) FROM private.customer_catalog_available a WHERE a.product_id=p.id) stock_as_of,
    (SELECT a.id FROM private.customer_catalog_available a WHERE a.product_id=p.id ORDER BY a.id LIMIT 1) cover_image_id,
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('variant_id',v.id,'size_label',v.size,'sale_price',CASE WHEN v.sale_price_set OR v.sale_price>0 THEN v.sale_price ELSE NULL END,'available_count',(SELECT count(*) FROM private.customer_catalog_available a WHERE a.variant_id=v.id)) ORDER BY v.id),'[]') FROM public.product_variants v WHERE v.product_id=p.id AND v.status='active') sizes
   FROM public.products p JOIN public.customer_catalog_products cp ON cp.product_id=p.id AND cp.public_enabled
   WHERE p.status='active' AND (pid IS NULL OR p.id=pid) AND (COALESCE(p_payload->>'query','')='' OR p.name ILIKE '%'||(p_payload->>'query')||'%' OR p.product_code ILIKE '%'||(p_payload->>'query')||'%')
   AND (COALESCE(p_payload->>'size','')='' OR EXISTS(SELECT 1 FROM public.product_variants vf WHERE vf.product_id=p.id AND vf.status='active' AND vf.size=p_payload->>'size' AND (COALESCE(p_payload->>'in_stock','false')<>'true' OR EXISTS(SELECT 1 FROM private.customer_catalog_available ax WHERE ax.variant_id=vf.id))))
   AND (COALESCE(p_payload->>'in_stock','false')<>'true' OR EXISTS(SELECT 1 FROM private.customer_catalog_available ax WHERE ax.product_id=p.id))
   ORDER BY CASE WHEN p_payload->>'sort'='asc' THEN (SELECT min(vf.sale_price) FROM public.product_variants vf WHERE vf.product_id=p.id AND vf.status='active' AND (vf.sale_price_set OR vf.sale_price>0)) END ASC NULLS LAST,
    CASE WHEN p_payload->>'sort'='desc' THEN (SELECT min(vf.sale_price) FROM public.product_variants vf WHERE vf.product_id=p.id AND vf.status='active' AND (vf.sale_price_set OR vf.sale_price>0)) END DESC NULLS LAST,p.updated_at DESC,p.id LIMIT 20 OFFSET offset_n
  ) t;
  RETURN jsonb_build_object('products',result,'next_offset',offset_n+jsonb_array_length(result),'checked_at',now());
 END IF;
 RAISE EXCEPTION 'CATALOG_ACTION';
END $$;
REVOKE ALL ON FUNCTION public.mc_catalog_public(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mc_catalog_public(text,jsonb) TO service_role;

CREATE FUNCTION public.mc_catalog_submit(p_token_hash text,p_ip_hash text,p_payload jsonb,p_lookup boolean DEFAULT false) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prev public.customer_catalog_inquiries%ROWTYPE; digest text; line jsonb; saved jsonb:='[]'; ids bigint[]; total_n integer:=0; q integer; n integer; v public.product_variants%ROWTYPE; p public.products%ROWTYPE; price bigint; contact_s text; name_s text; BEGIN
 IF COALESCE(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'CATALOG_DENIED' USING ERRCODE='42501'; END IF;
 IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_ip_hash IS NULL OR p_ip_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'CATALOG_INPUT'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mc-catalog-submit',0));
 -- Contacts are removed after 90 days without deleting the idempotency receipt.
 UPDATE public.customer_catalog_inquiries SET customer_name='',contact='',note='' WHERE created_at<now()-interval '90 days' AND (contact<>'' OR customer_name<>'' OR note<>'');
 DELETE FROM public.customer_catalog_rate WHERE window_start<now()-interval '2 days';
 SELECT * INTO prev FROM public.customer_catalog_inquiries WHERE token_hash=p_token_hash;
 IF p_lookup THEN
  IF FOUND THEN RETURN jsonb_build_object('reference',prev.reference,'status',prev.status); END IF;
  RETURN jsonb_build_object('status','NOT_FOUND');
 END IF;
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>40000 THEN RAISE EXCEPTION 'CATALOG_INPUT'; END IF;
 digest:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 IF prev.id IS NOT NULL THEN
  IF prev.input_hash<>digest THEN RAISE EXCEPTION 'CATALOG_RETRY_CONFLICT'; END IF;
  RETURN jsonb_build_object('reference',prev.reference,'status',prev.status);
 END IF;
 IF NOT (SELECT enabled FROM public.customer_catalog_settings WHERE id) THEN RAISE EXCEPTION 'CATALOG_DISABLED'; END IF;
 name_s:=trim(COALESCE(p_payload->>'name',''));contact_s:=trim(COALESCE(p_payload->>'contact',''));
 IF length(name_s) NOT BETWEEN 1 AND 100 OR length(contact_s) NOT BETWEEN 5 AND 150 OR length(COALESCE(p_payload->>'note',''))>500 OR COALESCE((p_payload->>'consent')::boolean,false)<>true OR COALESCE(p_payload->>'website','')<>'' THEN RAISE EXCEPTION 'CATALOG_CONTACT'; END IF;
 IF p_payload->'items' IS NULL OR jsonb_typeof(p_payload->'items')<>'array' OR jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'CATALOG_INPUT'; END IF;
 IF (SELECT count(DISTINCT value->>'variant_id') FROM jsonb_array_elements(p_payload->'items'))<>jsonb_array_length(p_payload->'items') THEN RAISE EXCEPTION 'CATALOG_INPUT'; END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
  q:=(line->>'quick_quantity')::integer;
  IF q IS NULL OR q NOT BETWEEN 0 AND 100 OR line->'selected_image_ids' IS NULL OR jsonb_typeof(line->'selected_image_ids')<>'array' OR jsonb_array_length(line->'selected_image_ids')>100 THEN RAISE EXCEPTION 'CATALOG_INPUT'; END IF;
  SELECT array_agg(value::text::bigint),count(DISTINCT value::text::bigint) INTO ids,n FROM jsonb_array_elements(line->'selected_image_ids');
  IF n<>jsonb_array_length(line->'selected_image_ids') OR q+n NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'CATALOG_INPUT'; END IF;
  SELECT * INTO v FROM public.product_variants WHERE id=(line->>'variant_id')::bigint AND product_id=(line->>'product_id')::bigint AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'CATALOG_STOCK_CHANGED'; END IF;
  SELECT * INTO p FROM public.products WHERE id=v.product_id AND status='active' AND EXISTS(SELECT 1 FROM public.customer_catalog_products cp WHERE cp.product_id=v.product_id AND cp.public_enabled);
  IF NOT FOUND THEN RAISE EXCEPTION 'CATALOG_STOCK_CHANGED'; END IF;
  IF (SELECT count(*) FROM private.customer_catalog_available a WHERE a.variant_id=v.id)<q+n OR (SELECT count(*) FROM private.customer_catalog_available a WHERE a.variant_id=v.id AND a.id=ANY(ids))<>n THEN RAISE EXCEPTION 'CATALOG_STOCK_CHANGED'; END IF;
  price:=CASE WHEN v.sale_price_set OR v.sale_price>0 THEN v.sale_price ELSE NULL END;
  IF NOT (line ? 'expected_price') OR (line->>'expected_price')::bigint IS DISTINCT FROM price THEN RAISE EXCEPTION 'CATALOG_PRICE_CHANGED'; END IF;
  saved:=saved||jsonb_build_array(jsonb_build_object('product_id',p.id,'variant_id',v.id,'name',p.name,'size',v.size,'quick_quantity',q,'selected_image_ids',COALESCE(to_jsonb(ids),'[]'),'sale_price',price,'stock_as_of',(SELECT min(a.source_checked_at) FROM private.customer_catalog_available a WHERE a.variant_id=v.id)));
  total_n:=total_n+q+n;
 END LOOP;
 IF total_n>100 THEN RAISE EXCEPTION 'CATALOG_LIMIT'; END IF;
 PERFORM private.customer_catalog_limit('ip:'||p_ip_hash,10);
 PERFORM private.customer_catalog_limit('contact:'||encode(sha256(convert_to(lower(contact_s),'UTF8')),'hex'),5);
 PERFORM private.customer_catalog_limit('global',500);
 INSERT INTO public.customer_catalog_inquiries(token_hash,input_hash,customer_name,contact,note,items) VALUES(p_token_hash,digest,name_s,contact_s,COALESCE(p_payload->>'note',''),saved) RETURNING * INTO prev;
 INSERT INTO public.customer_catalog_audit(inquiry_id,action) VALUES(prev.id,'NEW');
 RETURN jsonb_build_object('reference',prev.reference,'status',prev.status);
END $$;
REVOKE ALL ON FUNCTION public.mc_catalog_submit(text,text,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mc_catalog_submit(text,text,jsonb,boolean) TO service_role;

CREATE FUNCTION private.mc_catalog_admin(p_action text,p_payload jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; row_i public.customer_catalog_inquiries%ROWTYPE; line jsonb; ids bigint[]; chosen bigint[]; n integer; cfg jsonb; result jsonb; snapshot jsonb; BEGIN
 r:=private.mc_v7_role();
 IF r<>'owner' THEN RAISE EXCEPTION 'CATALOG_DENIED' USING ERRCODE='42501'; END IF;
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>50000 THEN RAISE EXCEPTION 'CATALOG_INPUT'; END IF;
 IF p_action='settings' THEN RETURN (SELECT jsonb_build_object('enabled',enabled,'config',config,'version',version,'products',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM public.customer_catalog_products t)) FROM public.customer_catalog_settings WHERE id); END IF;
 IF p_action='inbox' THEN
  SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') INTO result FROM (SELECT id,reference,CASE WHEN created_at<now()-interval '90 days' THEN '' ELSE customer_name END customer_name,CASE WHEN created_at<now()-interval '90 days' THEN '' ELSE contact END contact,CASE WHEN created_at<now()-interval '90 days' THEN '' ELSE note END note,items,status,order_id,version,created_at,updated_at FROM public.customer_catalog_inquiries ORDER BY created_at DESC,id LIMIT 50 OFFSET greatest(0,least(100000,COALESCE((p_payload->>'offset')::integer,0)))) t;
  RETURN result;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mc-v7-write',0));
 IF p_action='publish' THEN
  IF (p_payload->>'enabled') IS NULL OR NOT EXISTS(SELECT 1 FROM public.products WHERE id=(p_payload->>'product_id')::bigint) THEN RAISE EXCEPTION 'CATALOG_INPUT'; END IF;
  INSERT INTO public.customer_catalog_products(product_id,public_enabled) VALUES((p_payload->>'product_id')::bigint,(p_payload->>'enabled')::boolean)
  ON CONFLICT(product_id) DO UPDATE SET public_enabled=excluded.public_enabled,version=public.customer_catalog_products.version+1,updated_at=now();
 ELSIF p_action='configure' THEN
  cfg:=p_payload->'config';
  IF cfg IS NULL OR jsonb_typeof(cfg)<>'object' OR octet_length(cfg::text)>10000 OR cfg->'guide' IS NULL OR jsonb_typeof(cfg->'guide')<>'array' OR jsonb_array_length(cfg->'guide')<>12 THEN RAISE EXCEPTION 'CATALOG_CONFIG'; END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(cfg->'guide') LOOP
   IF jsonb_typeof(line)<>'array' OR jsonb_array_length(line)<>5 OR line->>0 IS NULL OR jsonb_typeof(line->1) IS DISTINCT FROM 'number' OR jsonb_typeof(line->2) IS DISTINCT FROM 'number' OR jsonb_typeof(line->3) IS DISTINCT FROM 'number' OR jsonb_typeof(line->4) IS DISTINCT FROM 'number' OR line->>0 NOT IN ('4','5','6','7','8','9','10','11','12','S','M','L') OR (line->>1)::numeric<=0 OR (line->>2)::numeric<(line->>1)::numeric OR (line->>3)::numeric<=0 OR (line->>4)::numeric<(line->>3)::numeric THEN RAISE EXCEPTION 'CATALOG_CONFIG'; END IF;
  END LOOP;
  IF (SELECT count(DISTINCT value->>0) FROM jsonb_array_elements(cfg->'guide'))<>12 THEN RAISE EXCEPTION 'CATALOG_CONFIG'; END IF;
  IF COALESCE(cfg->>'zalo_url','')<>'' AND cfg->>'zalo_url' !~ '^https://zalo[.]me/[A-Za-z0-9/?=&_.-]+$' THEN RAISE EXCEPTION 'CATALOG_CONFIG'; END IF;
  IF COALESCE(cfg->>'messenger_url','')<>'' AND cfg->>'messenger_url' !~ '^https://(m[.]me|www[.]messenger[.]com)/[A-Za-z0-9/?=&_.-]+$' THEN RAISE EXCEPTION 'CATALOG_CONFIG'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each_text(cfg) x WHERE x.key IN ('banner_url','size_image_url') AND x.value<>'' AND (x.value !~ '^https://' OR length(x.value)>2000)) THEN RAISE EXCEPTION 'CATALOG_CONFIG'; END IF;
  UPDATE public.customer_catalog_settings SET enabled=(p_payload->>'enabled')::boolean,config=jsonb_build_object('banner_url',COALESCE(cfg->>'banner_url',''),'size_image_url',COALESCE(cfg->>'size_image_url',''),'zalo_url',COALESCE(cfg->>'zalo_url',''),'messenger_url',COALESCE(cfg->>'messenger_url',''),'guide',cfg->'guide'),version=version+1,updated_at=now() WHERE id AND version=(p_payload->>'version')::integer;
  IF NOT FOUND THEN RAISE EXCEPTION 'CATALOG_VERSION'; END IF;
 ELSE
  SELECT * INTO row_i FROM public.customer_catalog_inquiries WHERE id=(p_payload->>'id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CATALOG_NOT_FOUND'; END IF;
  IF p_action='draft' AND row_i.order_id IS NOT NULL THEN RETURN jsonb_build_object('id',row_i.order_id); END IF;
  IF row_i.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RAISE EXCEPTION 'CATALOG_VERSION'; END IF;
  IF p_action='draft' THEN
   IF row_i.status NOT IN ('NEW','CONTACTING') THEN RAISE EXCEPTION 'CATALOG_STATE'; END IF;
   IF p_payload->'image_ids' IS NULL OR jsonb_typeof(p_payload->'image_ids')<>'array' OR jsonb_array_length(p_payload->'image_ids') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'CATALOG_INPUT'; END IF;
   SELECT array_agg(value::text::bigint),count(DISTINCT value::text::bigint) INTO chosen,n FROM jsonb_array_elements(p_payload->'image_ids');
   IF n<>jsonb_array_length(p_payload->'image_ids') THEN RAISE EXCEPTION 'CATALOG_INPUT'; END IF;
   IF (SELECT count(*) FROM private.customer_catalog_available a WHERE a.id=ANY(chosen))<>n THEN RAISE EXCEPTION 'CATALOG_STOCK_CHANGED'; END IF;
   FOR line IN SELECT value FROM jsonb_array_elements(row_i.items) LOOP
    SELECT array_agg(value::text::bigint) INTO ids FROM jsonb_array_elements(line->'selected_image_ids');
    IF NOT COALESCE(ids,'{}')<@chosen OR (SELECT count(*) FROM private.customer_catalog_available a WHERE a.variant_id=(line->>'variant_id')::bigint AND a.id=ANY(chosen))<>(line->>'quick_quantity')::integer+COALESCE(array_length(ids,1),0) THEN RAISE EXCEPTION 'CATALOG_ALLOCATION'; END IF;
   END LOOP;
   IF n<>(SELECT sum((value->>'quick_quantity')::integer+jsonb_array_length(value->'selected_image_ids')) FROM jsonb_array_elements(row_i.items)) THEN RAISE EXCEPTION 'CATALOG_ALLOCATION'; END IF;
   SELECT jsonb_agg(jsonb_build_object('imageId',a.id,'unitPrice',v.sale_price) ORDER BY a.id) INTO snapshot FROM private.customer_catalog_available a JOIN public.product_variants v ON v.id=a.variant_id WHERE a.id=ANY(chosen) AND (v.sale_price_set OR v.sale_price>0);
   IF jsonb_array_length(snapshot) IS DISTINCT FROM n THEN RAISE EXCEPTION 'CATALOG_PRICE_PENDING'; END IF;
   IF snapshot IS DISTINCT FROM p_payload->'price_snapshot' THEN RAISE EXCEPTION 'CATALOG_PRICE_CHANGED'; END IF;
   result:=private.mc_v7_command('catalog-draft-'||row_i.id::text,'draft.save',jsonb_build_object('id',row_i.id::text,'version',0,'items',snapshot,'discount',0,'note','Yêu cầu '||row_i.reference||' · '||row_i.note||' · Liên hệ: '||row_i.contact,'acknowledgeDraftConflict',COALESCE((p_payload->>'acknowledgeDraftConflict')::boolean,false),'contact',jsonb_build_object('customerId',NULL,'recipientName',row_i.customer_name,'phone','','address','','shippingFee',0)));
   UPDATE public.customer_catalog_inquiries SET status='DRAFTED',order_id=result->>'id',version=version+1,updated_at=now() WHERE id=row_i.id;
  ELSIF p_action='status' THEN
   IF p_payload->>'status' IS NULL OR p_payload->>'status' NOT IN ('CONTACTING','REJECTED','CLOSED') OR row_i.status IN ('REJECTED','CLOSED') OR (row_i.status='DRAFTED' AND p_payload->>'status'<>'CLOSED') THEN RAISE EXCEPTION 'CATALOG_STATE'; END IF;
   UPDATE public.customer_catalog_inquiries SET status=p_payload->>'status',version=version+1,updated_at=now() WHERE id=row_i.id;
  ELSIF p_action='redact' THEN
   UPDATE public.customer_catalog_inquiries SET customer_name='',contact='',note='',version=version+1,updated_at=now() WHERE id=row_i.id;
  ELSE RAISE EXCEPTION 'CATALOG_ACTION'; END IF;
 END IF;
 INSERT INTO public.customer_catalog_audit(inquiry_id,actor,action) VALUES(CASE WHEN row_i.id IS NOT NULL THEN row_i.id END,auth.uid(),p_action);
 RETURN COALESCE(result,'{"ok":true}');
END $$;
REVOKE ALL ON FUNCTION private.mc_catalog_admin(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.mc_catalog_admin(text,jsonb) TO authenticated;
CREATE FUNCTION public.mc_catalog_admin(p_action text,p_payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.mc_catalog_admin(p_action,p_payload) $$;
REVOKE ALL ON FUNCTION public.mc_catalog_admin(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_catalog_admin(text,jsonb) TO authenticated;
