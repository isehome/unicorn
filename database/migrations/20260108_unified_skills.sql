-- ============================================================
-- UNIFIED SKILLS SYSTEM MIGRATION
-- Skills as single source of truth for service tickets + employee development
-- ============================================================

-- ============================================================
-- PART 1: Ensure skill_categories table exists with all fields
-- ============================================================

CREATE TABLE IF NOT EXISTS public.skill_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748B',
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_skill_categories_active ON public.skill_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_skill_categories_sort ON public.skill_categories(sort_order);

-- ============================================================
-- PART 2: Add show_in_service column to skill_categories
-- This allows hiding categories like "Soft Skills" from service UI
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'skill_categories' AND column_name = 'show_in_service') THEN
    ALTER TABLE public.skill_categories ADD COLUMN show_in_service BOOLEAN DEFAULT TRUE;
  END IF;
END $$;

COMMENT ON COLUMN public.skill_categories.show_in_service IS 'If false, category is hidden from service ticket UI (e.g., Soft Skills)';

-- Add icon column for service ticket display
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'skill_categories' AND column_name = 'icon') THEN
    ALTER TABLE public.skill_categories ADD COLUMN icon TEXT;
  END IF;
END $$;

COMMENT ON COLUMN public.skill_categories.icon IS 'Icon name for display in service ticket UI';

-- ============================================================
-- PART 3: Ensure global_skills table exists
-- ============================================================

CREATE TABLE IF NOT EXISTS public.global_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT global_skills_name_category_unique UNIQUE (name, category)
);

CREATE INDEX IF NOT EXISTS idx_global_skills_category ON public.global_skills(category);
CREATE INDEX IF NOT EXISTS idx_global_skills_active ON public.global_skills(is_active);

-- ============================================================
-- PART 4: Add training_urls column to global_skills
-- Stores array of training resource URLs per skill
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'global_skills' AND column_name = 'training_urls') THEN
    ALTER TABLE public.global_skills ADD COLUMN training_urls JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

COMMENT ON COLUMN public.global_skills.training_urls IS 'Array of training resource URLs for this skill';

-- ============================================================
-- PART 5: Ensure skill_classes table exists (intermediate level)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.skill_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.skill_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT skill_classes_category_name_unique UNIQUE (category_id, name)
);

CREATE INDEX IF NOT EXISTS idx_skill_classes_category ON public.skill_classes(category_id);
CREATE INDEX IF NOT EXISTS idx_skill_classes_active ON public.skill_classes(is_active);
CREATE INDEX IF NOT EXISTS idx_skill_classes_sort ON public.skill_classes(sort_order);

-- Add class_id to global_skills if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'global_skills' AND column_name = 'class_id') THEN
    ALTER TABLE public.global_skills ADD COLUMN class_id UUID REFERENCES public.skill_classes(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_global_skills_class ON public.global_skills(class_id);

-- ============================================================
-- PART 6: Ensure employee_skills table exists
-- ============================================================

CREATE TABLE IF NOT EXISTS public.employee_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.global_skills(id) ON DELETE CASCADE,
  proficiency_level TEXT NOT NULL DEFAULT 'training' CHECK (proficiency_level IN (
    'training',
    'proficient',
    'expert'
  )),
  certified_at TIMESTAMPTZ,
  certified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  certified_by_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT employee_skills_unique UNIQUE (employee_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_skills_employee ON public.employee_skills(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_skills_skill ON public.employee_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_employee_skills_proficiency ON public.employee_skills(proficiency_level);

-- ============================================================
-- PART 7: Row Level Security
-- ============================================================

ALTER TABLE public.skill_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_skills ENABLE ROW LEVEL SECURITY;

-- skill_categories policies
DROP POLICY IF EXISTS skill_categories_read_all ON public.skill_categories;
CREATE POLICY skill_categories_read_all ON public.skill_categories
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS skill_categories_write_auth ON public.skill_categories;
CREATE POLICY skill_categories_write_auth ON public.skill_categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS skill_categories_write_anon ON public.skill_categories;
CREATE POLICY skill_categories_write_anon ON public.skill_categories
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- skill_classes policies
DROP POLICY IF EXISTS skill_classes_read_all ON public.skill_classes;
CREATE POLICY skill_classes_read_all ON public.skill_classes
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS skill_classes_write_auth ON public.skill_classes;
CREATE POLICY skill_classes_write_auth ON public.skill_classes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS skill_classes_write_anon ON public.skill_classes;
CREATE POLICY skill_classes_write_anon ON public.skill_classes
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- global_skills policies
DROP POLICY IF EXISTS global_skills_read_all ON public.global_skills;
CREATE POLICY global_skills_read_all ON public.global_skills
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS global_skills_write_auth ON public.global_skills;
CREATE POLICY global_skills_write_auth ON public.global_skills
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS global_skills_write_anon ON public.global_skills;
CREATE POLICY global_skills_write_anon ON public.global_skills
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- employee_skills policies
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
-- PART 8: Update timestamps triggers
-- ============================================================

CREATE OR REPLACE FUNCTION update_skill_categories_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_skill_categories_timestamp ON public.skill_categories;
CREATE TRIGGER trigger_update_skill_categories_timestamp
  BEFORE UPDATE ON public.skill_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_skill_categories_timestamp();

CREATE OR REPLACE FUNCTION update_skill_classes_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_skill_classes_timestamp ON public.skill_classes;
CREATE TRIGGER trigger_update_skill_classes_timestamp
  BEFORE UPDATE ON public.skill_classes
  FOR EACH ROW
  EXECUTE FUNCTION update_skill_classes_timestamp();

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
-- PART 9: Seed default categories (with show_in_service)
-- ============================================================

INSERT INTO public.skill_categories (name, label, color, description, sort_order, show_in_service, icon) VALUES
  ('network', 'Network', '#3B82F6', 'Network infrastructure, WiFi, switches, firewalls', 1, true, 'wifi'),
  ('av', 'Audio/Video', '#8B5CF6', 'TVs, speakers, home theater, video distribution', 2, true, 'tv'),
  ('shades', 'Shades', '#F59E0B', 'Motorized window treatments and shading systems', 3, true, 'blinds'),
  ('control', 'Control Systems', '#10B981', 'Control4, Crestron, Savant, Lutron programming', 4, true, 'settings'),
  ('wiring', 'Wiring', '#EF4444', 'Low voltage wiring, cable termination, rack building', 5, true, 'cable'),
  ('installation', 'Installation', '#EC4899', 'Equipment installation, speaker installation', 6, true, 'build'),
  ('maintenance', 'Maintenance', '#6366F1', 'Firmware updates, system health checks', 7, true, 'wrench'),
  ('general', 'General', '#64748B', 'Customer communication, documentation, safety', 8, true, 'clipboard'),
  ('soft_skills', 'Soft Skills', '#94A3B8', 'Communication, teamwork, leadership skills', 9, false, 'users')
ON CONFLICT (name) DO UPDATE SET
  label = EXCLUDED.label,
  color = EXCLUDED.color,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  show_in_service = EXCLUDED.show_in_service,
  icon = EXCLUDED.icon;

-- ============================================================
-- PART 10: Create "General" class for each category
-- ============================================================

INSERT INTO public.skill_classes (category_id, name, label, description, sort_order)
SELECT
  sc.id,
  'general',
  'General',
  'General skills for ' || sc.label,
  999
FROM public.skill_categories sc
ON CONFLICT (category_id, name) DO NOTHING;

-- ============================================================
-- PART 11: Function to get qualified technicians
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

-- ============================================================
-- DONE
-- ============================================================
SELECT 'Unified skills system migration completed!' as status;
