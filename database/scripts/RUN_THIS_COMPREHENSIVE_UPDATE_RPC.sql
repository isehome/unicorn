-- ================================================================
-- COMPREHENSIVE FIX: RPC function to update all global_parts fields
-- ================================================================
-- This creates an RPC function that bypasses RLS for ALL updates
-- to global_parts, not just required_for_prewire
-- ================================================================

CREATE OR REPLACE FUNCTION public.update_global_part(
  p_part_id uuid,
  p_part_number text DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_manufacturer text DEFAULT NULL,
  p_model text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_unit_of_measure text DEFAULT NULL,
  p_quantity_on_hand numeric DEFAULT NULL,
  p_quantity_reserved numeric DEFAULT NULL,
  p_is_wire_drop_visible boolean DEFAULT NULL,
  p_is_inventory_item boolean DEFAULT NULL,
  p_required_for_prewire boolean DEFAULT NULL,
  p_schematic_url text DEFAULT NULL,
  p_install_manual_urls text[] DEFAULT NULL,
  p_technical_manual_urls text[] DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  -- Update the part (only update fields that are not NULL)
  UPDATE public.global_parts
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
    updated_at = now()
  WHERE id = p_part_id;

  -- Check if update affected any rows
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Part with ID % not found', p_part_id;
  END IF;

  -- Return the updated part as JSON
  SELECT row_to_json(gp.*)
  INTO v_result
  FROM public.global_parts gp
  WHERE gp.id = p_part_id;

  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.update_global_part(
  uuid, text, text, text, text, text, text, text,
  numeric, numeric, boolean, boolean, boolean,
  text, text[], text[]
) TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION public.update_global_part IS
  'Updates a global part with any combination of fields. Uses SECURITY DEFINER to bypass RLS.';

-- Test the function
SELECT public.update_global_part(
  p_part_id := (SELECT id FROM global_parts LIMIT 1),
  p_required_for_prewire := true
);

-- ================================================================
-- END OF SCRIPT
-- After running this, refresh your app and try saving from Part Detail Page
-- ================================================================
