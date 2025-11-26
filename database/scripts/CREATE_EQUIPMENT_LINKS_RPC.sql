-- Create RPC functions to manage equipment links SERVER-SIDE
-- This bypasses any Supabase JS client issues

-- Function 1: Delete equipment links for a wire drop
CREATE OR REPLACE FUNCTION delete_wire_drop_equipment_links(
    p_wire_drop_id UUID,
    p_link_side TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM wire_drop_equipment_links
    WHERE wire_drop_id = p_wire_drop_id
      AND link_side = p_link_side;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    RETURN v_deleted_count;
END;
$$;

-- Function 2: Set equipment links for a wire drop (delete all, then insert new)
CREATE OR REPLACE FUNCTION set_wire_drop_equipment_links(
    p_wire_drop_id UUID,
    p_link_side TEXT,
    p_equipment_ids UUID[]
)
RETURNS TABLE (
    operation TEXT,
    count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_count INTEGER;
    v_inserted_count INTEGER;
    v_equipment_id UUID;
    v_index INTEGER;
BEGIN
    -- Delete all existing links for this side
    DELETE FROM wire_drop_equipment_links
    WHERE wire_drop_id = p_wire_drop_id
      AND link_side = p_link_side;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    -- Insert new links if any provided
    v_index := 0;
    IF p_equipment_ids IS NOT NULL AND array_length(p_equipment_ids, 1) > 0 THEN
        FOREACH v_equipment_id IN ARRAY p_equipment_ids
        LOOP
            INSERT INTO wire_drop_equipment_links (
                wire_drop_id,
                project_equipment_id,
                link_side,
                sort_order
            ) VALUES (
                p_wire_drop_id,
                v_equipment_id,
                p_link_side,
                v_index
            );
            v_index := v_index + 1;
        END LOOP;
        v_inserted_count := array_length(p_equipment_ids, 1);
    ELSE
        v_inserted_count := 0;
    END IF;
    
    -- Return results
    RETURN QUERY SELECT 'deleted'::TEXT, v_deleted_count;
    RETURN QUERY SELECT 'inserted'::TEXT, v_inserted_count;
END;
$$;

-- Test the functions (optional)
-- SELECT * FROM delete_wire_drop_equipment_links('e6fbb06c-46e1-49db-9204-a5bf204bd072', 'room_end');
-- SELECT * FROM set_wire_drop_equipment_links('e6fbb06c-46e1-49db-9204-a5bf204bd072', 'room_end', ARRAY[]::UUID[]);
