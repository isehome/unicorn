-- =================================================================
-- COMPREHENSIVE FIX FOR MILESTONE CALCULATION VIEWS
--
-- This script fixes the database views that were broken by the
-- removal of the `resource_links` and `attributes` columns from
-- the `global_parts` table.
--
-- REASON:
-- The `project_equipment_by_phase` view was not updated, causing
-- HTTP 400 (Bad Request) errors in the milestone calculation service.
-- This script recreates the view with the correct schema.
-- =================================================================

-- Step 1: Drop the broken view.
DROP VIEW IF EXISTS public.project_equipment_by_phase;

-- Step 2: Recreate the view with the correct columns.
-- This version removes all references to the obsolete JSON fields.
CREATE OR REPLACE VIEW public.project_equipment_by_phase AS
SELECT
  pe.id,
  pe.project_id,
  pe.name,
  pe.part_number,
  pe.room_id,
  pe.planned_quantity,
  pe.ordered_confirmed,
  pe.received_at_warehouse,
  pe.is_on_site,
  pe.installed_at,
  pe.is_complete,
  pe.notes,
  gp.required_for_prewire
FROM
  public.project_equipment pe
LEFT JOIN
  public.global_parts gp ON pe.global_part_id = gp.id;

-- =================================================================
-- Step 3: Re-run the definitive fix for the global_parts table
-- to ensure the entire schema is consistent. This is a safety
-- measure to prevent any lingering issues.
-- =================================================================

-- Drop the dependent view first.
DROP VIEW IF EXISTS public.project_equipment_global_parts;

-- Drop the obsolete JSON columns.
ALTER TABLE public.global_parts
  DROP COLUMN IF EXISTS resource_links,
  DROP COLUMN IF EXISTS attributes;

-- Recreate the view without the obsolete columns.
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

-- Reset RLS policies to ensure they are clean.
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

-- Update comments on the table to reflect the change.
COMMENT ON TABLE public.global_parts IS 
  'Master catalog containing one entry per unique part. Documentation is stored in separate fields (schematic_url, install_manual_urls, technical_manual_urls) rather than JSON.';

-- =================================================================
-- END OF FIX
-- =================================================================
