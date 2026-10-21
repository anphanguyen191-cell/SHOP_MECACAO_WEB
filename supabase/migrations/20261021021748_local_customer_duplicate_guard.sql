-- Preserve duplicate-phone choice for legacy Cloud-only customers too.
-- Put this AFTER durable request replay, so a previously accepted retry is not
-- rejected because another customer appeared later.
DO $install$
DECLARE source text;needle text:='SELECT * INTO c FROM public.shop_customers WHERE id=p_payload->>''id'';'; BEGIN
 SELECT pg_get_functiondef('private.mc_v8_local_customers(text,text,jsonb)'::regprocedure) INTO source;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'CUSTOMER_DUPLICATE_CONTRACT_CHANGED'; END IF;
 EXECUTE replace(source,needle,$guard$IF COALESCE((p_payload->>'allowDuplicate')::boolean,false)=false AND EXISTS(
   SELECT 1 FROM public.shop_customers sc
   CROSS JOIN LATERAL (SELECT regexp_replace(p_payload->>'phone','[^0-9]','','g') AS k) phone
   WHERE phone.k<>'' AND sc.id<>p_payload->>'id'
    AND sc.phone_key=CASE WHEN left(phone.k,2)='84' THEN '0'||substr(phone.k,3) ELSE phone.k END
  ) THEN RAISE EXCEPTION 'CLOUD_CUSTOMER_DUPLICATE'; END IF;
  $guard$||needle);
END $install$;
