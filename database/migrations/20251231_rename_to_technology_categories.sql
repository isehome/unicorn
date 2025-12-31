-- ============================================================
-- RENAME skill_categories TO technology_categories
-- These are work/service types, not just employee skills
-- ============================================================

-- Step 1: Rename the table
ALTER TABLE IF EXISTS public.skill_categories RENAME TO technology_categories;

-- Step 2: Rename the trigger function
DROP TRIGGER IF EXISTS trigger_update_skill_categories_timestamp ON public.technology_categories;

CREATE OR REPLACE FUNCTION update_technology_categories_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_technology_categories_timestamp
  BEFORE UPDATE ON public.technology_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_technology_categories_timestamp();

-- Step 3: Drop old function (cleanup)
DROP FUNCTION IF EXISTS update_skill_categories_timestamp();

-- Step 4: Rename policies (drop old and new names to handle re-runs)
DROP POLICY IF EXISTS skill_categories_read_all ON public.technology_categories;
DROP POLICY IF EXISTS skill_categories_write_auth ON public.technology_categories;
DROP POLICY IF EXISTS skill_categories_write_anon ON public.technology_categories;
DROP POLICY IF EXISTS technology_categories_read_all ON public.technology_categories;
DROP POLICY IF EXISTS technology_categories_write_auth ON public.technology_categories;
DROP POLICY IF EXISTS technology_categories_write_anon ON public.technology_categories;

CREATE POLICY technology_categories_read_all ON public.technology_categories
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY technology_categories_write_auth ON public.technology_categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY technology_categories_write_anon ON public.technology_categories
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Step 5: Update indexes (rename for clarity)
DROP INDEX IF EXISTS idx_skill_categories_active;
DROP INDEX IF EXISTS idx_skill_categories_sort;

CREATE INDEX IF NOT EXISTS idx_technology_categories_active ON public.technology_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_technology_categories_sort ON public.technology_categories(sort_order);

-- Step 6: Update comments
COMMENT ON TABLE public.technology_categories IS 'Technology/work categories for service tickets and employee skills';

-- ============================================================
-- DONE
-- ============================================================
SELECT 'Renamed skill_categories to technology_categories!' as status;
