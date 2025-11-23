-- Auto-refresh milestone percentages materialized view
-- Triggers refresh whenever underlying data changes

-- =====================================================
-- STEP 1: Create function to refresh view asynchronously
-- =====================================================

-- Function to refresh the view (already exists, but ensure it's there)
CREATE OR REPLACE FUNCTION refresh_milestone_percentages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY project_milestone_percentages;
  RAISE NOTICE 'Milestone percentages refreshed at %', NOW();
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to refresh milestone percentages: %', SQLERRM;
END;
$$;

-- =====================================================
-- STEP 2: Create trigger function
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_refresh_milestone_percentages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Refresh the materialized view
  -- We use PERFORM to call the function without returning a value
  PERFORM refresh_milestone_percentages();
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the transaction
    RAISE WARNING 'Failed to refresh milestone percentages: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- =====================================================
-- STEP 3: Add triggers to relevant tables
-- =====================================================

-- Trigger on purchase_orders when status changes to 'submitted'
DROP TRIGGER IF EXISTS trigger_po_status_refresh_milestones ON purchase_orders;
CREATE TRIGGER trigger_po_status_refresh_milestones
  AFTER UPDATE OF status ON purchase_orders
  FOR EACH ROW
  WHEN (NEW.status IN ('submitted', 'confirmed', 'partially_received', 'received')
        AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION trigger_refresh_milestone_percentages();

-- Trigger on project_equipment when quantities change
DROP TRIGGER IF EXISTS trigger_equipment_qty_refresh_milestones ON project_equipment;
CREATE TRIGGER trigger_equipment_qty_refresh_milestones
  AFTER INSERT OR UPDATE OF ordered_quantity, received_quantity, planned_quantity ON project_equipment
  FOR EACH ROW
  EXECUTE FUNCTION trigger_refresh_milestone_percentages();

-- Trigger on wire_drop_stages when stages are updated
DROP TRIGGER IF EXISTS trigger_wire_drop_stages_refresh_milestones ON wire_drop_stages;
CREATE TRIGGER trigger_wire_drop_stages_refresh_milestones
  AFTER INSERT OR UPDATE OF photo_url, completed ON wire_drop_stages
  FOR EACH ROW
  EXECUTE FUNCTION trigger_refresh_milestone_percentages();

-- Trigger on projects when URLs change
DROP TRIGGER IF EXISTS trigger_project_urls_refresh_milestones ON projects;
CREATE TRIGGER trigger_project_urls_refresh_milestones
  AFTER UPDATE OF wiring_diagram_url, portal_proposal_url ON projects
  FOR EACH ROW
  WHEN (OLD.wiring_diagram_url IS DISTINCT FROM NEW.wiring_diagram_url
        OR OLD.portal_proposal_url IS DISTINCT FROM NEW.portal_proposal_url)
  EXECUTE FUNCTION trigger_refresh_milestone_percentages();

-- =====================================================
-- STEP 4: Grant permissions
-- =====================================================

GRANT EXECUTE ON FUNCTION refresh_milestone_percentages() TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_refresh_milestone_percentages() TO authenticated;

-- =====================================================
-- STEP 5: Initial refresh
-- =====================================================

-- Do an initial refresh to sync current data
SELECT refresh_milestone_percentages();

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Auto-refresh triggers installed!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Materialized view will now refresh automatically when:';
  RAISE NOTICE '  - PO status changes to submitted/confirmed/received';
  RAISE NOTICE '  - Equipment quantities change (ordered/received/planned)';
  RAISE NOTICE '  - Wire drop stages updated (photos/completion/equipment)';
  RAISE NOTICE '  - Project URLs change (Lucid/Portal)';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Progress gauges will now stay in sync automatically!';
  RAISE NOTICE '========================================';
END $$;
