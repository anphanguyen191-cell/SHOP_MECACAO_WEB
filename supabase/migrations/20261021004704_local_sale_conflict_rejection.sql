-- A request is intent, not the SOLD order. A different, verified Windows
-- operation may win while this intent is pending. Reject only the losing intent;
-- keep the winning evidence and all sale/money rows untouched.
-- Preserve the installed function, its permissions, locking and finish guards.
DO $install$
DECLARE source text;
 needle text:='IF q.action=''sale.confirm'' AND EXISTS(SELECT 1 FROM public.sales_confirmations WHERE order_id=q.order_id) THEN RAISE EXCEPTION ''CLOUD_LOCAL_PROOF_REQUIRED''; END IF;';
 replacement text:=$guard$IF q.action='sale.confirm' AND EXISTS(SELECT 1 FROM public.sales_confirmations WHERE order_id=q.order_id) THEN
    IF NOT EXISTS(
     SELECT 1 FROM public.sales_confirmations c
     JOIN public.sales_operations op ON op.id=c.operation_id
     WHERE c.order_id=q.order_id AND op.status='SOLD'
      AND op.payload::jsonb->>'origin'='WINDOWS'
      AND op.payload::jsonb->>'operationId'=op.id
      AND op.payload::jsonb->>'sourcePayloadHash' ~ '^[a-f0-9]{64}$'
      -- Same derivation as LOCAL keyFor: SHA256(JSON.stringify(requestKey)).
      -- Request keys allow only ASCII letters, digits, underscore and hyphen.
      AND op.request_key <> 'mobile-sale-'||encode(sha256(convert_to(to_jsonb(q.request_key)::text,'UTF8')),'hex')
    ) THEN RAISE EXCEPTION 'CLOUD_LOCAL_PROOF_REQUIRED'; END IF;
   END IF;$guard$;
BEGIN
 SELECT pg_get_functiondef('private.mc_v8_local_sales(text,text,jsonb)'::regprocedure) INTO source;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN
  RAISE EXCEPTION 'LOCAL_SALE_REJECTION_CONTRACT_CHANGED';
 END IF;
 EXECUTE replace(source,needle,replacement);
END $install$;
