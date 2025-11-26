-- ============================================================
-- RESET ORDERED QUANTITIES FOR EQUIPMENT
-- Use this if POs were deleted and equipment is stuck with ordered_quantity > 0
-- ============================================================

-- Option 1: Reset ALL ordered quantities to 0 (CAREFUL!)
-- Uncomment this if you want to reset everything
-- UPDATE public.project_equipment
-- SET ordered_quantity = 0
-- WHERE ordered_quantity > 0;

-- Option 2: Reset only equipment that has ordered_quantity but no active PO
-- This is safer - only resets "orphaned" ordered quantities
UPDATE public.project_equipment
SET ordered_quantity = 0
WHERE id IN (
  SELECT DISTINCT pe.id
  FROM public.project_equipment pe
  LEFT JOIN public.purchase_order_items poi ON pe.id = poi.project_equipment_id
  LEFT JOIN public.purchase_orders po ON poi.po_id = po.id
  WHERE pe.ordered_quantity > 0
    AND (po.id IS NULL OR po.status = 'cancelled')
);

-- Option 3: Recalculate ordered_quantity from active POs
-- This ensures ordered_quantity matches what's actually in active POs
UPDATE public.project_equipment
SET ordered_quantity = COALESCE(
  (
    SELECT SUM(poi.quantity_ordered)
    FROM public.purchase_order_items poi
    JOIN public.purchase_orders po ON poi.po_id = po.id
    WHERE poi.project_equipment_id = project_equipment.id
      AND po.status IN ('draft', 'submitted', 'confirmed', 'partially_received')
  ),
  0
);

-- Verify the changes
SELECT
  pe.id,
  pe.name,
  pe.part_number,
  pe.planned_quantity,
  pe.ordered_quantity,
  pe.received_quantity,
  COUNT(poi.id) as active_po_items
FROM public.project_equipment pe
LEFT JOIN public.purchase_order_items poi ON pe.id = poi.project_equipment_id
LEFT JOIN public.purchase_orders po ON poi.po_id = po.id AND po.status IN ('draft', 'submitted', 'confirmed')
WHERE pe.ordered_quantity > 0
GROUP BY pe.id, pe.name, pe.part_number, pe.planned_quantity, pe.ordered_quantity, pe.received_quantity
ORDER BY pe.name;
