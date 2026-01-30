-- ============================================================================
-- EMPLOYEE PTO ALLOCATIONS
-- Created: 2026-01-30
--
-- This migration adds manager-assigned PTO allocations per employee.
-- Managers can set specific hour allocations for their direct reports,
-- overriding the company-wide defaults.
-- ============================================================================

-- ============================================================================
-- EMPLOYEE PTO ALLOCATIONS TABLE
-- Manager-assigned PTO hour allocations per employee per year
-- ============================================================================
CREATE TABLE IF NOT EXISTS employee_pto_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Employee being allocated PTO
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- PTO type this allocation applies to
  pto_type_id UUID NOT NULL REFERENCES pto_types(id) ON DELETE CASCADE,

  -- Year this allocation applies to
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),

  -- Hours allocated by manager (overrides company default)
  allocated_hours DECIMAL(6,2) NOT NULL DEFAULT 0,

  -- Who set this allocation
  allocated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Notes (e.g., "Increased due to tenure" or "New hire - prorated")
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One allocation per employee per type per year
  UNIQUE(employee_id, pto_type_id, year)
);

CREATE INDEX IF NOT EXISTS idx_employee_pto_allocations_employee ON employee_pto_allocations(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_pto_allocations_year ON employee_pto_allocations(year);
CREATE INDEX IF NOT EXISTS idx_employee_pto_allocations_allocated_by ON employee_pto_allocations(allocated_by);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE employee_pto_allocations ENABLE ROW LEVEL SECURITY;

-- Employees can view their own allocations
CREATE POLICY "Employees can view own allocations" ON employee_pto_allocations
  FOR SELECT USING (auth.uid() = employee_id);

-- Managers can view allocations for their direct reports
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

-- Managers can create/update allocations for their direct reports
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

-- Admins can manage all allocations (via service role or admin flag)
-- Note: This assumes admins use service role key for operations

-- ============================================================================
-- FUNCTION: Get effective PTO allocation for an employee
-- Returns the manager-assigned allocation if exists, otherwise company default
-- ============================================================================
CREATE OR REPLACE FUNCTION get_effective_pto_allocation(
  p_employee_id UUID,
  p_pto_type_id UUID,
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)
)
RETURNS DECIMAL(6,2) AS $$
DECLARE
  v_allocation DECIMAL(6,2);
  v_company_default DECIMAL(6,2);
  v_pto_type RECORD;
BEGIN
  -- First, check for manager-assigned allocation
  SELECT allocated_hours INTO v_allocation
  FROM employee_pto_allocations
  WHERE employee_id = p_employee_id
    AND pto_type_id = p_pto_type_id
    AND year = p_year;

  IF FOUND THEN
    RETURN v_allocation;
  END IF;

  -- No manager allocation, get from PTO type defaults
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

-- ============================================================================
-- FUNCTION: Initialize PTO balance with manager allocation
-- Modified version that respects manager allocations
-- ============================================================================
CREATE OR REPLACE FUNCTION initialize_pto_balance_with_allocation(
  emp_id UUID,
  type_id UUID,
  for_year INTEGER
)
RETURNS UUID AS $$
DECLARE
  new_id UUID;
  prev_balance DECIMAL(6,2);
  max_carry DECIMAL(6,2);
  carry_amt DECIMAL(6,2) := 0;
  allocated_amt DECIMAL(6,2);
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

  -- Get allocated amount (manager or company default)
  allocated_amt := get_effective_pto_allocation(emp_id, type_id, for_year);

  -- Insert new balance record with allocation + carryover
  INSERT INTO pto_balances (
    employee_id,
    pto_type_id,
    year,
    balance_hours,
    carryover_hours
  )
  VALUES (
    emp_id,
    type_id,
    for_year,
    allocated_amt + carry_amt,
    carry_amt
  )
  ON CONFLICT (employee_id, pto_type_id, year)
  DO UPDATE SET
    balance_hours = EXCLUDED.balance_hours,
    carryover_hours = EXCLUDED.carryover_hours,
    updated_at = NOW()
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT ALL ON employee_pto_allocations TO authenticated;
GRANT EXECUTE ON FUNCTION get_effective_pto_allocation TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_pto_balance_with_allocation TO authenticated;
