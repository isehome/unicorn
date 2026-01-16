-- Update the update_global_part RPC function to include submittal fields
-- This migration adds the new submittal document parameters

-- First, drop ALL existing versions of the function using DO block
-- This handles any signature without needing to know the exact parameter types
DO $$
DECLARE
  func_oid oid;
BEGIN
  FOR func_oid IN
    SELECT oid FROM pg_proc
    WHERE proname = 'update_global_part'
    AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', func_oid::regprocedure);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.update_global_part(
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
  -- New submittal document fields
  p_submittal_pdf_url TEXT DEFAULT NULL,
  p_submittal_sharepoint_url TEXT DEFAULT NULL,
  p_submittal_sharepoint_drive_id TEXT DEFAULT NULL,
  p_submittal_sharepoint_item_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
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
    -- Submittal document fields
    submittal_pdf_url = COALESCE(p_submittal_pdf_url, submittal_pdf_url),
    submittal_sharepoint_url = COALESCE(p_submittal_sharepoint_url, submittal_sharepoint_url),
    submittal_sharepoint_drive_id = COALESCE(p_submittal_sharepoint_drive_id, submittal_sharepoint_drive_id),
    submittal_sharepoint_item_id = COALESCE(p_submittal_sharepoint_item_id, submittal_sharepoint_item_id),
    updated_at = NOW()
  WHERE id = p_part_id
  RETURNING to_jsonb(global_parts.*) INTO v_result;

  RETURN v_result;
END;
$$;

-- Grant execute permission to anon and authenticated roles (MSAL auth pattern)
GRANT EXECUTE ON FUNCTION public.update_global_part TO anon, authenticated;
