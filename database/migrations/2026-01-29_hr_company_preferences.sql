-- ============================================================================
-- HR COMPANY PREFERENCES
-- Created: 2026-01-29
--
-- Company-level HR settings including:
-- - Time off policy configurations
-- - Holiday observances
-- - PTO allowances by type
-- - Unified PTO option (combine vacation/sick/personal)
-- ============================================================================

-- ============================================================================
-- COMPANY HR PREFERENCES TABLE
-- Singleton table (one row per company) for HR policy settings
-- ============================================================================
CREATE TABLE IF NOT EXISTS company_hr_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ═══════════════════════════════════════════════════════════════════════════
  -- PTO POLICY SETTINGS
  -- ═══════════════════════════════════════════════════════════════════════════

  -- Unified PTO mode (combines vacation, sick, personal into one bucket)
  use_unified_pto BOOLEAN DEFAULT false,
  unified_pto_name VARCHAR(50) DEFAULT 'Personal Time Off',
  unified_pto_annual_hours DECIMAL(6,2) DEFAULT 120, -- 15 days

  -- Standard annual allowances (when NOT using unified PTO)
  vacation_annual_hours DECIMAL(6,2) DEFAULT 80, -- 10 days
  sick_annual_hours DECIMAL(6,2) DEFAULT 40, -- 5 days
  personal_annual_hours DECIMAL(6,2) DEFAULT 24, -- 3 days

  -- Carryover limits
  vacation_max_carryover_hours DECIMAL(6,2) DEFAULT 40,
  sick_max_carryover_hours DECIMAL(6,2) DEFAULT 40,
  personal_max_carryover_hours DECIMAL(6,2) DEFAULT 0,
  unified_max_carryover_hours DECIMAL(6,2) DEFAULT 40,

  -- Accrual settings
  pto_accrual_method VARCHAR(20) DEFAULT 'annual', -- 'annual', 'monthly', 'per_pay_period'
  fiscal_year_start_month INTEGER DEFAULT 1, -- January

  -- ═══════════════════════════════════════════════════════════════════════════
  -- HOLIDAY SETTINGS
  -- ═══════════════════════════════════════════════════════════════════════════

  -- Which holidays are observed (JSON array of holiday names)
  observed_holidays JSONB DEFAULT '["New Year''s Day", "Memorial Day", "Independence Day", "Labor Day", "Thanksgiving", "Day After Thanksgiving", "Christmas Eve", "Christmas Day"]'::jsonb,

  -- Additional company-specific holidays (JSON array with name and date)
  custom_holidays JSONB DEFAULT '[]'::jsonb,

  -- ═══════════════════════════════════════════════════════════════════════════
  -- POLICY RULES
  -- ═══════════════════════════════════════════════════════════════════════════

  -- Minimum notice for time off requests (in days)
  min_notice_days INTEGER DEFAULT 2,

  -- Can employees take negative PTO (borrow against future accrual)?
  allow_negative_balance BOOLEAN DEFAULT false,
  max_negative_hours DECIMAL(5,2) DEFAULT 0,

  -- Require manager approval for all PTO?
  require_approval BOOLEAN DEFAULT true,

  -- Blackout dates (JSON array of date ranges when PTO is restricted)
  blackout_dates JSONB DEFAULT '[]'::jsonb,

  -- Working hours per day (for calculating days from hours)
  hours_per_day DECIMAL(3,1) DEFAULT 8.0,

  -- ═══════════════════════════════════════════════════════════════════════════
  -- TENURE-BASED INCREASES
  -- ═══════════════════════════════════════════════════════════════════════════

  -- Enable tenure-based PTO increases
  enable_tenure_increases BOOLEAN DEFAULT false,

  -- Tenure tiers (JSON array: [{years: 1, additional_hours: 8}, {years: 5, additional_hours: 16}])
  tenure_tiers JSONB DEFAULT '[
    {"years": 1, "additional_vacation_hours": 0},
    {"years": 3, "additional_vacation_hours": 8},
    {"years": 5, "additional_vacation_hours": 16},
    {"years": 10, "additional_vacation_hours": 24}
  ]'::jsonb,

  -- ═══════════════════════════════════════════════════════════════════════════
  -- METADATA
  -- ═══════════════════════════════════════════════════════════════════════════

  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id)
);

-- Create single row if doesn't exist
INSERT INTO company_hr_preferences (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM company_hr_preferences);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to get company HR preferences (creates default if not exists)
CREATE OR REPLACE FUNCTION get_hr_preferences()
RETURNS company_hr_preferences AS $$
DECLARE
  prefs company_hr_preferences;
BEGIN
  SELECT * INTO prefs FROM company_hr_preferences LIMIT 1;

  IF prefs IS NULL THEN
    INSERT INTO company_hr_preferences (id)
    VALUES (gen_random_uuid())
    RETURNING * INTO prefs;
  END IF;

  RETURN prefs;
END;
$$ LANGUAGE plpgsql;

-- Function to update PTO type settings based on company preferences
CREATE OR REPLACE FUNCTION sync_pto_types_from_preferences()
RETURNS void AS $$
DECLARE
  prefs company_hr_preferences;
BEGIN
  SELECT * INTO prefs FROM company_hr_preferences LIMIT 1;

  IF prefs IS NULL THEN
    RETURN;
  END IF;

  IF prefs.use_unified_pto THEN
    -- Deactivate individual types, activate unified
    UPDATE pto_types SET is_active = false WHERE name IN ('vacation', 'sick', 'personal');

    -- Upsert unified PTO type
    INSERT INTO pto_types (name, label, description, color, icon, accrues_monthly, monthly_accrual_hours, max_carryover_hours, requires_approval, sort_order, is_active)
    VALUES (
      'unified_pto',
      prefs.unified_pto_name,
      'Combined time off for any purpose',
      '#8B5CF6',
      'calendar',
      prefs.pto_accrual_method = 'monthly',
      CASE WHEN prefs.pto_accrual_method = 'monthly' THEN prefs.unified_pto_annual_hours / 12 ELSE 0 END,
      prefs.unified_max_carryover_hours,
      prefs.require_approval,
      1,
      true
    )
    ON CONFLICT (name) DO UPDATE SET
      label = EXCLUDED.label,
      monthly_accrual_hours = EXCLUDED.monthly_accrual_hours,
      max_carryover_hours = EXCLUDED.max_carryover_hours,
      is_active = true;

  ELSE
    -- Activate individual types, deactivate unified
    UPDATE pto_types SET is_active = false WHERE name = 'unified_pto';

    -- Update vacation
    UPDATE pto_types SET
      is_active = true,
      monthly_accrual_hours = CASE WHEN prefs.pto_accrual_method = 'monthly' THEN prefs.vacation_annual_hours / 12 ELSE 0 END,
      max_carryover_hours = prefs.vacation_max_carryover_hours
    WHERE name = 'vacation';

    -- Update sick
    UPDATE pto_types SET
      is_active = true,
      monthly_accrual_hours = CASE WHEN prefs.pto_accrual_method = 'monthly' THEN prefs.sick_annual_hours / 12 ELSE 0 END,
      max_carryover_hours = prefs.sick_max_carryover_hours
    WHERE name = 'sick';

    -- Update personal
    UPDATE pto_types SET
      is_active = true,
      monthly_accrual_hours = CASE WHEN prefs.pto_accrual_method = 'monthly' THEN prefs.personal_annual_hours / 12 ELSE 0 END,
      max_carryover_hours = prefs.personal_max_carryover_hours
    WHERE name = 'personal';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger to sync PTO types when preferences change
CREATE OR REPLACE FUNCTION on_hr_preferences_update()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM sync_pto_types_from_preferences();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_pto_on_pref_change ON company_hr_preferences;
CREATE TRIGGER trigger_sync_pto_on_pref_change
  AFTER INSERT OR UPDATE ON company_hr_preferences
  FOR EACH ROW
  EXECUTE FUNCTION on_hr_preferences_update();

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE company_hr_preferences ENABLE ROW LEVEL SECURITY;

-- Everyone can read preferences
CREATE POLICY "Everyone can read HR preferences" ON company_hr_preferences
  FOR SELECT USING (true);

-- Only admins/owners can update
CREATE POLICY "Admins can update HR preferences" ON company_hr_preferences
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT ALL ON company_hr_preferences TO authenticated;
