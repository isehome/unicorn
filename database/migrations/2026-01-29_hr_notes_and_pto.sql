-- ============================================================================
-- HR NOTES AND PTO SYSTEM
-- Created: 2026-01-29
--
-- This migration adds:
-- 1. employee_notes - Quick capture of thoughts/observations about employees
-- 2. pto_balances - Track vacation, sick, personal time balances
-- 3. pto_requests - Time off request workflow with approval
-- 4. company_holidays - Company-wide holiday definitions
-- ============================================================================

-- ============================================================================
-- EMPLOYEE NOTES TABLE
-- Quick capture notes for performance reviews. Can be about self or others.
-- ============================================================================
CREATE TABLE IF NOT EXISTS employee_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who is this note about?
  subject_employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Who wrote the note?
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Note content
  note_text TEXT NOT NULL,

  -- Categorization
  note_type VARCHAR(50) DEFAULT 'general', -- 'positive', 'improvement', 'accomplishment', 'concern', 'general'

  -- Link to review cycle (optional - if note is attached to a specific review)
  review_cycle_id UUID REFERENCES review_cycles(id) ON DELETE SET NULL,

  -- Has this been incorporated into a review?
  incorporated_at TIMESTAMPTZ,
  incorporated_into_session_id UUID REFERENCES review_sessions(id) ON DELETE SET NULL,

  -- Visibility
  is_private BOOLEAN DEFAULT false, -- If true, only author can see it

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_employee_notes_subject ON employee_notes(subject_employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_notes_author ON employee_notes(author_id);
CREATE INDEX IF NOT EXISTS idx_employee_notes_created ON employee_notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_notes_type ON employee_notes(note_type);

-- ============================================================================
-- PTO BALANCE TYPES
-- Define types of time off (vacation, sick, personal, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pto_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  label VARCHAR(100) NOT NULL,
  description TEXT,
  color VARCHAR(20) DEFAULT '#3B82F6',
  icon VARCHAR(50) DEFAULT 'calendar',

  -- Accrual settings
  accrues_monthly BOOLEAN DEFAULT true,
  monthly_accrual_hours DECIMAL(5,2) DEFAULT 0, -- Hours per month
  max_carryover_hours DECIMAL(6,2), -- Max hours that carry to next year
  max_balance_hours DECIMAL(6,2), -- Cap on total balance

  -- Behavior
  requires_approval BOOLEAN DEFAULT true,
  min_notice_days INTEGER DEFAULT 1, -- Minimum days advance notice

  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default PTO types
INSERT INTO pto_types (name, label, description, color, icon, accrues_monthly, monthly_accrual_hours, max_carryover_hours, requires_approval, sort_order)
VALUES
  ('vacation', 'Vacation', 'Paid time off for rest and personal activities', '#10B981', 'umbrella', true, 6.67, 40, true, 1),
  ('sick', 'Sick Leave', 'Time off for illness or medical appointments', '#EF4444', 'heart-pulse', true, 4.0, 40, false, 2),
  ('personal', 'Personal Day', 'Flexible time off for personal matters', '#8B5CF6', 'user', false, 0, 0, true, 3),
  ('bereavement', 'Bereavement', 'Time off for loss of family member', '#64748B', 'heart', false, 0, 0, false, 4),
  ('jury_duty', 'Jury Duty', 'Time off for civic duty', '#F59E0B', 'scale', false, 0, 0, false, 5)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- PTO BALANCES
-- Track each employee's time off balances per type
-- ============================================================================
CREATE TABLE IF NOT EXISTS pto_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pto_type_id UUID NOT NULL REFERENCES pto_types(id) ON DELETE CASCADE,

  -- Current balance in hours
  balance_hours DECIMAL(6,2) DEFAULT 0,

  -- Year tracking for carryover
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),

  -- Hours used this year
  used_hours DECIMAL(6,2) DEFAULT 0,

  -- Hours carried over from last year
  carryover_hours DECIMAL(6,2) DEFAULT 0,

  -- Manual adjustments (admin corrections)
  adjustment_hours DECIMAL(6,2) DEFAULT 0,
  adjustment_notes TEXT,

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(employee_id, pto_type_id, year)
);

CREATE INDEX IF NOT EXISTS idx_pto_balances_employee ON pto_balances(employee_id);
CREATE INDEX IF NOT EXISTS idx_pto_balances_year ON pto_balances(year);

-- ============================================================================
-- PTO REQUESTS
-- Time off request workflow with approval
-- ============================================================================
CREATE TABLE IF NOT EXISTS pto_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pto_type_id UUID NOT NULL REFERENCES pto_types(id) ON DELETE RESTRICT,

  -- Request details
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  hours_requested DECIMAL(5,2) NOT NULL,

  -- Partial day support
  is_partial_day BOOLEAN DEFAULT false,
  partial_day_hours DECIMAL(4,2), -- If partial, how many hours

  -- Reason/notes
  employee_notes TEXT,

  -- Approval workflow
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'denied', 'cancelled'

  -- Manager response
  approver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  approver_notes TEXT,

  -- Balance snapshot at time of request
  balance_at_request DECIMAL(6,2),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pto_requests_employee ON pto_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_pto_requests_status ON pto_requests(status);
CREATE INDEX IF NOT EXISTS idx_pto_requests_dates ON pto_requests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_pto_requests_approver ON pto_requests(approver_id) WHERE approver_id IS NOT NULL;

-- ============================================================================
-- COMPANY HOLIDAYS
-- Company-wide holiday definitions
-- ============================================================================
CREATE TABLE IF NOT EXISTS company_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  date DATE NOT NULL,
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),

  -- Is this a paid day off?
  is_paid BOOLEAN DEFAULT true,

  -- Does it affect PTO (some holidays are optional)
  is_company_closed BOOLEAN DEFAULT true,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(date, name)
);

-- Insert 2026 US holidays
INSERT INTO company_holidays (name, date, year, is_paid, is_company_closed)
VALUES
  ('New Year''s Day', '2026-01-01', 2026, true, true),
  ('Martin Luther King Jr. Day', '2026-01-19', 2026, true, true),
  ('Presidents'' Day', '2026-02-16', 2026, true, true),
  ('Memorial Day', '2026-05-25', 2026, true, true),
  ('Independence Day', '2026-07-03', 2026, true, true), -- Observed Friday
  ('Labor Day', '2026-09-07', 2026, true, true),
  ('Thanksgiving', '2026-11-26', 2026, true, true),
  ('Day After Thanksgiving', '2026-11-27', 2026, true, true),
  ('Christmas Eve', '2026-12-24', 2026, true, true),
  ('Christmas Day', '2026-12-25', 2026, true, true)
ON CONFLICT (date, name) DO NOTHING;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Employee Notes RLS
ALTER TABLE employee_notes ENABLE ROW LEVEL SECURITY;

-- Authors can always see their own notes
CREATE POLICY "Authors can view own notes" ON employee_notes
  FOR SELECT USING (auth.uid() = author_id);

-- Managers can see notes about their direct reports (non-private)
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

-- Employees can see non-private notes about themselves
CREATE POLICY "Employees can view notes about self" ON employee_notes
  FOR SELECT USING (
    NOT is_private AND
    subject_employee_id = auth.uid()
  );

-- Users can create notes about their reports or themselves
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

-- Authors can update their own notes
CREATE POLICY "Authors can update own notes" ON employee_notes
  FOR UPDATE USING (auth.uid() = author_id);

-- Authors can delete their own notes
CREATE POLICY "Authors can delete own notes" ON employee_notes
  FOR DELETE USING (auth.uid() = author_id);

-- PTO Balances RLS
ALTER TABLE pto_balances ENABLE ROW LEVEL SECURITY;

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

-- PTO Requests RLS
ALTER TABLE pto_requests ENABLE ROW LEVEL SECURITY;

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

-- Company Holidays - everyone can read
ALTER TABLE company_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view holidays" ON company_holidays
  FOR SELECT USING (true);

-- PTO Types - everyone can read
ALTER TABLE pto_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view pto types" ON pto_types
  FOR SELECT USING (true);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to calculate working days between two dates (excluding weekends and holidays)
CREATE OR REPLACE FUNCTION calculate_working_days(start_dt DATE, end_dt DATE)
RETURNS INTEGER AS $$
DECLARE
  working_days INTEGER := 0;
  current_dt DATE := start_dt;
  holiday_count INTEGER;
BEGIN
  WHILE current_dt <= end_dt LOOP
    -- Skip weekends
    IF EXTRACT(DOW FROM current_dt) NOT IN (0, 6) THEN
      -- Check if it's not a holiday
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

-- Function to auto-create PTO balances for new year
CREATE OR REPLACE FUNCTION initialize_pto_balance(emp_id UUID, type_id UUID, for_year INTEGER)
RETURNS UUID AS $$
DECLARE
  new_id UUID;
  prev_balance DECIMAL(6,2);
  max_carry DECIMAL(6,2);
  carry_amt DECIMAL(6,2) := 0;
BEGIN
  -- Get carryover from previous year
  SELECT balance_hours, pt.max_carryover_hours
  INTO prev_balance, max_carry
  FROM pto_balances pb
  JOIN pto_types pt ON pt.id = pb.pto_type_id
  WHERE pb.employee_id = emp_id
    AND pb.pto_type_id = type_id
    AND pb.year = for_year - 1;

  -- Calculate carryover (capped at max)
  IF prev_balance IS NOT NULL AND max_carry IS NOT NULL THEN
    carry_amt := LEAST(prev_balance, max_carry);
  END IF;

  -- Insert new balance record
  INSERT INTO pto_balances (employee_id, pto_type_id, year, balance_hours, carryover_hours)
  VALUES (emp_id, type_id, for_year, carry_amt, carry_amt)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update balances when request is approved
CREATE OR REPLACE FUNCTION update_pto_balance_on_approval()
RETURNS TRIGGER AS $$
BEGIN
  -- Only act on status change to 'approved'
  IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
    -- Deduct hours from balance
    UPDATE pto_balances
    SET
      balance_hours = balance_hours - NEW.hours_requested,
      used_hours = used_hours + NEW.hours_requested,
      updated_at = NOW()
    WHERE employee_id = NEW.employee_id
      AND pto_type_id = NEW.pto_type_id
      AND year = EXTRACT(YEAR FROM NEW.start_date);
  END IF;

  -- If request is cancelled after approval, restore balance
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

CREATE TRIGGER trigger_pto_balance_update
  AFTER UPDATE ON pto_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_pto_balance_on_approval();

-- ============================================================================
-- GRANTS (for service role)
-- ============================================================================
GRANT ALL ON employee_notes TO authenticated;
GRANT ALL ON pto_types TO authenticated;
GRANT ALL ON pto_balances TO authenticated;
GRANT ALL ON pto_requests TO authenticated;
GRANT ALL ON company_holidays TO authenticated;
