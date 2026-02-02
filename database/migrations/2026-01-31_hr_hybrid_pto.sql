-- ============================================================================
-- HR HYBRID PTO MODE
-- Created: 2026-01-31
--
-- Adds support for hybrid PTO mode:
-- - Vacation tracked separately
-- - Sick + Personal combined into one bucket
-- ============================================================================

-- Add new columns for hybrid PTO mode
ALTER TABLE company_hr_preferences
ADD COLUMN IF NOT EXISTS use_hybrid_pto BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS sick_personal_name VARCHAR(50) DEFAULT 'Sick/Personal',
ADD COLUMN IF NOT EXISTS sick_personal_annual_hours DECIMAL(6,2) DEFAULT 40,
ADD COLUMN IF NOT EXISTS sick_personal_max_carryover_hours DECIMAL(6,2) DEFAULT 40;

-- Add comment explaining the new mode
COMMENT ON COLUMN company_hr_preferences.use_hybrid_pto IS 'When true, combines sick and personal into one bucket while keeping vacation separate';
COMMENT ON COLUMN company_hr_preferences.sick_personal_name IS 'Display name for the combined sick/personal bucket';
COMMENT ON COLUMN company_hr_preferences.sick_personal_annual_hours IS 'Annual hours for combined sick/personal bucket';
COMMENT ON COLUMN company_hr_preferences.sick_personal_max_carryover_hours IS 'Max carryover hours for combined sick/personal bucket';

-- Update the sync function to handle hybrid mode
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
    -- Unified mode: All PTO combined into one bucket
    UPDATE pto_types SET is_active = false WHERE name IN ('vacation', 'sick', 'personal', 'sick_personal');

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

  ELSIF prefs.use_hybrid_pto THEN
    -- Hybrid mode: Vacation separate, Sick+Personal combined
    UPDATE pto_types SET is_active = false WHERE name IN ('sick', 'personal', 'unified_pto');

    -- Update vacation
    UPDATE pto_types SET
      is_active = true,
      monthly_accrual_hours = CASE WHEN prefs.pto_accrual_method = 'monthly' THEN prefs.vacation_annual_hours / 12 ELSE 0 END,
      max_carryover_hours = prefs.vacation_max_carryover_hours
    WHERE name = 'vacation';

    -- Upsert sick_personal combined type
    INSERT INTO pto_types (name, label, description, color, icon, accrues_monthly, monthly_accrual_hours, max_carryover_hours, requires_approval, sort_order, is_active)
    VALUES (
      'sick_personal',
      COALESCE(prefs.sick_personal_name, 'Sick/Personal'),
      'Combined sick leave and personal time',
      '#8B5CF6',
      'heart-pulse',
      prefs.pto_accrual_method = 'monthly',
      CASE WHEN prefs.pto_accrual_method = 'monthly' THEN prefs.sick_personal_annual_hours / 12 ELSE 0 END,
      prefs.sick_personal_max_carryover_hours,
      prefs.require_approval,
      2,
      true
    )
    ON CONFLICT (name) DO UPDATE SET
      label = EXCLUDED.label,
      description = EXCLUDED.description,
      monthly_accrual_hours = EXCLUDED.monthly_accrual_hours,
      max_carryover_hours = EXCLUDED.max_carryover_hours,
      is_active = true;

  ELSE
    -- Standard mode: Vacation, Sick, Personal all separate
    UPDATE pto_types SET is_active = false WHERE name IN ('unified_pto', 'sick_personal');

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

-- ============================================================================
-- Run sync to apply any pending changes
-- ============================================================================
SELECT sync_pto_types_from_preferences();
