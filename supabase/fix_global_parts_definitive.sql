-- =================================================================
-- DEFINITIVE FIX FOR global_parts TABLE
--
-- This script removes the obsolete `resource_links` and `attributes`
-- JSON columns and resets the associated view and RLS policies.
--
-- REASON:
-- These columns were causing "Cannot coerce the result to a single
-- JSON object" (HTTP 406) errors. This script ensures the database
-- schema is aligned with the current application code.
-- =================================================================

-- Step 1: Drop the view that depends on the columns.
DROP VIEW IF EXISTS public.project_equipment_global_parts;

-- Step 2: Drop the obsolete JSON columns from the table.
ALTER TABLE public.global_parts
  DROP COLUMN IF EXISTS resource_links,
  DROP COLUMN IF EXISTS attributes;

-- Step 3: Recreate the view without the obsolete columns.
CREATE OR REPLACE VIEW public.project_equipment_global_parts AS
  SELECT
    pe.id as project_equipment_id,
    pe.project_id,
    pe.part_number,
    gp.id as global_part_id,
    gp.name as global_part_name,
    gp.description as global_part_description,
    gp.manufacturer as global_part_manufacturer,
    gp.model as global_part_model,
    gp.is_wire_drop_visible,
    gp.is_inventory_item
  FROM public.project_equipment pe
  LEFT JOIN public.global_parts gp
    ON (gp.id = pe.global_part_id)
    OR (pe.global_part_id IS NULL AND gp.part_number = pe.part_number);

-- Step 4: Reset RLS policies to ensure they are clean.
-- This removes any potential lingering issues from old policies.
ALTER TABLE public.global_parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS global_parts_read_all ON public.global_parts;
CREATE POLICY global_parts_read_all
  ON public.global_parts
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS global_parts_write_authenticated ON public.global_parts;
CREATE POLICY global_parts_write_authenticated
  ON public.global_parts
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Step 5: Update comments on the table to reflect the change.
COMMENT ON TABLE public.global_parts IS 
  'Master catalog containing one entry per unique part. Documentation is stored in separate fields (schematic_url, install_manual_urls, technical_manual_urls) rather than JSON.';

-- =================================================================
-- END OF FIX
-- =================================================================
