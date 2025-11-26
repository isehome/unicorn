-- Complete PM Project Management Enhancements SQL
-- Run this entire script in your Supabase SQL editor

-- ============================================
-- 1. ADD MISSING COLUMNS TO PROJECTS TABLE
-- ============================================

-- Add status column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'projects' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.projects 
    ADD COLUMN status text CHECK (status IN ('active', 'on_hold', 'completed', 'cancelled')) DEFAULT 'active';
  END IF;
END $$;

-- Add project_number column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'projects' AND column_name = 'project_number'
  ) THEN
    ALTER TABLE public.projects ADD COLUMN project_number text;
  END IF;
END $$;

-- Add description column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'projects' AND column_name = 'description'
  ) THEN
    ALTER TABLE public.projects ADD COLUMN description text;
  END IF;
END $$;

-- ============================================
-- 2. CREATE PROJECT PHASES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.project_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  sort_order int DEFAULT 0,
  color text DEFAULT '#6b7280',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_phases ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "dev_read_all" ON public.project_phases;
DROP POLICY IF EXISTS "dev_insert_all" ON public.project_phases;
DROP POLICY IF EXISTS "dev_update_all" ON public.project_phases;
DROP POLICY IF EXISTS "dev_delete_all" ON public.project_phases;

-- Create policies for phases
CREATE POLICY "dev_read_all" ON public.project_phases
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "dev_insert_all" ON public.project_phases
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "dev_update_all" ON public.project_phases
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "dev_delete_all" ON public.project_phases
  FOR DELETE TO authenticated USING (true);

-- ============================================
-- 3. CREATE PROJECT STATUSES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.project_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  sort_order int DEFAULT 0,
  color text DEFAULT '#6b7280',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_statuses ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "dev_read_all" ON public.project_statuses;
DROP POLICY IF EXISTS "dev_insert_all" ON public.project_statuses;
DROP POLICY IF EXISTS "dev_update_all" ON public.project_statuses;
DROP POLICY IF EXISTS "dev_delete_all" ON public.project_statuses;

-- Create policies for statuses
CREATE POLICY "dev_read_all" ON public.project_statuses
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "dev_insert_all" ON public.project_statuses
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "dev_update_all" ON public.project_statuses
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "dev_delete_all" ON public.project_statuses
  FOR DELETE TO authenticated USING (true);

-- ============================================
-- 4. CREATE PROJECT PHASE MILESTONES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.project_phase_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase_id uuid NOT NULL REFERENCES public.project_phases(id) ON DELETE CASCADE,
  target_date date,
  actual_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT project_phase_unique UNIQUE (project_id, phase_id)
);

-- Enable RLS
ALTER TABLE public.project_phase_milestones ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "dev_read_all" ON public.project_phase_milestones;
DROP POLICY IF EXISTS "dev_insert_all" ON public.project_phase_milestones;
DROP POLICY IF EXISTS "dev_update_all" ON public.project_phase_milestones;
DROP POLICY IF EXISTS "dev_delete_all" ON public.project_phase_milestones;

-- Create policies for milestones
CREATE POLICY "dev_read_all" ON public.project_phase_milestones
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "dev_insert_all" ON public.project_phase_milestones
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "dev_update_all" ON public.project_phase_milestones
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "dev_delete_all" ON public.project_phase_milestones
  FOR DELETE TO authenticated USING (true);

-- ============================================
-- 5. INSERT DEFAULT PHASES
-- ============================================

INSERT INTO public.project_phases (name, description, sort_order, color) VALUES
  ('Planning', 'Initial project planning and design', 1, '#6366f1'),
  ('Pre-Wire', 'Rough-in wiring installation', 2, '#8b5cf6'),
  ('Trim', 'Device and fixture installation', 3, '#f59e0b'),
  ('Final', 'Final testing and commissioning', 4, '#3b82f6'),
  ('Complete', 'Project completed and handed over', 5, '#10b981')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- 6. INSERT DEFAULT STATUSES
-- ============================================

INSERT INTO public.project_statuses (name, description, sort_order, color) VALUES
  ('active', 'Project is currently active', 1, '#10b981'),
  ('on_hold', 'Project temporarily paused', 2, '#f59e0b'),
  ('completed', 'Project successfully completed', 3, '#3b82f6'),
  ('cancelled', 'Project cancelled', 4, '#ef4444')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- 7. CREATE VIEW FOR PROJECT ISSUES WITH STAKEHOLDERS
-- ============================================

-- Drop view if exists
DROP VIEW IF EXISTS public.project_issues_with_stakeholders;

-- Create enhanced view for project issues with stakeholder information
CREATE OR REPLACE VIEW public.project_issues_with_stakeholders AS
SELECT 
  i.*,
  p.name as project_name,
  p.client as project_client,
  COUNT(DISTINCT ic.contact_id) as stakeholder_count,
  array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL) as stakeholder_names,
  array_agg(DISTINCT sr.name) FILTER (WHERE sr.name IS NOT NULL) as stakeholder_roles
FROM issues i
LEFT JOIN projects p ON i.project_id = p.id
LEFT JOIN issue_contacts ic ON i.id = ic.issue_id
LEFT JOIN contacts c ON ic.contact_id = c.id
LEFT JOIN stakeholder_roles sr ON c.stakeholder_role_id = sr.id
GROUP BY i.id, p.id, p.name, p.client;

-- Grant access to the view
GRANT SELECT ON public.project_issues_with_stakeholders TO anon, authenticated;

-- ============================================
-- 8. UPDATE EXISTING PROJECTS TO HAVE STATUS
-- ============================================

UPDATE public.projects 
SET status = 'active' 
WHERE status IS NULL;

-- ============================================
-- 9. CREATE INDEXES FOR BETTER PERFORMANCE
-- ============================================

-- Create indexes if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_project_phases_active') THEN
    CREATE INDEX idx_project_phases_active ON public.project_phases(active);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_project_statuses_active') THEN
    CREATE INDEX idx_project_statuses_active ON public.project_statuses(active);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_project_phase_milestones_project') THEN
    CREATE INDEX idx_project_phase_milestones_project ON public.project_phase_milestones(project_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_project_phase_milestones_phase') THEN
    CREATE INDEX idx_project_phase_milestones_phase ON public.project_phase_milestones(phase_id);
  END IF;
END $$;

-- ============================================
-- 10. VERIFY TABLES EXIST AND HAVE CORRECT STRUCTURE
-- ============================================

-- This query will help verify all tables are created correctly
-- You can run this separately to check the structure
/*
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name IN ('projects', 'project_phases', 'project_statuses', 'project_phase_milestones')
ORDER BY table_name, ordinal_position;
*/

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'PM Project Management tables and enhancements have been successfully created/updated!';
END $$;
