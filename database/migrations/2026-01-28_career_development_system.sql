-- ============================================================================
-- Career Development & Quarterly Skills Review System
-- Created: 2026-01-28
--
-- This migration adds comprehensive career development features:
-- 1. Manager/employee relationships (org structure)
-- 2. Review cycles (quarterly periods)
-- 3. Self-evaluations (employee self-ratings)
-- 4. Manager reviews (manager ratings)
-- 5. Development goals (5 focus skills per quarter)
-- 6. Review sessions (meeting tracking)
-- 7. Audit trail (history of all rating changes)
-- ============================================================================

-- ============================================================================
-- 1. MANAGER RELATIONSHIPS - Org chart structure
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.manager_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  manager_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT TRUE,
  relationship_type TEXT DEFAULT 'direct' CHECK (relationship_type IN ('direct', 'dotted', 'mentor')),
  effective_date DATE DEFAULT CURRENT_DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT no_self_management CHECK (employee_id != manager_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_manager_relationships_employee ON manager_relationships(employee_id);
CREATE INDEX IF NOT EXISTS idx_manager_relationships_manager ON manager_relationships(manager_id);
CREATE INDEX IF NOT EXISTS idx_manager_relationships_active ON manager_relationships(employee_id) WHERE end_date IS NULL;

-- RLS Policy
ALTER TABLE manager_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manager_relationships_policy" ON manager_relationships;
CREATE POLICY "manager_relationships_policy" ON manager_relationships
FOR ALL TO anon, authenticated
USING (true)
WITH CHECK (true);

-- ============================================================================
-- 2. REVIEW CYCLES - Quarterly review periods
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.review_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,  -- e.g., "Q1 2026"
  year INTEGER NOT NULL,
  quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  self_eval_due_date DATE NOT NULL,
  manager_review_due_date DATE NOT NULL,
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'self_eval', 'manager_review', 'completed', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_year_quarter UNIQUE (year, quarter)
);

-- Index for current cycle lookup
CREATE INDEX IF NOT EXISTS idx_review_cycles_status ON review_cycles(status);
CREATE INDEX IF NOT EXISTS idx_review_cycles_dates ON review_cycles(start_date, end_date);

-- RLS Policy
ALTER TABLE review_cycles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "review_cycles_policy" ON review_cycles;
CREATE POLICY "review_cycles_policy" ON review_cycles
FOR ALL TO anon, authenticated
USING (true)
WITH CHECK (true);

-- ============================================================================
-- 3. SKILL SELF EVALUATIONS - Employee self-ratings
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.skill_self_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_cycle_id UUID NOT NULL REFERENCES review_cycles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES global_skills(id) ON DELETE CASCADE,
  self_rating TEXT NOT NULL CHECK (self_rating IN ('none', 'training', 'proficient', 'expert')),
  self_notes TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_self_eval UNIQUE (review_cycle_id, employee_id, skill_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_skill_self_evals_employee_cycle ON skill_self_evaluations(employee_id, review_cycle_id);
CREATE INDEX IF NOT EXISTS idx_skill_self_evals_skill ON skill_self_evaluations(skill_id);

-- RLS Policy
ALTER TABLE skill_self_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "skill_self_evaluations_policy" ON skill_self_evaluations;
CREATE POLICY "skill_self_evaluations_policy" ON skill_self_evaluations
FOR ALL TO anon, authenticated
USING (true)
WITH CHECK (true);

-- ============================================================================
-- 4. SKILL MANAGER REVIEWS - Manager ratings of employees
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.skill_manager_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_cycle_id UUID NOT NULL REFERENCES review_cycles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  manager_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES global_skills(id) ON DELETE CASCADE,
  manager_rating TEXT NOT NULL CHECK (manager_rating IN ('none', 'training', 'proficient', 'expert')),
  manager_notes TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_manager_review UNIQUE (review_cycle_id, employee_id, skill_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_skill_manager_reviews_employee_cycle ON skill_manager_reviews(employee_id, review_cycle_id);
CREATE INDEX IF NOT EXISTS idx_skill_manager_reviews_manager ON skill_manager_reviews(manager_id);
CREATE INDEX IF NOT EXISTS idx_skill_manager_reviews_skill ON skill_manager_reviews(skill_id);

-- RLS Policy
ALTER TABLE skill_manager_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "skill_manager_reviews_policy" ON skill_manager_reviews;
CREATE POLICY "skill_manager_reviews_policy" ON skill_manager_reviews
FOR ALL TO anon, authenticated
USING (true)
WITH CHECK (true);

-- ============================================================================
-- 5. DEVELOPMENT GOALS - 5 focus skills per quarter per employee
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.development_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_cycle_id UUID NOT NULL REFERENCES review_cycles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES global_skills(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL CHECK (priority BETWEEN 1 AND 5),
  target_level TEXT NOT NULL CHECK (target_level IN ('training', 'proficient', 'expert')),
  current_level TEXT CHECK (current_level IN ('none', 'training', 'proficient', 'expert')),
  action_plan TEXT,
  employee_agreed_at TIMESTAMPTZ,
  manager_agreed_at TIMESTAMPTZ,
  manager_id UUID REFERENCES profiles(id),
  progress_notes TEXT,
  achieved_at TIMESTAMPTZ,
  achieved_level TEXT CHECK (achieved_level IN ('training', 'proficient', 'expert')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  CONSTRAINT unique_goal_priority UNIQUE (review_cycle_id, employee_id, priority),
  CONSTRAINT unique_skill_goal UNIQUE (review_cycle_id, employee_id, skill_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_development_goals_employee_cycle ON development_goals(employee_id, review_cycle_id);
CREATE INDEX IF NOT EXISTS idx_development_goals_skill ON development_goals(skill_id);

-- RLS Policy
ALTER TABLE development_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "development_goals_policy" ON development_goals;
CREATE POLICY "development_goals_policy" ON development_goals
FOR ALL TO anon, authenticated
USING (true)
WITH CHECK (true);

-- ============================================================================
-- 6. REVIEW SESSIONS - Track the overall review meeting/session
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.review_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_cycle_id UUID NOT NULL REFERENCES review_cycles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  manager_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'self_eval_complete', 'manager_review_complete', 'meeting_scheduled', 'completed')),
  self_eval_submitted_at TIMESTAMPTZ,
  manager_review_submitted_at TIMESTAMPTZ,
  meeting_date DATE,
  meeting_notes TEXT,
  overall_rating TEXT CHECK (overall_rating IN ('exceeds', 'meets', 'developing', 'needs_improvement')),
  employee_signature_at TIMESTAMPTZ,
  manager_signature_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_review_session UNIQUE (review_cycle_id, employee_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_review_sessions_employee ON review_sessions(employee_id);
CREATE INDEX IF NOT EXISTS idx_review_sessions_manager ON review_sessions(manager_id);
CREATE INDEX IF NOT EXISTS idx_review_sessions_cycle ON review_sessions(review_cycle_id);
CREATE INDEX IF NOT EXISTS idx_review_sessions_status ON review_sessions(status);

-- RLS Policy
ALTER TABLE review_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "review_sessions_policy" ON review_sessions;
CREATE POLICY "review_sessions_policy" ON review_sessions
FOR ALL TO anon, authenticated
USING (true)
WITH CHECK (true);

-- ============================================================================
-- 7. SKILL REVIEW HISTORY - Audit trail for all rating changes
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.skill_review_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (source_type IN ('self_evaluation', 'manager_review', 'official_update', 'goal_achieved')),
  source_id UUID,  -- References the self_eval or manager_review or employee_skills id
  skill_id UUID NOT NULL REFERENCES global_skills(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  old_rating TEXT,
  new_rating TEXT,
  changed_by UUID REFERENCES profiles(id),
  changed_by_name TEXT,
  change_notes TEXT,
  review_cycle_id UUID REFERENCES review_cycles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for history lookup
CREATE INDEX IF NOT EXISTS idx_skill_review_history_employee ON skill_review_history(employee_id);
CREATE INDEX IF NOT EXISTS idx_skill_review_history_skill ON skill_review_history(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_review_history_cycle ON skill_review_history(review_cycle_id);
CREATE INDEX IF NOT EXISTS idx_skill_review_history_created ON skill_review_history(created_at DESC);

-- RLS Policy
ALTER TABLE skill_review_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "skill_review_history_policy" ON skill_review_history;
CREATE POLICY "skill_review_history_policy" ON skill_review_history
FOR ALL TO anon, authenticated
USING (true)
WITH CHECK (true);

-- ============================================================================
-- 8. MODIFY EXISTING TABLES
-- ============================================================================

-- Add default_manager_id to profiles for quick lookup
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS default_manager_id UUID REFERENCES profiles(id);

-- Add review tracking fields to employee_skills
ALTER TABLE employee_skills ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ;
ALTER TABLE employee_skills ADD COLUMN IF NOT EXISTS last_reviewed_by UUID REFERENCES profiles(id);
ALTER TABLE employee_skills ADD COLUMN IF NOT EXISTS last_reviewed_by_name TEXT;
ALTER TABLE employee_skills ADD COLUMN IF NOT EXISTS review_cycle_id UUID REFERENCES review_cycles(id);

-- ============================================================================
-- 9. HELPER FUNCTIONS
-- ============================================================================

-- Function to get current active review cycle
CREATE OR REPLACE FUNCTION get_current_review_cycle()
RETURNS review_cycles AS $$
  SELECT *
  FROM review_cycles
  WHERE status IN ('self_eval', 'manager_review')
  ORDER BY start_date DESC
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Function to check if user is manager of another user
CREATE OR REPLACE FUNCTION is_manager_of(p_manager_id UUID, p_employee_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM manager_relationships
    WHERE manager_id = p_manager_id
      AND employee_id = p_employee_id
      AND is_primary = TRUE
      AND end_date IS NULL
  );
$$ LANGUAGE SQL STABLE;

-- Function to get direct reports for a manager
CREATE OR REPLACE FUNCTION get_direct_reports(p_manager_id UUID)
RETURNS TABLE (
  employee_id UUID,
  full_name TEXT,
  email TEXT,
  role TEXT,
  relationship_type TEXT
) AS $$
  SELECT
    p.id as employee_id,
    p.full_name,
    p.email,
    p.role,
    mr.relationship_type
  FROM manager_relationships mr
  JOIN profiles p ON p.id = mr.employee_id
  WHERE mr.manager_id = p_manager_id
    AND mr.is_primary = TRUE
    AND mr.end_date IS NULL
    AND p.is_active = TRUE
  ORDER BY p.full_name;
$$ LANGUAGE SQL STABLE;

-- Function to get employee's primary manager
CREATE OR REPLACE FUNCTION get_primary_manager(p_employee_id UUID)
RETURNS TABLE (
  manager_id UUID,
  full_name TEXT,
  email TEXT,
  role TEXT
) AS $$
  SELECT
    p.id as manager_id,
    p.full_name,
    p.email,
    p.role
  FROM manager_relationships mr
  JOIN profiles p ON p.id = mr.manager_id
  WHERE mr.employee_id = p_employee_id
    AND mr.is_primary = TRUE
    AND mr.end_date IS NULL
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Function to auto-assign managers based on role hierarchy
-- Directors manage managers, managers manage technicians
CREATE OR REPLACE FUNCTION auto_assign_managers_by_role()
RETURNS void AS $$
DECLARE
  v_director RECORD;
  v_manager RECORD;
  v_technician RECORD;
BEGIN
  -- Get all directors (they don't have auto-assigned managers)
  -- Managers are assigned to directors
  FOR v_director IN
    SELECT id FROM profiles WHERE role = 'director' AND is_active = TRUE
  LOOP
    FOR v_manager IN
      SELECT id FROM profiles WHERE role = 'manager' AND is_active = TRUE
    LOOP
      -- Check if relationship already exists
      IF NOT EXISTS (
        SELECT 1 FROM manager_relationships
        WHERE employee_id = v_manager.id AND end_date IS NULL
      ) THEN
        INSERT INTO manager_relationships (employee_id, manager_id, is_primary, relationship_type)
        VALUES (v_manager.id, v_director.id, TRUE, 'direct')
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;

  -- Managers manage technicians
  FOR v_manager IN
    SELECT id FROM profiles WHERE role = 'manager' AND is_active = TRUE
  LOOP
    FOR v_technician IN
      SELECT id FROM profiles WHERE role = 'technician' AND is_active = TRUE
    LOOP
      -- Check if relationship already exists
      IF NOT EXISTS (
        SELECT 1 FROM manager_relationships
        WHERE employee_id = v_technician.id AND end_date IS NULL
      ) THEN
        INSERT INTO manager_relationships (employee_id, manager_id, is_primary, relationship_type)
        VALUES (v_technician.id, v_manager.id, TRUE, 'direct')
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 10. VIEWS FOR COMMON QUERIES
-- ============================================================================

-- View: Employee review status for current cycle
CREATE OR REPLACE VIEW v_employee_review_status AS
SELECT
  p.id as employee_id,
  p.full_name,
  p.email,
  p.role,
  rc.id as cycle_id,
  rc.name as cycle_name,
  rc.status as cycle_status,
  rs.status as review_status,
  rs.self_eval_submitted_at,
  rs.manager_review_submitted_at,
  rs.meeting_date,
  rs.overall_rating,
  (SELECT COUNT(*) FROM skill_self_evaluations sse
   WHERE sse.employee_id = p.id AND sse.review_cycle_id = rc.id AND sse.submitted_at IS NOT NULL) as self_evals_submitted,
  (SELECT COUNT(*) FROM skill_manager_reviews smr
   WHERE smr.employee_id = p.id AND smr.review_cycle_id = rc.id AND smr.submitted_at IS NOT NULL) as manager_reviews_submitted,
  (SELECT COUNT(*) FROM development_goals dg
   WHERE dg.employee_id = p.id AND dg.review_cycle_id = rc.id) as goals_count
FROM profiles p
CROSS JOIN review_cycles rc
LEFT JOIN review_sessions rs ON rs.employee_id = p.id AND rs.review_cycle_id = rc.id
WHERE p.is_active = TRUE
  AND rc.status IN ('self_eval', 'manager_review', 'completed');

-- ============================================================================
-- COMPLETE
-- ============================================================================
-- Run this migration in Supabase SQL Editor
-- After running, use auto_assign_managers_by_role() to set up initial org structure
