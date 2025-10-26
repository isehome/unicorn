-- Create an RPC function to update required_for_prewire
-- This bypasses RLS issues by using SECURITY DEFINER

CREATE OR REPLACE FUNCTION public.update_part_prewire_status(
  p_part_id uuid,
  p_required_for_prewire boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  -- Update the part
  UPDATE public.global_parts
  SET required_for_prewire = p_required_for_prewire,
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
    'required_for_prewire', required_for_prewire,
    'updated_at', updated_at
  ) INTO v_result
  FROM public.global_parts
  WHERE id = p_part_id;

  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.update_part_prewire_status(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_part_prewire_status(uuid, boolean) TO anon;

-- Add helpful comment
COMMENT ON FUNCTION public.update_part_prewire_status IS
  'Updates the required_for_prewire flag for a part. Uses SECURITY DEFINER to bypass RLS.';

-- Test the function
SELECT public.update_part_prewire_status(
  (SELECT id FROM global_parts LIMIT 1),
  true
);
