-- Document server-only access for tables whose existing RLS was enabled,
-- which had no policies, and which grant no direct privileges to anon/authenticated.
-- This does not grant client access; it explicitly scopes policy access to service_role.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r','p')
      AND n.nspname = 'public'
      AND c.relrowsecurity = true
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname = n.nspname AND p.tablename = c.relname
      )
      AND NOT has_table_privilege('anon', c.oid, 'select,insert,update,delete')
      AND NOT has_table_privilege('authenticated', c.oid, 'select,insert,update,delete')
  LOOP
    EXECUTE format(
      'CREATE POLICY service_role_internal_access ON %I.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      r.nspname, r.relname
    );
  END LOOP;
END $$;
