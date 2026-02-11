-- Fix global_skills unique constraint to include class_id
-- Bug #22: Cannot create duplicate skill names under different classes
-- The old constraint (name, category) prevented skills with the same name
-- in different classes within the same category.
-- The correct constraint is (name, category, class_id) since skills like
-- "Termination" can exist in both "Copper Cabling" and "Fiber Optic" classes.
-- 2026-02-06

-- Drop the old constraint
ALTER TABLE public.global_skills
  DROP CONSTRAINT IF EXISTS global_skills_name_category_unique;

-- Add the corrected constraint including class_id
ALTER TABLE public.global_skills
  ADD CONSTRAINT global_skills_name_category_class_unique UNIQUE (name, category, class_id);
