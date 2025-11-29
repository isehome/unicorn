-- ============================================================
-- FIX: Decrement inventory when Internal Inventory PO is submitted
-- ============================================================
-- The previous trigger logic didn't work for Internal Inventory POs
-- because it calculated: min(planned - ordered, on_hand)
-- But for inventory POs, "ordered" IS the inventory allocation!
--
-- This fix:
-- 1. Detects if PO is from "Internal Inventory" supplier
-- 2. If yes: decrement global_parts.quantity_on_hand by quantity_ordered
-- 3. If no: use the original logic for external supplier POs
-- ============================================================

-- First, let's create or replace the function with fixed logic
CREATE OR REPLACE FUNCTION allocate_inventory_for_po(p_po_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_inventory_to_allocate INTEGER;
  v_is_inventory_po BOOLEAN;
  v_supplier_name TEXT;
BEGIN
  -- Check if this is an Internal Inventory PO
  SELECT s.name INTO v_supplier_name
  FROM purchase_orders po
  JOIN suppliers s ON po.supplier_id = s.id
  WHERE po.id = p_po_id;

  v_is_inventory_po := (v_supplier_name = 'Internal Inventory');

  RAISE NOTICE 'Processing PO: %, Supplier: %, Is Inventory PO: %',
    p_po_id, v_supplier_name, v_is_inventory_po;

  -- For each line item in the PO
  FOR v_item IN
    SELECT
      poi.id as line_item_id,
      poi.project_equipment_id,
      poi.quantity_ordered,
      pe.planned_quantity,
      pe.global_part_id,
      pe.part_number,
      gp.quantity_on_hand
    FROM purchase_order_items poi
    JOIN project_equipment pe ON poi.project_equipment_id = pe.id
    LEFT JOIN global_parts gp ON pe.global_part_id = gp.id
    WHERE poi.po_id = p_po_id
  LOOP
    -- Skip if no global_part linked
    IF v_item.global_part_id IS NULL THEN
      RAISE NOTICE 'Skipping item % - no global_part_id linked', v_item.part_number;
      CONTINUE;
    END IF;

    IF v_is_inventory_po THEN
      -- For Internal Inventory POs: decrement by the quantity ordered
      -- This IS the inventory we're pulling from the warehouse
      v_inventory_to_allocate := COALESCE(v_item.quantity_ordered, 0);

      RAISE NOTICE 'INVENTORY PO: Decrementing % units for part %',
        v_inventory_to_allocate, v_item.part_number;
    ELSE
      -- For external supplier POs: calculate leftover inventory to allocate
      -- Formula: min(planned - ordered, on_hand)
      -- This represents inventory that supplements the external order
      v_inventory_to_allocate := LEAST(
        GREATEST(0, COALESCE(v_item.planned_quantity, 0) - COALESCE(v_item.quantity_ordered, 0)),
        COALESCE(v_item.quantity_on_hand, 0)
      );

      RAISE NOTICE 'SUPPLIER PO: Would allocate % supplementary inventory for part %',
        v_inventory_to_allocate, v_item.part_number;
    END IF;

    -- Only proceed if there's inventory to allocate
    IF v_inventory_to_allocate > 0 THEN
      -- Decrement global inventory
      UPDATE global_parts
      SET quantity_on_hand = GREATEST(0, quantity_on_hand - v_inventory_to_allocate),
          updated_at = NOW()
      WHERE id = v_item.global_part_id;

      RAISE NOTICE 'Decremented global_parts.quantity_on_hand by % for global_part_id: %',
        v_inventory_to_allocate, v_item.global_part_id;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- The trigger function stays the same
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_allocate_inventory_on_po_submit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only allocate when PO status changes TO 'submitted' (or confirmed/received)
  -- from 'draft' status
  IF NEW.status IN ('submitted', 'confirmed', 'partially_received', 'received')
     AND (OLD.status IS NULL OR OLD.status = 'draft') THEN

    RAISE NOTICE 'Trigger fired: PO % status changed from % to %',
      NEW.po_number, OLD.status, NEW.status;

    -- Allocate/decrement inventory for this PO
    PERFORM allocate_inventory_for_po(NEW.id);

    RAISE NOTICE 'Inventory processed for PO: %', NEW.po_number;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE WARNING 'Failed to process inventory for PO %: %', NEW.po_number, SQLERRM;
    RETURN NEW;
END;
$$;

-- ============================================================
-- Recreate trigger (ensures it's using updated function)
-- ============================================================

DROP TRIGGER IF EXISTS trigger_allocate_inventory_on_submit ON purchase_orders;

CREATE TRIGGER trigger_allocate_inventory_on_submit
  AFTER UPDATE OF status ON purchase_orders
  FOR EACH ROW
  WHEN (NEW.status IN ('submitted', 'confirmed', 'partially_received', 'received')
        AND (OLD.status IS DISTINCT FROM NEW.status))
  EXECUTE FUNCTION trigger_allocate_inventory_on_po_submit();

-- ============================================================
-- Grant permissions
-- ============================================================

GRANT EXECUTE ON FUNCTION allocate_inventory_for_po(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_allocate_inventory_on_po_submit() TO authenticated;

-- ============================================================
-- Verification
-- ============================================================

DO $$
DECLARE
  v_trigger_exists BOOLEAN;
  v_function_exists BOOLEAN;
BEGIN
  -- Check trigger exists
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_allocate_inventory_on_submit'
  ) INTO v_trigger_exists;

  -- Check function exists
  SELECT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'allocate_inventory_for_po'
  ) INTO v_function_exists;

  RAISE NOTICE '================================================';
  RAISE NOTICE 'Inventory Decrement System - Installation Check';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Function exists: %', v_function_exists;
  RAISE NOTICE 'Trigger exists: %', v_trigger_exists;
  RAISE NOTICE '';
  RAISE NOTICE 'How it works:';
  RAISE NOTICE '1. When a PO status changes to "submitted"';
  RAISE NOTICE '2. Trigger fires and calls allocate_inventory_for_po()';
  RAISE NOTICE '3. For INTERNAL INVENTORY POs:';
  RAISE NOTICE '   - Decrements global_parts.quantity_on_hand by quantity_ordered';
  RAISE NOTICE '4. For EXTERNAL SUPPLIER POs:';
  RAISE NOTICE '   - Decrements supplementary inventory (planned - ordered)';
  RAISE NOTICE '================================================';
END $$;
