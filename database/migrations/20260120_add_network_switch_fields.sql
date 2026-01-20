-- ================================================================
-- Add network switch fields to global_parts
-- These fields enable the network connection visualization feature
-- ================================================================

-- Add is_network_switch column (boolean to identify switches)
ALTER TABLE public.global_parts
ADD COLUMN IF NOT EXISTS is_network_switch boolean DEFAULT false;

-- Add switch_ports column (total number of ports)
ALTER TABLE public.global_parts
ADD COLUMN IF NOT EXISTS switch_ports integer DEFAULT NULL;

-- Add poe_enabled column (whether ports support PoE)
ALTER TABLE public.global_parts
ADD COLUMN IF NOT EXISTS poe_enabled boolean DEFAULT false;

-- Add uplink_ports column (number of SFP/uplink ports)
ALTER TABLE public.global_parts
ADD COLUMN IF NOT EXISTS uplink_ports integer DEFAULT 0;

-- Add network_ports column for regular devices (how many ethernet ports they have)
ALTER TABLE public.global_parts
ADD COLUMN IF NOT EXISTS network_ports integer DEFAULT 1;

-- Add has_network_port column (default true, set false for devices with no ethernet)
ALTER TABLE public.global_parts
ADD COLUMN IF NOT EXISTS has_network_port boolean DEFAULT true;

-- ================================================================
-- Update the RPC function to include network switch fields
-- ================================================================
DROP FUNCTION IF EXISTS public.update_part_rack_info;

CREATE FUNCTION public.update_part_rack_info(
  p_part_id uuid,
  p_u_height integer DEFAULT NULL,
  p_is_rack_mountable boolean DEFAULT NULL,
  p_is_rack boolean DEFAULT NULL,
  p_power_watts numeric DEFAULT NULL,
  p_power_outlets integer DEFAULT NULL,
  p_is_power_device boolean DEFAULT NULL,
  p_power_outlets_provided integer DEFAULT NULL,
  p_ups_outlets_provided integer DEFAULT NULL,
  p_power_output_watts integer DEFAULT NULL,
  -- New network switch fields
  p_is_network_switch boolean DEFAULT NULL,
  p_switch_ports integer DEFAULT NULL,
  p_poe_enabled boolean DEFAULT NULL,
  p_uplink_ports integer DEFAULT NULL,
  p_network_ports integer DEFAULT NULL,
  p_has_network_port boolean DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  -- Update the part with all configurable fields
  UPDATE public.global_parts
  SET
    u_height = COALESCE(p_u_height, u_height),
    is_rack_mountable = COALESCE(p_is_rack_mountable, is_rack_mountable),
    is_rack = COALESCE(p_is_rack, is_rack),
    power_watts = COALESCE(p_power_watts, power_watts),
    power_outlets = COALESCE(p_power_outlets, power_outlets),
    is_power_device = COALESCE(p_is_power_device, is_power_device),
    power_outlets_provided = COALESCE(p_power_outlets_provided, power_outlets_provided),
    ups_outlets_provided = COALESCE(p_ups_outlets_provided, ups_outlets_provided),
    power_output_watts = COALESCE(p_power_output_watts, power_output_watts),
    -- Network switch fields
    is_network_switch = COALESCE(p_is_network_switch, is_network_switch),
    switch_ports = COALESCE(p_switch_ports, switch_ports),
    poe_enabled = COALESCE(p_poe_enabled, poe_enabled),
    uplink_ports = COALESCE(p_uplink_ports, uplink_ports),
    network_ports = COALESCE(p_network_ports, network_ports),
    has_network_port = COALESCE(p_has_network_port, has_network_port),
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.update_part_rack_info TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_part_rack_info TO anon;

-- ================================================================
-- Auto-detect and update UniFi switches based on name/model patterns
-- This will mark known UniFi switches with appropriate port counts
-- ================================================================

-- USW-Pro-24-PoE (24 port PoE switch)
UPDATE public.global_parts
SET
  is_network_switch = true,
  switch_ports = 24,
  poe_enabled = true,
  uplink_ports = 2
WHERE (
  LOWER(name) LIKE '%usw-pro-24%' OR
  LOWER(name) LIKE '%usw pro 24%' OR
  LOWER(model) LIKE '%usw-pro-24%' OR
  LOWER(part_number) LIKE '%usw-pro-24%'
) AND is_network_switch IS NOT TRUE;

-- USW-Pro-48-PoE (48 port PoE switch)
UPDATE public.global_parts
SET
  is_network_switch = true,
  switch_ports = 48,
  poe_enabled = true,
  uplink_ports = 4
WHERE (
  LOWER(name) LIKE '%usw-pro-48%' OR
  LOWER(name) LIKE '%usw pro 48%' OR
  LOWER(model) LIKE '%usw-pro-48%' OR
  LOWER(part_number) LIKE '%usw-pro-48%'
) AND is_network_switch IS NOT TRUE;

-- USW-24 (24 port non-PoE switch)
UPDATE public.global_parts
SET
  is_network_switch = true,
  switch_ports = 24,
  poe_enabled = false,
  uplink_ports = 2
WHERE (
  LOWER(name) LIKE '%usw-24%' OR
  LOWER(name) LIKE '%usw 24%' OR
  LOWER(model) LIKE '%usw-24%' OR
  LOWER(part_number) LIKE '%usw-24%'
) AND LOWER(name) NOT LIKE '%pro%' AND LOWER(name) NOT LIKE '%poe%'
  AND is_network_switch IS NOT TRUE;

-- USW-48 (48 port non-PoE switch)
UPDATE public.global_parts
SET
  is_network_switch = true,
  switch_ports = 48,
  poe_enabled = false,
  uplink_ports = 4
WHERE (
  LOWER(name) LIKE '%usw-48%' OR
  LOWER(name) LIKE '%usw 48%' OR
  LOWER(model) LIKE '%usw-48%' OR
  LOWER(part_number) LIKE '%usw-48%'
) AND LOWER(name) NOT LIKE '%pro%' AND LOWER(name) NOT LIKE '%poe%'
  AND is_network_switch IS NOT TRUE;

-- USW-Lite-8-PoE (8 port PoE switch)
UPDATE public.global_parts
SET
  is_network_switch = true,
  switch_ports = 8,
  poe_enabled = true,
  uplink_ports = 0
WHERE (
  LOWER(name) LIKE '%usw-lite-8%' OR
  LOWER(name) LIKE '%usw lite 8%' OR
  LOWER(model) LIKE '%usw-lite-8%' OR
  LOWER(part_number) LIKE '%usw-lite-8%'
) AND is_network_switch IS NOT TRUE;

-- USW-Lite-16-PoE (16 port PoE switch)
UPDATE public.global_parts
SET
  is_network_switch = true,
  switch_ports = 16,
  poe_enabled = true,
  uplink_ports = 0
WHERE (
  LOWER(name) LIKE '%usw-lite-16%' OR
  LOWER(name) LIKE '%usw lite 16%' OR
  LOWER(model) LIKE '%usw-lite-16%' OR
  LOWER(part_number) LIKE '%usw-lite-16%'
) AND is_network_switch IS NOT TRUE;

-- USW-Enterprise-8-PoE (8 port enterprise PoE)
UPDATE public.global_parts
SET
  is_network_switch = true,
  switch_ports = 8,
  poe_enabled = true,
  uplink_ports = 2
WHERE (
  LOWER(name) LIKE '%usw-enterprise-8%' OR
  LOWER(name) LIKE '%enterprise 8%' OR
  LOWER(model) LIKE '%usw-enterprise-8%'
) AND is_network_switch IS NOT TRUE;

-- USW-Enterprise-24-PoE
UPDATE public.global_parts
SET
  is_network_switch = true,
  switch_ports = 24,
  poe_enabled = true,
  uplink_ports = 2
WHERE (
  LOWER(name) LIKE '%usw-enterprise-24%' OR
  LOWER(name) LIKE '%enterprise 24%' OR
  LOWER(model) LIKE '%usw-enterprise-24%'
) AND is_network_switch IS NOT TRUE;

-- USW-Enterprise-48-PoE
UPDATE public.global_parts
SET
  is_network_switch = true,
  switch_ports = 48,
  poe_enabled = true,
  uplink_ports = 4
WHERE (
  LOWER(name) LIKE '%usw-enterprise-48%' OR
  LOWER(name) LIKE '%enterprise 48%' OR
  LOWER(model) LIKE '%usw-enterprise-48%'
) AND is_network_switch IS NOT TRUE;

-- USW-Aggregation (aggregation switch with SFP+ ports)
UPDATE public.global_parts
SET
  is_network_switch = true,
  switch_ports = 8,
  poe_enabled = false,
  uplink_ports = 8
WHERE (
  LOWER(name) LIKE '%usw-aggregation%' OR
  LOWER(name) LIKE '%aggregation switch%' OR
  LOWER(model) LIKE '%usw-aggregation%'
) AND is_network_switch IS NOT TRUE;

-- USW-Flex-Mini (5 port mini switch)
UPDATE public.global_parts
SET
  is_network_switch = true,
  switch_ports = 5,
  poe_enabled = false,
  uplink_ports = 0
WHERE (
  LOWER(name) LIKE '%usw-flex-mini%' OR
  LOWER(name) LIKE '%flex mini%' OR
  LOWER(model) LIKE '%usw-flex-mini%'
) AND is_network_switch IS NOT TRUE;

-- USW-Flex (PoE powered switch)
UPDATE public.global_parts
SET
  is_network_switch = true,
  switch_ports = 5,
  poe_enabled = true,
  uplink_ports = 0
WHERE (
  LOWER(name) LIKE '%usw-flex%' OR
  LOWER(model) LIKE '%usw-flex%'
) AND LOWER(name) NOT LIKE '%mini%'
  AND is_network_switch IS NOT TRUE;

-- Generic fallback: anything with "switch" in the name that has ports specified
-- e.g. "24 Port Switch", "48-port Gigabit Switch"
UPDATE public.global_parts
SET
  is_network_switch = true,
  switch_ports = CASE
    WHEN LOWER(name) ~ '48.?port' OR LOWER(name) ~ '48p' THEN 48
    WHEN LOWER(name) ~ '24.?port' OR LOWER(name) ~ '24p' THEN 24
    WHEN LOWER(name) ~ '16.?port' OR LOWER(name) ~ '16p' THEN 16
    WHEN LOWER(name) ~ '8.?port' OR LOWER(name) ~ '8p' THEN 8
    WHEN LOWER(name) ~ '5.?port' OR LOWER(name) ~ '5p' THEN 5
    ELSE 8 -- default assumption
  END,
  poe_enabled = LOWER(name) LIKE '%poe%',
  uplink_ports = CASE
    WHEN LOWER(name) ~ '48' THEN 4
    WHEN LOWER(name) ~ '24' THEN 2
    ELSE 0
  END
WHERE LOWER(name) LIKE '%switch%'
  AND is_network_switch IS NOT TRUE;

-- Verify the updates
SELECT
  'Network switch fields added successfully!' as status,
  COUNT(*) FILTER (WHERE is_network_switch = true) as switches_identified,
  COUNT(*) as total_parts
FROM public.global_parts;
