-- Partial source-check evidence must never look like a fully fresh stock snapshot.
DO $fix$
DECLARE target text; definition text; BEGIN
 FOREACH target IN ARRAY ARRAY['public.mc_catalog_public(text,jsonb)','public.mc_catalog_submit(text,text,jsonb,boolean)'] LOOP
  definition:=pg_get_functiondef(target::regprocedure);
  IF strpos(definition,'min(a.source_checked_at)')=0 THEN RAISE EXCEPTION 'Catalog stock timestamp patch target missing'; END IF;
  definition:=replace(definition,'min(a.source_checked_at)','CASE WHEN count(*)=count(a.source_checked_at) THEN min(a.source_checked_at) ELSE NULL END');
  EXECUTE definition;
 END LOOP;
END $fix$;
