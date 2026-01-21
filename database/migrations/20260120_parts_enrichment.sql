-- Parts Enrichment AI Agent - Database Schema
-- This migration adds fields for AI-powered parts enrichment and human review workflow

-- =====================================================
-- TECHNICAL SPECIFICATION FIELDS
-- =====================================================

-- Network device ports
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS total_ports integer;
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS poe_ports integer;
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS poe_port_list text; -- e.g., "1-8, 17-24"

-- UPS outlets
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS ups_battery_outlets integer;
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS ups_surge_only_outlets integer;

-- User guide URLs (separate from install manuals)
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS user_guide_urls text[];

-- =====================================================
-- AI ENRICHMENT TRACKING FIELDS
-- =====================================================

-- Status: pending, processing, needs_review, approved, rejected, edited, error
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS ai_enrichment_status text DEFAULT 'pending';

-- Full AI response data for review
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS ai_enrichment_data jsonb;

-- Notes from AI about what it found/couldn't find
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS ai_enrichment_notes text;

-- When was enrichment last attempted
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS ai_last_enriched_at timestamptz;

-- AI confidence score (0.0 - 1.0)
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS ai_enrichment_confidence numeric(3,2);

-- Human feedback history for learning
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS human_feedback jsonb DEFAULT '[]'::jsonb;

-- =====================================================
-- INDEXES
-- =====================================================

-- Index for finding parts that need AI enrichment
CREATE INDEX IF NOT EXISTS idx_parts_ai_status ON global_parts(ai_enrichment_status);

-- Index for finding parts that need human review
CREATE INDEX IF NOT EXISTS idx_parts_ai_needs_review ON global_parts(ai_enrichment_status)
  WHERE ai_enrichment_status = 'needs_review';

-- =====================================================
-- RPC FUNCTIONS
-- =====================================================

-- Function to get parts pending enrichment
CREATE OR REPLACE FUNCTION get_parts_pending_enrichment(p_limit integer DEFAULT 10)
RETURNS SETOF global_parts AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM global_parts
  WHERE (ai_enrichment_status = 'pending' OR ai_enrichment_status IS NULL)
    AND (part_number IS NOT NULL OR name IS NOT NULL)  -- Must have something to search
  ORDER BY
    CASE WHEN needs_review = true THEN 0 ELSE 1 END,  -- Prioritize new parts
    created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get count of parts needing AI review
CREATE OR REPLACE FUNCTION get_ai_review_count()
RETURNS integer AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM global_parts
  WHERE ai_enrichment_status = 'needs_review';

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to save enrichment results
CREATE OR REPLACE FUNCTION save_parts_enrichment(
  p_part_id uuid,
  p_enrichment_data jsonb,
  p_confidence numeric,
  p_notes text
) RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
BEGIN
  UPDATE global_parts SET
    ai_enrichment_data = p_enrichment_data,
    ai_enrichment_status = 'needs_review',
    ai_enrichment_confidence = p_confidence,
    ai_enrichment_notes = p_notes,
    ai_last_enriched_at = NOW(),
    -- Apply values to main fields (will be reviewed by human)
    total_ports = COALESCE((p_enrichment_data->>'total_ports')::integer, total_ports),
    poe_ports = COALESCE((p_enrichment_data->>'poe_ports')::integer, poe_ports),
    poe_port_list = COALESCE(p_enrichment_data->>'poe_port_list', poe_port_list),
    ups_battery_outlets = COALESCE((p_enrichment_data->>'ups_battery_outlets')::integer, ups_battery_outlets),
    ups_surge_only_outlets = COALESCE((p_enrichment_data->>'ups_surge_only_outlets')::integer, ups_surge_only_outlets),
    power_watts = COALESCE((p_enrichment_data->>'power_watts')::numeric, power_watts),
    user_guide_urls = CASE
      WHEN p_enrichment_data->'user_guide_urls' IS NOT NULL
           AND jsonb_array_length(p_enrichment_data->'user_guide_urls') > 0
      THEN ARRAY(SELECT jsonb_array_elements_text(p_enrichment_data->'user_guide_urls'))
      ELSE user_guide_urls
    END,
    install_manual_urls = CASE
      WHEN p_enrichment_data->'install_manual_urls' IS NOT NULL
           AND jsonb_array_length(p_enrichment_data->'install_manual_urls') > 0
      THEN ARRAY(SELECT jsonb_array_elements_text(p_enrichment_data->'install_manual_urls'))
      ELSE install_manual_urls
    END
  WHERE id = p_part_id
  RETURNING jsonb_build_object(
    'id', id,
    'name', name,
    'part_number', part_number,
    'status', ai_enrichment_status,
    'confidence', ai_enrichment_confidence
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for human review actions
CREATE OR REPLACE FUNCTION review_part_enrichment(
  p_part_id uuid,
  p_action text,  -- 'approve', 'reject', 'edit'
  p_feedback jsonb DEFAULT NULL,
  p_corrections jsonb DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
  v_feedback_entry jsonb;
BEGIN
  -- Build feedback entry
  v_feedback_entry := jsonb_build_object(
    'action', p_action,
    'feedback', COALESCE(p_feedback, '{}'::jsonb),
    'corrections', COALESCE(p_corrections, '{}'::jsonb),
    'timestamp', NOW()
  );

  -- Update the part
  UPDATE global_parts SET
    ai_enrichment_status = CASE
      WHEN p_action = 'approve' THEN 'approved'
      WHEN p_action = 'reject' THEN 'rejected'
      WHEN p_action = 'edit' THEN 'edited'
      ELSE ai_enrichment_status
    END,
    human_feedback = COALESCE(human_feedback, '[]'::jsonb) || v_feedback_entry,
    needs_review = false,
    -- Apply corrections if provided
    total_ports = COALESCE((p_corrections->>'total_ports')::integer, total_ports),
    poe_ports = COALESCE((p_corrections->>'poe_ports')::integer, poe_ports),
    poe_port_list = COALESCE(p_corrections->>'poe_port_list', poe_port_list),
    ups_battery_outlets = COALESCE((p_corrections->>'ups_battery_outlets')::integer, ups_battery_outlets),
    ups_surge_only_outlets = COALESCE((p_corrections->>'ups_surge_only_outlets')::integer, ups_surge_only_outlets),
    power_watts = COALESCE((p_corrections->>'power_watts')::numeric, power_watts)
  WHERE id = p_part_id
  RETURNING jsonb_build_object(
    'id', id,
    'name', name,
    'status', ai_enrichment_status,
    'feedback_count', jsonb_array_length(human_feedback)
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reset a part for re-enrichment
CREATE OR REPLACE FUNCTION reset_part_enrichment(p_part_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
BEGIN
  UPDATE global_parts SET
    ai_enrichment_status = 'pending',
    ai_enrichment_data = NULL,
    ai_enrichment_notes = NULL,
    ai_last_enriched_at = NULL,
    ai_enrichment_confidence = NULL
  WHERE id = p_part_id
  RETURNING jsonb_build_object(
    'id', id,
    'name', name,
    'status', ai_enrichment_status
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON COLUMN global_parts.total_ports IS 'Total number of network ports (for switches, hubs, etc.)';
COMMENT ON COLUMN global_parts.poe_ports IS 'Number of PoE-enabled ports';
COMMENT ON COLUMN global_parts.poe_port_list IS 'Which ports are PoE, e.g., "1-8, 17-24"';
COMMENT ON COLUMN global_parts.ups_battery_outlets IS 'Number of battery backup outlets (UPS)';
COMMENT ON COLUMN global_parts.ups_surge_only_outlets IS 'Number of surge-only outlets (UPS)';
COMMENT ON COLUMN global_parts.user_guide_urls IS 'Links to user guides/quick start guides';
COMMENT ON COLUMN global_parts.ai_enrichment_status IS 'Status of AI enrichment: pending, processing, needs_review, approved, rejected, edited, error';
COMMENT ON COLUMN global_parts.ai_enrichment_data IS 'Full JSON response from AI enrichment including sources';
COMMENT ON COLUMN global_parts.ai_enrichment_confidence IS 'AI confidence score from 0.0 to 1.0';
COMMENT ON COLUMN global_parts.human_feedback IS 'Array of human feedback/corrections for learning';

COMMENT ON FUNCTION get_parts_pending_enrichment IS 'Get parts that need AI enrichment, prioritizing new parts';
COMMENT ON FUNCTION get_ai_review_count IS 'Count of parts pending human review of AI enrichment';
COMMENT ON FUNCTION save_parts_enrichment IS 'Save AI enrichment results and mark for review';
COMMENT ON FUNCTION review_part_enrichment IS 'Record human review decision (approve/reject/edit) with feedback';
COMMENT ON FUNCTION reset_part_enrichment IS 'Reset a part to be re-enriched by AI';
