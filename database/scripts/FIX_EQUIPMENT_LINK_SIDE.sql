-- Check for equipment links with missing or incorrect link_side values
-- This script will help identify and fix data inconsistencies

-- Step 1: Check what link_side values exist in the database
SELECT 
    link_side, 
    COUNT(*) as count,
    CASE 
        WHEN link_side IS NULL THEN 'NULL values'
        WHEN link_side = '' THEN 'Empty string'
        WHEN link_side = 'room_end' THEN 'Correct room_end'
        WHEN link_side = 'head_end' THEN 'Correct head_end'
        ELSE 'Unknown value: ' || link_side
    END as status
FROM wire_drop_equipment_links
GROUP BY link_side
ORDER BY count DESC;

-- Step 2: Check ALL wire drop equipment links to see the data
-- (Optional: Add WHERE clause to filter by specific wire_drop_id if needed)
SELECT 
    wel.id,
    wel.wire_drop_id,
    wel.project_equipment_id,
    wel.link_side,
    wel.created_at,
    pe.name as equipment_name,
    pr.name as room_name,
    pr.is_headend
FROM wire_drop_equipment_links wel
LEFT JOIN project_equipment pe ON pe.id = wel.project_equipment_id
LEFT JOIN project_rooms pr ON pr.id = pe.room_id
ORDER BY wel.created_at
LIMIT 50;  -- Showing first 50 records

-- Step 3: Fix missing link_side values
-- This will set NULL or empty link_side values to 'room_end' by default
-- unless the equipment is in a headend room
BEGIN;

-- First, show what will be updated
SELECT 
    wel.id,
    wel.wire_drop_id,
    wel.link_side as current_link_side,
    pe.name as equipment_name,
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
   OR wel.link_side NOT IN ('room_end', 'head_end');

-- Now update them
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

-- Check the results
SELECT 
    link_side, 
    COUNT(*) as count
FROM wire_drop_equipment_links
GROUP BY link_side
ORDER BY count DESC;

COMMIT;

-- Step 4: If you need to force all non-headend equipment to room_end
-- (Only run this if you're sure!)
/*
UPDATE wire_drop_equipment_links wel
SET link_side = 'room_end'
FROM project_equipment pe
LEFT JOIN project_rooms pr ON pr.id = pe.room_id
WHERE wel.project_equipment_id = pe.id
  AND (pr.is_headend IS NULL OR pr.is_headend = false)
  AND wel.link_side != 'room_end';
*/

-- Step 5: Ensure all future inserts have a link_side value
-- Add a check constraint to prevent NULL or invalid values
ALTER TABLE wire_drop_equipment_links 
ADD CONSTRAINT check_link_side 
CHECK (link_side IN ('room_end', 'head_end'));

-- Note: If the constraint fails, it means there are still invalid values
-- You'll need to fix them first using the UPDATE queries above
