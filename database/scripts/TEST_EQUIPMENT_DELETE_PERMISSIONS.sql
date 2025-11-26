-- Test Equipment Delete Permissions
-- Run this after running FIX_EQUIPMENT_LINKS_DELETE.sql

-- 1. Check if RLS is enabled on the table
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename = 'wire_drop_equipment_links';

-- 2. List all policies on the table
SELECT 
    pol.polname as policy_name,
    pol.polcmd as command,
    pol.polpermissive as permissive,
    rol.rolname as role,
    pol.polqual::text as using_expression,
    pol.polwithcheck::text as with_check_expression
FROM pg_policy pol
JOIN pg_class cls ON pol.polrelid = cls.oid
LEFT JOIN pg_roles rol ON pol.polroles @> ARRAY[rol.oid]
WHERE cls.relname = 'wire_drop_equipment_links'
ORDER BY pol.polname;

-- 3. Test: Find some existing equipment links (replace project_id with your actual project ID)
SELECT 
    wdel.id,
    wdel.wire_drop_id,
    wdel.project_equipment_id,
    wdel.link_side,
    wd.drop_name,
    pe.name as equipment_name
FROM wire_drop_equipment_links wdel
JOIN wire_drops wd ON wd.id = wdel.wire_drop_id
JOIN project_equipment pe ON pe.id = wdel.project_equipment_id
WHERE wd.project_id IS NOT NULL
LIMIT 5;

-- 4. Test deletion (uncomment and replace with actual IDs from query above)
-- This should work if policies are correct:
/*
DELETE FROM wire_drop_equipment_links 
WHERE id = 'YOUR-LINK-ID-HERE'
RETURNING *;
*/

-- 5. Alternative: Delete by wire_drop_id and link_side (what the app tries to do)
-- Replace with actual wire_drop_id from your data
/*
DELETE FROM wire_drop_equipment_links 
WHERE wire_drop_id = 'YOUR-WIRE-DROP-ID' 
AND link_side = 'room_end'
RETURNING *;
*/

-- 6. Check current user permissions
SELECT current_user, session_user;

-- 7. Check if you're authenticated (should show your user ID)
SELECT auth.uid() as authenticated_user_id;

-- If DELETE still fails after running FIX_EQUIPMENT_LINKS_DELETE.sql, 
-- try this more permissive policy (TEMPORARY - for testing only):
/*
DROP POLICY IF EXISTS "Users can delete wire drop equipment links" ON wire_drop_equipment_links;
CREATE POLICY "Allow all authenticated users to delete links"
ON wire_drop_equipment_links
FOR DELETE
TO authenticated
USING (true);
*/
