-- A LOCAL mutation journal proves that a request was applied once. The owner
-- can advance the draft again before a lost upload reply is recovered. Receipt
-- acknowledgement must not require that the earlier version is still current.
DO $install$
DECLARE source text; needle text:='current_order.version=(q.payload->>''version'')::bigint+1 AND current_order.status=CASE WHEN q.action=''draft.cancel'' THEN ''CANCELLED_DRAFT'' ELSE ''DRAFT'' END'; BEGIN
 SELECT pg_get_functiondef('private.mc_v8_local_sales(text,text,jsonb)'::regprocedure) INTO source;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'LOCAL_FINAL_RECEIPT_CONTRACT_CHANGED'; END IF;
 source:=replace(source,needle,'current_order.version>=(q.payload->>''version'')::bigint+1 AND (q.action=''draft.save'' OR current_order.status=''CANCELLED_DRAFT'')');
 EXECUTE source;
END $install$;
