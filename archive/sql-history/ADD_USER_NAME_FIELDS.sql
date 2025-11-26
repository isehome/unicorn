-- Add user name and email fields to project_permits
ALTER TABLE project_permits
  ADD COLUMN IF NOT EXISTS rough_in_completed_by_name TEXT,
  ADD COLUMN IF NOT EXISTS rough_in_completed_by_email TEXT,
  ADD COLUMN IF NOT EXISTS final_inspection_completed_by_name TEXT,
  ADD COLUMN IF NOT EXISTS final_inspection_completed_by_email TEXT,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT,
  ADD COLUMN IF NOT EXISTS created_by_email TEXT,
  ADD COLUMN IF NOT EXISTS updated_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_by_email TEXT;

-- Add user name and email fields to project_milestones
ALTER TABLE project_milestones
  ADD COLUMN IF NOT EXISTS updated_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_by_email TEXT;

-- Remove foreign key constraints if they exist
ALTER TABLE project_permits
  DROP CONSTRAINT IF EXISTS project_permits_created_by_fkey,
  DROP CONSTRAINT IF EXISTS project_permits_updated_by_fkey,
  DROP CONSTRAINT IF EXISTS project_permits_rough_in_completed_by_fkey,
  DROP CONSTRAINT IF EXISTS project_permits_final_inspection_completed_by_fkey;

ALTER TABLE project_milestones
  DROP CONSTRAINT IF EXISTS project_milestones_updated_by_fkey;
