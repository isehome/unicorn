-- Create lookup tables for project phases and statuses
CREATE TABLE IF NOT EXISTS public.project_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  sort_order int DEFAULT 0,
  color text DEFAULT '#6b7280',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.project_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  sort_order int DEFAULT 0,
  color text DEFAULT '#6b7280',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create phase milestone dates table
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

-- Add RLS policies
ALTER TABLE public.project_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_phase_milestones ENABLE ROW LEVEL SECURITY;

-- Create policies for phases
CREATE POLICY "dev_read_all" ON public.project_phases
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "dev_insert_all" ON public.project_phases
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "dev_update_all" ON public.project_phases
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "dev_delete_all" ON public.project_phases
  FOR DELETE TO authenticated USING (true);

-- Create policies for statuses
CREATE POLICY "dev_read_all" ON public.project_statuses
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "dev_insert_all" ON public.project_statuses
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "dev_update_all" ON public.project_statuses
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "dev_delete_all" ON public.project_statuses
  FOR DELETE TO authenticated USING (true);

-- Create policies for milestones
CREATE POLICY "dev_read_all" ON public.project_phase_milestones
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "dev_insert_all" ON public.project_phase_milestones
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "dev_update_all" ON public.project_phase_milestones
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "dev_delete_all" ON public.project_phase_milestones
  FOR DELETE TO authenticated USING (true);

-- Insert default phases
INSERT INTO public.project_phases (name, description, sort_order, color) VALUES
  ('Planning', 'Initial project planning and design', 1, '#6366f1'),
  ('Pre-Wire', 'Rough-in wiring installation', 2, '#8b5cf6'),
  ('Trim', 'Device and fixture installation', 3, '#f59e0b'),
  ('Final', 'Final testing and commissioning', 4, '#3b82f6'),
  ('Complete', 'Project completed and handed over', 5, '#10b981')
ON CONFLICT (name) DO NOTHING;

-- Insert default statuses
INSERT INTO public.project_statuses (name, description, sort_order, color) VALUES
  ('active', 'Project is currently active', 1, '#10b981'),
  ('on_hold', 'Project temporarily paused', 2, '#f59e0b'),
  ('completed', 'Project successfully completed', 3, '#3b82f6'),
  ('cancelled', 'Project cancelled', 4, '#ef4444')
ON CONFLICT (name) DO NOTHING;

-- Create view for project issues with stakeholder counts
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
