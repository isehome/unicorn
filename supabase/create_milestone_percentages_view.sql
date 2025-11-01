-- =====================================================
-- MILESTONE PERCENTAGES MATERIALIZED VIEW
-- =====================================================
-- This view pre-calculates all milestone percentages for all projects
-- Replaces 10+ queries per project with a single query
--
-- Performance: 200+ queries → 1 query for dashboard
-- Refresh: Can be refreshed on-demand or scheduled
--
-- Created: 2025-01-XX
-- =====================================================

-- Drop existing view if it exists
DROP MATERIALIZED VIEW IF EXISTS project_milestone_percentages CASCADE;

-- Create the materialized view
CREATE MATERIALIZED VIEW project_milestone_percentages AS
WITH
-- Planning & Design: Check if URLs exist
planning_design_calc AS (
  SELECT
    id as project_id,
    CASE
      WHEN wiring_diagram_url IS NOT NULL AND portal_proposal_url IS NOT NULL THEN 100
      WHEN wiring_diagram_url IS NOT NULL OR portal_proposal_url IS NOT NULL THEN 50
      ELSE 0
    END as percentage
  FROM projects
),

-- Prewire Orders: Count ordered prewire items
prewire_orders_calc AS (
  SELECT
    pe.project_id,
    COUNT(*) FILTER (WHERE pe.ordered_quantity > 0) as items_ordered,
    COUNT(*) as total_items,
    CASE
      WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND((COUNT(*) FILTER (WHERE pe.ordered_quantity > 0)::numeric / COUNT(*)::numeric) * 100)
    END as percentage
  FROM project_equipment pe
  JOIN global_parts gp ON pe.global_part_id = gp.id
  WHERE
    gp.required_for_prewire = true
    AND pe.equipment_type != 'Labor'
    AND (pe.planned_quantity > 0 OR pe.ordered_quantity > 0)
  GROUP BY pe.project_id
),

-- Prewire Receiving: Count fully received prewire items
prewire_receiving_calc AS (
  SELECT
    pe.project_id,
    COUNT(*) FILTER (WHERE pe.received_quantity >= pe.ordered_quantity AND pe.ordered_quantity > 0) as items_received,
    COUNT(*) FILTER (WHERE pe.ordered_quantity > 0) as total_ordered,
    CASE
      WHEN COUNT(*) FILTER (WHERE pe.ordered_quantity > 0) = 0 THEN 0
      ELSE ROUND((COUNT(*) FILTER (WHERE pe.received_quantity >= pe.ordered_quantity AND pe.ordered_quantity > 0)::numeric /
                  COUNT(*) FILTER (WHERE pe.ordered_quantity > 0)::numeric) * 100)
    END as percentage
  FROM project_equipment pe
  JOIN global_parts gp ON pe.global_part_id = gp.id
  WHERE
    gp.required_for_prewire = true
    AND pe.equipment_type != 'Labor'
  GROUP BY pe.project_id
),

-- Prewire Stages: Count wire drops with prewire photos
prewire_stages_calc AS (
  SELECT
    wd.project_id,
    COUNT(*) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM wire_drop_stages wds
        WHERE wds.wire_drop_id = wd.id
        AND wds.stage_type = 'prewire'
        AND wds.photo_url IS NOT NULL
      )
    ) as stages_complete,
    COUNT(*) as total_stages,
    CASE
      WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND((COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM wire_drop_stages wds
          WHERE wds.wire_drop_id = wd.id
          AND wds.stage_type = 'prewire'
          AND wds.photo_url IS NOT NULL
        )
      )::numeric / COUNT(*)::numeric) * 100)
    END as percentage
  FROM wire_drops wd
  GROUP BY wd.project_id
),

-- Trim Orders: Count ordered trim items
trim_orders_calc AS (
  SELECT
    pe.project_id,
    COUNT(*) FILTER (WHERE pe.ordered_quantity > 0) as items_ordered,
    COUNT(*) as total_items,
    CASE
      WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND((COUNT(*) FILTER (WHERE pe.ordered_quantity > 0)::numeric / COUNT(*)::numeric) * 100)
    END as percentage
  FROM project_equipment pe
  JOIN global_parts gp ON pe.global_part_id = gp.id
  WHERE
    gp.required_for_prewire IS NOT TRUE
    AND pe.equipment_type != 'Labor'
    AND (pe.planned_quantity > 0 OR pe.ordered_quantity > 0)
  GROUP BY pe.project_id
),

-- Trim Receiving: Count fully received trim items
trim_receiving_calc AS (
  SELECT
    pe.project_id,
    COUNT(*) FILTER (WHERE pe.received_quantity >= pe.ordered_quantity AND pe.ordered_quantity > 0) as items_received,
    COUNT(*) FILTER (WHERE pe.ordered_quantity > 0) as total_ordered,
    CASE
      WHEN COUNT(*) FILTER (WHERE pe.ordered_quantity > 0) = 0 THEN 0
      ELSE ROUND((COUNT(*) FILTER (WHERE pe.received_quantity >= pe.ordered_quantity AND pe.ordered_quantity > 0)::numeric /
                  COUNT(*) FILTER (WHERE pe.ordered_quantity > 0)::numeric) * 100)
    END as percentage
  FROM project_equipment pe
  JOIN global_parts gp ON pe.global_part_id = gp.id
  WHERE
    gp.required_for_prewire IS NOT TRUE
    AND pe.equipment_type != 'Labor'
  GROUP BY pe.project_id
),

-- Trim Stages: Count wire drops with trim photos
trim_stages_calc AS (
  SELECT
    wd.project_id,
    COUNT(*) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM wire_drop_stages wds
        WHERE wds.wire_drop_id = wd.id
        AND wds.stage_type = 'trim_out'
        AND (wds.completed = true OR wds.photo_url IS NOT NULL)
      )
    ) as stages_complete,
    COUNT(*) as total_stages,
    CASE
      WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND((COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM wire_drop_stages wds
          WHERE wds.wire_drop_id = wd.id
          AND wds.stage_type = 'trim_out'
          AND (wds.completed = true OR wds.photo_url IS NOT NULL)
        )
      )::numeric / COUNT(*)::numeric) * 100)
    END as percentage
  FROM wire_drops wd
  GROUP BY wd.project_id
),

-- Commissioning: Check if equipment is attached to head-end rooms
commissioning_calc AS (
  SELECT
    p.id as project_id,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM project_rooms pr
        JOIN project_equipment pe ON pe.room_id = pr.id
        WHERE pr.project_id = p.id
        AND pr.is_headend = true
      )
      THEN 100
      ELSE 0
    END as percentage
  FROM projects p
)

-- Combine all calculations
SELECT
  p.id as project_id,
  p.name as project_name,

  -- Individual milestones
  COALESCE(pd.percentage, 0) as planning_design_percentage,

  COALESCE(po.percentage, 0) as prewire_orders_percentage,
  COALESCE(po.items_ordered, 0) as prewire_orders_count,
  COALESCE(po.total_items, 0) as prewire_orders_total,

  COALESCE(pr.percentage, 0) as prewire_receiving_percentage,
  COALESCE(pr.items_received, 0) as prewire_receiving_count,
  COALESCE(pr.total_ordered, 0) as prewire_receiving_total,

  COALESCE(ps.percentage, 0) as prewire_stages_percentage,
  COALESCE(ps.stages_complete, 0) as prewire_stages_count,
  COALESCE(ps.total_stages, 0) as prewire_stages_total,

  COALESCE(tro.percentage, 0) as trim_orders_percentage,
  COALESCE(tro.items_ordered, 0) as trim_orders_count,
  COALESCE(tro.total_items, 0) as trim_orders_total,

  COALESCE(trr.percentage, 0) as trim_receiving_percentage,
  COALESCE(trr.items_received, 0) as trim_receiving_count,
  COALESCE(trr.total_ordered, 0) as trim_receiving_total,

  COALESCE(ts.percentage, 0) as trim_stages_percentage,
  COALESCE(ts.stages_complete, 0) as trim_stages_count,
  COALESCE(ts.total_stages, 0) as trim_stages_total,

  COALESCE(c.percentage, 0) as commissioning_percentage,

  -- Rollup milestones (weighted averages)
  ROUND(
    (COALESCE(po.percentage, 0) * 0.25) +
    (COALESCE(pr.percentage, 0) * 0.35) +
    (COALESCE(ps.percentage, 0) * 0.40)
  ) as prewire_phase_percentage,

  ROUND(
    (COALESCE(tro.percentage, 0) * 0.25) +
    (COALESCE(trr.percentage, 0) * 0.35) +
    (COALESCE(ts.percentage, 0) * 0.40)
  ) as trim_phase_percentage,

  -- Metadata
  NOW() as last_calculated_at

FROM projects p
LEFT JOIN planning_design_calc pd ON p.id = pd.project_id
LEFT JOIN prewire_orders_calc po ON p.id = po.project_id
LEFT JOIN prewire_receiving_calc pr ON p.id = pr.project_id
LEFT JOIN prewire_stages_calc ps ON p.id = ps.project_id
LEFT JOIN trim_orders_calc tro ON p.id = tro.project_id
LEFT JOIN trim_receiving_calc trr ON p.id = trr.project_id
LEFT JOIN trim_stages_calc ts ON p.id = ts.project_id
LEFT JOIN commissioning_calc c ON p.id = c.project_id;

-- Create index for fast lookups by project_id
CREATE UNIQUE INDEX idx_milestone_percentages_project_id ON project_milestone_percentages (project_id);

-- Create index on calculated_at for cache invalidation
CREATE INDEX idx_milestone_percentages_calculated_at ON project_milestone_percentages (last_calculated_at);

-- Grant access to authenticated users (adjust as needed for your RLS policies)
GRANT SELECT ON project_milestone_percentages TO authenticated;

-- =====================================================
-- REFRESH FUNCTION
-- =====================================================
-- Function to refresh the materialized view
-- Can be called manually or scheduled via pg_cron
-- =====================================================

CREATE OR REPLACE FUNCTION refresh_milestone_percentages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY project_milestone_percentages;
  RAISE NOTICE 'Milestone percentages refreshed at %', NOW();
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION refresh_milestone_percentages() TO authenticated;

-- =====================================================
-- AUTOMATIC REFRESH TRIGGER (OPTIONAL)
-- =====================================================
-- Automatically refresh when data changes
-- NOTE: This can be expensive for high-write workloads
-- Consider using pg_cron for scheduled refresh instead
-- =====================================================

-- Function to trigger refresh
CREATE OR REPLACE FUNCTION trigger_milestone_refresh()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Queue a refresh (don't block the transaction)
  -- Using NOTIFY to trigger async refresh
  PERFORM pg_notify('milestone_refresh', NEW.project_id::text);
  RETURN NEW;
END;
$$;

-- Triggers on relevant tables (commented out by default)
-- Uncomment if you want automatic refresh on data changes

/*
-- Refresh when wire drop stages change
CREATE TRIGGER wire_drop_stages_milestone_refresh
AFTER INSERT OR UPDATE OR DELETE ON wire_drop_stages
FOR EACH ROW
EXECUTE FUNCTION trigger_milestone_refresh();

-- Refresh when equipment changes
CREATE TRIGGER project_equipment_milestone_refresh
AFTER INSERT OR UPDATE OR DELETE ON project_equipment
FOR EACH ROW
EXECUTE FUNCTION trigger_milestone_refresh();

-- Refresh when project URLs change
CREATE TRIGGER projects_milestone_refresh
AFTER UPDATE OF wiring_diagram_url, portal_proposal_url ON projects
FOR EACH ROW
EXECUTE FUNCTION trigger_milestone_refresh();

-- Refresh when project rooms change (for commissioning milestone)
CREATE TRIGGER project_rooms_milestone_refresh
AFTER INSERT OR UPDATE OR DELETE ON project_rooms
FOR EACH ROW
EXECUTE FUNCTION trigger_milestone_refresh();
*/

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

-- Get milestones for all projects
-- SELECT * FROM project_milestone_percentages;

-- Get milestones for specific project
-- SELECT * FROM project_milestone_percentages WHERE project_id = 'your-uuid-here';

-- Get milestones for multiple projects (dashboard use case)
-- SELECT * FROM project_milestone_percentages WHERE project_id = ANY(ARRAY['uuid1', 'uuid2']::uuid[]);

-- Manual refresh
-- SELECT refresh_milestone_percentages();

-- Check when last refreshed
-- SELECT MAX(last_calculated_at) as last_refresh FROM project_milestone_percentages;

-- =====================================================
-- MAINTENANCE NOTES
-- =====================================================
--
-- 1. Initial refresh: Run after creating the view
--    SELECT refresh_milestone_percentages();
--
-- 2. Scheduled refresh: Use pg_cron (if available)
--    SELECT cron.schedule('refresh-milestones', '*/5 * * * *', 'SELECT refresh_milestone_percentages()');
--    (This refreshes every 5 minutes)
--
-- 3. On-demand refresh: Call from application when data changes
--    await supabase.rpc('refresh_milestone_percentages')
--
-- 4. Monitor performance:
--    SELECT * FROM pg_stat_user_tables WHERE relname = 'project_milestone_percentages';
--
-- =====================================================
