-- ================================================================
-- RPC function to update rack-specific fields on global_parts
-- This bypasses RLS using SECURITY DEFINER
-- ================================================================

-- Drop the function if it exists
DROP FUNCTION IF EXISTS public.update_part_rack_info;

-- Create the function
CREATE FUNCTION public.update_part_rack_info(
  p_part_id uuid,
  p_u_height integer DEFAULT NULL,
  p_is_rack_mountable boolean DEFAULT NULL,
  p_is_rack boolean DEFAULT NULL,
  p_power_watts numeric DEFAULT NULL,
  p_power_outlets integer DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  -- Update the part with rack-specific fields
  UPDATE public.global_parts
  SET
    u_height = COALESCE(p_u_height, u_height),
    is_rack_mountable = COALESCE(p_is_rack_mountable, is_rack_mountable),
    is_rack = COALESCE(p_is_rack, is_rack),
    power_watts = COALESCE(p_power_watts, power_watts),
    power_outlets = COALESCE(p_power_outlets, power_outlets),
    updated_at = now()
  WHERE id = p_part_id;

  -- Check if update worked
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Part with ID % not found', p_part_id;
  END IF;

  -- Return the updated part
  SELECT row_to_json(gp.*)
  INTO v_result
  FROM public.global_parts gp
  WHERE gp.id = p_part_id;

  RETURN v_result;
END;
$$;

-- Grant permissions to both authenticated and anon (for MSAL auth)
GRANT EXECUTE ON FUNCTION public.update_part_rack_info(
  uuid, integer, boolean, boolean, numeric, integer
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.update_part_rack_info(
  uuid, integer, boolean, boolean, numeric, integer
) TO anon;

-- Verify it was created
SELECT
  'Function created successfully!' as status,
  proname as function_name
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'update_part_rack_info';
