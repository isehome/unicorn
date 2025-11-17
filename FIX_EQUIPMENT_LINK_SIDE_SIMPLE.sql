-- Simple script to fix NULL link_side values
-- (Skip constraint creation since it already exists)

-- Step 1: Check what link_side values exist RIGHT NOW
SELECT 
    link_side, 
    COUNT(*) as count,
    CASE 
        WHEN link_side IS NULL THEN '⚠️ NULL values - NEEDS FIX'
        WHEN link_side = '' THEN '⚠️ Empty string - NEEDS FIX'
        WHEN link_side = 'room_end' THEN '✅ Correct room_end'
        WHEN link_side = 'head_end' THEN '✅ Correct head_end'
        ELSE '❌ Unknown value: ' || link_side
    END as status
FROM wire_drop_equipment_links
GROUP BY link_side
ORDER BY count DESC;

-- Step 2: Preview what will be fixed
SELECT 
    wel.id,
    wel.wire_drop_id,
    wel.link_side as current_link_side,
    pe.name as equipment_name,
    pr.name as room_name,
    pr.is_headend,
    CASE 
        WHEN pr.is_headend = true THEN 'head_end'
        ELSE 'room_end'
    END as new_link_side
FROM wire_drop_equipment_links wel
LEFT JOIN project_equipment pe ON pe.id = wel.project_equipment_id
LEFT JOIN project_rooms pr ON pr.id = pe.room_id
WHERE wel.link_side IS NULL 
   OR wel.link_side = ''
   OR wel.link_side NOT IN ('room_end', 'head_end')
ORDER BY wel.created_at DESC
LIMIT 20;

-- Step 3: FIX THE DATA
-- Update NULL/empty link_side values to proper values
UPDATE wire_drop_equipment_links wel
SET link_side = CASE 
    WHEN pr.is_headend = true THEN 'head_end'
    ELSE 'room_end'
END
FROM project_equipment pe
LEFT JOIN project_rooms pr ON pr.id = pe.room_id
WHERE wel.project_equipment_id = pe.id
  AND (wel.link_side IS NULL 
       OR wel.link_side = ''
       OR wel.link_side NOT IN ('room_end', 'head_end'));

-- Step 4: Verify the fix worked
SELECT 
    link_side, 
    COUNT(*) as count,
    CASE 
        WHEN link_side IS NULL THEN '⚠️ Still NULL - PROBLEM'
        WHEN link_side = '' THEN '⚠️ Still empty - PROBLEM'
        WHEN link_side = 'room_end' THEN '✅ Correct room_end'
        WHEN link_side = 'head_end' THEN '✅ Correct head_end'
        ELSE '❌ Unknown: ' || link_side
    END as status
FROM wire_drop_equipment_links
GROUP BY link_side
ORDER BY count DESC;
