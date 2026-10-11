CREATE FUNCTION public.mc_v7_sold_proof(p_id text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE r text; result jsonb; BEGIN
 r:=private.mc_v7_role(); IF r NOT IN ('owner','inventory') THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sales_confirmations WHERE order_id=p_id) THEN RAISE EXCEPTION 'CLOUD_ORDER_NOT_SOLD'; END IF;
 SELECT jsonb_build_object('instance',(SELECT value FROM public.app_metadata WHERE key='cloud_instance'),'order',to_jsonb(o),'confirmation',(SELECT to_jsonb(c) FROM public.sales_confirmations c WHERE c.order_id=o.id),'contact',(SELECT to_jsonb(c) FROM public.order_contacts c WHERE c.order_id=o.id),'items',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.position) FROM public.sales_order_images i WHERE i.order_id=o.id),'assets',(SELECT jsonb_agg(to_jsonb(a)) FROM public.cloud_image_assets a JOIN public.sales_units u ON u.image_id=a.image_id WHERE u.order_id=o.id)) INTO result FROM public.sales_orders o WHERE o.id=p_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.mc_v7_sold_proof(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_v7_sold_proof(text) TO authenticated;
