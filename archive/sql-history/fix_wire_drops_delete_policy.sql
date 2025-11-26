-- Fix wire_drops delete functionality by adding missing DELETE policy

-- Add DELETE policy for wire_drops table
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
    AND tablename='wire_drops' 
    AND policyname='dev_delete_all'
  ) THEN
    CREATE POLICY dev_delete_all ON public.wire_drops
      FOR DELETE TO authenticated USING (true);
  END IF;
END $$;
