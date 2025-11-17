-- Check for AFTER DELETE triggers that might be recreating data

SELECT 
    trigger_name,
    event_manipulation as trigger_event,
    action_timing,
    action_statement,
    CASE 
        WHEN action_timing = 'AFTER' AND event_manipulation = 'DELETE' 
        THEN '⚠️ This could be recreating deleted records'
        ELSE '✅ OK'
    END as potential_issue
FROM information_schema.triggers
WHERE event_object_table = 'wire_drop_equipment_links'
ORDER BY action_timing, event_manipulation;

-- Also check for any foreign key constraints with CASCADE or SET NULL
-- that might be affecting related tables
SELECT
    con.conname AS constraint_name,
    con.contype AS constraint_type,
    CASE con.contype
        WHEN 'f' THEN 'FOREIGN KEY'
        WHEN 'p' THEN 'PRIMARY KEY'
        WHEN 'u' THEN 'UNIQUE'
        WHEN 'c' THEN 'CHECK'
        ELSE con.contype::text
    END AS constraint_type_name,
    con.confupdtype AS on_update_action,
    con.confdeltype AS on_delete_action,
    CASE con.confdeltype
        WHEN 'a' THEN 'NO ACTION'
        WHEN 'r' THEN 'RESTRICT'
        WHEN 'c' THEN 'CASCADE'
        WHEN 'n' THEN 'SET NULL'
        WHEN 'd' THEN 'SET DEFAULT'
        ELSE 'UNKNOWN'
    END AS on_delete_action_name
FROM pg_constraint con
WHERE con.conrelid = 'wire_drop_equipment_links'::regclass
ORDER BY constraint_type, constraint_name;
