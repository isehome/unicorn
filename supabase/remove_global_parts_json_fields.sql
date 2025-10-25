-- Remove JSON fields from global_parts table
-- These fields (resource_links and attributes) cause "Cannot coerce the result to a single JSON object" errors
-- User confirmed these fields are not needed

-- IMPORTANT: Drop the view FIRST before dropping the columns it references
DROP VIEW IF EXISTS public.project_equipment_global_parts;

-- Now drop the JSON columns
ALTER TABLE public.global_parts 
  DROP COLUMN IF EXISTS resource_links,
  DROP COLUMN IF EXISTS attributes;

-- Recreate the view without the JSON columns

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

-- Drop the comment references since the columns no longer exist
COMMENT ON TABLE public.global_parts IS 
  'Master catalog containing one entry per unique part. Documentation is stored in separate fields (schematic_url, install_manual_urls, technical_manual_urls) rather than JSON.';
