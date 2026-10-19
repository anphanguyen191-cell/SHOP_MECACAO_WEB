CREATE OR REPLACE FUNCTION private.mc_v7_presence(p_instance uuid,p_request text,p_images jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row_data jsonb; expected text; payload_hash text; old_request public.cloud_requests%ROWTYPE; image_key bigint; present_value boolean; changed_count integer:=0; affected integer; answer jsonb; BEGIN
 IF private.mc_v7_role()<>'owner' THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED' USING ERRCODE='42501'; END IF;
 IF p_instance IS NULL OR p_request IS NULL OR length(p_request) NOT BETWEEN 16 AND 200 OR jsonb_typeof(p_images) IS DISTINCT FROM 'array' OR jsonb_array_length(p_images)>100 OR octet_length(p_images::text)>100000 THEN RAISE EXCEPTION 'CLOUD_INPUT_INVALID'; END IF;
 SELECT value INTO expected FROM public.app_metadata WHERE key='cloud_instance'; IF expected IS DISTINCT FROM p_instance::text THEN RAISE EXCEPTION 'CLOUD_WAREHOUSE_MISMATCH'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mc-v7-write',0));
 payload_hash:=encode(sha256(convert_to(jsonb_build_object('instance',p_instance,'images',p_images)::text,'UTF8')),'hex');
 SELECT * INTO old_request FROM public.cloud_requests WHERE request_key=p_request;
 IF FOUND THEN IF old_request.actor_id<>auth.uid() OR old_request.input_hash<>payload_hash THEN RAISE EXCEPTION 'CLOUD_REQUEST_CONFLICT'; END IF; RETURN old_request.result; END IF;
 FOR row_data IN SELECT value FROM jsonb_array_elements(p_images) LOOP
  IF jsonb_typeof(row_data->'present') IS DISTINCT FROM 'boolean' OR COALESCE(row_data->>'id','') !~ '^[0-9]{1,16}$' THEN RAISE EXCEPTION 'CLOUD_INPUT_INVALID'; END IF;
  image_key:=(row_data->>'id')::bigint;present_value:=(row_data->>'present')::boolean;
  IF NOT EXISTS(SELECT 1 FROM public.product_images WHERE id=image_key) THEN RAISE EXCEPTION 'CLOUD_IMAGE_SOLD_OR_MISSING'; END IF;
  IF EXISTS(SELECT 1 FROM public.sales_units WHERE image_id=image_key) THEN CONTINUE; END IF;
  UPDATE public.cloud_image_assets SET source_present=present_value,source_checked_at=now() WHERE image_id=image_key AND source_present IS DISTINCT FROM present_value;
  GET DIAGNOSTICS affected=ROW_COUNT;changed_count:=changed_count+affected;
 END LOOP;
 answer:=jsonb_build_object('changed',changed_count);
 INSERT INTO public.cloud_requests(request_key,actor_id,input_hash,status,result) VALUES(p_request,auth.uid(),payload_hash,'COMMITTED',answer);
 IF changed_count>0 THEN INSERT INTO public.cloud_sync_events(request_key,entity_type,entity_id,version,payload) VALUES(p_request,'source_presence',p_instance::text,1,answer); END IF;
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION private.mc_v7_presence(uuid,text,jsonb) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION private.mc_v7_presence(uuid,text,jsonb) TO authenticated;
