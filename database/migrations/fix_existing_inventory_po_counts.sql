-- ============================================================
-- FIX EXISTING DATA: Retroactively decrement inventory for
-- already-submitted Internal Inventory POs
-- ============================================================
-- Run this AFTER running fix_inventory_po_decrement.sql
-- This will fix the double-counting issue for existing POs
-- ============================================================

-- First, let's see what Internal Inventory POs exist
DO $$
DECLARE
  v_po RECORD;
  v_item RECORD;
  v_total_to_decrement INTEGER;
BEGIN
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Checking for Internal Inventory POs to fix';
  RAISE NOTICE '===========================================';

  FOR v_po IN
    SELECT po.id, po.po_number, po.status, s.name as supplier_name
    FROM purchase_orders po
    JOIN suppliers s ON po.supplier_id = s.id
    WHERE s.name = 'Internal Inventory'
      AND po.status IN ('submitted', 'confirmed', 'partially_received', 'received')
    ORDER BY po.created_at
  LOOP
    RAISE NOTICE '';
    RAISE NOTICE 'Found Inventory PO: % (Status: %)', v_po.po_number, v_po.status;

    -- Check each line item
    FOR v_item IN
      SELECT
        poi.quantity_ordered,
        pe.part_number,
        pe.name as equipment_name,
        pe.global_part_id,
        gp.quantity_on_hand as current_on_hand
      FROM purchase_order_items poi
      JOIN project_equipment pe ON poi.project_equipment_id = pe.id
      LEFT JOIN global_parts gp ON pe.global_part_id = gp.id
      WHERE poi.po_id = v_po.id
    LOOP
      IF v_item.global_part_id IS NOT NULL THEN
        RAISE NOTICE '  - %: ordered=%, current_on_hand=%',
          COALESCE(v_item.part_number, v_item.equipment_name),
          v_item.quantity_ordered,
          v_item.current_on_hand;
      ELSE
        RAISE NOTICE '  - %: ordered=% (NO global_part linked!)',
          COALESCE(v_item.part_number, v_item.equipment_name),
          v_item.quantity_ordered;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '===========================================';
END $$;

-- ============================================================
-- ACTUAL FIX: Decrement inventory for submitted Internal Inventory POs
-- ============================================================
-- UNCOMMENT THE BLOCK BELOW TO APPLY THE FIX
-- ============================================================

/*
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
        pe.part_number
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

      RAISE NOTICE '  Decremented % by % units', v_item.part_number, v_item.quantity_ordered;
    END LOOP;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Total units decremented: %', v_decremented;
  RAISE NOTICE '===========================================';
END $$;
*/

-- ============================================================
-- VERIFICATION: Check current inventory levels
-- ============================================================
SELECT
  gp.part_number,
  gp.name,
  gp.quantity_on_hand,
  COUNT(poi.id) as in_inventory_pos,
  SUM(CASE
    WHEN s.name = 'Internal Inventory' AND po.status != 'draft'
    THEN poi.quantity_ordered
    ELSE 0
  END) as total_in_submitted_inventory_pos
FROM global_parts gp
LEFT JOIN project_equipment pe ON pe.global_part_id = gp.id
LEFT JOIN purchase_order_items poi ON poi.project_equipment_id = pe.id
LEFT JOIN purchase_orders po ON poi.po_id = po.id
LEFT JOIN suppliers s ON po.supplier_id = s.id
WHERE gp.quantity_on_hand > 0
   OR (s.name = 'Internal Inventory' AND po.status != 'draft')
GROUP BY gp.id, gp.part_number, gp.name, gp.quantity_on_hand
ORDER BY gp.part_number;
