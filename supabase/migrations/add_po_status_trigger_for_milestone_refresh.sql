-- Add trigger to refresh milestone percentages when PO status changes
-- This ensures the materialized view updates when POs are submitted/undone

-- The trigger function already exists from auto_refresh_milestone_view.sql
-- We just need to add a new trigger on purchase_orders table

DROP TRIGGER IF EXISTS trigger_po_status_refresh_milestones ON purchase_orders;
CREATE TRIGGER trigger_po_status_refresh_milestones
  AFTER INSERT OR UPDATE OF status ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_refresh_milestone_percentages();

COMMENT ON TRIGGER trigger_po_status_refresh_milestones ON purchase_orders IS
  'Refresh milestone percentages when PO status changes (submit/undo)';
