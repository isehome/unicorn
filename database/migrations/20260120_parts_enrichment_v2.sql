-- Parts Enrichment AI Agent - Database Schema V2
-- Adds rack layout fields and updates save function for comprehensive enrichment

-- =====================================================
-- NEW RACK LAYOUT FIELDS
-- =====================================================

-- Device classification
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS device_type text; -- rack_equipment, power_device, network_switch, shelf_device, wireless_device, other

-- Rack mounting info
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS is_rack_mountable boolean;
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS u_height integer;
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS needs_shelf boolean;
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS is_wireless boolean;

-- Power device info
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS power_outlets integer DEFAULT 1; -- outlets NEEDED by device
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS is_power_device boolean;
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS power_outlets_provided integer; -- outlets PROVIDED by device (PDU, UPS)
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS power_output_watts numeric;
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS ups_va_rating numeric;
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS ups_runtime_minutes numeric;

-- Network switch info
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS is_network_switch boolean;
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS switch_ports integer;
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS poe_enabled boolean;
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS uplink_ports integer;
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS has_network_port boolean DEFAULT true;

-- =====================================================
-- UPDATE SAVE FUNCTION TO HANDLE ALL NEW FIELDS
-- =====================================================

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
    -- AI tracking fields
    ai_enrichment_data = p_enrichment_data,
    ai_enrichment_status = 'needs_review',
    ai_enrichment_confidence = p_confidence,
    ai_enrichment_notes = p_notes,
    ai_last_enriched_at = NOW(),

    -- Device classification
    device_type = COALESCE(p_enrichment_data->>'device_type', device_type),

    -- Rack layout fields
    is_rack_mountable = COALESCE((p_enrichment_data->>'is_rack_mountable')::boolean, is_rack_mountable),
    u_height = COALESCE((p_enrichment_data->>'u_height')::integer, u_height),
    needs_shelf = COALESCE((p_enrichment_data->>'needs_shelf')::boolean, needs_shelf),
    is_wireless = COALESCE((p_enrichment_data->>'is_wireless')::boolean, is_wireless),

    -- Power fields
    power_watts = COALESCE((p_enrichment_data->>'power_watts')::numeric, power_watts),
    power_outlets = COALESCE((p_enrichment_data->>'power_outlets')::integer, power_outlets),
    is_power_device = COALESCE((p_enrichment_data->>'is_power_device')::boolean, is_power_device),
    power_outlets_provided = COALESCE((p_enrichment_data->>'power_outlets_provided')::integer, power_outlets_provided),
    power_output_watts = COALESCE((p_enrichment_data->>'power_output_watts')::numeric, power_output_watts),
    ups_va_rating = COALESCE((p_enrichment_data->>'ups_va_rating')::numeric, ups_va_rating),
    ups_battery_outlets = COALESCE((p_enrichment_data->>'ups_battery_outlets')::integer, ups_battery_outlets),
    ups_surge_only_outlets = COALESCE((p_enrichment_data->>'ups_surge_only_outlets')::integer, ups_surge_only_outlets),
    ups_runtime_minutes = COALESCE((p_enrichment_data->>'ups_runtime_minutes')::numeric, ups_runtime_minutes),

    -- Network fields
    is_network_switch = COALESCE((p_enrichment_data->>'is_network_switch')::boolean, is_network_switch),
    total_ports = COALESCE((p_enrichment_data->>'total_ports')::integer, total_ports),
    switch_ports = COALESCE((p_enrichment_data->>'switch_ports')::integer, switch_ports),
    poe_enabled = COALESCE((p_enrichment_data->>'poe_enabled')::boolean, poe_enabled),
    poe_ports = COALESCE((p_enrichment_data->>'poe_ports')::integer, poe_ports),
    poe_port_list = COALESCE(p_enrichment_data->>'poe_port_list', poe_port_list),
    uplink_ports = COALESCE((p_enrichment_data->>'uplink_ports')::integer, uplink_ports),
    has_network_port = COALESCE((p_enrichment_data->>'has_network_port')::boolean, has_network_port),

    -- Documentation URLs
    user_guide_urls = CASE
      WHEN p_enrichment_data->'user_guide_urls' IS NOT NULL
           AND jsonb_typeof(p_enrichment_data->'user_guide_urls') = 'array'
           AND jsonb_array_length(p_enrichment_data->'user_guide_urls') > 0
      THEN ARRAY(SELECT jsonb_array_elements_text(p_enrichment_data->'user_guide_urls'))
      ELSE user_guide_urls
    END,
    install_manual_urls = CASE
      WHEN p_enrichment_data->'install_manual_urls' IS NOT NULL
           AND jsonb_typeof(p_enrichment_data->'install_manual_urls') = 'array'
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
    'confidence', ai_enrichment_confidence,
    'device_type', device_type,
    'is_rack_mountable', is_rack_mountable,
    'u_height', u_height,
    'power_watts', power_watts
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- COMMENTS FOR NEW COLUMNS
-- =====================================================

COMMENT ON COLUMN global_parts.device_type IS 'Device classification: rack_equipment, power_device, network_switch, shelf_device, wireless_device, other';
COMMENT ON COLUMN global_parts.is_rack_mountable IS 'Whether device can be rack mounted (19" standard rack)';
COMMENT ON COLUMN global_parts.u_height IS 'Rack unit height (1U, 2U, etc.)';
COMMENT ON COLUMN global_parts.needs_shelf IS 'Device needs a shelf (not rack mountable but can sit on rack shelf)';
COMMENT ON COLUMN global_parts.is_wireless IS 'Wireless device (no network cable needed)';
COMMENT ON COLUMN global_parts.power_outlets IS 'Number of power outlets the device NEEDS';
COMMENT ON COLUMN global_parts.is_power_device IS 'Is this a power distribution device (PDU, UPS, surge protector)';
COMMENT ON COLUMN global_parts.power_outlets_provided IS 'Number of outlets PROVIDED by a power device';
COMMENT ON COLUMN global_parts.power_output_watts IS 'Total output capacity in watts for power devices';
COMMENT ON COLUMN global_parts.ups_va_rating IS 'VA rating for UPS devices';
COMMENT ON COLUMN global_parts.ups_runtime_minutes IS 'Estimated runtime at half load for UPS';
COMMENT ON COLUMN global_parts.is_network_switch IS 'Is this a network switch/router/hub';
COMMENT ON COLUMN global_parts.switch_ports IS 'Total network switch ports';
COMMENT ON COLUMN global_parts.poe_enabled IS 'Whether switch supports PoE';
COMMENT ON COLUMN global_parts.uplink_ports IS 'Number of SFP/uplink ports';
COMMENT ON COLUMN global_parts.has_network_port IS 'Whether device has an ethernet port';
