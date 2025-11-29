-- ================================================================
-- Create RPC function to update global parts documentation
-- This bypasses RLS issues by using SECURITY DEFINER
-- ================================================================

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.update_part_documentation(uuid, text, text[], text[]);

-- Create the function
CREATE OR REPLACE FUNCTION public.update_part_documentation(
  p_part_id uuid,
  p_schematic_url text,
  p_install_manual_urls text[],
  p_technical_manual_urls text[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  -- Update the part documentation fields
  -- Note: We explicitly set values (including NULL) to allow clearing
  UPDATE public.global_parts
  SET
    schematic_url = p_schematic_url,
    install_manual_urls = p_install_manual_urls,
    technical_manual_urls = p_technical_manual_urls,
    updated_at = now()
  WHERE id = p_part_id;

  -- Check if update affected any rows
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Part with ID % not found', p_part_id;
  END IF;

  -- Return the updated part
  SELECT json_build_object(
    'id', id,
    'part_number', part_number,
    'name', name,
    'description', description,
    'manufacturer', manufacturer,
    'model', model,
    'category', category,
    'unit_of_measure', unit_of_measure,
    'quantity_on_hand', quantity_on_hand,
    'quantity_reserved', quantity_reserved,
    'is_wire_drop_visible', is_wire_drop_visible,
    'is_inventory_item', is_inventory_item,
    'required_for_prewire', required_for_prewire,
    'schematic_url', schematic_url,
    'install_manual_urls', install_manual_urls,
    'technical_manual_urls', technical_manual_urls,
    'updated_at', updated_at
  ) INTO v_result
  FROM public.global_parts
  WHERE id = p_part_id;

  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users and anon
GRANT EXECUTE ON FUNCTION public.update_part_documentation(uuid, text, text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_part_documentation(uuid, text, text[], text[]) TO anon;

-- Add helpful comment
COMMENT ON FUNCTION public.update_part_documentation IS
  'Updates documentation fields (schematic_url, install_manual_urls, technical_manual_urls) for a global part. Uses SECURITY DEFINER to bypass RLS.';

-- Verify function was created
SELECT
  'Function created successfully!' as status,
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'update_part_documentation';
