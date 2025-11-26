-- Run these queries separately to check RLS policies

-- Query 1: View all policies on wire_drop_equipment_links
SELECT 
    policyname,
    cmd as operation,
    roles,
    CASE 
        WHEN cmd = 'SELECT' THEN '📖 Read'
        WHEN cmd = 'INSERT' THEN '➕ Insert'
        WHEN cmd = 'UPDATE' THEN '✏️ Update'
        WHEN cmd = 'DELETE' THEN '🗑️ Delete'
        ELSE cmd
    END as operation_type
FROM pg_policies
WHERE tablename = 'wire_drop_equipment_links'
ORDER BY cmd;

-- Query 2: Specifically check for DELETE policy
SELECT 
    policyname,
    cmd,
    qual as using_expression,
    with_check as with_check_expression
FROM pg_policies
WHERE tablename = 'wire_drop_equipment_links'
  AND cmd = 'DELETE';
