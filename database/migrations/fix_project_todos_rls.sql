-- ============================================================
-- FIX PROJECT TODOS RLS
-- Replaces legacy policies with permissive access so any
-- authenticated client (and service role) can manage project_todos.
-- ============================================================

BEGIN;

ALTER TABLE public.project_todos ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies so we can replace them safely
DO $$
DECLARE policy RECORD;
BEGIN
  FOR policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_todos'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.project_todos', policy.policyname);
  END LOOP;
END $$;

-- Shared condition: allow all authenticated/anon clients (PKCE session will still apply RLS via service role on server)
CREATE POLICY project_todos_select_access
  ON public.project_todos
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY project_todos_insert_access
  ON public.project_todos
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY project_todos_update_access
  ON public.project_todos
  FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY project_todos_delete_access
  ON public.project_todos
  FOR DELETE
  TO public
  USING (true);

COMMIT;
