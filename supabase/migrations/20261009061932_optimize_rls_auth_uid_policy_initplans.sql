-- Supabase's RLS planner guidance: evaluate auth.uid() once per statement,
-- not once per candidate row. This is a semantics-preserving policy rewrite.
DO $$
DECLARE p record; cmd text; q text; w text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') LIKE '%auth.uid()%' OR coalesce(with_check, '') LIKE '%auth.uid()%')
  LOOP
    q := CASE WHEN p.qual IS NULL THEN NULL ELSE replace(p.qual, 'auth.uid()', '(select auth.uid())') END;
    w := CASE WHEN p.with_check IS NULL THEN NULL ELSE replace(p.with_check, 'auth.uid()', '(select auth.uid())') END;
    cmd := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    IF q IS NOT NULL THEN cmd := cmd || format(' USING (%s)', q); END IF;
    IF w IS NOT NULL THEN cmd := cmd || format(' WITH CHECK (%s)', w); END IF;
    EXECUTE cmd;
  END LOOP;
END $$;
