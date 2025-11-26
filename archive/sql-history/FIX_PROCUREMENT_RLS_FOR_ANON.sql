-- ============================================================
-- TEMPORARY: Allow anon role to write to procurement tables
-- This is needed until Azure auth is properly integrated
-- TODO: Remove this and use authenticated role in production
-- ============================================================

-- Purchase Orders: Allow anon to insert/update/delete
DROP POLICY IF EXISTS purchase_orders_anon_write ON public.purchase_orders;
CREATE POLICY purchase_orders_anon_write ON public.purchase_orders
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

-- Purchase Order Items: Allow anon to insert/update/delete
DROP POLICY IF EXISTS po_items_anon_write ON public.purchase_order_items;
CREATE POLICY po_items_anon_write ON public.purchase_order_items
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

-- PO Sequence: Allow anon to update sequence numbers
DROP POLICY IF EXISTS po_sequence_anon_write ON public.po_sequence;
CREATE POLICY po_sequence_anon_write ON public.po_sequence
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

-- Shipment Tracking: Allow anon to insert/update
DROP POLICY IF EXISTS shipment_tracking_anon_write ON public.shipment_tracking;
CREATE POLICY shipment_tracking_anon_write ON public.shipment_tracking
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

-- Verify policies were created
SELECT
  schemaname,
  tablename,
  policyname,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('purchase_orders', 'purchase_order_items', 'po_sequence', 'shipment_tracking')
  AND 'anon' = ANY(roles)
ORDER BY tablename, policyname;
