-- Put pg_catalog first and pg_temp last for SECURITY DEFINER functions
-- that currently pin search_path to public. This prevents temporary objects
-- from shadowing trusted public relations during privileged execution.
DO $migration$
DECLARE
  r record;
  changed_count integer := 0;
BEGIN
  FOR r IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) AS signature
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proconfig @> ARRAY['search_path=public']
    ORDER BY p.proname
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path TO pg_catalog, public, pg_temp',
      r.signature
    );
    changed_count := changed_count + 1;
  END LOOP;

  RAISE NOTICE 'Hardened search_path on % SECURITY DEFINER functions', changed_count;
END;
$migration$;
