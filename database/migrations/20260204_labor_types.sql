-- ============================================================
-- LABOR TYPES & QBO ITEM MAPPING
-- Adds labor type management for service tickets and QBO integration
-- ============================================================

-- ============================================================
-- PART 1: Create labor_types table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.labor_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,              -- 'install', 'programming', etc.
  label TEXT NOT NULL,                     -- 'Installation', 'Programming'
  description TEXT,
  hourly_rate NUMERIC NOT NULL DEFAULT 150 CHECK (hourly_rate >= 0),
  qbo_item_name TEXT,                      -- Suggested QBO Product/Service name
  is_default BOOLEAN DEFAULT FALSE,        -- Only one should be true
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_labor_types_active ON public.labor_types(is_active);
CREATE INDEX IF NOT EXISTS idx_labor_types_sort ON public.labor_types(sort_order);

-- Add comments
COMMENT ON TABLE public.labor_types IS 'Labor types for service ticket time tracking with hourly rates';
COMMENT ON COLUMN public.labor_types.name IS 'Unique identifier slug (install, programming, etc.)';
COMMENT ON COLUMN public.labor_types.label IS 'Display name shown in UI';
COMMENT ON COLUMN public.labor_types.qbo_item_name IS 'Suggested QuickBooks Product/Service name';
COMMENT ON COLUMN public.labor_types.is_default IS 'Default labor type when none selected';

-- Insert default labor types
INSERT INTO public.labor_types (name, label, description, hourly_rate, qbo_item_name, is_default, sort_order) VALUES
  ('service', 'Service', 'General service work', 150, 'Service Labor', TRUE, 0),
  ('install', 'Installation', 'Equipment installation and setup', 150, 'Installation Labor', FALSE, 1),
  ('programming', 'Programming', 'System programming and configuration', 175, 'Programming Labor', FALSE, 2),
  ('troubleshooting', 'Troubleshooting', 'Diagnostic and repair work', 150, 'Troubleshooting Labor', FALSE, 3),
  ('consultation', 'Consultation', 'Design consultation and planning', 125, 'Consultation', FALSE, 4),
  ('training', 'Training', 'Customer training and education', 100, 'Training', FALSE, 5)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- PART 2: Add labor_type_id to service_time_logs
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'service_time_logs' AND column_name = 'labor_type_id') THEN
    ALTER TABLE public.service_time_logs
    ADD COLUMN labor_type_id UUID REFERENCES public.labor_types(id);
  END IF;
END $$;

-- Add index for labor type lookups
CREATE INDEX IF NOT EXISTS idx_service_time_logs_labor_type ON public.service_time_logs(labor_type_id);

COMMENT ON COLUMN public.service_time_logs.labor_type_id IS 'Type of labor performed during this time entry';

-- ============================================================
-- PART 3: Create qbo_item_mapping table
-- Maps local labor types and parts to QuickBooks Products/Services
-- ============================================================

CREATE TABLE IF NOT EXISTS public.qbo_item_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type TEXT NOT NULL CHECK (item_type IN ('labor', 'part')),
  local_id UUID,                           -- labor_type_id or global_part_id
  qbo_item_id TEXT NOT NULL,               -- QuickBooks Item ID
  qbo_item_name TEXT NOT NULL,             -- QuickBooks Item name
  qbo_realm_id TEXT NOT NULL,              -- QuickBooks company ID
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT qbo_item_mapping_unique UNIQUE (item_type, local_id, qbo_realm_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_qbo_item_mapping_type ON public.qbo_item_mapping(item_type);
CREATE INDEX IF NOT EXISTS idx_qbo_item_mapping_local ON public.qbo_item_mapping(local_id);
CREATE INDEX IF NOT EXISTS idx_qbo_item_mapping_realm ON public.qbo_item_mapping(qbo_realm_id);

-- Add comments
COMMENT ON TABLE public.qbo_item_mapping IS 'Maps local labor types and parts to QuickBooks Products/Services';
COMMENT ON COLUMN public.qbo_item_mapping.item_type IS 'Type of item: labor or part';
COMMENT ON COLUMN public.qbo_item_mapping.local_id IS 'ID of labor_type or global_part';
COMMENT ON COLUMN public.qbo_item_mapping.qbo_item_id IS 'QuickBooks Item/Product ID';

-- ============================================================
-- PART 4: Row Level Security
-- ============================================================

ALTER TABLE public.labor_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qbo_item_mapping ENABLE ROW LEVEL SECURITY;

-- Labor types policies (read by all, write by authenticated)
DROP POLICY IF EXISTS labor_types_read_all ON public.labor_types;
CREATE POLICY labor_types_read_all ON public.labor_types
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS labor_types_write_auth ON public.labor_types;
CREATE POLICY labor_types_write_auth ON public.labor_types
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS labor_types_write_anon ON public.labor_types;
CREATE POLICY labor_types_write_anon ON public.labor_types
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- QBO item mapping policies
DROP POLICY IF EXISTS qbo_item_mapping_read_all ON public.qbo_item_mapping;
CREATE POLICY qbo_item_mapping_read_all ON public.qbo_item_mapping
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS qbo_item_mapping_write_auth ON public.qbo_item_mapping;
CREATE POLICY qbo_item_mapping_write_auth ON public.qbo_item_mapping
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS qbo_item_mapping_write_anon ON public.qbo_item_mapping;
CREATE POLICY qbo_item_mapping_write_anon ON public.qbo_item_mapping
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- PART 5: Update timestamp triggers
-- ============================================================

CREATE OR REPLACE FUNCTION update_labor_types_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_labor_types_timestamp ON public.labor_types;
CREATE TRIGGER trigger_update_labor_types_timestamp
  BEFORE UPDATE ON public.labor_types
  FOR EACH ROW
  EXECUTE FUNCTION update_labor_types_timestamp();

CREATE OR REPLACE FUNCTION update_qbo_item_mapping_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_qbo_item_mapping_timestamp ON public.qbo_item_mapping;
CREATE TRIGGER trigger_update_qbo_item_mapping_timestamp
  BEFORE UPDATE ON public.qbo_item_mapping
  FOR EACH ROW
  EXECUTE FUNCTION update_qbo_item_mapping_timestamp();

-- ============================================================
-- PART 6: Helper function to get default labor type
-- ============================================================

CREATE OR REPLACE FUNCTION get_default_labor_type()
RETURNS UUID AS $$
DECLARE
  v_default_id UUID;
BEGIN
  SELECT id INTO v_default_id
  FROM labor_types
  WHERE is_default = TRUE AND is_active = TRUE
  LIMIT 1;

  -- Fallback to first active if no default set
  IF v_default_id IS NULL THEN
    SELECT id INTO v_default_id
    FROM labor_types
    WHERE is_active = TRUE
    ORDER BY sort_order
    LIMIT 1;
  END IF;

  RETURN v_default_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- DONE
-- ============================================================
SELECT 'Labor types and QBO item mapping tables created successfully!' as status;
