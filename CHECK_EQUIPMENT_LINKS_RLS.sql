-- Check RLS policies on wire_drop_equipment_links table

-- 1. Check if RLS is enabled
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables
WHERE tablename = 'wire_drop_equipment_links';

-- 2. View all policies on the table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'wire_drop_equipment_links'
ORDER BY cmd;

-- 3. Test if current user can delete from this table
-- This will show if there's a DELETE policy
SELECT 
    cmd as operation,
    policyname,
    CASE 
        WHEN cmd = 'DELETE' THEN '✅ DELETE policy exists'
        ELSE ''
    END as status
FROM pg_policies
WHERE tablename = 'wire_drop_equipment_links'
  AND cmd = 'DELETE';

-- 4. If no DELETE policy, create one
-- Run this ONLY if the query above returns NO results
/*
CREATE POLICY "Enable delete for authenticated users"
ON wire_drop_equipment_links
FOR DELETE
TO authenticated
USING (true);
*/

-- 5. Alternative: Check if there are any triggers that might interfere
SELECT 
    trigger_name,
    event_manipulation,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'wire_drop_equipment_links'
ORDER BY trigger_name;
