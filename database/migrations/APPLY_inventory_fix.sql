-- ============================================================
-- APPLY FIX: Decrement inventory for existing Internal Inventory POs
-- ============================================================
-- This will fix the double-counting issue for parts like "package"
-- that were already submitted via Internal Inventory POs
-- ============================================================

DO $$
DECLARE
  v_po RECORD;
  v_item RECORD;
  v_decremented INTEGER := 0;
BEGIN
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'APPLYING FIX: Decrementing inventory...';
  RAISE NOTICE '===========================================';

  FOR v_po IN
    SELECT po.id, po.po_number, po.status
    FROM purchase_orders po
    JOIN suppliers s ON po.supplier_id = s.id
    WHERE s.name = 'Internal Inventory'
      AND po.status IN ('submitted', 'confirmed', 'partially_received', 'received')
  LOOP
    RAISE NOTICE 'Processing PO: %', v_po.po_number;

    -- Decrement inventory for each line item
    FOR v_item IN
      SELECT
        poi.quantity_ordered,
        pe.global_part_id,
        pe.part_number,
        pe.name as equipment_name
      FROM purchase_order_items poi
      JOIN project_equipment pe ON poi.project_equipment_id = pe.id
      WHERE poi.po_id = v_po.id
        AND pe.global_part_id IS NOT NULL
    LOOP
      -- Decrement global inventory
      UPDATE global_parts
      SET quantity_on_hand = GREATEST(0, quantity_on_hand - v_item.quantity_ordered),
          updated_at = NOW()
      WHERE id = v_item.global_part_id;

      v_decremented := v_decremented + v_item.quantity_ordered;

      RAISE NOTICE '  Decremented % by % units',
        COALESCE(v_item.part_number, v_item.equipment_name),
        v_item.quantity_ordered;
    END LOOP;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Total units decremented: %', v_decremented;
  RAISE NOTICE '===========================================';
END $$;

-- Verify results
SELECT
  gp.part_number,
  gp.name,
  gp.quantity_on_hand
FROM global_parts gp
WHERE gp.name ILIKE '%package%'
   OR gp.part_number ILIKE '%package%'
   OR gp.quantity_on_hand > 0
ORDER BY gp.name;
