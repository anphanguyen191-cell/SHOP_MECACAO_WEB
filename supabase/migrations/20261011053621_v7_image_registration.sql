CREATE FUNCTION private.mc_v7_image(p_image bigint,p_sha text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; img public.product_images%ROWTYPE; size bigint; answer jsonb; BEGIN
 r:=private.mc_v7_role();
 IF r NOT IN ('owner','inventory') THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED' USING ERRCODE='42501'; END IF;
 IF p_sha !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'CLOUD_HASH_INVALID'; END IF;
 SELECT * INTO img FROM public.product_images WHERE id=p_image FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CLOUD_IMAGE_MISSING'; END IF;
 IF EXISTS(SELECT 1 FROM public.sales_units WHERE image_id=p_image) THEN RAISE EXCEPTION 'CLOUD_IMAGE_SOLD'; END IF;
 SELECT (metadata->>'size')::bigint INTO size FROM storage.objects WHERE bucket_id='shop-mobile-images' AND name=img.file_path AND metadata->>'mimetype'='image/jpeg';
 IF size IS NULL OR size NOT BETWEEN 1 AND 150000 THEN RAISE EXCEPTION 'CLOUD_UPLOAD_NOT_VERIFIED'; END IF;
 IF EXISTS(SELECT 1 FROM public.cloud_image_assets WHERE image_id=p_image AND sha256<>p_sha) THEN RAISE EXCEPTION 'CLOUD_IMAGE_REVISION_CONFLICT'; END IF;
 INSERT INTO public.cloud_image_assets(image_id,object_path,bytes,sha256,revision,ready) VALUES(p_image,img.file_path,size,p_sha,p_sha,true) ON CONFLICT(image_id) DO NOTHING;
 answer:=jsonb_build_object('image',p_image,'bytes',size,'ready',true);
 INSERT INTO public.cloud_sync_events(request_key,entity_type,entity_id,version,payload) VALUES('image:'||p_image::text||':'||p_sha,'image',p_image::text,1,answer) ON CONFLICT(request_key) DO NOTHING;
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION private.mc_v7_image(bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.mc_v7_image(bigint,text) TO authenticated;
CREATE FUNCTION public.mc_v7_image(p_image bigint,p_sha text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.mc_v7_image(p_image,p_sha) $$;
REVOKE ALL ON FUNCTION public.mc_v7_image(bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_v7_image(bigint,text) TO authenticated;
NOTIFY pgrst,'reload schema';
