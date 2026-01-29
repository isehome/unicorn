-- ============================================================
-- CAREER DEVELOPMENT & QUARTERLY REVIEW SYSTEM
-- Manager relationships, review cycles, sessions, evaluations
-- ============================================================

-- ============================================================
-- PART 1: Manager Relationships Table
-- Tracks who reports to whom in the org hierarchy
-- ============================================================

CREATE TABLE IF NOT EXISTS public.manager_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  manager_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT TRUE,
  relationship_type TEXT DEFAULT 'direct' CHECK (relationship_type IN (
    'direct',      -- Direct report
    'dotted',      -- Dotted line / matrix reporting
    'mentor'       -- Mentorship relationship
  )),
  effective_date DATE DEFAULT CURRENT_DATE,
  end_date DATE, -- NULL means current/active
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id),
  CONSTRAINT manager_relationships_no_self CHECK (employee_id != manager_id)
);

CREATE INDEX IF NOT EXISTS idx_manager_rel_employee ON public.manager_relationships(employee_id);
CREATE INDEX IF NOT EXISTS idx_manager_rel_manager ON public.manager_relationships(manager_id);
CREATE INDEX IF NOT EXISTS idx_manager_rel_active ON public.manager_relationships(end_date) WHERE end_date IS NULL;

COMMENT ON TABLE public.manager_relationships IS 'Tracks reporting relationships between employees';

-- ============================================================
-- PART 2: Review Cycles Table
-- Quarterly or annual review periods
-- ============================================================

CREATE TABLE IF NOT EXISTS public.review_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, -- e.g., "Q1 2026", "Annual 2026"
  cycle_type TEXT DEFAULT 'quarterly' CHECK (cycle_type IN ('quarterly', 'annual', 'mid-year')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  self_eval_due_date DATE,
  manager_review_due_date DATE,
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft',       -- Being set up
    'active',      -- Self-evaluations open
    'self_eval',   -- Self-evaluations in progress
    'manager_review', -- Manager reviews in progress
    'review',      -- Manager reviews in progress (alias)
    'completed',   -- All reviews finalized
    'archived'     -- Historical
  )),
  year INTEGER,
  quarter INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id),
  CONSTRAINT review_cycles_dates_valid CHECK (end_date > start_date)
);

CREATE INDEX IF NOT EXISTS idx_review_cycles_status ON public.review_cycles(status);
CREATE INDEX IF NOT EXISTS idx_review_cycles_dates ON public.review_cycles(start_date, end_date);

COMMENT ON TABLE public.review_cycles IS 'Defines review periods (quarters, years) for skill evaluations';

-- ============================================================
-- PART 3: Review Sessions Table
-- Individual employee's review for a cycle
-- ============================================================

CREATE TABLE IF NOT EXISTS public.review_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_cycle_id UUID NOT NULL REFERENCES public.review_cycles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  manager_id UUID REFERENCES public.profiles(id),
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',           -- Not started
    'self_eval',         -- Employee doing self-evaluation
    'self_eval_complete', -- Self-eval submitted
    'manager_review',    -- Manager reviewing
    'manager_review_complete', -- Manager review submitted
    'meeting_scheduled', -- Review meeting scheduled
    'completed'          -- All done, signed off
  )),
  self_eval_submitted_at TIMESTAMPTZ,
  manager_review_submitted_at TIMESTAMPTZ,
  meeting_scheduled_at TIMESTAMPTZ,
  meeting_completed_at TIMESTAMPTZ,
  employee_signed_at TIMESTAMPTZ,
  manager_signed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT review_sessions_unique UNIQUE (review_cycle_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_review_sessions_cycle ON public.review_sessions(review_cycle_id);
CREATE INDEX IF NOT EXISTS idx_review_sessions_employee ON public.review_sessions(employee_id);
CREATE INDEX IF NOT EXISTS idx_review_sessions_manager ON public.review_sessions(manager_id);
CREATE INDEX IF NOT EXISTS idx_review_sessions_status ON public.review_sessions(status);

COMMENT ON TABLE public.review_sessions IS 'Tracks individual employee review progress within a cycle';

-- ============================================================
-- PART 4: Skill Self-Evaluations Table
-- Employee rates their own skills
-- ============================================================

CREATE TABLE IF NOT EXISTS public.skill_self_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_cycle_id UUID NOT NULL REFERENCES public.review_cycles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.global_skills(id) ON DELETE CASCADE,
  self_rating TEXT CHECK (self_rating IN ('none', 'training', 'proficient', 'expert')),
  self_notes TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT skill_self_evals_unique UNIQUE (review_cycle_id, employee_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_self_evals_cycle ON public.skill_self_evaluations(review_cycle_id);
CREATE INDEX IF NOT EXISTS idx_self_evals_employee ON public.skill_self_evaluations(employee_id);
CREATE INDEX IF NOT EXISTS idx_self_evals_skill ON public.skill_self_evaluations(skill_id);

COMMENT ON TABLE public.skill_self_evaluations IS 'Employee self-ratings for skills during a review cycle';

-- ============================================================
-- PART 5: Skill Manager Reviews Table
-- Manager rates employee skills and sets focus areas
-- ============================================================

CREATE TABLE IF NOT EXISTS public.skill_manager_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_cycle_id UUID NOT NULL REFERENCES public.review_cycles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  manager_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.global_skills(id) ON DELETE CASCADE,
  manager_rating TEXT CHECK (manager_rating IN ('none', 'training', 'proficient', 'expert')),
  manager_notes TEXT,
  is_focus_goal BOOLEAN DEFAULT FALSE,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT skill_mgr_reviews_unique UNIQUE (review_cycle_id, employee_id, skill_id)
);

-- Add is_focus_goal column if table already exists without it
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'skill_manager_reviews' AND column_name = 'is_focus_goal') THEN
    ALTER TABLE public.skill_manager_reviews ADD COLUMN is_focus_goal BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mgr_reviews_cycle ON public.skill_manager_reviews(review_cycle_id);
CREATE INDEX IF NOT EXISTS idx_mgr_reviews_employee ON public.skill_manager_reviews(employee_id);
CREATE INDEX IF NOT EXISTS idx_mgr_reviews_manager ON public.skill_manager_reviews(manager_id);

-- Only create focus index if column exists (created above)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'skill_manager_reviews' AND column_name = 'is_focus_goal') THEN
    CREATE INDEX IF NOT EXISTS idx_mgr_reviews_focus ON public.skill_manager_reviews(is_focus_goal) WHERE is_focus_goal = TRUE;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Index may already exist, that's fine
  NULL;
END $$;

COMMENT ON TABLE public.skill_manager_reviews IS 'Manager ratings and focus goal selections for employee skills';

-- ============================================================
-- PART 6: Skill Classes Table (for organizing skills)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.skill_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.skill_classes IS 'Skill classification groups (e.g., Technical, Soft Skills)';

-- Add class_id to global_skills if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'global_skills' AND column_name = 'class_id') THEN
    ALTER TABLE global_skills ADD COLUMN class_id UUID REFERENCES public.skill_classes(id);
  END IF;
END $$;

-- Add training_urls to global_skills if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'global_skills' AND column_name = 'training_urls') THEN
    ALTER TABLE global_skills ADD COLUMN training_urls JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- ============================================================
-- PART 7: Development Goals Table (legacy, for backward compat)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.development_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_cycle_id UUID NOT NULL REFERENCES public.review_cycles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_id UUID REFERENCES public.global_skills(id) ON DELETE SET NULL,
  goal_text TEXT NOT NULL,
  target_date DATE,
  priority INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'deferred', 'cancelled')),
  progress_notes TEXT,
  achieved_at TIMESTAMPTZ,
  set_by UUID REFERENCES public.profiles(id),
  agreed_by_employee BOOLEAN DEFAULT FALSE,
  agreed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dev_goals_cycle ON public.development_goals(review_cycle_id);
CREATE INDEX IF NOT EXISTS idx_dev_goals_employee ON public.development_goals(employee_id);

-- ============================================================
-- PART 8: Row Level Security
-- ============================================================

ALTER TABLE public.manager_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_self_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_manager_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.development_goals ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (simplified for now)
DROP POLICY IF EXISTS manager_rel_all ON public.manager_relationships;
CREATE POLICY manager_rel_all ON public.manager_relationships FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS manager_rel_anon ON public.manager_relationships;
CREATE POLICY manager_rel_anon ON public.manager_relationships FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS review_cycles_all ON public.review_cycles;
CREATE POLICY review_cycles_all ON public.review_cycles FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS review_cycles_anon ON public.review_cycles;
CREATE POLICY review_cycles_anon ON public.review_cycles FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS review_sessions_all ON public.review_sessions;
CREATE POLICY review_sessions_all ON public.review_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS review_sessions_anon ON public.review_sessions;
CREATE POLICY review_sessions_anon ON public.review_sessions FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS self_evals_all ON public.skill_self_evaluations;
CREATE POLICY self_evals_all ON public.skill_self_evaluations FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS self_evals_anon ON public.skill_self_evaluations;
CREATE POLICY self_evals_anon ON public.skill_self_evaluations FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS mgr_reviews_all ON public.skill_manager_reviews;
CREATE POLICY mgr_reviews_all ON public.skill_manager_reviews FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS mgr_reviews_anon ON public.skill_manager_reviews;
CREATE POLICY mgr_reviews_anon ON public.skill_manager_reviews FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS skill_classes_all ON public.skill_classes;
CREATE POLICY skill_classes_all ON public.skill_classes FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS skill_classes_anon ON public.skill_classes;
CREATE POLICY skill_classes_anon ON public.skill_classes FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS dev_goals_all ON public.development_goals;
CREATE POLICY dev_goals_all ON public.development_goals FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS dev_goals_anon ON public.development_goals;
CREATE POLICY dev_goals_anon ON public.development_goals FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- PART 9: Recursive Org Hierarchy Function
-- Get all reports (direct and indirect) under a manager
-- ============================================================

CREATE OR REPLACE FUNCTION get_all_reports(p_manager_id UUID, p_include_inactive BOOLEAN DEFAULT FALSE)
RETURNS TABLE (
  employee_id UUID,
  full_name TEXT,
  email TEXT,
  role TEXT,
  avatar_color TEXT,
  is_active BOOLEAN,
  direct_manager_id UUID,
  direct_manager_name TEXT,
  hierarchy_level INTEGER,
  hierarchy_path UUID[]
) AS $$
WITH RECURSIVE org_tree AS (
  -- Base case: direct reports of the given manager
  SELECT
    p.id AS employee_id,
    p.full_name,
    p.email,
    p.role,
    p.avatar_color,
    p.is_active,
    mr.manager_id AS direct_manager_id,
    mgr.full_name AS direct_manager_name,
    1 AS hierarchy_level,
    ARRAY[p.id] AS hierarchy_path
  FROM manager_relationships mr
  JOIN profiles p ON p.id = mr.employee_id
  LEFT JOIN profiles mgr ON mgr.id = mr.manager_id
  WHERE mr.manager_id = p_manager_id
    AND mr.is_primary = TRUE
    AND mr.end_date IS NULL
    AND (p_include_inactive OR p.is_active = TRUE)

  UNION ALL

  -- Recursive case: reports of reports
  SELECT
    p.id AS employee_id,
    p.full_name,
    p.email,
    p.role,
    p.avatar_color,
    p.is_active,
    mr.manager_id AS direct_manager_id,
    mgr.full_name AS direct_manager_name,
    ot.hierarchy_level + 1 AS hierarchy_level,
    ot.hierarchy_path || p.id AS hierarchy_path
  FROM manager_relationships mr
  JOIN profiles p ON p.id = mr.employee_id
  LEFT JOIN profiles mgr ON mgr.id = mr.manager_id
  JOIN org_tree ot ON mr.manager_id = ot.employee_id
  WHERE mr.is_primary = TRUE
    AND mr.end_date IS NULL
    AND (p_include_inactive OR p.is_active = TRUE)
    AND NOT (p.id = ANY(ot.hierarchy_path)) -- Prevent cycles
)
SELECT * FROM org_tree
ORDER BY hierarchy_level, full_name;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION get_all_reports IS 'Recursively retrieves all direct and indirect reports under a manager';

-- ============================================================
-- PART 10: Get Org Tree Structure
-- Returns hierarchical org data for tree visualization
-- ============================================================

CREATE OR REPLACE FUNCTION get_org_tree(p_root_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  email TEXT,
  role TEXT,
  avatar_color TEXT,
  is_active BOOLEAN,
  manager_id UUID,
  manager_name TEXT,
  depth INTEGER,
  path TEXT
) AS $$
WITH RECURSIVE tree AS (
  -- Start from root (either specified or all top-level employees)
  SELECT
    p.id,
    p.full_name,
    p.email,
    p.role,
    p.avatar_color,
    p.is_active,
    mr.manager_id,
    mgr.full_name AS manager_name,
    0 AS depth,
    p.full_name AS path
  FROM profiles p
  LEFT JOIN manager_relationships mr ON mr.employee_id = p.id
    AND mr.is_primary = TRUE
    AND mr.end_date IS NULL
  LEFT JOIN profiles mgr ON mgr.id = mr.manager_id
  WHERE
    CASE
      WHEN p_root_id IS NOT NULL THEN p.id = p_root_id
      ELSE mr.manager_id IS NULL AND p.is_active = TRUE
    END

  UNION ALL

  SELECT
    p.id,
    p.full_name,
    p.email,
    p.role,
    p.avatar_color,
    p.is_active,
    mr.manager_id,
    mgr.full_name AS manager_name,
    t.depth + 1,
    t.path || ' > ' || p.full_name
  FROM profiles p
  JOIN manager_relationships mr ON mr.employee_id = p.id
    AND mr.is_primary = TRUE
    AND mr.end_date IS NULL
  LEFT JOIN profiles mgr ON mgr.id = mr.manager_id
  JOIN tree t ON mr.manager_id = t.id
  WHERE p.is_active = TRUE
    AND t.depth < 10 -- Safety limit
)
SELECT * FROM tree
ORDER BY path;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION get_org_tree IS 'Returns org structure as a tree for visualization';

-- ============================================================
-- PART 11: Update Timestamps Triggers
-- ============================================================

CREATE OR REPLACE FUNCTION update_career_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_manager_rel_timestamp ON public.manager_relationships;
CREATE TRIGGER trigger_manager_rel_timestamp
  BEFORE UPDATE ON public.manager_relationships
  FOR EACH ROW EXECUTE FUNCTION update_career_timestamp();

DROP TRIGGER IF EXISTS trigger_review_cycles_timestamp ON public.review_cycles;
CREATE TRIGGER trigger_review_cycles_timestamp
  BEFORE UPDATE ON public.review_cycles
  FOR EACH ROW EXECUTE FUNCTION update_career_timestamp();

DROP TRIGGER IF EXISTS trigger_review_sessions_timestamp ON public.review_sessions;
CREATE TRIGGER trigger_review_sessions_timestamp
  BEFORE UPDATE ON public.review_sessions
  FOR EACH ROW EXECUTE FUNCTION update_career_timestamp();

DROP TRIGGER IF EXISTS trigger_self_evals_timestamp ON public.skill_self_evaluations;
CREATE TRIGGER trigger_self_evals_timestamp
  BEFORE UPDATE ON public.skill_self_evaluations
  FOR EACH ROW EXECUTE FUNCTION update_career_timestamp();

DROP TRIGGER IF EXISTS trigger_mgr_reviews_timestamp ON public.skill_manager_reviews;
CREATE TRIGGER trigger_mgr_reviews_timestamp
  BEFORE UPDATE ON public.skill_manager_reviews
  FOR EACH ROW EXECUTE FUNCTION update_career_timestamp();

DROP TRIGGER IF EXISTS trigger_skill_classes_timestamp ON public.skill_classes;
CREATE TRIGGER trigger_skill_classes_timestamp
  BEFORE UPDATE ON public.skill_classes
  FOR EACH ROW EXECUTE FUNCTION update_career_timestamp();

DROP TRIGGER IF EXISTS trigger_dev_goals_timestamp ON public.development_goals;
CREATE TRIGGER trigger_dev_goals_timestamp
  BEFORE UPDATE ON public.development_goals
  FOR EACH ROW EXECUTE FUNCTION update_career_timestamp();

-- ============================================================
-- PART 12: Seed Initial Skill Classes (skip if table has different structure)
-- ============================================================

-- Only seed if skill_classes table doesn't have a category_id column (our new schema)
-- If it has category_id, it's an existing table with different structure - skip seeding
DO $$
BEGIN
  -- Check if this is our new table structure (no category_id required)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'skill_classes'
    AND column_name = 'category_id'
    AND is_nullable = 'NO'
  ) THEN
    -- Safe to insert - either no category_id or it's nullable
    INSERT INTO skill_classes (name, label, description, sort_order)
    SELECT v.name, v.label, v.description, v.sort_order
    FROM (VALUES
      ('technical', 'Technical Skills', 'Core technical competencies for installations and service', 1),
      ('systems', 'Systems Knowledge', 'Platform-specific expertise', 2),
      ('soft', 'Soft Skills', 'Communication and interpersonal abilities', 3),
      ('safety', 'Safety & Compliance', 'Safety protocols and regulatory compliance', 4)
    ) AS v(name, label, description, sort_order)
    WHERE NOT EXISTS (SELECT 1 FROM skill_classes WHERE skill_classes.name = v.name);
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Table structure different, skip seeding
  RAISE NOTICE 'Skipping skill_classes seed - table has different structure';
END $$;

-- ============================================================
-- DONE
-- ============================================================
SELECT 'Career Development system created successfully!' as status;
