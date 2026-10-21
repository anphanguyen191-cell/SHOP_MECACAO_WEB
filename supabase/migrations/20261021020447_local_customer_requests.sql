-- Customer intent is separate from sale intent; no production profile is
-- mutated until the owner laptop uses its native customer service and uploads.
CREATE TABLE private.mc_local_customers(
 request_key text PRIMARY KEY CHECK(request_key ~ '^[A-Za-z0-9_-]{16,100}$'),
 customer_id text NOT NULL,instance text NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 input_hash text NOT NULL,payload jsonb NOT NULL,base jsonb,
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','CONFIRMED','REJECTED')),
 result jsonb,error text,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz
);
ALTER TABLE private.mc_local_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY mc_local_customers_no_direct ON private.mc_local_customers TO authenticated USING(false) WITH CHECK(false);
REVOKE ALL ON private.mc_local_customers FROM PUBLIC,anon,authenticated;
CREATE UNIQUE INDEX mc_local_customers_pending ON private.mc_local_customers(instance,customer_id) WHERE state='PENDING';
CREATE INDEX mc_local_customers_worker ON private.mc_local_customers(instance,created_at,request_key) WHERE state='PENDING';
CREATE INDEX mc_local_customers_actor ON private.mc_local_customers(actor_id);
CREATE INDEX mc_local_customers_recent ON private.mc_local_customers(instance,(state='PENDING') DESC,created_at DESC,request_key);

CREATE FUNCTION private.mc_v8_local_customers(p_action text,p_key text,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; inst text; q private.mc_local_customers; c public.shop_customers; h text; answer jsonb; v bigint; BEGIN
 r:=private.mc_v7_role();IF r NOT IN ('owner','cashier') THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mc-v7-write',0));
 SELECT value INTO inst FROM public.app_metadata WHERE key='cloud_instance';
 IF inst IS NULL OR (SELECT value FROM public.app_metadata WHERE key='cloud_status') IS DISTINCT FROM 'CLOUD_TEST_READY' THEN RAISE EXCEPTION 'CLOUD_BUSINESS_NOT_READY'; END IF;
 IF p_action='list' THEN
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY created_at DESC,request_key) FROM
   (SELECT request_key,customer_id,payload,state,error,result,created_at FROM private.mc_local_customers WHERE instance=inst ORDER BY (state='PENDING') DESC,created_at DESC,request_key LIMIT 200) t),'[]'::jsonb);
 END IF;
 IF p_action='enable' THEN
  IF r<>'owner' OR p_payload->>'instance' IS DISTINCT FROM inst OR (SELECT value FROM public.app_metadata WHERE key='cloud_business_source') IS DISTINCT FROM inst THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED'; END IF;
  INSERT INTO public.app_metadata(key,value) VALUES('cloud_local_customers',inst) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE app_metadata.value IS DISTINCT FROM excluded.value;
  RETURN jsonb_build_object('enabled',true);
 END IF;
 IF (SELECT value FROM public.app_metadata WHERE key='cloud_local_customers') IS DISTINCT FROM inst THEN RAISE EXCEPTION 'CLOUD_CUSTOMER_LAPTOP_UPDATE_REQUIRED'; END IF;
 IF p_action='request' THEN
  IF p_key IS NULL OR p_key !~ '^[A-Za-z0-9_-]{16,100}$' OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>8192
   OR jsonb_typeof(p_payload->'id') IS DISTINCT FROM 'string' OR p_payload->>'id' !~ '^[-A-Za-z0-9_]{1,100}$'
   OR jsonb_typeof(p_payload->'version') IS DISTINCT FROM 'number' OR p_payload->>'version' !~ '^[0-9]+$' OR (p_payload->>'version')::numeric>9007199254740991
   OR jsonb_typeof(p_payload->'name') IS DISTINCT FROM 'string' OR length(trim(p_payload->>'name')) NOT BETWEEN 1 AND 100
   OR jsonb_typeof(p_payload->'phone') IS DISTINCT FROM 'string' OR length(p_payload->>'phone')>30
   OR (trim(p_payload->>'phone')<>'' AND trim(p_payload->>'phone') !~ '^[+0-9().[:space:]-]{5,30}$')
   OR jsonb_typeof(p_payload->'address') IS DISTINCT FROM 'string' OR length(p_payload->>'address')>500
   OR jsonb_typeof(p_payload->'note') IS DISTINCT FROM 'string' OR length(p_payload->>'note')>500
   OR (p_payload ? 'allowDuplicate' AND jsonb_typeof(p_payload->'allowDuplicate') IS DISTINCT FROM 'boolean') THEN RAISE EXCEPTION 'CLOUD_CUSTOMER_INVALID'; END IF;
  h:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
  SELECT * INTO q FROM private.mc_local_customers WHERE request_key=p_key;
  IF FOUND THEN
   IF q.input_hash<>h OR q.actor_id<>auth.uid() OR q.instance<>inst THEN RAISE EXCEPTION 'CLOUD_REQUEST_CONFLICT'; END IF;
   RETURN jsonb_build_object('queued',true,'requestKey',q.request_key,'customerId',q.customer_id,'state',q.state);
  END IF;
  SELECT * INTO c FROM public.shop_customers WHERE id=p_payload->>'id';
  IF (FOUND AND c.version IS DISTINCT FROM (p_payload->>'version')::bigint) OR (NOT FOUND AND (p_payload->>'version')::bigint<>0) THEN RAISE EXCEPTION 'CLOUD_CUSTOMER_VERSION_CONFLICT'; END IF;
  IF EXISTS(SELECT 1 FROM private.mc_local_customers WHERE instance=inst AND customer_id=p_payload->>'id' AND state='PENDING') THEN RAISE EXCEPTION 'CLOUD_CUSTOMER_PENDING'; END IF;
  INSERT INTO private.mc_local_customers(request_key,customer_id,instance,actor_id,input_hash,payload,base) VALUES(p_key,p_payload->>'id',inst,auth.uid(),h,p_payload,CASE WHEN c.id IS NULL THEN NULL ELSE to_jsonb(c) END);
  answer:=jsonb_build_object('queued',true,'requestKey',p_key,'customerId',p_payload->>'id','state','PENDING');
 ELSIF p_action='next' THEN
  IF r<>'owner' OR p_payload->>'instance' IS DISTINCT FROM inst THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED'; END IF;
  SELECT * INTO q FROM private.mc_local_customers WHERE instance=inst AND state='PENDING' ORDER BY created_at,request_key LIMIT 1;
  IF NOT FOUND THEN RETURN 'null'::jsonb; END IF;
  RETURN jsonb_build_object('requestKey',q.request_key,'instance',inst,'customerId',q.customer_id,'payload',q.payload,'base',q.base);
 ELSIF p_action IN ('finish','reject') THEN
  IF r<>'owner' OR p_payload->>'instance' IS DISTINCT FROM inst THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED'; END IF;
  SELECT * INTO q FROM private.mc_local_customers WHERE request_key=p_key AND instance=inst;
  IF NOT FOUND THEN RAISE EXCEPTION 'CLOUD_REQUEST_NOT_FOUND'; END IF;
  IF q.state<>'PENDING' THEN RETURN jsonb_build_object('state',q.state); END IF;
  IF p_action='finish' THEN
   v:=(q.payload->>'version')::bigint+1;
   SELECT * INTO c FROM public.shop_customers WHERE id=q.customer_id;
   IF NOT FOUND OR p_payload->'appliedVersion' IS DISTINCT FROM to_jsonb(v) OR c.version<v OR p_payload->'customer' IS DISTINCT FROM to_jsonb(c) THEN RAISE EXCEPTION 'CLOUD_LOCAL_PROOF_REQUIRED'; END IF;
   UPDATE private.mc_local_customers SET state='CONFIRMED',completed_at=now(),result=jsonb_build_object('version',v,'currentVersion',c.version) WHERE request_key=p_key;
  ELSE
   IF jsonb_typeof(p_payload->'error') IS DISTINCT FROM 'string' OR length(p_payload->>'error') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'CLOUD_INPUT_INVALID'; END IF;
   UPDATE private.mc_local_customers SET state='REJECTED',completed_at=now(),error=p_payload->>'error' WHERE request_key=p_key;
  END IF;
  answer:=jsonb_build_object('state',CASE WHEN p_action='finish' THEN 'CONFIRMED' ELSE 'REJECTED' END);
 ELSE RAISE EXCEPTION 'CLOUD_ACTION_INVALID'; END IF;
 INSERT INTO public.cloud_sync_events(request_key,entity_type,entity_id,version,payload) VALUES('customer-request:'||p_key||':'||p_action,'local.customer',COALESCE(q.customer_id,p_payload->>'id'),1,answer);
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION private.mc_v8_local_customers(text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.mc_v8_local_customers(text,text,jsonb) TO authenticated;
CREATE FUNCTION public.mc_v8_local_customers(p_action text,p_key text DEFAULT '',p_payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.mc_v8_local_customers(p_action,p_key,p_payload)$$;
REVOKE ALL ON FUNCTION public.mc_v8_local_customers(text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_v8_local_customers(text,text,jsonb) TO authenticated;

-- Enable fencing only after the updated laptop has registered its worker.
-- Preserve installed legacy replay logic and every existing sale/finance guard.
DO $install$
DECLARE source text; needle text:='IF p_action=''customer.save'' THEN'; BEGIN
 SELECT pg_get_functiondef('private.mc_v7_command(text,text,jsonb)'::regprocedure) INTO source;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'CUSTOMER_COMMAND_CONTRACT_CHANGED'; END IF;
 EXECUTE replace(source,needle,needle||$guard$
  IF (SELECT value FROM public.app_metadata WHERE key='cloud_local_customers')=(SELECT value FROM public.app_metadata WHERE key='cloud_instance') THEN RAISE EXCEPTION 'CLOUD_CUSTOMER_LAPTOP_UPDATE_REQUIRED'; END IF;
$guard$);
END $install$;
