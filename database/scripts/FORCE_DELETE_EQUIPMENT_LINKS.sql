-- DIRECT SQL DELETE to bypass Supabase client issues
-- This will delete ALL equipment links for wire drop: e6fbb06c-46e1-49db-9204-a5bf204bd072

-- Step 1: Confirm what will be deleted
SELECT 
    id,
    project_equipment_id,
    link_side,
    'Will be deleted' as action
FROM wire_drop_equipment_links
WHERE wire_drop_id = 'e6fbb06c-46e1-49db-9204-a5bf204bd072'
  AND link_side = 'room_end';

-- Step 2: DELETE them directly
DELETE FROM wire_drop_equipment_links
WHERE wire_drop_id = 'e6fbb06c-46e1-49db-9204-a5bf204bd072'
  AND link_side = 'room_end';

-- Step 3: Verify they're gone
SELECT 
    COUNT(*) as remaining_links,
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ All links deleted successfully'
        ELSE '❌ Links still remain'
    END as status
FROM wire_drop_equipment_links
WHERE wire_drop_id = 'e6fbb06c-46e1-49db-9204-a5bf204bd072'
  AND link_side = 'room_end';
