-- Add prewire classification to global parts
-- This allows parts to be tagged as "required for prewire" for separate milestone tracking

-- Add the required_for_prewire column to global_parts
ALTER TABLE public.global_parts
  ADD COLUMN IF NOT EXISTS required_for_prewire BOOLEAN NOT NULL DEFAULT false;

-- Add an index for filtering by prewire status
CREATE INDEX IF NOT EXISTS idx_global_parts_required_for_prewire 
  ON public.global_parts(required_for_prewire) 
  WHERE required_for_prewire = true;

-- Add helpful comment
COMMENT ON COLUMN public.global_parts.required_for_prewire IS 
  'Indicates if this part is required for the prewire phase. Used to separate ordering/receiving into Prewire Prep vs Trim Prep milestones.';

-- Create a view to easily see prewire vs trim equipment across all projects
CREATE OR REPLACE VIEW public.project_equipment_by_phase AS
SELECT
  pe.id,
  pe.project_id,
  pe.name,
  pe.part_number,
  pe.room_id,
  pe.planned_quantity,
  pe.ordered_confirmed,
  pe.ordered_confirmed_at,
  pe.onsite_confirmed,
  pe.onsite_confirmed_at,
  gp.required_for_prewire,
  CASE 
    WHEN gp.required_for_prewire = true THEN 'Prewire Prep'
    ELSE 'Trim Prep'
  END as project_phase,
  pr.name as room_name,
  gp.name as global_part_name,
  gp.manufacturer,
  gp.model
FROM public.project_equipment pe
LEFT JOIN public.global_parts gp ON gp.id = pe.global_part_id
LEFT JOIN public.project_rooms pr ON pr.id = pe.room_id
WHERE pe.is_active = true;

-- Grant access to the view
GRANT SELECT ON public.project_equipment_by_phase TO authenticated;
GRANT SELECT ON public.project_equipment_by_phase TO anon;

COMMENT ON VIEW public.project_equipment_by_phase IS 
  'Shows project equipment classified by project phase (Prewire Prep vs Trim Prep) based on global_parts.required_for_prewire flag.';
