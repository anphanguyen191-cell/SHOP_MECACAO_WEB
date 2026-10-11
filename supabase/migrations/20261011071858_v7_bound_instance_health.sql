CREATE OR REPLACE FUNCTION public.mc_v7_health() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE r text; BEGIN
 r:=private.mc_v7_role();
 RETURN jsonb_build_object('contract',1,'schema',130,'role',r,'bucket','shop-mobile-images','maxImageBytes',150000,'serverTime',now(),'status',COALESCE((SELECT value FROM public.app_metadata WHERE key='cloud_status'),'RPC_READY'),'instance',(SELECT value FROM public.app_metadata WHERE key='cloud_instance'),'sequence',COALESCE((SELECT max(sequence) FROM public.cloud_sync_events),0));
END $$;
CREATE FUNCTION public.mc_v7_activate(p_instance uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF private.mc_v7_role()<>'owner' THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mc-v7-write',0));
 IF (SELECT value FROM public.app_metadata WHERE key='cloud_instance') IS DISTINCT FROM p_instance::text THEN RAISE EXCEPTION 'CLOUD_WAREHOUSE_MISMATCH'; END IF;
 UPDATE public.app_metadata SET value='CLOUD_TEST_READY' WHERE key='cloud_status';
 RETURN jsonb_build_object('status','CLOUD_TEST_READY');
END $$;
REVOKE ALL ON FUNCTION public.mc_v7_activate(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_v7_activate(uuid) TO authenticated;
