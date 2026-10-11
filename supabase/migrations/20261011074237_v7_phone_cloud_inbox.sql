CREATE TABLE public.cloud_photo_inbox(id uuid PRIMARY KEY,created_by uuid NOT NULL REFERENCES auth.users(id),object_path text NOT NULL UNIQUE,sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 150000),source_name text NOT NULL CHECK(length(source_name)<=100),status text NOT NULL CHECK(status IN ('PENDING','LOCAL_READY','CONSUMED','CANCELLED')),local_id text,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.cloud_photo_inbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cloud_photo_inbox FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.cloud_photo_inbox TO authenticated;
GRANT ALL ON public.cloud_photo_inbox TO service_role;
CREATE INDEX cloud_photo_inbox_created_by_idx ON public.cloud_photo_inbox(created_by);
CREATE POLICY inbox_read ON public.cloud_photo_inbox FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.cloud_members WHERE user_id=(SELECT auth.uid()) AND enabled AND (role IN ('owner','inventory') OR (role='cashier' AND created_by=(SELECT auth.uid())))));
CREATE FUNCTION private.mc_v7_inbox(p_request text,p_action text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; hash text; previous public.cloud_requests%ROWTYPE; photo public.cloud_photo_inbox%ROWTYPE; id uuid; objectpath text; meta jsonb; result jsonb;
BEGIN
 r:=private.mc_v7_role();IF r NOT IN ('owner','inventory','cashier') THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED'; END IF;
 IF p_request IS NULL OR length(p_request) NOT BETWEEN 16 AND 100 OR p_action IS NULL OR p_action NOT IN ('inbox.register','inbox.received','inbox.consume','inbox.cancel') OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'CLOUD_INPUT_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mc-v7-write',0));
 hash:=encode(sha256(convert_to(jsonb_build_object('action',p_action,'payload',p_payload)::text,'UTF8')),'hex');
 SELECT * INTO previous FROM public.cloud_requests WHERE request_key=p_request;
 IF FOUND THEN IF previous.actor_id<>auth.uid() OR previous.input_hash<>hash THEN RAISE EXCEPTION 'CLOUD_REQUEST_CONFLICT';END IF;RETURN previous.result;END IF;
 id:=(p_payload->>'id')::uuid;IF id IS NULL THEN RAISE EXCEPTION 'CLOUD_INPUT_INVALID'; END IF;
 IF p_action='inbox.register' THEN
  objectpath:='inbox/'||auth.uid()::text||'/'||id::text||'.jpg';
  SELECT metadata INTO meta FROM storage.objects WHERE bucket_id='shop-mobile-images' AND name=objectpath;
  IF NOT FOUND OR COALESCE((meta->>'size')::bigint,0) NOT BETWEEN 1 AND 150000 OR meta->>'mimetype' IS DISTINCT FROM 'image/jpeg' OR COALESCE(p_payload->>'sha','') !~ '^[a-f0-9]{64}$' OR length(COALESCE(p_payload->>'name','')) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'CLOUD_UPLOAD_NOT_VERIFIED'; END IF;
  IF EXISTS(SELECT 1 FROM public.cloud_image_assets WHERE sha256=p_payload->>'sha' AND ready) THEN RAISE EXCEPTION 'CLOUD_INBOX_KNOWN_IMAGE'; END IF;
  IF EXISTS(SELECT 1 FROM public.cloud_photo_inbox WHERE sha256=p_payload->>'sha' AND status IN ('PENDING','LOCAL_READY')) THEN RAISE EXCEPTION 'CLOUD_INBOX_DUPLICATE'; END IF;
  INSERT INTO public.cloud_photo_inbox(id,created_by,object_path,sha256,bytes,source_name,status) VALUES(id,auth.uid(),objectpath,p_payload->>'sha',(meta->>'size')::integer,p_payload->>'name','PENDING');
 ELSE
  SELECT * INTO photo FROM public.cloud_photo_inbox WHERE cloud_photo_inbox.id=id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CLOUD_INBOX_MISSING'; END IF;
  IF p_action='inbox.received' THEN
   IF r NOT IN ('owner','inventory') OR photo.status NOT IN ('PENDING','LOCAL_READY') OR COALESCE(p_payload->>'localId','') !~ '^[a-f0-9-]{36}$' THEN RAISE EXCEPTION 'CLOUD_ROLE_OR_STATUS_INVALID'; END IF;
   UPDATE public.cloud_photo_inbox SET status='LOCAL_READY',local_id=p_payload->>'localId' WHERE cloud_photo_inbox.id=id;
  ELSIF p_action='inbox.consume' THEN
   IF r NOT IN ('owner','inventory') OR photo.status<>'LOCAL_READY' OR NOT EXISTS(SELECT 1 FROM public.cloud_image_assets WHERE sha256=photo.sha256 AND ready AND object_path<>photo.object_path) THEN RAISE EXCEPTION 'CLOUD_INBOX_NOT_REGISTERED'; END IF;
   UPDATE public.cloud_photo_inbox SET status='CONSUMED' WHERE cloud_photo_inbox.id=id;
  ELSE
   IF (r<>'owner' AND photo.created_by<>auth.uid()) OR photo.status<>'PENDING' THEN RAISE EXCEPTION 'CLOUD_ROLE_OR_STATUS_INVALID'; END IF;
   UPDATE public.cloud_photo_inbox SET status='CANCELLED' WHERE cloud_photo_inbox.id=id;
  END IF;
 END IF;
 SELECT to_jsonb(t) INTO result FROM public.cloud_photo_inbox t WHERE t.id=id;
 INSERT INTO public.cloud_requests(request_key,input_hash,actor_id,status,result) VALUES(p_request,hash,auth.uid(),'COMMITTED',result);
 INSERT INTO public.cloud_sync_events(request_key,entity_type,entity_id,version,payload) VALUES(p_request,p_action,id::text,1,jsonb_build_object('id',id,'status',result->'status'));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION private.mc_v7_inbox(text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.mc_v7_inbox(text,text,jsonb) TO authenticated;
CREATE FUNCTION public.mc_v7_inbox(p_request text,p_action text,p_payload jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.mc_v7_inbox(p_request,p_action,p_payload) $$;
REVOKE ALL ON FUNCTION public.mc_v7_inbox(text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_v7_inbox(text,text,jsonb) TO authenticated;
CREATE POLICY v7_phone_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='shop-mobile-images' AND name LIKE 'inbox/'||(SELECT auth.uid())::text||'/%' AND EXISTS(SELECT 1 FROM public.cloud_members WHERE user_id=(SELECT auth.uid()) AND enabled AND role IN ('owner','inventory','cashier')));
CREATE POLICY v7_inbox_cleanup ON storage.objects FOR DELETE TO authenticated USING(bucket_id='shop-mobile-images' AND EXISTS(SELECT 1 FROM public.cloud_photo_inbox p WHERE p.object_path=name AND p.status IN ('CONSUMED','CANCELLED') AND EXISTS(SELECT 1 FROM public.cloud_members WHERE user_id=(SELECT auth.uid()) AND enabled AND (role IN ('owner','inventory') OR p.created_by=(SELECT auth.uid())))));
DO $fix$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.mc_v7_rows(text,text,integer)'::regprocedure);definition:=replace(definition,'''inventory_transactions'')','''inventory_transactions'',''cloud_photo_inbox'')');EXECUTE definition;
END $fix$;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cloud_photo_inbox;
