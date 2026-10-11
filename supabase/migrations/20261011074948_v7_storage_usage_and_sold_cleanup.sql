ALTER TABLE public.cloud_image_assets ADD COLUMN cleanup_requested boolean NOT NULL DEFAULT false,ADD COLUMN deleted_at timestamptz,ADD COLUMN cleanup_reason text;
CREATE TABLE public.cloud_archive_receipts(order_id text PRIMARY KEY REFERENCES public.sales_orders(id),actor_id uuid NOT NULL REFERENCES auth.users(id),instance_id uuid NOT NULL,cloud_operation text NOT NULL,local_operation uuid NOT NULL,verified_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX cloud_archive_receipts_actor_idx ON public.cloud_archive_receipts(actor_id);
ALTER TABLE public.cloud_archive_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cloud_archive_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.cloud_archive_receipts TO authenticated;GRANT ALL ON public.cloud_archive_receipts TO service_role;
CREATE POLICY archive_receipt_read ON public.cloud_archive_receipts FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.cloud_members WHERE user_id=(SELECT auth.uid()) AND enabled AND role='owner'));
CREATE FUNCTION private.mc_v7_archive_ack(p_id text,p_instance uuid,p_cloud_operation text,p_local_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF private.mc_v7_role()<>'owner' THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED'; END IF;
 IF p_instance IS NULL OR p_local_operation IS NULL OR (SELECT value FROM public.app_metadata WHERE key='cloud_instance') IS DISTINCT FROM p_instance::text OR NOT EXISTS(SELECT 1 FROM public.sales_confirmations WHERE order_id=p_id AND operation_id=p_cloud_operation) THEN RAISE EXCEPTION 'CLOUD_ARCHIVE_PROOF_INVALID'; END IF;
 INSERT INTO public.cloud_archive_receipts(order_id,actor_id,instance_id,cloud_operation,local_operation) VALUES(p_id,auth.uid(),p_instance,p_cloud_operation,p_local_operation) ON CONFLICT(order_id) DO NOTHING;
 RETURN jsonb_build_object('verified',true,'orderId',p_id);
END $$;
REVOKE ALL ON FUNCTION private.mc_v7_archive_ack(text,uuid,text,uuid) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION private.mc_v7_archive_ack(text,uuid,text,uuid) TO authenticated;
CREATE FUNCTION public.mc_v7_archive_ack(p_id text,p_instance uuid,p_cloud_operation text,p_local_operation uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.mc_v7_archive_ack(p_id,p_instance,p_cloud_operation,p_local_operation) $$;
REVOKE ALL ON FUNCTION public.mc_v7_archive_ack(text,uuid,text,uuid) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.mc_v7_archive_ack(text,uuid,text,uuid) TO authenticated;
CREATE FUNCTION private.mc_v7_sold_cleanup(p_action text,p_images bigint[],p_reason text,p_confirmed boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF private.mc_v7_role()<>'owner' THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('prepare','finalize') OR p_confirmed IS DISTINCT FROM true OR cardinality(p_images) IS NULL OR cardinality(p_images) NOT BETWEEN 1 AND 100 OR length(trim(COALESCE(p_reason,''))) NOT BETWEEN 1 AND 500 OR (SELECT count(DISTINCT id) FROM unnest(p_images) id)<>cardinality(p_images) THEN RAISE EXCEPTION 'CLOUD_CLEANUP_CONFIRM_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mc-v7-write',0));
 IF (SELECT count(*) FROM public.cloud_image_assets a JOIN public.sales_units u ON u.image_id=a.image_id JOIN public.cloud_archive_receipts r ON r.order_id=u.order_id WHERE a.image_id=ANY(p_images))<>cardinality(p_images) THEN RAISE EXCEPTION 'CLOUD_ARCHIVE_NOT_VERIFIED'; END IF;
 IF p_action='prepare' THEN
  UPDATE public.cloud_image_assets SET cleanup_requested=true,cleanup_reason=trim(p_reason) WHERE image_id=ANY(p_images);
 ELSE
  IF EXISTS(SELECT 1 FROM public.cloud_image_assets a LEFT JOIN storage.objects o ON o.bucket_id='shop-mobile-images' AND o.name=a.object_path WHERE a.image_id=ANY(p_images) AND (NOT a.cleanup_requested OR o.id IS NOT NULL)) THEN RAISE EXCEPTION 'CLOUD_DELETE_NOT_VERIFIED'; END IF;
  UPDATE public.cloud_image_assets SET ready=false,deleted_at=COALESCE(deleted_at,now()) WHERE image_id=ANY(p_images);
 END IF;
 SELECT jsonb_agg(jsonb_build_object('imageId',image_id,'path',object_path,'deletedAt',deleted_at) ORDER BY image_id) INTO result FROM public.cloud_image_assets WHERE image_id=ANY(p_images);
 RETURN jsonb_build_object('images',result);
END $$;
REVOKE ALL ON FUNCTION private.mc_v7_sold_cleanup(text,bigint[],text,boolean) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION private.mc_v7_sold_cleanup(text,bigint[],text,boolean) TO authenticated;
CREATE FUNCTION public.mc_v7_sold_cleanup(p_action text,p_images bigint[],p_reason text,p_confirmed boolean) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.mc_v7_sold_cleanup(p_action,p_images,p_reason,p_confirmed) $$;
REVOKE ALL ON FUNCTION public.mc_v7_sold_cleanup(text,bigint[],text,boolean) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.mc_v7_sold_cleanup(text,bigint[],text,boolean) TO authenticated;
CREATE POLICY v7_archived_sold_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='shop-mobile-images' AND EXISTS(SELECT 1 FROM public.cloud_members WHERE user_id=(SELECT auth.uid()) AND enabled AND role='owner') AND EXISTS(SELECT 1 FROM public.cloud_image_assets a JOIN public.sales_units u ON u.image_id=a.image_id JOIN public.cloud_archive_receipts r ON r.order_id=u.order_id WHERE a.object_path=name AND a.cleanup_requested));
CREATE POLICY v7_unregistered_inbox_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='shop-mobile-images' AND name LIKE 'inbox/'||(SELECT auth.uid())::text||'/%' AND EXISTS(SELECT 1 FROM public.cloud_members WHERE user_id=(SELECT auth.uid()) AND enabled AND role IN ('owner','inventory','cashier')) AND NOT EXISTS(SELECT 1 FROM public.cloud_photo_inbox p WHERE p.object_path=name) AND NOT EXISTS(SELECT 1 FROM public.cloud_image_assets a WHERE a.object_path=name));
CREATE FUNCTION public.mc_v7_storage_usage() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF private.mc_v7_role() NOT IN ('owner','inventory') THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED'; END IF;
 RETURN jsonb_build_object('objects',(SELECT count(*) FROM storage.objects WHERE bucket_id='shop-mobile-images'),'bytes',(SELECT COALESCE(sum((metadata->>'size')::numeric),0)::text FROM storage.objects WHERE bucket_id='shop-mobile-images'),'readyStock',(SELECT count(*) FROM public.cloud_image_assets a WHERE ready AND NOT EXISTS(SELECT 1 FROM public.sales_units u WHERE u.image_id=a.image_id)),'soldKept',(SELECT count(*) FROM public.cloud_image_assets a WHERE ready AND EXISTS(SELECT 1 FROM public.sales_units u WHERE u.image_id=a.image_id)),'maxImageBytes',150000);
END $$;
REVOKE ALL ON FUNCTION public.mc_v7_storage_usage() FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.mc_v7_storage_usage() TO authenticated;
