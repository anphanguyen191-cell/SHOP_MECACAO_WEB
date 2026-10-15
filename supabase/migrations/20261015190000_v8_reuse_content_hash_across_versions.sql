-- Cloud V8 idempotent Size sync and SHA-256 reuse of existing Storage media.
-- Live functions applied and verified on 15/10/2026. This schema migration does not delete data.
CREATE OR REPLACE FUNCTION private.mc_v8_catalog_variants(p_request text, p_instance uuid, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE role_value text; row_item jsonb; existing public.cloud_requests%ROWTYPE;
        bound_instance text; payload_hash text; total_count integer:=0; response jsonb;
BEGIN
 role_value:=private.mc_v7_role();
 IF role_value NOT IN ('owner','inventory') THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED' USING ERRCODE='42501'; END IF;
 IF p_instance IS NULL OR length(p_request) NOT BETWEEN 8 AND 200
 OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'CLOUD_INPUT_INVALID'; END IF;
 payload_hash:=encode(sha256(convert_to(p_rows::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('mc-v7-write',0));
 SELECT value INTO bound_instance FROM public.app_metadata WHERE key='cloud_instance';
 IF bound_instance IS DISTINCT FROM p_instance::text THEN RAISE EXCEPTION 'CLOUD_WAREHOUSE_MISMATCH'; END IF;
 SELECT * INTO existing FROM public.cloud_requests WHERE request_key=p_request;
 IF FOUND THEN
  IF existing.actor_id<>auth.uid() OR existing.input_hash<>payload_hash THEN RAISE EXCEPTION 'CLOUD_REQUEST_CONFLICT'; END IF;
  RETURN existing.result;
 END IF;
 FOR row_item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  INSERT INTO public.product_variants
   (id,product_id,sku,size,status,cost_price,sale_price,cost_price_set,sale_price_set)
  VALUES
   ((row_item->>'id')::bigint,(row_item->>'product_id')::bigint,
    row_item->>'sku',row_item->>'size',COALESCE(row_item->>'status','active'),
    COALESCE((row_item->>'cost_price')::bigint,0),
    COALESCE((row_item->>'sale_price')::bigint,0),
    COALESCE((row_item->>'cost_price_set')::boolean,COALESCE((row_item->>'cost_price')::bigint,0)>0),
    COALESCE((row_item->>'sale_price_set')::boolean,COALESCE((row_item->>'sale_price')::bigint,0)>0))
   ON CONFLICT(id) DO UPDATE SET status=public.product_variants.status
   WHERE public.product_variants.product_id=excluded.product_id
   AND public.product_variants.sku=excluded.sku
   AND public.product_variants.size=excluded.size;
  IF NOT FOUND THEN RAISE EXCEPTION 'CLOUD_VARIANT_ID_CONFLICT'; END IF;
  total_count:=total_count+1;
 END LOOP;
 response:=jsonb_build_object('count',total_count,'instance',p_instance,'request',p_request);
 INSERT INTO public.cloud_requests(request_key,input_hash,actor_id,status,result)
 VALUES(p_request,payload_hash,auth.uid(),'COMMITTED',response);
 INSERT INTO public.cloud_sync_events(request_key,entity_type,entity_id,version,payload)
 VALUES(p_request,'catalog',p_instance::text,1,response);
 RETURN response;
END $function$
;

CREATE OR REPLACE FUNCTION private.mc_v8_reuse_image(p_image bigint, p_sha text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE role_value text; cloud_instance text; row_image public.product_images%ROWTYPE;
 original public.cloud_image_assets%ROWTYPE; chosen_path text; chosen_bytes bigint; result jsonb;
BEGIN
 role_value:=private.mc_v7_role();
 IF role_value NOT IN ('owner','inventory') THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED' USING ERRCODE='42501'; END IF;
 IF p_image IS NULL OR p_image<1 OR p_sha !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'CLOUD_INPUT_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mc-v7-write',0));
 SELECT value INTO cloud_instance FROM public.app_metadata WHERE key='cloud_instance';
 IF cloud_instance IS NULL THEN RAISE EXCEPTION 'CLOUD_WAREHOUSE_UNBOUND'; END IF;
 SELECT * INTO row_image FROM public.product_images WHERE id=p_image FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CLOUD_IMAGE_MISSING'; END IF;
 IF EXISTS(SELECT 1 FROM public.sales_units WHERE image_id=p_image) THEN RAISE EXCEPTION 'CLOUD_IMAGE_SOLD'; END IF;
 SELECT * INTO original FROM public.cloud_image_assets WHERE image_id=p_image;
 IF FOUND THEN
  IF original.sha256<>p_sha OR NOT original.ready THEN RAISE EXCEPTION 'CLOUD_IMAGE_REVISION_CONFLICT'; END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='shop-mobile-images' AND o.name=original.object_path) THEN RAISE EXCEPTION 'CLOUD_UPLOAD_NOT_VERIFIED'; END IF;
  RETURN jsonb_build_object('reused',true,'ready',true,'path',original.object_path,'bytes',original.bytes);
 END IF;
 -- First reuse another verified active asset, then preserved archived files.
 SELECT match_source.object_path,match_source.bytes INTO chosen_path,chosen_bytes
 FROM (
   SELECT a.object_path,a.bytes,0 AS preference
   FROM public.cloud_image_assets a WHERE a.sha256=p_sha AND a.ready
   UNION ALL
   SELECT a.object_path,a.bytes,1 AS preference
   FROM private.mc_v8_handoff_assets a JOIN private.mc_v8_handoff_archive h ON h.id=a.archive_id
   WHERE h.target_instance=cloud_instance::uuid AND a.sha256=p_sha
 ) match_source
 JOIN storage.objects stored ON stored.name=match_source.object_path
 AND stored.bucket_id='shop-mobile-images'
 AND stored.metadata->>'mimetype'='image/jpeg'
 AND (stored.metadata->>'size')::bigint=match_source.bytes
 WHERE match_source.bytes BETWEEN 1 AND 150000
 ORDER BY match_source.preference,match_source.object_path LIMIT 1;
 IF chosen_path IS NULL THEN RETURN jsonb_build_object('reused',false,'ready',false); END IF;
 UPDATE public.product_images SET file_path=chosen_path WHERE id=p_image;
 INSERT INTO public.cloud_image_assets(image_id,object_path,bytes,sha256,revision,ready)
 VALUES(p_image,chosen_path,chosen_bytes,p_sha,p_sha,true);
 result:=jsonb_build_object('image',p_image,'path',chosen_path,'bytes',chosen_bytes,'reused',true,'ready',true);
 INSERT INTO public.cloud_sync_events(request_key,entity_type,entity_id,version,payload)
 VALUES('reuse-image:'||cloud_instance||':'||p_image::text||':'||p_sha,'image',p_image::text,1,result)
 ON CONFLICT(request_key) DO NOTHING;
 RETURN result;
END $function$
;

CREATE OR REPLACE FUNCTION private.mc_v8_can_cleanup_legacy(p_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT private.mc_v7_role()='owner'
  AND (SELECT value FROM public.app_metadata WHERE key='cloud_status')='CLOUD_TEST_READY'
  AND EXISTS (
   SELECT 1 FROM private.mc_v8_handoff_assets old
   JOIN private.mc_v8_handoff_archive history ON history.id=old.archive_id
   JOIN storage.objects object_row ON object_row.bucket_id='shop-mobile-images' AND object_row.name=old.object_path
   WHERE old.object_path=p_path
    AND history.target_instance::text=(SELECT value FROM public.app_metadata WHERE key='cloud_instance')
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.cloud_image_assets active
    WHERE active.object_path=p_path AND active.ready
  )
$function$
;

CREATE OR REPLACE FUNCTION public.mc_v8_catalog_variants(p_request text, p_instance uuid, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.mc_v8_catalog_variants(p_request,p_instance,p_rows)
$function$
;

CREATE OR REPLACE FUNCTION public.mc_v8_reuse_image(p_image bigint, p_sha text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.mc_v8_reuse_image(p_image,p_sha)
$function$
;

REVOKE ALL ON FUNCTION private.mc_v8_catalog_variants(text,uuid,jsonb) FROM public,anon;
REVOKE ALL ON FUNCTION private.mc_v8_reuse_image(bigint,text) FROM public,anon;
REVOKE ALL ON FUNCTION private.mc_v8_can_cleanup_legacy(text) FROM public,anon;
GRANT EXECUTE ON FUNCTION private.mc_v8_catalog_variants(text,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION private.mc_v8_reuse_image(bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.mc_v8_can_cleanup_legacy(text) TO authenticated;
REVOKE ALL ON FUNCTION public.mc_v8_catalog_variants(text,uuid,jsonb) FROM public,anon;
REVOKE ALL ON FUNCTION public.mc_v8_reuse_image(bigint,text) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.mc_v8_catalog_variants(text,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mc_v8_reuse_image(bigint,text) TO authenticated;
