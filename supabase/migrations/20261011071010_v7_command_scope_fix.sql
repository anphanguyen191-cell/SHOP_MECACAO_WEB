DO $fix$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('private.mc_v7_command(text,text,jsonb)'::regprocedure);
  definition := replace(definition, 'mc_v7_command.', '');
  EXECUTE definition;
END $fix$;
