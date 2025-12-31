-- ============================================================
-- SKILL CATEGORIES TABLE
-- Dynamic skill categories that can be managed in the admin UI
-- ============================================================

-- ============================================================
-- PART 1: Create skill_categories table
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

-- Add comments
COMMENT ON TABLE public.skill_categories IS 'Skill categories for organizing technician skills';
COMMENT ON COLUMN public.skill_categories.name IS 'Internal identifier (e.g., network, av, shades)';
COMMENT ON COLUMN public.skill_categories.label IS 'Display name (e.g., Network, Audio/Video, Shades)';
COMMENT ON COLUMN public.skill_categories.color IS 'Hex color for UI display';

-- ============================================================
-- PART 2: Row Level Security
-- ============================================================

ALTER TABLE public.skill_categories ENABLE ROW LEVEL SECURITY;

-- Everyone can read categories
DROP POLICY IF EXISTS skill_categories_read_all ON public.skill_categories;
CREATE POLICY skill_categories_read_all ON public.skill_categories
  FOR SELECT TO anon, authenticated USING (true);

-- Authenticated users can write (further restricted in app logic to admin roles)
DROP POLICY IF EXISTS skill_categories_write_auth ON public.skill_categories;
CREATE POLICY skill_categories_write_auth ON public.skill_categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Anon users can also write (for API access without auth)
DROP POLICY IF EXISTS skill_categories_write_anon ON public.skill_categories;
CREATE POLICY skill_categories_write_anon ON public.skill_categories
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- PART 3: Update timestamps trigger
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

-- ============================================================
-- PART 4: Seed initial categories (matching existing hardcoded ones)
-- ============================================================

INSERT INTO public.skill_categories (name, label, color, description, sort_order) VALUES
  ('network', 'Network', '#3B82F6', 'Network infrastructure, WiFi, switches, firewalls', 1),
  ('av', 'Audio/Video', '#8B5CF6', 'TVs, speakers, home theater, video distribution', 2),
  ('shades', 'Shades', '#F59E0B', 'Motorized window treatments and shading systems', 3),
  ('control', 'Control Systems', '#10B981', 'Control4, Crestron, Savant, Lutron programming', 4),
  ('wiring', 'Wiring', '#EF4444', 'Low voltage wiring, cable termination, rack building', 5),
  ('installation', 'Installation', '#EC4899', 'Equipment installation, speaker installation', 6),
  ('maintenance', 'Maintenance', '#6366F1', 'Firmware updates, system health checks', 7),
  ('general', 'General', '#64748B', 'Customer communication, documentation, safety', 8)
ON CONFLICT (name) DO UPDATE SET
  label = EXCLUDED.label,
  color = EXCLUDED.color,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;

-- ============================================================
-- DONE
-- ============================================================
SELECT 'Skill categories table created successfully!' as status;
