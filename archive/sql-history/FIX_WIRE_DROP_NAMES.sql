-- Fix Wire Drop Names - Update single-letter or missing drop names
-- This script regenerates drop names using the format: "Room Name Drop Type #"

-- First, let's see what we're dealing with
SELECT 
    wd.id,
    wd.project_id,
    wd.drop_name,
    wd.room_name,
    wd.drop_type,
    wd.wire_type,
    LENGTH(wd.drop_name) as name_length,
    CASE 
        WHEN wd.drop_name IS NULL THEN 'NULL'
        WHEN LENGTH(wd.drop_name) = 1 THEN 'SINGLE_LETTER'
        WHEN wd.drop_name ~ '^[A-Z]$' THEN 'SINGLE_LETTER_UPPER'
        ELSE 'OK'
    END as name_status
FROM wire_drops wd
WHERE wd.drop_name IS NULL 
   OR LENGTH(wd.drop_name) <= 1
   OR wd.drop_name ~ '^[A-Z]$'
ORDER BY wd.project_id, wd.room_name, wd.drop_type;

-- Create a function to generate proper drop names
CREATE OR REPLACE FUNCTION generate_drop_name(
    p_project_id UUID,
    p_room_name TEXT,
    p_drop_type TEXT
) RETURNS TEXT AS $$
DECLARE
    v_base_name TEXT;
    v_next_number INTEGER;
    v_final_name TEXT;
BEGIN
    -- Handle null inputs
    IF p_room_name IS NULL OR p_drop_type IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Create base name
    v_base_name := p_room_name || ' ' || p_drop_type;
    
    -- Find the highest existing number for this room/type combination
    SELECT COALESCE(MAX(
        CASE 
            WHEN drop_name ~ (regexp_quote(v_base_name) || ' \d+$') THEN
                CAST(regexp_replace(drop_name, '^.*\s(\d+)$', '\1') AS INTEGER)
            ELSE 0
        END
    ), 0) + 1
    INTO v_next_number
    FROM wire_drops
    WHERE project_id = p_project_id
      AND room_name = p_room_name
      AND drop_type = p_drop_type
      AND drop_name IS NOT NULL
      AND drop_name != '';
    
    -- Generate the final name
    v_final_name := v_base_name || ' ' || v_next_number;
    
    RETURN v_final_name;
END;
$$ LANGUAGE plpgsql;

-- Update wire drops with single-letter names or null names
DO $$
DECLARE
    r RECORD;
    v_new_name TEXT;
    v_update_count INTEGER := 0;
BEGIN
    -- Process each wire drop that needs fixing
    FOR r IN 
        SELECT 
            wd.id,
            wd.project_id,
            wd.room_name,
            wd.drop_type,
            wd.drop_name,
            ROW_NUMBER() OVER (
                PARTITION BY wd.project_id, wd.room_name, wd.drop_type 
                ORDER BY wd.created_at
            ) as drop_number
        FROM wire_drops wd
        WHERE (wd.drop_name IS NULL 
           OR LENGTH(wd.drop_name) <= 2  -- Changed to catch "IP" as well
           OR wd.drop_name ~ '^[A-Z]{1,2}$'  -- Catches single or double letter entries
           OR wd.drop_name = wd.drop_type)  -- Catches when name is just the type
           AND wd.room_name IS NOT NULL 
           AND wd.drop_type IS NOT NULL
        ORDER BY wd.project_id, wd.room_name, wd.drop_type, wd.created_at
    LOOP
        -- Generate the new name
        v_new_name := r.room_name || ' ' || r.drop_type || ' ' || r.drop_number;
        
        -- Update the wire drop
        UPDATE wire_drops 
        SET drop_name = v_new_name,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = r.id;
        
        v_update_count := v_update_count + 1;
        
        RAISE NOTICE 'Updated wire drop % from "%" to "%"', r.id, r.drop_name, v_new_name;
    END LOOP;
    
    RAISE NOTICE 'Total wire drops updated: %', v_update_count;
END $$;

-- Also ensure the name column is synced with drop_name
UPDATE wire_drops 
SET name = drop_name 
WHERE name != drop_name OR (name IS NULL AND drop_name IS NOT NULL);

-- Verify the results
SELECT 
    wd.id,
    wd.project_id,
    wd.drop_name,
    wd.room_name,
    wd.drop_type,
    wd.wire_type
FROM wire_drops wd
ORDER BY wd.project_id, wd.room_name, wd.drop_type, wd.drop_name;

-- Clean up the function
DROP FUNCTION IF EXISTS generate_drop_name(UUID, TEXT, TEXT);
