-- =====================================================
-- MIGRATION: Clean Contact System Architecture
-- =====================================================

BEGIN;

-- Step 1: Create new stakeholder_roles table
CREATE TABLE IF NOT EXISTS public.stakeholder_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  category text CHECK (category IN ('internal','external')) NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Step 2: Backup existing contacts data
CREATE TABLE IF NOT EXISTS public.contacts_backup AS 
SELECT * FROM public.contacts WHERE 1=1;

-- Step 3: Modify contacts table to be global (remove project_id dependency)
-- First, let's add new columns we need
ALTER TABLE public.contacts 
ADD COLUMN IF NOT EXISTS full_name text,
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Update full_name from existing data
UPDATE public.contacts 
SET full_name = COALESCE(
  CASE 
    WHEN first_name IS NOT NULL AND last_name IS NOT NULL 
    THEN first_name || ' ' || last_name
    WHEN name IS NOT NULL 
    THEN name
    ELSE 'Unknown Contact'
  END
) 
WHERE full_name IS NULL;

-- Make full_name required
ALTER TABLE public.contacts ALTER COLUMN full_name SET NOT NULL;

-- Step 4: Create new project_stakeholders table with proper relationships
CREATE TABLE IF NOT EXISTS public.project_stakeholders_new (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  stakeholder_role_id uuid NOT NULL REFERENCES public.stakeholder_roles(id) ON DELETE CASCADE,
  is_primary boolean DEFAULT false,
  assignment_notes text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_contact_role_per_project UNIQUE (project_id, contact_id, stakeholder_role_id)
);

-- Step 5: Create issue stakeholder tags table
CREATE TABLE IF NOT EXISTS public.issue_stakeholder_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  project_stakeholder_id uuid NOT NULL REFERENCES public.project_stakeholders_new(id) ON DELETE CASCADE,
  tag_type text DEFAULT 'assigned' CHECK (tag_type IN ('assigned', 'watching', 'notified')),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_issue_stakeholder_tag UNIQUE (issue_id, project_stakeholder_id)
);

-- Step 6: Insert default stakeholder roles
INSERT INTO public.stakeholder_roles (name, category, description, sort_order) VALUES
('Project Manager', 'internal', 'Internal project manager', 1),
('Technician', 'internal', 'Field technician', 2),
('Sales Rep', 'internal', 'Sales representative', 3),
('Supervisor', 'internal', 'Project supervisor', 4),
('Electrician', 'external', 'Licensed electrician', 10),
('General Contractor', 'external', 'General contractor', 11),
('Property Owner', 'external', 'Property owner/client', 12),
('Architect', 'external', 'Project architect', 13),
('Inspector', 'external', 'Building inspector', 14),
('Permit Office', 'external', 'Permitting office', 15)
ON CONFLICT (name) DO NOTHING;

-- Step 7: Migrate existing data
-- Remove project_id dependency from contacts (make them global)
-- We'll keep existing contacts but remove the project_id constraint

-- First, let's create a default role for migration
INSERT INTO public.stakeholder_roles (name, category, description, sort_order) VALUES
('General Contact', 'external', 'General project contact - needs role assignment', 999)
ON CONFLICT (name) DO NOTHING;

-- Step 8: Migrate existing project-contact relationships
-- For each existing contact with a project_id, create a project_stakeholders_new entry
INSERT INTO public.project_stakeholders_new (project_id, contact_id, stakeholder_role_id, assignment_notes)
SELECT 
  c.project_id,
  c.id as contact_id,
  sr.id as stakeholder_role_id,
  'Migrated from old schema - please update role' as assignment_notes
FROM public.contacts c
JOIN public.stakeholder_roles sr ON sr.name = 'General Contact'
WHERE c.project_id IS NOT NULL
ON CONFLICT (project_id, contact_id, stakeholder_role_id) DO NOTHING;

-- Step 9: Remove project_id from contacts to make them global
ALTER TABLE public.contacts DROP COLUMN IF EXISTS project_id;

-- Step 10: Replace old project_stakeholders table
DROP TABLE IF EXISTS public.project_stakeholders CASCADE;
ALTER TABLE public.project_stakeholders_new RENAME TO project_stakeholders;

-- Step 11: Create helpful views
CREATE OR REPLACE VIEW public.project_stakeholders_detailed AS
SELECT 
  ps.id as assignment_id,
  ps.project_id,
  ps.contact_id,
  ps.is_primary,
  ps.assignment_notes,
  ps.created_at as assigned_at,
  c.full_name as contact_name,
  c.first_name,
  c.last_name,
  c.email,
  c.phone,
  c.company,
  c.address,
  c.is_internal,
  sr.name as role_name,
  sr.category as role_category,
  sr.id as role_id
FROM public.project_stakeholders ps
JOIN public.contacts c ON ps.contact_id = c.id
JOIN public.stakeholder_roles sr ON ps.stakeholder_role_id = sr.id
WHERE c.is_active = true;

CREATE OR REPLACE VIEW public.issue_stakeholder_tags_detailed AS
SELECT 
  ist.id as tag_id,
  ist.issue_id,
  ist.tag_type,
  ist.created_at as tagged_at,
  ps.project_id,
  ps.assignment_id,
  c.full_name as contact_name,
  c.email,
  c.phone,
  c.is_internal,
  sr.name as role_name,
  sr.category as role_category
FROM public.issue_stakeholder_tags ist
JOIN public.project_stakeholders_detailed ps ON ist.project_stakeholder_id = ps.assignment_id
JOIN public.contacts c ON ps.contact_id = c.id
JOIN public.stakeholder_roles sr ON ps.role_id = sr.id;

-- Step 12: Update RLS policies
ALTER TABLE public.stakeholder_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_stakeholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_stakeholder_tags ENABLE ROW LEVEL SECURITY;

-- RLS Policies for development (you can tighten these later)
CREATE POLICY dev_read_all ON public.stakeholder_roles
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY dev_insert_all ON public.stakeholder_roles
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY dev_update_all ON public.stakeholder_roles
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY dev_read_all ON public.project_stakeholders
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY dev_insert_all ON public.project_stakeholders
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY dev_update_all ON public.project_stakeholders
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY dev_delete_all ON public.project_stakeholders
  FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY dev_read_all ON public.issue_stakeholder_tags
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY dev_insert_all ON public.issue_stakeholder_tags
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY dev_update_all ON public.issue_stakeholder_tags
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY dev_delete_all ON public.issue_stakeholder_tags
  FOR DELETE TO anon, authenticated USING (true);

-- Step 13: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_stakeholders_project_id ON public.project_stakeholders(project_id);
CREATE INDEX IF NOT EXISTS idx_project_stakeholders_contact_id ON public.project_stakeholders(contact_id);
CREATE INDEX IF NOT EXISTS idx_issue_stakeholder_tags_issue_id ON public.issue_stakeholder_tags(issue_id);
CREATE INDEX IF NOT EXISTS idx_contacts_full_name ON public.contacts(full_name);
CREATE INDEX IF NOT EXISTS idx_contacts_is_active ON public.contacts(is_active);

COMMIT;

-- Migration complete! 
-- Your database now has:
-- 1. Global contacts pool (no longer tied to specific projects)
-- 2. Stakeholder roles system (Project Manager, Electrician, etc.)
-- 3. Proper project stakeholder assignments
-- 4. Issue stakeholder tagging capability
-- 5. Helpful views for easy querying