-- ============================================================
-- SKILLS SYSTEM FOR TECHNICIAN MATCHING
-- Global skills, employee skills with proficiency levels
-- ============================================================

-- ============================================================
-- PART 1: Add assigned_to_name to service_tickets
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'service_tickets' AND column_name = 'assigned_to_name') THEN
    ALTER TABLE service_tickets ADD COLUMN assigned_to_name TEXT;
  END IF;
END $$;

COMMENT ON COLUMN service_tickets.assigned_to_name IS 'Display name of assigned technician';

-- ============================================================
-- PART 2: Global Skills table
-- Master list of skills that employees can have
-- ============================================================

CREATE TABLE IF NOT EXISTS public.global_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- matches service ticket categories: network, av, shades, control, wiring, etc.
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT global_skills_name_category_unique UNIQUE (name, category)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_global_skills_category ON public.global_skills(category);
CREATE INDEX IF NOT EXISTS idx_global_skills_active ON public.global_skills(is_active);

-- Add comments
COMMENT ON TABLE public.global_skills IS 'Master list of skills for technician capability tracking';
COMMENT ON COLUMN public.global_skills.category IS 'Skill category matching service ticket types: network, av, shades, control, wiring, installation, maintenance, general';

-- ============================================================
-- PART 3: Employee Skills junction table
-- Links employees to skills with proficiency levels
-- ============================================================

CREATE TABLE IF NOT EXISTS public.employee_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.global_skills(id) ON DELETE CASCADE,
  proficiency_level TEXT NOT NULL DEFAULT 'training' CHECK (proficiency_level IN (
    'training',    -- Currently learning this skill
    'proficient',  -- Can perform tasks independently
    'expert'       -- Can train others, handles complex cases
  )),
  certified_at TIMESTAMPTZ, -- Optional certification date
  certified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  certified_by_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT employee_skills_unique UNIQUE (employee_id, skill_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_employee_skills_employee ON public.employee_skills(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_skills_skill ON public.employee_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_employee_skills_proficiency ON public.employee_skills(proficiency_level);

-- Add comments
COMMENT ON TABLE public.employee_skills IS 'Employee skill certifications with proficiency levels';
COMMENT ON COLUMN public.employee_skills.proficiency_level IS 'Skill level: training (learning), proficient (independent), expert (can train others)';

-- ============================================================
-- PART 4: Add role column to profiles if not exists
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'profiles' AND column_name = 'role') THEN
    ALTER TABLE profiles ADD COLUMN role TEXT DEFAULT 'technician' CHECK (role IN (
      'admin',      -- Full system access
      'pm',         -- Project manager
      'technician'  -- Field technician
    ));
  END IF;
END $$;

COMMENT ON COLUMN profiles.role IS 'User role: admin (full access), pm (project manager), technician (field tech)';

-- ============================================================
-- PART 5: Row Level Security
-- ============================================================

ALTER TABLE public.global_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_skills ENABLE ROW LEVEL SECURITY;

-- Global skills - everyone can read, admins can write
DROP POLICY IF EXISTS global_skills_read_all ON public.global_skills;
CREATE POLICY global_skills_read_all ON public.global_skills
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS global_skills_write_auth ON public.global_skills;
CREATE POLICY global_skills_write_auth ON public.global_skills
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS global_skills_write_anon ON public.global_skills;
CREATE POLICY global_skills_write_anon ON public.global_skills
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Employee skills - everyone can read, admins can write
DROP POLICY IF EXISTS employee_skills_read_all ON public.employee_skills;
CREATE POLICY employee_skills_read_all ON public.employee_skills
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS employee_skills_write_auth ON public.employee_skills;
CREATE POLICY employee_skills_write_auth ON public.employee_skills
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS employee_skills_write_anon ON public.employee_skills;
CREATE POLICY employee_skills_write_anon ON public.employee_skills
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- PART 6: Update timestamps trigger
-- ============================================================

CREATE OR REPLACE FUNCTION update_global_skills_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_global_skills_timestamp ON public.global_skills;
CREATE TRIGGER trigger_update_global_skills_timestamp
  BEFORE UPDATE ON public.global_skills
  FOR EACH ROW
  EXECUTE FUNCTION update_global_skills_timestamp();

CREATE OR REPLACE FUNCTION update_employee_skills_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_employee_skills_timestamp ON public.employee_skills;
CREATE TRIGGER trigger_update_employee_skills_timestamp
  BEFORE UPDATE ON public.employee_skills
  FOR EACH ROW
  EXECUTE FUNCTION update_employee_skills_timestamp();

-- ============================================================
-- PART 7: Seed initial skills data
-- ============================================================

INSERT INTO public.global_skills (name, category, description, sort_order) VALUES
  -- Network skills
  ('Network Troubleshooting', 'network', 'Diagnose and resolve network connectivity issues', 1),
  ('Switch Configuration', 'network', 'Configure managed switches and VLANs', 2),
  ('Firewall Management', 'network', 'Configure and manage firewalls and security rules', 3),
  ('WiFi Installation', 'network', 'Install and configure wireless access points', 4),
  ('Network Cable Testing', 'network', 'Test and certify network cabling', 5),

  -- AV skills
  ('TV Mounting', 'av', 'Mount and install televisions', 1),
  ('Audio System Setup', 'av', 'Configure whole-home audio systems', 2),
  ('Home Theater Installation', 'av', 'Design and install home theater systems', 3),
  ('Video Distribution', 'av', 'Configure video matrix and distribution systems', 4),
  ('Projector Setup', 'av', 'Install and calibrate projectors', 5),

  -- Shades skills
  ('Motorized Shade Installation', 'shades', 'Install motorized window treatments', 1),
  ('Shade Programming', 'shades', 'Program shade limits and scenes', 2),
  ('Shade Motor Replacement', 'shades', 'Replace shade motors and components', 3),

  -- Control skills
  ('Control4 Programming', 'control', 'Program Control4 systems', 1),
  ('Crestron Programming', 'control', 'Program Crestron systems', 2),
  ('Savant Programming', 'control', 'Program Savant systems', 3),
  ('Lutron Programming', 'control', 'Program Lutron lighting and shade systems', 4),
  ('Remote Troubleshooting', 'control', 'Troubleshoot and program remotes', 5),

  -- Wiring skills
  ('Low Voltage Wiring', 'wiring', 'Install low voltage structured wiring', 1),
  ('Cable Termination', 'wiring', 'Terminate RJ45, coax, and other connectors', 2),
  ('Wire Pull and Fish', 'wiring', 'Pull wire through walls and ceilings', 3),
  ('Rack Building', 'wiring', 'Build and organize equipment racks', 4),

  -- Installation skills
  ('Equipment Rack Installation', 'installation', 'Install and organize AV racks', 1),
  ('In-Wall Speaker Installation', 'installation', 'Cut and install in-wall/ceiling speakers', 2),
  ('Outdoor Installation', 'installation', 'Install outdoor audio and video equipment', 3),

  -- Maintenance skills
  ('Firmware Updates', 'maintenance', 'Update device firmware and software', 1),
  ('System Health Checks', 'maintenance', 'Perform system diagnostics and health checks', 2),
  ('Preventive Maintenance', 'maintenance', 'Perform routine maintenance tasks', 3),

  -- General skills
  ('Customer Communication', 'general', 'Professional customer interaction and explanation', 1),
  ('Documentation', 'general', 'Create accurate service documentation', 2),
  ('Safety Compliance', 'general', 'Follow safety protocols and procedures', 3)
ON CONFLICT (name, category) DO NOTHING;

-- ============================================================
-- PART 8: Function to get qualified technicians for a category
-- ============================================================

CREATE OR REPLACE FUNCTION get_qualified_technicians(p_category TEXT, p_min_level TEXT DEFAULT 'training')
RETURNS TABLE (
  technician_id UUID,
  full_name TEXT,
  email TEXT,
  skill_count BIGINT,
  highest_level TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS technician_id,
    p.full_name,
    p.email,
    COUNT(es.id) AS skill_count,
    MAX(es.proficiency_level) AS highest_level
  FROM profiles p
  INNER JOIN employee_skills es ON es.employee_id = p.id
  INNER JOIN global_skills gs ON gs.id = es.skill_id
  WHERE gs.category = p_category
    AND gs.is_active = true
    AND (
      (p_min_level = 'training') OR
      (p_min_level = 'proficient' AND es.proficiency_level IN ('proficient', 'expert')) OR
      (p_min_level = 'expert' AND es.proficiency_level = 'expert')
    )
  GROUP BY p.id, p.full_name, p.email
  ORDER BY skill_count DESC, highest_level DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_qualified_technicians IS 'Returns technicians qualified for a service category based on their skills';

-- ============================================================
-- DONE
-- ============================================================
SELECT 'Skills system created successfully!' as status;
