-- Check if there's a SELECT policy that's blocking the Supabase client
-- from seeing the equipment links

-- View SELECT policies specifically
SELECT 
    policyname,
    cmd as operation,
    qual as using_expression,
    roles
FROM pg_policies
WHERE tablename = 'wire_drop_equipment_links'
  AND cmd = 'SELECT';

-- If the SELECT policy is too restrictive, it prevents the JS client
-- from seeing records even though SQL Editor can see them (bypasses RLS)

-- TEMPORARY FIX: Create a permissive SELECT policy if one doesn't exist
-- Run this ONLY if the query above shows no SELECT policy or a restrictive one
/*
CREATE POLICY "Enable read access for authenticated users"
ON wire_drop_equipment_links
FOR SELECT
TO authenticated
USING (true);
*/
