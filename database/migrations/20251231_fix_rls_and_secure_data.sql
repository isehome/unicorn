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
-- PART 2: Auto-create secure data entries for contacts
-- Uses contact_secure_data table (contact-scoped, not project-scoped)
-- ============================================================

-- Function to auto-create gate code and house code entries for a contact
CREATE OR REPLACE FUNCTION create_default_secure_entries(p_contact_id UUID)
RETURNS void AS $$
BEGIN
    -- Create gate code entry if doesn't exist
    INSERT INTO public.contact_secure_data (contact_id, data_type, name, password, notes)
    SELECT p_contact_id, 'credentials', 'Gate Code', '', 'Auto-created'
    WHERE NOT EXISTS (
        SELECT 1 FROM contact_secure_data csd
        WHERE csd.contact_id = p_contact_id AND csd.name = 'Gate Code'
    );

    -- Create house code entry if doesn't exist
    INSERT INTO public.contact_secure_data (contact_id, data_type, name, password, notes)
    SELECT p_contact_id, 'credentials', 'House Code', '', 'Auto-created'
    WHERE NOT EXISTS (
        SELECT 1 FROM contact_secure_data csd
        WHERE csd.contact_id = p_contact_id AND csd.name = 'House Code'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- PART 3: Trigger to auto-create secure entries on contact creation
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_create_secure_entries()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM create_default_secure_entries(NEW.id);
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
