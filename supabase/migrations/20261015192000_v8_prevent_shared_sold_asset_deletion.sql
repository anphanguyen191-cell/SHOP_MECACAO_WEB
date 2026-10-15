-- Per-unit stock has independent SOLD and recovery lifecycles.
-- Never point different live inventory image IDs at the SAME Storage object:
-- the original SOLD cleanup removes one file for one sold unit.
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
 AND NOT EXISTS (
  SELECT 1 FROM public.cloud_image_assets used
  WHERE used.object_path=match_source.object_path
  AND used.ready
 )
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
REVOKE ALL ON FUNCTION private.mc_v8_reuse_image(bigint,text) FROM public,anon;
GRANT EXECUTE ON FUNCTION private.mc_v8_reuse_image(bigint,text) TO authenticated;
CREATE OR REPLACE FUNCTION private.mc_v8_unsold_object_protected(p_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS (
  SELECT 1 FROM public.cloud_image_assets a
  WHERE a.object_path=p_path AND a.ready
   AND NOT EXISTS (SELECT 1 FROM public.sales_units sold WHERE sold.image_id=a.image_id)
 )
$function$
;
REVOKE ALL ON FUNCTION private.mc_v8_unsold_object_protected(text) FROM public,anon;
GRANT EXECUTE ON FUNCTION private.mc_v8_unsold_object_protected(text) TO authenticated;
DROP POLICY IF EXISTS mc_v8_unsold_storage_file_guard ON storage.objects;
CREATE POLICY mc_v8_unsold_storage_file_guard ON storage.objects AS RESTRICTIVE
 FOR DELETE TO authenticated
 USING (bucket_id<>'shop-mobile-images' OR NOT private.mc_v8_unsold_object_protected(name));
