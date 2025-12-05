-- Function to safely decrement global inventory
-- Used when submitting Internal Inventory POs to allocate stock to projects

CREATE OR REPLACE FUNCTION decrement_global_inventory(
  p_global_part_id UUID,
  p_quantity INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_qty INTEGER;
BEGIN
  -- Get current quantity
  SELECT quantity_on_hand INTO v_current_qty
  FROM global_parts
  WHERE id = p_global_part_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Global part not found: %', p_global_part_id;
  END IF;

  -- Prevent negative inventory
  IF COALESCE(v_current_qty, 0) < p_quantity THEN
    RAISE WARNING 'Insufficient inventory for part %: has %, requested %',
      p_global_part_id, COALESCE(v_current_qty, 0), p_quantity;
    -- Still allow the decrement but floor at 0
    UPDATE global_parts
    SET quantity_on_hand = 0
    WHERE id = p_global_part_id;
  ELSE
    -- Safely decrement the quantity_on_hand
    UPDATE global_parts
    SET quantity_on_hand = COALESCE(quantity_on_hand, 0) - p_quantity
    WHERE id = p_global_part_id;
  END IF;

  RAISE NOTICE 'Decremented % units from inventory for part: %', p_quantity, p_global_part_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION decrement_global_inventory(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION decrement_global_inventory IS 'Safely decrements global inventory quantity - used when submitting Internal Inventory POs';
