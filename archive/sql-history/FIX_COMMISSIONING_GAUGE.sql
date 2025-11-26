-- =====================================================
-- FIX COMMISSIONING GAUGE CALCULATION
-- =====================================================
-- Updates the materialized view to correctly calculate
-- commissioning based on wire_drop_stages completion status
-- instead of incorrectly checking for equipment in head-end rooms
-- =====================================================

-- Drop existing view
DROP MATERIALIZED VIEW IF EXISTS project_milestone_percentages CASCADE;

-- Create the updated materialized view
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

-- Prewire Orders: NEW METHOD - Count parts accounted for (on hand + ordered from submitted POs)
prewire_orders_calc AS (
  SELECT
    pe.project_id,
    -- Total parts required
    SUM(COALESCE(pe.planned_quantity, 0)) as total_parts,
    -- Parts accounted for (on hand + ordered from submitted POs)
    SUM(
      LEAST(
        COALESCE(pe.planned_quantity, 0),
        COALESCE(gp.quantity_on_hand, 0) + COALESCE(
          (
            SELECT SUM(poi.quantity_ordered)
            FROM purchase_order_items poi
            JOIN purchase_orders po ON poi.po_id = po.id
            WHERE poi.project_equipment_id = pe.id
            AND po.status IN ('submitted', 'confirmed', 'partially_received', 'received')
          ), 0
        )
      )
    ) as parts_accounted_for,
    -- Percentage
    CASE
      WHEN SUM(COALESCE(pe.planned_quantity, 0)) = 0 THEN 0
      ELSE ROUND(
        (SUM(
          LEAST(
            COALESCE(pe.planned_quantity, 0),
            COALESCE(gp.quantity_on_hand, 0) + COALESCE(
              (
                SELECT SUM(poi.quantity_ordered)
                FROM purchase_order_items poi
                JOIN purchase_orders po ON poi.po_id = po.id
                WHERE poi.project_equipment_id = pe.id
                AND po.status IN ('submitted', 'confirmed', 'partially_received', 'received')
              ), 0
            )
          )
        )::numeric / SUM(COALESCE(pe.planned_quantity, 0))::numeric) * 100
      )
    END as percentage
  FROM project_equipment pe
  JOIN global_parts gp ON pe.global_part_id = gp.id
  WHERE
    gp.required_for_prewire = true
    AND pe.equipment_type != 'Labor'
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

-- Trim Orders: NEW METHOD - Count parts accounted for (on hand + ordered from submitted POs)
trim_orders_calc AS (
  SELECT
    pe.project_id,
    -- Total parts required
    SUM(COALESCE(pe.planned_quantity, 0)) as total_parts,
    -- Parts accounted for (on hand + ordered from submitted POs)
    SUM(
      LEAST(
        COALESCE(pe.planned_quantity, 0),
        COALESCE(gp.quantity_on_hand, 0) + COALESCE(
          (
            SELECT SUM(poi.quantity_ordered)
            FROM purchase_order_items poi
            JOIN purchase_orders po ON poi.po_id = po.id
            WHERE poi.project_equipment_id = pe.id
            AND po.status IN ('submitted', 'confirmed', 'partially_received', 'received')
          ), 0
        )
      )
    ) as parts_accounted_for,
    -- Percentage
    CASE
      WHEN SUM(COALESCE(pe.planned_quantity, 0)) = 0 THEN 0
      ELSE ROUND(
        (SUM(
          LEAST(
            COALESCE(pe.planned_quantity, 0),
            COALESCE(gp.quantity_on_hand, 0) + COALESCE(
              (
                SELECT SUM(poi.quantity_ordered)
                FROM purchase_order_items poi
                JOIN purchase_orders po ON poi.po_id = po.id
                WHERE poi.project_equipment_id = pe.id
                AND po.status IN ('submitted', 'confirmed', 'partially_received', 'received')
              ), 0
            )
          )
        )::numeric / SUM(COALESCE(pe.planned_quantity, 0))::numeric) * 100
      )
    END as percentage
  FROM project_equipment pe
  JOIN global_parts gp ON pe.global_part_id = gp.id
  WHERE
    gp.required_for_prewire IS NOT TRUE
    AND pe.equipment_type != 'Labor'
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

-- Commissioning: Count wire drops with completed commission stages
commissioning_calc AS (
  SELECT
    wd.project_id,
    COUNT(*) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM wire_drop_stages wds
        WHERE wds.wire_drop_id = wd.id
        AND wds.stage_type = 'commission'
        AND wds.completed = true
      )
    ) as stages_complete,
    COUNT(*) as total_stages,
    CASE
      WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND((COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM wire_drop_stages wds
          WHERE wds.wire_drop_id = wd.id
          AND wds.stage_type = 'commission'
          AND wds.completed = true
        )
      )::numeric / COUNT(*)::numeric) * 100)
    END as percentage
  FROM wire_drops wd
  GROUP BY wd.project_id
)

-- Combine all calculations
SELECT
  p.id as project_id,
  p.name as project_name,

  -- Individual milestones
  COALESCE(pd.percentage, 0) as planning_design_percentage,

  -- NEW: Prewire Orders with parts counts
  COALESCE(po.percentage, 0) as prewire_orders_percentage,
  COALESCE(po.parts_accounted_for, 0) as prewire_orders_count,
  COALESCE(po.total_parts, 0) as prewire_orders_total,

  COALESCE(pr.percentage, 0) as prewire_receiving_percentage,
  COALESCE(pr.items_received, 0) as prewire_receiving_count,
  COALESCE(pr.total_ordered, 0) as prewire_receiving_total,

  COALESCE(ps.percentage, 0) as prewire_stages_percentage,
  COALESCE(ps.stages_complete, 0) as prewire_stages_count,
  COALESCE(ps.total_stages, 0) as prewire_stages_total,

  -- NEW: Trim Orders with parts counts
  COALESCE(tro.percentage, 0) as trim_orders_percentage,
  COALESCE(tro.parts_accounted_for, 0) as trim_orders_count,
  COALESCE(tro.total_parts, 0) as trim_orders_total,

  COALESCE(trr.percentage, 0) as trim_receiving_percentage,
  COALESCE(trr.items_received, 0) as trim_receiving_count,
  COALESCE(trr.total_ordered, 0) as trim_receiving_total,

  COALESCE(ts.percentage, 0) as trim_stages_percentage,
  COALESCE(ts.stages_complete, 0) as trim_stages_count,
  COALESCE(ts.total_stages, 0) as trim_stages_total,

  COALESCE(c.percentage, 0) as commissioning_percentage,
  COALESCE(c.stages_complete, 0) as commissioning_count,
  COALESCE(c.total_stages, 0) as commissioning_total,

  -- Rollup milestones (weighted averages)
  -- Updated weights: Orders 25% + Receiving 25% + Stages 50%
  ROUND(
    (COALESCE(po.percentage, 0) * 0.25) +
    (COALESCE(pr.percentage, 0) * 0.25) +
    (COALESCE(ps.percentage, 0) * 0.50)
  ) as prewire_phase_percentage,

  ROUND(
    (COALESCE(tro.percentage, 0) * 0.25) +
    (COALESCE(trr.percentage, 0) * 0.25) +
    (COALESCE(ts.percentage, 0) * 0.50)
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

-- Grant access to authenticated users
GRANT SELECT ON project_milestone_percentages TO authenticated;

-- Recreate the refresh function
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
-- INITIAL REFRESH
-- =====================================================
-- Run initial refresh to populate the view
SELECT refresh_milestone_percentages();

SELECT 'Commissioning gauge fixed! Now correctly checking wire_drop_stages completion status.' as status;
