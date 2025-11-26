-- Check the ACTUAL link_side values for your specific wire drop
-- Replace the wire_drop_id with yours: e6fbb06c-46e1-49db-9204-a5bf204bd072

SELECT 
    id,
    wire_drop_id,
    project_equipment_id,
    link_side,
    LENGTH(link_side) as link_side_length,
    link_side = 'room_end' as matches_room_end,
    link_side = 'head_end' as matches_head_end,
    CASE 
        WHEN link_side IS NULL THEN '❌ NULL'
        WHEN link_side = '' THEN '❌ Empty string'
        WHEN link_side = 'room_end' THEN '✅ Correct room_end'
        WHEN link_side = 'head_end' THEN '✅ Correct head_end'
        WHEN link_side LIKE 'room_end%' THEN '⚠️ room_end with extra characters'
        WHEN link_side LIKE '%room_end' THEN '⚠️ room_end with leading characters'
        ELSE '❌ Unexpected value: "' || link_side || '"'
    END as status,
    -- Show any whitespace or special characters
    encode(link_side::bytea, 'hex') as hex_value
FROM wire_drop_equipment_links
WHERE wire_drop_id = 'e6fbb06c-46e1-49db-9204-a5bf204bd072'
ORDER BY created_at;
