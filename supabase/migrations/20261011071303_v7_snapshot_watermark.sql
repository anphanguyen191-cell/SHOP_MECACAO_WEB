CREATE OR REPLACE FUNCTION public.mc_v7_health() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE r text; BEGIN
 r:=private.mc_v7_role();
 RETURN jsonb_build_object('contract',1,'schema',130,'role',r,'bucket','shop-mobile-images','maxImageBytes',150000,'serverTime',now(),'status','RPC_READY','sequence',COALESCE((SELECT max(sequence) FROM public.cloud_sync_events),0));
END $$;
