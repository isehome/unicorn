-- IMMEDIATE FIX FOR WIRE DROP DELETE
-- Run this ENTIRE script in Supabase SQL Editor NOW

-- 1. Enable RLS (required for policies to work)
ALTER TABLE public.wire_drops ENABLE ROW LEVEL SECURITY;

-- 2. Drop ALL existing DELETE policies to avoid conflicts
DO $$ 
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE tablename = 'wire_drops' 
    AND cmd = 'DELETE'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.wire_drops', policy_record.policyname);
  END LOOP;
END $$;

-- 3. Create a PERMISSIVE DELETE policy
CREATE POLICY "allow_delete" ON public.wire_drops
FOR DELETE 
TO authenticated, anon 
USING (true);

-- 4. Verify the policy was created
SELECT 
  'DELETE POLICY CREATED: ' || policyname as status,
  cmd,
  roles::text as for_roles
FROM pg_policies 
WHERE tablename = 'wire_drops' 
AND cmd = 'DELETE';

-- 5. IMPORTANT: Also ensure CASCADE delete works
ALTER TABLE public.wire_drop_stages 
  DROP CONSTRAINT IF EXISTS wire_drop_stages_wire_drop_id_fkey;

ALTER TABLE public.wire_drop_stages 
  ADD CONSTRAINT wire_drop_stages_wire_drop_id_fkey 
  FOREIGN KEY (wire_drop_id) 
  REFERENCES public.wire_drops(id) 
  ON DELETE CASCADE;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ DELETE POLICY APPLIED - Wire drops can now be deleted!';
END $$;
