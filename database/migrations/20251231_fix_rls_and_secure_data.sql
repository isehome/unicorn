-- ============================================================
-- FIX RLS POLICIES AND ADD SECURE DATA AUTO-CREATION
-- ============================================================

-- ============================================================
-- PART 1: Fix role_feature_flags RLS (ensure INSERT works)
-- ============================================================

-- Drop all existing policies first
DROP POLICY IF EXISTS role_feature_flags_read ON public.role_feature_flags;
DROP POLICY IF EXISTS role_feature_flags_write ON public.role_feature_flags;
DROP POLICY IF EXISTS role_feature_flags_insert ON public.role_feature_flags;
DROP POLICY IF EXISTS role_feature_flags_update ON public.role_feature_flags;
DROP POLICY IF EXISTS role_feature_flags_delete ON public.role_feature_flags;
DROP POLICY IF EXISTS role_feature_flags_all ON public.role_feature_flags;

-- Create simple permissive policies
CREATE POLICY role_feature_flags_select ON public.role_feature_flags
  FOR SELECT TO authenticated USING (true);

CREATE POLICY role_feature_flags_insert ON public.role_feature_flags
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY role_feature_flags_update ON public.role_feature_flags
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY role_feature_flags_delete ON public.role_feature_flags
  FOR DELETE TO authenticated USING (true);

-- Same fix for user_feature_flags
DROP POLICY IF EXISTS user_feature_flags_read ON public.user_feature_flags;
DROP POLICY IF EXISTS user_feature_flags_write ON public.user_feature_flags;
DROP POLICY IF EXISTS user_feature_flags_insert ON public.user_feature_flags;
DROP POLICY IF EXISTS user_feature_flags_update ON public.user_feature_flags;
DROP POLICY IF EXISTS user_feature_flags_delete ON public.user_feature_flags;
DROP POLICY IF EXISTS user_feature_flags_all ON public.user_feature_flags;

CREATE POLICY user_feature_flags_select ON public.user_feature_flags
  FOR SELECT TO authenticated USING (true);

CREATE POLICY user_feature_flags_insert ON public.user_feature_flags
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY user_feature_flags_update ON public.user_feature_flags
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY user_feature_flags_delete ON public.user_feature_flags
  FOR DELETE TO authenticated USING (true);

-- Same fix for feature_flags
DROP POLICY IF EXISTS feature_flags_read_all ON public.feature_flags;
DROP POLICY IF EXISTS feature_flags_write_auth ON public.feature_flags;
DROP POLICY IF EXISTS feature_flags_insert ON public.feature_flags;
DROP POLICY IF EXISTS feature_flags_update ON public.feature_flags;
DROP POLICY IF EXISTS feature_flags_delete ON public.feature_flags;
DROP POLICY IF EXISTS feature_flags_all ON public.feature_flags;

CREATE POLICY feature_flags_select ON public.feature_flags
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY feature_flags_insert ON public.feature_flags
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY feature_flags_update ON public.feature_flags
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY feature_flags_delete ON public.feature_flags
  FOR DELETE TO authenticated USING (true);

-- ============================================================
-- PART 2: Add secure_data entries types for gate/house codes
-- ============================================================

-- Add entry_type column to secure_data if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'secure_data' AND column_name = 'entry_type') THEN
        ALTER TABLE public.secure_data ADD COLUMN entry_type TEXT DEFAULT 'general';
    END IF;
END $$;

-- Add index for entry_type
CREATE INDEX IF NOT EXISTS idx_secure_data_entry_type ON public.secure_data(entry_type);

-- ============================================================
-- PART 3: Function to auto-create secure data entries for contact
-- ============================================================

CREATE OR REPLACE FUNCTION create_default_secure_entries(p_contact_id UUID)
RETURNS void AS $$
DECLARE
    v_project_id UUID;
BEGIN
    -- Get a project for this contact (use their associated project or any project they're linked to)
    SELECT COALESCE(c.project_id, p.id) INTO v_project_id
    FROM contacts c
    LEFT JOIN projects p ON p.client = c.name OR p.client = c.company
    WHERE c.id = p_contact_id
    LIMIT 1;

    -- If no project found, skip
    IF v_project_id IS NULL THEN
        RETURN;
    END IF;

    -- Create gate code entry if doesn't exist
    INSERT INTO public.secure_data (project_id, key, value, entry_type, notes)
    SELECT v_project_id, 'Gate Code', '', 'gate_code', 'Auto-created for ' || c.name
    FROM contacts c
    WHERE c.id = p_contact_id
    AND NOT EXISTS (
        SELECT 1 FROM secure_data sd
        WHERE sd.project_id = v_project_id AND sd.entry_type = 'gate_code'
    );

    -- Create house code entry if doesn't exist
    INSERT INTO public.secure_data (project_id, key, value, entry_type, notes)
    SELECT v_project_id, 'House Code', '', 'house_code', 'Auto-created for ' || c.name
    FROM contacts c
    WHERE c.id = p_contact_id
    AND NOT EXISTS (
        SELECT 1 FROM secure_data sd
        WHERE sd.project_id = v_project_id AND sd.entry_type = 'house_code'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- PART 4: Trigger to auto-create secure entries on contact creation
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_create_secure_entries()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create if contact has a project
    IF NEW.project_id IS NOT NULL THEN
        PERFORM create_default_secure_entries(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_contact_secure_entries ON public.contacts;
CREATE TRIGGER trigger_contact_secure_entries
    AFTER INSERT ON public.contacts
    FOR EACH ROW
    EXECUTE FUNCTION trigger_create_secure_entries();

-- ============================================================
-- DONE
-- ============================================================
SELECT 'RLS policies fixed and secure data auto-creation added!' as status;
