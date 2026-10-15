-- Read-only Supabase integrity gate. Protects stock against missing Storage JPEG,
-- deleted/corrupt metadata, or accidental shared photo paths across two units.
CREATE OR REPLACE FUNCTION private.mc_v8_stock_integrity(p_instance uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE bound text; n bigint; bad bigint; aliases bigint; incomplete bigint;
BEGIN
 IF private.mc_v7_role()<>'owner' THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED' USING ERRCODE='42501'; END IF;
 SELECT value INTO bound FROM public.app_metadata WHERE key='cloud_instance';
 IF bound IS DISTINCT FROM p_instance::text THEN RAISE EXCEPTION 'CLOUD_WAREHOUSE_MISMATCH'; END IF;
 SELECT count(*) INTO n FROM public.cloud_image_assets a
  WHERE a.ready AND a.source_present AND NOT EXISTS(SELECT 1 FROM public.sales_units u WHERE u.image_id=a.image_id);
 SELECT count(*) INTO bad FROM public.cloud_image_assets a
  WHERE a.ready AND a.source_present AND NOT EXISTS(SELECT 1 FROM public.sales_units u WHERE u.image_id=a.image_id)
    AND NOT EXISTS(
     SELECT 1 FROM storage.objects o
     WHERE o.bucket_id='shop-mobile-images' AND o.name=a.object_path
       AND o.metadata->>'mimetype'='image/jpeg'
       AND (o.metadata->>'size')::bigint=a.bytes
       AND a.bytes BETWEEN 1 AND 150000
    );
 SELECT COALESCE(sum(q.cnt-1),0) INTO aliases FROM (
   SELECT count(*) cnt FROM public.cloud_image_assets a
   WHERE a.ready AND a.source_present AND NOT EXISTS(SELECT 1 FROM public.sales_units u WHERE u.image_id=a.image_id)
   GROUP BY a.object_path HAVING count(*)>1
 ) q;
 SELECT count(*) INTO incomplete
 FROM public.product_images i
 JOIN public.cloud_image_assets a ON a.image_id=i.id
 WHERE a.ready AND a.source_present
 AND NOT EXISTS(SELECT 1 FROM public.sales_units u WHERE u.image_id=i.id)
 AND (a.sha256 !~ '^[a-f0-9]{64}$' OR a.object_path IS NULL);
 RETURN jsonb_build_object('ready',n,'missingOrInvalidFiles',bad,'sharedActivePaths',aliases,'invalidHashes',incomplete);
END $function$
;

CREATE OR REPLACE FUNCTION public.mc_v8_stock_integrity(p_instance uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.mc_v8_stock_integrity(p_instance)
$function$
;

REVOKE ALL ON FUNCTION private.mc_v8_stock_integrity(uuid) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.mc_v8_stock_integrity(uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION private.mc_v8_stock_integrity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mc_v8_stock_integrity(uuid) TO authenticated;
