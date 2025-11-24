-- Add inspection milestone types to the project_milestones table
-- This allows rough_in_inspection and final_inspection to be tracked

-- Drop the existing CHECK constraint
ALTER TABLE public.project_milestones
DROP CONSTRAINT IF EXISTS project_milestones_milestone_type_check;

-- Add new CHECK constraint with inspection types included
ALTER TABLE public.project_milestones
ADD CONSTRAINT project_milestones_milestone_type_check
CHECK (milestone_type IN (
  'planning_design',
  'prewire_prep',
  'prewire',
  'rough_in_inspection',  -- NEW
  'trim_prep',
  'trim',
  'final_inspection',     -- NEW
  'commissioning',
  'handoff_training'
));

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Inspection milestone types have been added to project_milestones table';
  RAISE NOTICE 'The following milestone types are now allowed:';
  RAISE NOTICE '  - planning_design';
  RAISE NOTICE '  - prewire_prep';
  RAISE NOTICE '  - prewire';
  RAISE NOTICE '  - rough_in_inspection (NEW)';
  RAISE NOTICE '  - trim_prep';
  RAISE NOTICE '  - trim';
  RAISE NOTICE '  - final_inspection (NEW)';
  RAISE NOTICE '  - commissioning';
  RAISE NOTICE '  - handoff_training';
END $$;
