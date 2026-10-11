DO $fix$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('private.mc_v7_archive_ack(text,uuid,text,uuid)'::regprocedure);
 definition:=replace(definition,'ON CONFLICT(order_id) DO NOTHING','ON CONFLICT(order_id) DO UPDATE SET verified_at=now(),local_operation=excluded.local_operation');
 EXECUTE definition;
 definition:=pg_get_functiondef('private.mc_v7_sold_cleanup(text,bigint[],text,boolean)'::regprocedure);
 definition:=replace(definition,'WHERE a.image_id=ANY(p_images))<>cardinality(p_images)','WHERE a.image_id=ANY(p_images) AND r.verified_at>=now()-interval ''5 minutes'')<>cardinality(p_images)');
 definition:=replace(definition,'SELECT jsonb_agg(jsonb_build_object','IF p_action=''finalize'' THEN INSERT INTO public.cloud_sync_events(request_key,entity_type,entity_id,version,payload) VALUES(''cleanup:''||gen_random_uuid()::text,''image.cleanup'',array_to_string(p_images,'',''),1,jsonb_build_object(''imageIds'',p_images)); END IF; SELECT jsonb_agg(jsonb_build_object');
 EXECUTE definition;
END $fix$;
ALTER POLICY v7_archived_sold_delete ON storage.objects USING(bucket_id='shop-mobile-images' AND EXISTS(SELECT 1 FROM public.cloud_members WHERE user_id=(SELECT auth.uid()) AND enabled AND role='owner') AND EXISTS(SELECT 1 FROM public.cloud_image_assets a JOIN public.sales_units u ON u.image_id=a.image_id JOIN public.cloud_archive_receipts r ON r.order_id=u.order_id WHERE a.object_path=name AND a.cleanup_requested AND r.verified_at>=now()-interval '5 minutes'));
ALTER POLICY member_read ON public.cloud_sync_events USING(EXISTS(SELECT 1 FROM public.cloud_members WHERE user_id=(SELECT auth.uid()) AND enabled AND (role<>'inventory' OR entity_type IN ('catalog','image','image.ready','image.cleanup','variant.price','product.status','inventory.ledger','stocktake.create','stocktake.row','stocktake.finish') OR entity_type LIKE 'inbox.%')));
