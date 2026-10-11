DO $fix$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('private.mc_v7_command(text,text,jsonb)'::regprocedure);
 definition:=replace(definition,'op:=gen_random_uuid()::text;payload:=','UPDATE public.sales_order_images si SET unit_cost=CASE WHEN v.cost_price>0 THEN v.cost_price ELSE NULL END FROM public.product_variants v WHERE si.order_id=id AND v.id=si.variant_id; op:=gen_random_uuid()::text;payload:=');
 EXECUTE definition;
END $fix$;
