DO $fix$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('private.mc_v7_command(text,text,jsonb)'::regprocedure);
 definition:=replace(definition, 'ELSIF NOT FOUND THEN RAISE EXCEPTION ''CLOUD_ORDER_MISSING''; END IF;', 'ELSIF NOT FOUND THEN RAISE EXCEPTION ''CLOUD_ORDER_MISSING''; ELSIF p_action=''draft.save'' AND COALESCE((p_payload->>''version'')::bigint,0)=0 THEN RAISE EXCEPTION ''CLOUD_VERSION_CONFLICT''; END IF;');
 EXECUTE definition;
END $fix$;
