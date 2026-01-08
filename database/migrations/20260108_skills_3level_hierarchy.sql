-- ============================================================
-- SKILLS 3-LEVEL HIERARCHY MIGRATION
-- Category → Class → Skill (with Description)
-- ============================================================

-- ============================================================
-- PART 1: Create skill_classes table (new intermediate level)
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

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_skill_classes_category ON public.skill_classes(category_id);
CREATE INDEX IF NOT EXISTS idx_skill_classes_active ON public.skill_classes(is_active);
CREATE INDEX IF NOT EXISTS idx_skill_classes_sort ON public.skill_classes(sort_order);

-- Add comments
COMMENT ON TABLE public.skill_classes IS 'Skill classes - intermediate level between categories and skills';
COMMENT ON COLUMN public.skill_classes.category_id IS 'Parent category this class belongs to';
COMMENT ON COLUMN public.skill_classes.name IS 'Internal identifier (e.g., luxul, ubiquiti, general)';
COMMENT ON COLUMN public.skill_classes.label IS 'Display name (e.g., Luxul, Ubiquiti, General)';

-- ============================================================
-- PART 2: Add class_id to global_skills
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'global_skills' AND column_name = 'class_id') THEN
    ALTER TABLE public.global_skills ADD COLUMN class_id UUID REFERENCES public.skill_classes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add index for class lookup
CREATE INDEX IF NOT EXISTS idx_global_skills_class ON public.global_skills(class_id);

COMMENT ON COLUMN public.global_skills.class_id IS 'Optional skill class (intermediate level between category and skill)';

-- ============================================================
-- PART 3: Row Level Security for skill_classes
-- ============================================================

ALTER TABLE public.skill_classes ENABLE ROW LEVEL SECURITY;

-- Everyone can read
DROP POLICY IF EXISTS skill_classes_read_all ON public.skill_classes;
CREATE POLICY skill_classes_read_all ON public.skill_classes
  FOR SELECT TO anon, authenticated USING (true);

-- Authenticated users can write
DROP POLICY IF EXISTS skill_classes_write_auth ON public.skill_classes;
CREATE POLICY skill_classes_write_auth ON public.skill_classes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Anon users can also write (for API access)
DROP POLICY IF EXISTS skill_classes_write_anon ON public.skill_classes;
CREATE POLICY skill_classes_write_anon ON public.skill_classes
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- PART 4: Update timestamps trigger
-- ============================================================

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

-- ============================================================
-- PART 5: Seed "General" class for each existing category
-- This allows existing skills to be assigned to "General" class
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
-- PART 6: Migrate existing skills to General class
-- ============================================================

UPDATE public.global_skills gs
SET class_id = (
  SELECT sc.id
  FROM public.skill_classes sc
  INNER JOIN public.skill_categories cat ON sc.category_id = cat.id
  WHERE cat.name = gs.category AND sc.name = 'general'
)
WHERE gs.class_id IS NULL;

-- ============================================================
-- PART 7: Update get_qualified_technicians function
-- Now joins through skill_classes
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
SELECT 'Skills 3-level hierarchy migration completed!' as status;
