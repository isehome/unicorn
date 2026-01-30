-- ============================================================================
-- HR SYSTEM - SAFE MIGRATION
-- Created: 2026-01-30
--
-- This is a SAFE version that drops and recreates policies to avoid conflicts.
-- Run this if you get "policy already exists" errors.
-- ============================================================================

-- ============================================================================
-- PART 1: EMPLOYEE NOTES TABLE
-- ============================================================================

-- Create table if not exists
CREATE TABLE IF NOT EXISTS employee_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  note_type VARCHAR(50) DEFAULT 'general',
  review_cycle_id UUID REFERENCES review_cycles(id) ON DELETE SET NULL,
  incorporated_at TIMESTAMPTZ,
  incorporated_into_session_id UUID REFERENCES review_sessions(id) ON DELETE SET NULL,
  is_private BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes if not exist
CREATE INDEX IF NOT EXISTS idx_employee_notes_subject ON employee_notes(subject_employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_notes_author ON employee_notes(author_id);
CREATE INDEX IF NOT EXISTS idx_employee_notes_created ON employee_notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_notes_type ON employee_notes(note_type);

-- Enable RLS
ALTER TABLE employee_notes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (safe - won't error if they don't exist)
DROP POLICY IF EXISTS "Authors can view own notes" ON employee_notes;
DROP POLICY IF EXISTS "Managers can view report notes" ON employee_notes;
DROP POLICY IF EXISTS "Employees can view notes about self" ON employee_notes;
DROP POLICY IF EXISTS "Users can create notes" ON employee_notes;
DROP POLICY IF EXISTS "Authors can update own notes" ON employee_notes;
DROP POLICY IF EXISTS "Authors can delete own notes" ON employee_notes;

-- Recreate policies
CREATE POLICY "Authors can view own notes" ON employee_notes
  FOR SELECT USING (auth.uid() = author_id);

CREATE POLICY "Managers can view report notes" ON employee_notes
  FOR SELECT USING (
    NOT is_private AND
    EXISTS (
      SELECT 1 FROM manager_relationships mr
      WHERE mr.manager_id = auth.uid()
      AND mr.employee_id = employee_notes.subject_employee_id
      AND mr.is_primary = true
      AND mr.end_date IS NULL
    )
  );

CREATE POLICY "Employees can view notes about self" ON employee_notes
  FOR SELECT USING (
    NOT is_private AND
    subject_employee_id = auth.uid()
  );

CREATE POLICY "Users can create notes" ON employee_notes
  FOR INSERT WITH CHECK (
    auth.uid() = author_id AND (
      subject_employee_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM manager_relationships mr
        WHERE mr.manager_id = auth.uid()
        AND mr.employee_id = subject_employee_id
        AND mr.is_primary = true
        AND mr.end_date IS NULL
      )
    )
  );

CREATE POLICY "Authors can update own notes" ON employee_notes
  FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "Authors can delete own notes" ON employee_notes
  FOR DELETE USING (auth.uid() = author_id);

-- ============================================================================
-- PART 2: PTO TYPES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS pto_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  label VARCHAR(100) NOT NULL,
  description TEXT,
  color VARCHAR(20) DEFAULT '#3B82F6',
  icon VARCHAR(50) DEFAULT 'calendar',
  accrues_monthly BOOLEAN DEFAULT true,
  monthly_accrual_hours DECIMAL(5,2) DEFAULT 0,
  max_carryover_hours DECIMAL(6,2),
  max_balance_hours DECIMAL(6,2),
  requires_approval BOOLEAN DEFAULT true,
  min_notice_days INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default PTO types (ignore if they exist)
INSERT INTO pto_types (name, label, description, color, icon, accrues_monthly, monthly_accrual_hours, max_carryover_hours, requires_approval, sort_order)
VALUES
  ('vacation', 'Vacation', 'Paid time off for rest and personal activities', '#10B981', 'umbrella', true, 6.67, 40, true, 1),
  ('sick', 'Sick Leave', 'Time off for illness or medical appointments', '#EF4444', 'heart-pulse', true, 4.0, 40, false, 2),
  ('personal', 'Personal Day', 'Flexible time off for personal matters', '#8B5CF6', 'user', false, 0, 0, true, 3),
  ('bereavement', 'Bereavement', 'Time off for loss of family member', '#64748B', 'heart', false, 0, 0, false, 4),
  ('jury_duty', 'Jury Duty', 'Time off for civic duty', '#F59E0B', 'scale', false, 0, 0, false, 5)
ON CONFLICT (name) DO NOTHING;

-- Enable RLS
ALTER TABLE pto_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can view pto types" ON pto_types;
CREATE POLICY "Everyone can view pto types" ON pto_types
  FOR SELECT USING (true);

-- ============================================================================
-- PART 3: PTO BALANCES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS pto_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pto_type_id UUID NOT NULL REFERENCES pto_types(id) ON DELETE CASCADE,
  balance_hours DECIMAL(6,2) DEFAULT 0,
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  used_hours DECIMAL(6,2) DEFAULT 0,
  carryover_hours DECIMAL(6,2) DEFAULT 0,
  adjustment_hours DECIMAL(6,2) DEFAULT 0,
  adjustment_notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, pto_type_id, year)
);

CREATE INDEX IF NOT EXISTS idx_pto_balances_employee ON pto_balances(employee_id);
CREATE INDEX IF NOT EXISTS idx_pto_balances_year ON pto_balances(year);

-- Enable RLS
ALTER TABLE pto_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees can view own balances" ON pto_balances;
DROP POLICY IF EXISTS "Managers can view report balances" ON pto_balances;

CREATE POLICY "Employees can view own balances" ON pto_balances
  FOR SELECT USING (auth.uid() = employee_id);

CREATE POLICY "Managers can view report balances" ON pto_balances
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM manager_relationships mr
      WHERE mr.manager_id = auth.uid()
      AND mr.employee_id = pto_balances.employee_id
      AND mr.is_primary = true
      AND mr.end_date IS NULL
    )
  );

-- ============================================================================
-- PART 4: PTO REQUESTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS pto_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pto_type_id UUID NOT NULL REFERENCES pto_types(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  hours_requested DECIMAL(5,2) NOT NULL,
  is_partial_day BOOLEAN DEFAULT false,
  partial_day_hours DECIMAL(4,2),
  employee_notes TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  approver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  approver_notes TEXT,
  balance_at_request DECIMAL(6,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pto_requests_employee ON pto_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_pto_requests_status ON pto_requests(status);
CREATE INDEX IF NOT EXISTS idx_pto_requests_dates ON pto_requests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_pto_requests_approver ON pto_requests(approver_id) WHERE approver_id IS NOT NULL;

-- Enable RLS
ALTER TABLE pto_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees can view own requests" ON pto_requests;
DROP POLICY IF EXISTS "Managers can view report requests" ON pto_requests;
DROP POLICY IF EXISTS "Employees can create own requests" ON pto_requests;
DROP POLICY IF EXISTS "Employees can update own pending requests" ON pto_requests;
DROP POLICY IF EXISTS "Managers can approve report requests" ON pto_requests;

CREATE POLICY "Employees can view own requests" ON pto_requests
  FOR SELECT USING (auth.uid() = employee_id);

CREATE POLICY "Managers can view report requests" ON pto_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM manager_relationships mr
      WHERE mr.manager_id = auth.uid()
      AND mr.employee_id = pto_requests.employee_id
      AND mr.is_primary = true
      AND mr.end_date IS NULL
    )
  );

CREATE POLICY "Employees can create own requests" ON pto_requests
  FOR INSERT WITH CHECK (auth.uid() = employee_id);

CREATE POLICY "Employees can update own pending requests" ON pto_requests
  FOR UPDATE USING (auth.uid() = employee_id AND status = 'pending');

CREATE POLICY "Managers can approve report requests" ON pto_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM manager_relationships mr
      WHERE mr.manager_id = auth.uid()
      AND mr.employee_id = pto_requests.employee_id
      AND mr.is_primary = true
      AND mr.end_date IS NULL
    )
  );

-- ============================================================================
-- PART 5: COMPANY HOLIDAYS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS company_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  date DATE NOT NULL,
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  is_paid BOOLEAN DEFAULT true,
  is_company_closed BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, name)
);

-- Enable RLS
ALTER TABLE company_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can view holidays" ON company_holidays;
CREATE POLICY "Everyone can view holidays" ON company_holidays
  FOR SELECT USING (true);

-- ============================================================================
-- PART 6: COMPANY HR PREFERENCES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS company_hr_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  use_unified_pto BOOLEAN DEFAULT false,
  unified_pto_name VARCHAR(50) DEFAULT 'Personal Time Off',
  unified_pto_annual_hours DECIMAL(6,2) DEFAULT 120,
  vacation_annual_hours DECIMAL(6,2) DEFAULT 80,
  sick_annual_hours DECIMAL(6,2) DEFAULT 40,
  personal_annual_hours DECIMAL(6,2) DEFAULT 24,
  vacation_max_carryover_hours DECIMAL(6,2) DEFAULT 40,
  sick_max_carryover_hours DECIMAL(6,2) DEFAULT 40,
  personal_max_carryover_hours DECIMAL(6,2) DEFAULT 0,
  unified_max_carryover_hours DECIMAL(6,2) DEFAULT 40,
  pto_accrual_method VARCHAR(20) DEFAULT 'annual',
  fiscal_year_start_month INTEGER DEFAULT 1,
  observed_holidays JSONB DEFAULT '["New Year''s Day", "Memorial Day", "Independence Day", "Labor Day", "Thanksgiving", "Day After Thanksgiving", "Christmas Eve", "Christmas Day"]'::jsonb,
  custom_holidays JSONB DEFAULT '[]'::jsonb,
  min_notice_days INTEGER DEFAULT 2,
  allow_negative_balance BOOLEAN DEFAULT false,
  max_negative_hours DECIMAL(5,2) DEFAULT 0,
  require_approval BOOLEAN DEFAULT true,
  blackout_dates JSONB DEFAULT '[]'::jsonb,
  hours_per_day DECIMAL(3,1) DEFAULT 8.0,
  enable_tenure_increases BOOLEAN DEFAULT false,
  tenure_tiers JSONB DEFAULT '[{"years": 1, "additional_vacation_hours": 0}, {"years": 3, "additional_vacation_hours": 8}, {"years": 5, "additional_vacation_hours": 16}, {"years": 10, "additional_vacation_hours": 24}]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id)
);

-- Create single row if doesn't exist
INSERT INTO company_hr_preferences (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM company_hr_preferences);

-- Enable RLS
ALTER TABLE company_hr_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can read HR preferences" ON company_hr_preferences;
DROP POLICY IF EXISTS "Admins can update HR preferences" ON company_hr_preferences;

CREATE POLICY "Everyone can read HR preferences" ON company_hr_preferences
  FOR SELECT USING (true);

CREATE POLICY "Admins can update HR preferences" ON company_hr_preferences
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- ============================================================================
-- PART 7: EMPLOYEE PTO ALLOCATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS employee_pto_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pto_type_id UUID NOT NULL REFERENCES pto_types(id) ON DELETE CASCADE,
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  allocated_hours DECIMAL(6,2) NOT NULL DEFAULT 0,
  allocated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, pto_type_id, year)
);

CREATE INDEX IF NOT EXISTS idx_employee_pto_allocations_employee ON employee_pto_allocations(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_pto_allocations_year ON employee_pto_allocations(year);
CREATE INDEX IF NOT EXISTS idx_employee_pto_allocations_allocated_by ON employee_pto_allocations(allocated_by);

-- Enable RLS
ALTER TABLE employee_pto_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees can view own allocations" ON employee_pto_allocations;
DROP POLICY IF EXISTS "Managers can view report allocations" ON employee_pto_allocations;
DROP POLICY IF EXISTS "Managers can create report allocations" ON employee_pto_allocations;
DROP POLICY IF EXISTS "Managers can update report allocations" ON employee_pto_allocations;

CREATE POLICY "Employees can view own allocations" ON employee_pto_allocations
  FOR SELECT USING (auth.uid() = employee_id);

CREATE POLICY "Managers can view report allocations" ON employee_pto_allocations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM manager_relationships mr
      WHERE mr.manager_id = auth.uid()
      AND mr.employee_id = employee_pto_allocations.employee_id
      AND mr.is_primary = true
      AND mr.end_date IS NULL
    )
  );

CREATE POLICY "Managers can create report allocations" ON employee_pto_allocations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM manager_relationships mr
      WHERE mr.manager_id = auth.uid()
      AND mr.employee_id = employee_pto_allocations.employee_id
      AND mr.is_primary = true
      AND mr.end_date IS NULL
    )
  );

CREATE POLICY "Managers can update report allocations" ON employee_pto_allocations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM manager_relationships mr
      WHERE mr.manager_id = auth.uid()
      AND mr.employee_id = employee_pto_allocations.employee_id
      AND mr.is_primary = true
      AND mr.end_date IS NULL
    )
  );

-- ============================================================================
-- PART 8: FUNCTIONS
-- ============================================================================

-- Function to calculate working days
CREATE OR REPLACE FUNCTION calculate_working_days(start_dt DATE, end_dt DATE)
RETURNS INTEGER AS $$
DECLARE
  working_days INTEGER := 0;
  current_dt DATE := start_dt;
  holiday_count INTEGER;
BEGIN
  WHILE current_dt <= end_dt LOOP
    IF EXTRACT(DOW FROM current_dt) NOT IN (0, 6) THEN
      SELECT COUNT(*) INTO holiday_count
      FROM company_holidays
      WHERE date = current_dt AND is_company_closed = true;

      IF holiday_count = 0 THEN
        working_days := working_days + 1;
      END IF;
    END IF;
    current_dt := current_dt + 1;
  END LOOP;

  RETURN working_days;
END;
$$ LANGUAGE plpgsql;

-- Function to get effective PTO allocation
CREATE OR REPLACE FUNCTION get_effective_pto_allocation(
  p_employee_id UUID,
  p_pto_type_id UUID,
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)
)
RETURNS DECIMAL(6,2) AS $$
DECLARE
  v_allocation DECIMAL(6,2);
  v_company_default DECIMAL(6,2);
BEGIN
  SELECT allocated_hours INTO v_allocation
  FROM employee_pto_allocations
  WHERE employee_id = p_employee_id
    AND pto_type_id = p_pto_type_id
    AND year = p_year;

  IF FOUND THEN
    RETURN v_allocation;
  END IF;

  SELECT
    CASE
      WHEN accrues_monthly THEN monthly_accrual_hours * 12
      ELSE 0
    END INTO v_company_default
  FROM pto_types
  WHERE id = p_pto_type_id;

  RETURN COALESCE(v_company_default, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update balances when request is approved
CREATE OR REPLACE FUNCTION update_pto_balance_on_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
    UPDATE pto_balances
    SET
      balance_hours = balance_hours - NEW.hours_requested,
      used_hours = used_hours + NEW.hours_requested,
      updated_at = NOW()
    WHERE employee_id = NEW.employee_id
      AND pto_type_id = NEW.pto_type_id
      AND year = EXTRACT(YEAR FROM NEW.start_date);
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status = 'approved' THEN
    UPDATE pto_balances
    SET
      balance_hours = balance_hours + OLD.hours_requested,
      used_hours = used_hours - OLD.hours_requested,
      updated_at = NOW()
    WHERE employee_id = OLD.employee_id
      AND pto_type_id = OLD.pto_type_id
      AND year = EXTRACT(YEAR FROM OLD.start_date);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS trigger_pto_balance_update ON pto_requests;
CREATE TRIGGER trigger_pto_balance_update
  AFTER UPDATE ON pto_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_pto_balance_on_approval();

-- ============================================================================
-- PART 9: GRANTS
-- ============================================================================

GRANT ALL ON employee_notes TO authenticated;
GRANT ALL ON pto_types TO authenticated;
GRANT ALL ON pto_balances TO authenticated;
GRANT ALL ON pto_requests TO authenticated;
GRANT ALL ON company_holidays TO authenticated;
GRANT ALL ON company_hr_preferences TO authenticated;
GRANT ALL ON employee_pto_allocations TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_working_days TO authenticated;
GRANT EXECUTE ON FUNCTION get_effective_pto_allocation TO authenticated;

-- ============================================================================
-- DONE! HR System tables and policies are ready.
-- ============================================================================
