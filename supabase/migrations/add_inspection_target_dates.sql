-- Add target date fields for inspections
-- This allows PMs to set target dates separate from actual completion dates

ALTER TABLE public.project_permits
ADD COLUMN IF NOT EXISTS rough_in_target_date DATE,
ADD COLUMN IF NOT EXISTS final_inspection_target_date DATE;

-- Add indexes for faster querying
CREATE INDEX IF NOT EXISTS idx_project_permits_rough_in_target ON public.project_permits(rough_in_target_date);
CREATE INDEX IF NOT EXISTS idx_project_permits_final_inspection_target ON public.project_permits(final_inspection_target_date);

-- Add comments
COMMENT ON COLUMN public.project_permits.rough_in_target_date IS 'PM sets target date for rough-in inspection';
COMMENT ON COLUMN public.project_permits.final_inspection_target_date IS 'PM sets target date for final inspection';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Inspection target date fields added successfully!';
  RAISE NOTICE '- rough_in_target_date: Target date for rough-in inspection';
  RAISE NOTICE '- final_inspection_target_date: Target date for final inspection';
END $$;
