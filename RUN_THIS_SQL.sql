-- ============================================================
-- MANUS WEBHOOK FIX - Run this in Supabase SQL Editor
-- ============================================================

-- Step 1: Add the new column (already done, but IF NOT EXISTS makes it safe to re-run)
ALTER TABLE global_parts ADD COLUMN IF NOT EXISTS parts_folder_sharepoint_url text;

-- Step 2: Update the save_parts_enrichment function
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
    shelf_u_height = COALESCE((p_enrichment_data->>'shelf_u_height')::integer, shelf_u_height),
    max_items_per_shelf = COALESCE((p_enrichment_data->>'max_items_per_shelf')::integer, max_items_per_shelf),
    is_wireless = COALESCE((p_enrichment_data->>'is_wireless')::boolean, is_wireless),
    exclude_from_rack = COALESCE((p_enrichment_data->>'exclude_from_rack')::boolean, exclude_from_rack),
    width_inches = COALESCE((p_enrichment_data->>'width_inches')::numeric, width_inches),
    depth_inches = COALESCE((p_enrichment_data->>'depth_inches')::numeric, depth_inches),
    height_inches = COALESCE((p_enrichment_data->>'height_inches')::numeric, height_inches),

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
    poe_budget_watts = COALESCE((p_enrichment_data->>'poe_budget_watts')::numeric, poe_budget_watts),
    poe_ports = COALESCE((p_enrichment_data->>'poe_ports')::integer, poe_ports),
    poe_port_list = COALESCE(p_enrichment_data->>'poe_port_list', poe_port_list),
    uplink_ports = COALESCE((p_enrichment_data->>'uplink_ports')::integer, uplink_ports),
    has_network_port = COALESCE((p_enrichment_data->>'has_network_port')::boolean, has_network_port),

    -- Documentation URLs (arrays)
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
    END,

    -- Documentation URLs (single fields)
    quick_start_url = COALESCE(p_enrichment_data->>'quick_start_url', quick_start_url),
    datasheet_url = COALESCE(p_enrichment_data->>'datasheet_url', datasheet_url),
    submittal_url = COALESCE(p_enrichment_data->>'submittal_url', submittal_url),
    support_page_url = COALESCE(p_enrichment_data->>'support_page_url', support_page_url),

    -- SharePoint URLs for downloaded documents (NEW: parts_folder_sharepoint_url)
    parts_folder_sharepoint_url = COALESCE(p_enrichment_data->>'parts_folder_sharepoint_url', parts_folder_sharepoint_url),
    quick_start_sharepoint_url = COALESCE(p_enrichment_data->>'quick_start_sharepoint_url', quick_start_sharepoint_url),
    datasheet_sharepoint_url = COALESCE(p_enrichment_data->>'datasheet_sharepoint_url', datasheet_sharepoint_url),
    submittal_sharepoint_url = COALESCE(p_enrichment_data->>'submittal_sharepoint_url', submittal_sharepoint_url),
    install_manual_sharepoint_url = COALESCE(p_enrichment_data->>'install_manual_sharepoint_url', install_manual_sharepoint_url),
    user_guide_sharepoint_url = COALESCE(p_enrichment_data->>'user_guide_sharepoint_url', user_guide_sharepoint_url),

    -- Technical manual URLs (array)
    technical_manual_urls = CASE
      WHEN p_enrichment_data->'technical_manual_urls' IS NOT NULL
           AND jsonb_typeof(p_enrichment_data->'technical_manual_urls') = 'array'
           AND jsonb_array_length(p_enrichment_data->'technical_manual_urls') > 0
      THEN ARRAY(SELECT jsonb_array_elements_text(p_enrichment_data->'technical_manual_urls'))
      ELSE technical_manual_urls
    END,
    technical_manual_sharepoint_urls = CASE
      WHEN p_enrichment_data->'technical_manual_sharepoint_urls' IS NOT NULL
           AND jsonb_typeof(p_enrichment_data->'technical_manual_sharepoint_urls') = 'array'
           AND jsonb_array_length(p_enrichment_data->'technical_manual_sharepoint_urls') > 0
      THEN ARRAY(SELECT jsonb_array_elements_text(p_enrichment_data->'technical_manual_sharepoint_urls'))
      ELSE technical_manual_sharepoint_urls
    END,

    -- Document classification (JSONB)
    class3_documents = COALESCE(p_enrichment_data->'class3_documents', class3_documents),
    class2_documents = COALESCE(p_enrichment_data->'class2_documents', class2_documents),
    class1_documents = COALESCE(p_enrichment_data->'class1_documents', class1_documents),

    -- Search metadata
    manufacturer_website = COALESCE(p_enrichment_data->>'manufacturer_website', manufacturer_website),
    product_page_url = COALESCE(p_enrichment_data->>'product_page_url', product_page_url),
    search_summary = COALESCE(p_enrichment_data->'search_summary', search_summary)

  WHERE id = p_part_id
  RETURNING jsonb_build_object(
    'id', id,
    'name', name,
    'part_number', part_number,
    'status', ai_enrichment_status,
    'confidence', ai_enrichment_confidence,
    'parts_folder_sharepoint_url', parts_folder_sharepoint_url
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
