-- Update the update_global_part RPC function to include power fields
-- This bypasses RLS since we use MSAL for auth

CREATE OR REPLACE FUNCTION update_global_part(
  p_part_id UUID,
  p_part_number TEXT DEFAULT NULL,
  p_name TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_manufacturer TEXT DEFAULT NULL,
  p_model TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_unit_of_measure TEXT DEFAULT NULL,
  p_quantity_on_hand INTEGER DEFAULT NULL,
  p_quantity_reserved INTEGER DEFAULT NULL,
  p_is_wire_drop_visible BOOLEAN DEFAULT NULL,
  p_is_inventory_item BOOLEAN DEFAULT NULL,
  p_required_for_prewire BOOLEAN DEFAULT NULL,
  p_schematic_url TEXT DEFAULT NULL,
  p_install_manual_urls TEXT[] DEFAULT NULL,
  p_technical_manual_urls TEXT[] DEFAULT NULL,
  p_submittal_pdf_url TEXT DEFAULT NULL,
  p_submittal_sharepoint_url TEXT DEFAULT NULL,
  p_submittal_sharepoint_drive_id TEXT DEFAULT NULL,
  p_submittal_sharepoint_item_id TEXT DEFAULT NULL,
  -- Rack layout fields
  p_u_height INTEGER DEFAULT NULL,
  p_is_rack_mountable BOOLEAN DEFAULT NULL,
  p_needs_shelf BOOLEAN DEFAULT NULL,
  p_shelf_u_height INTEGER DEFAULT NULL,
  p_max_items_per_shelf INTEGER DEFAULT NULL,
  p_exclude_from_rack BOOLEAN DEFAULT NULL,
  -- Power fields
  p_power_watts INTEGER DEFAULT NULL,
  p_power_outlets INTEGER DEFAULT NULL,
  p_is_power_device BOOLEAN DEFAULT NULL,
  p_power_outlets_provided INTEGER DEFAULT NULL,
  p_ups_outlets_provided INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  UPDATE global_parts
  SET
    part_number = COALESCE(p_part_number, part_number),
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    manufacturer = COALESCE(p_manufacturer, manufacturer),
    model = COALESCE(p_model, model),
    category = COALESCE(p_category, category),
    unit_of_measure = COALESCE(p_unit_of_measure, unit_of_measure),
    quantity_on_hand = COALESCE(p_quantity_on_hand, quantity_on_hand),
    quantity_reserved = COALESCE(p_quantity_reserved, quantity_reserved),
    is_wire_drop_visible = COALESCE(p_is_wire_drop_visible, is_wire_drop_visible),
    is_inventory_item = COALESCE(p_is_inventory_item, is_inventory_item),
    required_for_prewire = COALESCE(p_required_for_prewire, required_for_prewire),
    schematic_url = COALESCE(p_schematic_url, schematic_url),
    install_manual_urls = COALESCE(p_install_manual_urls, install_manual_urls),
    technical_manual_urls = COALESCE(p_technical_manual_urls, technical_manual_urls),
    submittal_pdf_url = COALESCE(p_submittal_pdf_url, submittal_pdf_url),
    submittal_sharepoint_url = COALESCE(p_submittal_sharepoint_url, submittal_sharepoint_url),
    submittal_sharepoint_drive_id = COALESCE(p_submittal_sharepoint_drive_id, submittal_sharepoint_drive_id),
    submittal_sharepoint_item_id = COALESCE(p_submittal_sharepoint_item_id, submittal_sharepoint_item_id),
    -- Rack layout fields
    u_height = COALESCE(p_u_height, u_height),
    is_rack_mountable = COALESCE(p_is_rack_mountable, is_rack_mountable),
    needs_shelf = COALESCE(p_needs_shelf, needs_shelf),
    shelf_u_height = COALESCE(p_shelf_u_height, shelf_u_height),
    max_items_per_shelf = COALESCE(p_max_items_per_shelf, max_items_per_shelf),
    exclude_from_rack = COALESCE(p_exclude_from_rack, exclude_from_rack),
    -- Power fields
    power_watts = COALESCE(p_power_watts, power_watts),
    power_outlets = COALESCE(p_power_outlets, power_outlets),
    is_power_device = COALESCE(p_is_power_device, is_power_device),
    power_outlets_provided = COALESCE(p_power_outlets_provided, power_outlets_provided),
    ups_outlets_provided = COALESCE(p_ups_outlets_provided, ups_outlets_provided),
    updated_at = NOW()
  WHERE id = p_part_id;

  -- Return the updated record
  SELECT row_to_json(t) INTO result
  FROM (
    SELECT
      id,
      part_number,
      name,
      description,
      manufacturer,
      model,
      category,
      unit_of_measure,
      quantity_on_hand,
      quantity_reserved,
      is_wire_drop_visible,
      is_inventory_item,
      required_for_prewire,
      schematic_url,
      install_manual_urls,
      technical_manual_urls,
      submittal_pdf_url,
      submittal_sharepoint_url,
      submittal_sharepoint_drive_id,
      submittal_sharepoint_item_id,
      u_height,
      is_rack_mountable,
      needs_shelf,
      shelf_u_height,
      max_items_per_shelf,
      exclude_from_rack,
      power_watts,
      power_outlets,
      is_power_device,
      power_outlets_provided,
      ups_outlets_provided,
      created_at,
      updated_at
    FROM global_parts
    WHERE id = p_part_id
  ) t;

  RETURN result;
END;
$$;
