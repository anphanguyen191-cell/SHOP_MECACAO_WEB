DO $guards$ DECLARE definition text; signature text; BEGIN
 FOREACH signature IN ARRAY ARRAY['public.mc_v7_rows(text,text,integer)','public.mc_v7_changes(bigint,integer)'] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);definition:=replace(definition,'IF p_limit NOT BETWEEN 1 AND 500','IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500');definition:=replace(definition,'IF p_after<0 OR p_limit NOT BETWEEN 1 AND 500','IF p_after IS NULL OR p_limit IS NULL OR p_after<0 OR p_limit NOT BETWEEN 1 AND 500');EXECUTE definition;
 END LOOP;
 definition:=pg_get_functiondef('private.mc_v7_command(text,text,jsonb)'::regprocedure);definition:=replace(definition,'IF p_action NOT IN (','IF p_action IS NULL OR p_action NOT IN (');definition:=replace(definition,'IF length(p_request) NOT BETWEEN','IF p_request IS NULL OR length(p_request) NOT BETWEEN');definition:=replace(definition,'IF p_action=''draft.save'' THEN','IF p_action=''draft.save'' THEN IF p_payload->>''version'' IS NULL THEN RAISE EXCEPTION ''CLOUD_VERSION_CONFLICT''; END IF;');EXECUTE definition;
END $guards$;
CREATE FUNCTION public.mc_v7_debts() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb; BEGIN
 IF private.mc_v7_role() NOT IN ('owner','cashier','viewer') THEN RAISE EXCEPTION 'CLOUD_ROLE_DENIED'; END IF;
 WITH summaries AS MATERIALIZED(SELECT private.mc_v7_finance(id) summary FROM public.sales_orders WHERE status<>'CANCELLED_DRAFT') SELECT COALESCE(jsonb_agg(summary),'[]') INTO result FROM summaries WHERE (summary->>'due')::bigint>0 OR (summary->>'refundDue')::bigint>0;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.mc_v7_debts() FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.mc_v7_debts() TO authenticated;
INSERT INTO public.app_metadata(key,value) VALUES('cloud_version','V7.1.0-cloud-main-test') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
UPDATE public.app_metadata SET value='RPC_READY' WHERE key='cloud_status' AND value='FOUNDATION_NOT_CONNECTED';
