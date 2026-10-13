-- A policy must not query its own Storage relation: isolate the narrow proof
-- existence check under a fixed-search-path function with no write privilege.
CREATE FUNCTION private.mc_v7_retained_proof(p_original text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.cloud_members WHERE user_id=(SELECT auth.uid()) AND enabled AND role='owner')
 AND EXISTS(SELECT 1 FROM public.cloud_image_assets a JOIN public.sales_units u ON u.image_id=a.image_id JOIN storage.objects proof ON proof.bucket_id='shop-mobile-images' AND proof.name=a.proof_path WHERE a.object_path=p_original AND a.proof_path IS NOT NULL AND a.proof_sha256 IS NOT NULL AND a.proof_bytes BETWEEN 1 AND 40000)
$$;
REVOKE ALL ON FUNCTION private.mc_v7_retained_proof(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.mc_v7_retained_proof(text) TO authenticated;
ALTER POLICY v7_proof_before_sold_delete ON storage.objects USING(
 bucket_id<>'shop-mobile-images'
 OR NOT EXISTS(SELECT 1 FROM public.cloud_image_assets a JOIN public.sales_units u ON u.image_id=a.image_id WHERE a.object_path=objects.name)
 OR private.mc_v7_retained_proof(objects.name)
);
