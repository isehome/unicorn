-- Function to safely increment global inventory
-- Used when undoing PO submissions to restore allocated inventory

CREATE OR REPLACE FUNCTION increment_global_inventory(
  p_global_part_id UUID,
  p_quantity INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Safely increment the quantity_on_hand
  UPDATE global_parts
  SET quantity_on_hand = COALESCE(quantity_on_hand, 0) + p_quantity
  WHERE id = p_global_part_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Global part not found: %', p_global_part_id;
  END IF;

  RAISE NOTICE 'Restored % units to inventory for part: %', p_quantity, p_global_part_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION increment_global_inventory(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION increment_global_inventory IS 'Safely increments global inventory quantity - used for undo operations';
