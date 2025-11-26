-- Fix check_milestone_completion function to handle inspection milestones and add ELSE clause
-- This addresses the "CASE statement is missing ELSE part" error

CREATE OR REPLACE FUNCTION check_milestone_completion(
  p_project_id UUID,
  p_milestone_type TEXT
) RETURNS JSONB AS $$
DECLARE
  result JSONB;
  is_complete BOOLEAN := false;
  completion_percent INTEGER := 0;
  details JSONB := '{}'::jsonb;
BEGIN
  CASE p_milestone_type
    -- Planning & Design: Check for wiring diagram and portal URLs
    WHEN 'planning_design' THEN
      SELECT
        CASE
          WHEN wiring_diagram_url IS NOT NULL AND portal_proposal_url IS NOT NULL THEN true
          ELSE false
        END,
        CASE
          WHEN wiring_diagram_url IS NOT NULL AND portal_proposal_url IS NOT NULL THEN 100
          WHEN wiring_diagram_url IS NOT NULL OR portal_proposal_url IS NOT NULL THEN 50
          ELSE 0
        END,
        jsonb_build_object(
          'wiring_diagram', wiring_diagram_url IS NOT NULL,
          'portal_proposal', portal_proposal_url IS NOT NULL
        )
      INTO is_complete, completion_percent, details
      FROM projects WHERE id = p_project_id;

    -- Prewire Prep: All prewire items ordered AND received
    WHEN 'prewire_prep' THEN
      WITH prewire_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE gp.required_for_prewire = true) as total,
          COUNT(*) FILTER (WHERE gp.required_for_prewire = true AND pe.ordered_confirmed = true) as ordered,
          COUNT(*) FILTER (WHERE gp.required_for_prewire = true AND pe.onsite_confirmed = true) as received
        FROM project_equipment pe
        JOIN global_parts gp ON pe.global_part_id = gp.id
        WHERE pe.project_id = p_project_id
      )
      SELECT
        CASE WHEN total > 0 AND ordered = total AND received = total THEN true ELSE false END,
        CASE
          WHEN total = 0 THEN 0
          WHEN received = total THEN 100
          WHEN ordered = total THEN 75
          WHEN ordered > 0 THEN ROUND((ordered::numeric / total * 50)::numeric, 0)
          ELSE 0
        END,
        jsonb_build_object(
          'total_items', total,
          'ordered', ordered,
          'received', received,
          'all_ordered', ordered = total AND total > 0,
          'all_received', received = total AND total > 0
        )
      INTO is_complete, completion_percent, details
      FROM prewire_stats;

    -- Prewire: Check for prewire stage photos
    WHEN 'prewire' THEN
      WITH prewire_photo_stats AS (
        SELECT
          COUNT(DISTINCT wd.id) as total_drops,
          COUNT(DISTINCT CASE WHEN wds.photo_url IS NOT NULL THEN wd.id END) as drops_with_photos
        FROM wire_drops wd
        LEFT JOIN wire_drop_stages wds ON wd.id = wds.wire_drop_id AND wds.stage_type = 'prewire'
        WHERE wd.project_id = p_project_id
      )
      SELECT
        CASE WHEN drops_with_photos > 0 THEN true ELSE false END,
        CASE
          WHEN total_drops = 0 THEN 0
          ELSE ROUND((drops_with_photos::numeric / total_drops * 100)::numeric, 0)
        END,
        jsonb_build_object(
          'total_drops', total_drops,
          'drops_with_photos', drops_with_photos,
          'has_photos', drops_with_photos > 0
        )
      INTO is_complete, completion_percent, details
      FROM prewire_photo_stats;

    -- Rough-In Inspection: Check if marked complete in permits
    WHEN 'rough_in_inspection' THEN
      SELECT
        COALESCE(bool_or(rough_in_completed), false),
        CASE WHEN bool_or(rough_in_completed) THEN 100 ELSE 0 END,
        jsonb_build_object(
          'inspection_completed', bool_or(rough_in_completed),
          'inspection_count', COUNT(*)
        )
      INTO is_complete, completion_percent, details
      FROM project_permits
      WHERE project_id = p_project_id;

    -- Trim Prep: All non-prewire items ordered AND received
    WHEN 'trim_prep' THEN
      WITH trim_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE gp.required_for_prewire != true OR gp.required_for_prewire IS NULL) as total,
          COUNT(*) FILTER (WHERE (gp.required_for_prewire != true OR gp.required_for_prewire IS NULL) AND pe.ordered_confirmed = true) as ordered,
          COUNT(*) FILTER (WHERE (gp.required_for_prewire != true OR gp.required_for_prewire IS NULL) AND pe.onsite_confirmed = true) as received
        FROM project_equipment pe
        JOIN global_parts gp ON pe.global_part_id = gp.id
        WHERE pe.project_id = p_project_id
      )
      SELECT
        CASE WHEN total > 0 AND ordered = total AND received = total THEN true ELSE false END,
        CASE
          WHEN total = 0 THEN 0
          WHEN received = total THEN 100
          WHEN ordered = total THEN 75
          WHEN ordered > 0 THEN ROUND((ordered::numeric / total * 50)::numeric, 0)
          ELSE 0
        END,
        jsonb_build_object(
          'total_items', total,
          'ordered', ordered,
          'received', received,
          'all_ordered', ordered = total AND total > 0,
          'all_received', received = total AND total > 0
        )
      INTO is_complete, completion_percent, details
      FROM trim_stats;

    -- Trim: Check for trim photos AND room equipment
    WHEN 'trim' THEN
      WITH trim_stats AS (
        SELECT
          (SELECT COUNT(*) > 0 FROM wire_drop_stages wds
           JOIN wire_drops wd ON wds.wire_drop_id = wd.id
           WHERE wd.project_id = p_project_id
           AND wds.stage_type = 'trim_out'
           AND wds.photo_url IS NOT NULL) as has_photos,
          (SELECT COUNT(*) > 0 FROM wire_drop_room_end wdre
           JOIN wire_drops wd ON wdre.wire_drop_id = wd.id
           WHERE wd.project_id = p_project_id) as has_room_equipment
      )
      SELECT
        has_photos AND has_room_equipment,
        CASE
          WHEN has_photos AND has_room_equipment THEN 100
          WHEN has_photos OR has_room_equipment THEN 50
          ELSE 0
        END,
        jsonb_build_object(
          'has_trim_photos', has_photos,
          'has_room_equipment', has_room_equipment
        )
      INTO is_complete, completion_percent, details
      FROM trim_stats;

    -- Final Inspection: Check if marked complete in permits
    WHEN 'final_inspection' THEN
      SELECT
        COALESCE(bool_or(final_completed), false),
        CASE WHEN bool_or(final_completed) THEN 100 ELSE 0 END,
        jsonb_build_object(
          'inspection_completed', bool_or(final_completed),
          'inspection_count', COUNT(*)
        )
      INTO is_complete, completion_percent, details
      FROM project_permits
      WHERE project_id = p_project_id;

    -- Commissioning: Check for head-end equipment
    WHEN 'commissioning' THEN
      SELECT
        COUNT(*) > 0,
        CASE WHEN COUNT(*) > 0 THEN 100 ELSE 0 END,
        jsonb_build_object(
          'head_end_count', COUNT(*),
          'has_head_end', COUNT(*) > 0
        )
      INTO is_complete, completion_percent, details
      FROM wire_drop_head_end wdhe
      JOIN wire_drops wd ON wdhe.wire_drop_id = wd.id
      WHERE wd.project_id = p_project_id;

    -- Handoff/Training: Manual only
    WHEN 'handoff_training' THEN
      SELECT
        COALESCE(completed_manually, false),
        CASE WHEN completed_manually THEN 100 ELSE 0 END,
        jsonb_build_object('manual_only', true)
      INTO is_complete, completion_percent, details
      FROM project_milestones
      WHERE project_id = p_project_id AND milestone_type = p_milestone_type;

      -- Default to not complete if no record exists
      IF is_complete IS NULL THEN
        is_complete := false;
        completion_percent := 0;
        details := jsonb_build_object('manual_only', true);
      END IF;

    -- ELSE clause for unknown milestone types
    ELSE
      is_complete := false;
      completion_percent := 0;
      details := jsonb_build_object(
        'error', 'Unknown milestone type',
        'milestone_type', p_milestone_type
      );
  END CASE;

  result := jsonb_build_object(
    'is_complete', is_complete,
    'percent_complete', completion_percent,
    'details', details,
    'checked_at', NOW()
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ check_milestone_completion function updated successfully';
  RAISE NOTICE 'Added support for:';
  RAISE NOTICE '  - rough_in_inspection milestone';
  RAISE NOTICE '  - final_inspection milestone';
  RAISE NOTICE '  - ELSE clause for unknown types';
END $$;
