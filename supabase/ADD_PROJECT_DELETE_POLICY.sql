-- Add DELETE policy for projects table
-- This allows authenticated users to delete projects

DO $$
BEGIN
  -- Check if DELETE policy already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
    AND tablename='projects'
    AND policyname='dev_delete_all'
  ) THEN
    CREATE POLICY dev_delete_all ON public.projects
      FOR DELETE TO anon, authenticated
      USING (true);

    RAISE NOTICE 'Created DELETE policy for projects table';
  ELSE
    RAISE NOTICE 'DELETE policy already exists for projects table';
  END IF;

  -- Also add UPDATE policy if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
    AND tablename='projects'
    AND policyname='dev_update_all'
  ) THEN
    CREATE POLICY dev_update_all ON public.projects
      FOR UPDATE TO anon, authenticated
      USING (true)
      WITH CHECK (true);

    RAISE NOTICE 'Created UPDATE policy for projects table';
  ELSE
    RAISE NOTICE 'UPDATE policy already exists for projects table';
  END IF;

  -- Also add INSERT policy if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
    AND tablename='projects'
    AND policyname='dev_insert_all'
  ) THEN
    CREATE POLICY dev_insert_all ON public.projects
      FOR INSERT TO anon, authenticated
      WITH CHECK (true);

    RAISE NOTICE 'Created INSERT policy for projects table';
  ELSE
    RAISE NOTICE 'INSERT policy already exists for projects table';
  END IF;
END $$;

-- Verify the policies were created
SELECT
  schemaname,
  tablename,
  policyname,
  cmd as operation,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'projects'
ORDER BY policyname;
