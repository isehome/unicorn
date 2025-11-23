-- Allocate inventory when PO is submitted
-- When a PO is submitted, inventory that was counted in the PO calculation
-- should be allocated to the project and decremented from global inventory

-- =====================================================
-- Function to allocate inventory for a PO
-- =====================================================

CREATE OR REPLACE FUNCTION allocate_inventory_for_po(p_po_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_inventory_to_allocate INTEGER;
  v_current_on_hand INTEGER;
BEGIN
  -- For each line item in the PO
  FOR v_item IN
    SELECT
      poi.project_equipment_id,
      poi.quantity_ordered,
      pe.planned_quantity,
      pe.global_part_id,
      gp.quantity_on_hand
    FROM purchase_order_items poi
    JOIN project_equipment pe ON poi.project_equipment_id = pe.id
    JOIN global_parts gp ON pe.global_part_id = gp.id
    WHERE poi.po_id = p_po_id
  LOOP
    -- Calculate how much inventory should be allocated to this project
    -- Formula: min(planned_quantity - quantity_ordered, current_on_hand)
    -- This represents the inventory that was "counted" when calculating the PO
    v_inventory_to_allocate := LEAST(
      GREATEST(0, COALESCE(v_item.planned_quantity, 0) - COALESCE(v_item.quantity_ordered, 0)),
      COALESCE(v_item.quantity_on_hand, 0)
    );

    -- Only proceed if there's inventory to allocate
    IF v_inventory_to_allocate > 0 THEN
      -- Decrement global inventory (allocate to this project)
      UPDATE global_parts
      SET quantity_on_hand = GREATEST(0, quantity_on_hand - v_inventory_to_allocate)
      WHERE id = v_item.global_part_id;

      RAISE NOTICE 'Allocated % units from inventory for equipment_id: %',
        v_inventory_to_allocate, v_item.project_equipment_id;
    END IF;
  END LOOP;
END;
$$;

-- =====================================================
-- Trigger to auto-allocate inventory when PO is submitted
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_allocate_inventory_on_po_submit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only allocate when PO status changes TO 'submitted' (or confirmed/received)
  IF NEW.status IN ('submitted', 'confirmed', 'partially_received', 'received')
     AND (OLD.status IS NULL OR OLD.status = 'draft') THEN

    -- Allocate inventory for this PO
    PERFORM allocate_inventory_for_po(NEW.id);

    RAISE NOTICE 'Inventory allocated for PO: %', NEW.po_number;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE WARNING 'Failed to allocate inventory for PO %: %', NEW.po_number, SQLERRM;
    RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_allocate_inventory_on_submit ON purchase_orders;

-- Create trigger on purchase_orders
CREATE TRIGGER trigger_allocate_inventory_on_submit
  AFTER UPDATE OF status ON purchase_orders
  FOR EACH ROW
  WHEN (NEW.status IN ('submitted', 'confirmed', 'partially_received', 'received')
        AND (OLD.status IS DISTINCT FROM NEW.status))
  EXECUTE FUNCTION trigger_allocate_inventory_on_po_submit();

-- =====================================================
-- Grant permissions
-- =====================================================

GRANT EXECUTE ON FUNCTION allocate_inventory_for_po(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_allocate_inventory_on_po_submit() TO authenticated;

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Inventory allocation system installed!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'When a PO is submitted:';
  RAISE NOTICE '  1. Calculate inventory used in PO calculation';
  RAISE NOTICE '  2. Decrement global_parts.quantity_on_hand';
  RAISE NOTICE '  3. Inventory is now allocated to the project';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Example: Need 10, have 3, order 7';
  RAISE NOTICE '  - PO submitted: inventory drops from 3 to 0';
  RAISE NOTICE '  - Project effectively has 3 + 7 ordered = 10';
  RAISE NOTICE '========================================';
END $$;
