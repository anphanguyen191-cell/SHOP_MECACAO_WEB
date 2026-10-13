-- Additive audit fixes: source availability and small immutable SOLD proofs.
-- No inventory, ledger, order, payment or original Storage file is deleted here.
ALTER TABLE public.cloud_image_assets ADD COLUMN source_present boolean NOT NULL DEFAULT true;
ALTER TABLE public.cloud_image_assets ADD COLUMN source_checked_at timestamptz;
ALTER TABLE public.cloud_image_assets ADD COLUMN proof_path text;
ALTER TABLE public.cloud_image_assets ADD COLUMN proof_sha256 text CHECK(proof_sha256 IS NULL OR proof_sha256~'^[a-f0-9]{64}$');
ALTER TABLE public.cloud_image_assets ADD COLUMN proof_bytes integer CHECK(proof_bytes IS NULL OR proof_bytes BETWEEN 1 AND 40000);
ALTER TABLE public.cloud_image_assets ADD CONSTRAINT v7_proof_complete CHECK((proof_path IS NULL AND proof_sha256 IS NULL AND proof_bytes IS NULL) OR (proof_path IS NOT NULL AND proof_sha256 IS NOT NULL AND proof_bytes IS NOT NULL));

CREATE FUNCTION private.mc_v7_presence(p_instance uuid,p_request text,p_images jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 INSERT INTO public.cloud_requests(request_key,actor_id,input_hash,result) VALUES(p_request,auth.uid(),payload_hash,answer);
 IF changed_count>0 THEN INSERT INTO public.cloud_sync_events(request_key,entity_type,entity_id,version,payload) VALUES(p_request,'source_presence',p_instance::text,1,answer); END IF;
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION private.mc_v7_presence(uuid,text,jsonb) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION private.mc_v7_presence(uuid,text,jsonb) TO authenticated;
CREATE FUNCTION public.mc_v7_presence(p_instance uuid,p_request text,p_images jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.mc_v7_presence(p_instance,p_request,p_images) $$;
REVOKE ALL ON FUNCTION public.mc_v7_presence(uuid,text,jsonb) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.mc_v7_presence(uuid,text,jsonb) TO authenticated;

CREATE FUNCTION private.mc_v7_proof_register(p_instance uuid,p_image bigint,p_path text,p_sha text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE expected text; asset public.cloud_image_assets%ROWTYPE; object_meta jsonb; answer jsonb; BEGIN
 IF private.mc_v7_role()<>'owner' THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED' USING ERRCODE='42501'; END IF;
 SELECT value INTO expected FROM public.app_metadata WHERE key='cloud_instance'; IF p_instance IS NULL OR expected IS DISTINCT FROM p_instance::text THEN RAISE EXCEPTION 'CLOUD_WAREHOUSE_MISMATCH'; END IF;
 IF p_image IS NULL OR p_image<=0 OR p_sha IS NULL OR p_sha !~ '^[a-f0-9]{64}$' OR p_path IS DISTINCT FROM ('proof/v7/'||p_instance::text||'/'||p_image::text||'-'||p_sha||'.jpg') THEN RAISE EXCEPTION 'CLOUD_INPUT_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mc-v7-write',0));
 SELECT * INTO asset FROM public.cloud_image_assets WHERE image_id=p_image FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'CLOUD_IMAGE_MISSING'; END IF;
 IF asset.proof_path IS NOT NULL THEN IF asset.proof_path<>p_path OR asset.proof_sha256<>p_sha THEN RAISE EXCEPTION 'CLOUD_PROOF_IMMUTABLE'; END IF;RETURN jsonb_build_object('imageId',p_image,'path',asset.proof_path,'sha256',asset.proof_sha256); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sales_units u JOIN public.cloud_archive_receipts r ON r.order_id=u.order_id WHERE u.image_id=p_image AND r.verified_at>=now()-interval '5 minutes') THEN RAISE EXCEPTION 'CLOUD_ARCHIVE_NOT_VERIFIED'; END IF;
 SELECT metadata INTO object_meta FROM storage.objects WHERE bucket_id='shop-mobile-images' AND name=p_path;
 IF NOT FOUND OR COALESCE((object_meta->>'size')::bigint,0) NOT BETWEEN 1 AND 40000 OR object_meta->>'mimetype' IS DISTINCT FROM 'image/jpeg' THEN RAISE EXCEPTION 'CLOUD_UPLOAD_NOT_VERIFIED'; END IF;
 UPDATE public.cloud_image_assets SET proof_path=p_path,proof_sha256=p_sha,proof_bytes=(object_meta->>'size')::integer WHERE image_id=p_image;
 answer:=jsonb_build_object('imageId',p_image,'path',p_path,'sha256',p_sha);
 INSERT INTO public.cloud_sync_events(request_key,entity_type,entity_id,version,payload) VALUES('proof:'||p_image||':'||p_sha,'sold_proof',p_image::text,1,answer) ON CONFLICT(request_key) DO NOTHING;
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION private.mc_v7_proof_register(uuid,bigint,text,text) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION private.mc_v7_proof_register(uuid,bigint,text,text) TO authenticated;
CREATE FUNCTION public.mc_v7_proof_register(p_instance uuid,p_image bigint,p_path text,p_sha text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.mc_v7_proof_register(p_instance,p_image,p_path,p_sha) $$;
REVOKE ALL ON FUNCTION public.mc_v7_proof_register(uuid,bigint,text,text) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.mc_v7_proof_register(uuid,bigint,text,text) TO authenticated;

CREATE FUNCTION private.mc_v7_source_sale_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.cloud_image_assets WHERE image_id=NEW.image_id AND NOT source_present) THEN RAISE EXCEPTION 'CLOUD_SOURCE_MISSING'; END IF;RETURN NEW;END $$;
REVOKE ALL ON FUNCTION private.mc_v7_source_sale_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER v7_source_sale_guard BEFORE INSERT ON public.sales_units FOR EACH ROW EXECUTE FUNCTION private.mc_v7_source_sale_guard();

CREATE POLICY v7_proof_owner_upload ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'shop-mobile-images' OR name NOT LIKE 'proof/%' OR EXISTS(SELECT 1 FROM public.cloud_members WHERE user_id=(SELECT auth.uid()) AND enabled AND role='owner'));
CREATE POLICY v7_proof_before_sold_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'shop-mobile-images' OR NOT EXISTS(SELECT 1 FROM public.cloud_image_assets a JOIN public.sales_units u ON u.image_id=a.image_id WHERE a.object_path=objects.name) OR EXISTS(SELECT 1 FROM public.cloud_image_assets a WHERE a.object_path=objects.name AND a.proof_path IS NOT NULL AND EXISTS(SELECT 1 FROM storage.objects proof WHERE proof.bucket_id='shop-mobile-images' AND proof.name=a.proof_path)));
