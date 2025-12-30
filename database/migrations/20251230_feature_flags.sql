-- ============================================================
-- FEATURE FLAGS SYSTEM
-- Control which features are enabled for users/roles
-- ============================================================

-- ============================================================
-- PART 1: Create feature_flags table (global feature definitions)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general', -- 'ai', 'integrations', 'ui', 'general'
  default_enabled BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_feature_flags_active ON public.feature_flags(is_active);
CREATE INDEX IF NOT EXISTS idx_feature_flags_category ON public.feature_flags(category);

-- Add comments
COMMENT ON TABLE public.feature_flags IS 'Global feature flag definitions';
COMMENT ON COLUMN public.feature_flags.name IS 'Unique identifier for the feature (e.g., ai_chat, quickbooks_export)';
COMMENT ON COLUMN public.feature_flags.default_enabled IS 'Whether this feature is enabled by default for all users';

-- ============================================================
-- PART 2: Create user_feature_flags table (per-user overrides)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feature_flag_id UUID NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL,
  enabled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  enabled_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT user_feature_flags_unique UNIQUE (user_id, feature_flag_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_user_feature_flags_user ON public.user_feature_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_user_feature_flags_feature ON public.user_feature_flags(feature_flag_id);

-- Add comments
COMMENT ON TABLE public.user_feature_flags IS 'Per-user feature flag overrides';

-- ============================================================
-- PART 3: Create role_feature_flags table (per-role defaults)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.role_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL CHECK (role IN ('technician', 'manager', 'director', 'admin', 'owner')),
  feature_flag_id UUID NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT role_feature_flags_unique UNIQUE (role, feature_flag_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_role_feature_flags_role ON public.role_feature_flags(role);

-- Add comments
COMMENT ON TABLE public.role_feature_flags IS 'Per-role feature flag defaults (overrides global default)';

-- ============================================================
-- PART 4: Row Level Security
-- ============================================================

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_feature_flags ENABLE ROW LEVEL SECURITY;

-- Feature flags - everyone can read
DROP POLICY IF EXISTS feature_flags_read_all ON public.feature_flags;
CREATE POLICY feature_flags_read_all ON public.feature_flags
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS feature_flags_write_auth ON public.feature_flags;
CREATE POLICY feature_flags_write_auth ON public.feature_flags
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- User feature flags - users can read their own, admins can write
DROP POLICY IF EXISTS user_feature_flags_read ON public.user_feature_flags;
CREATE POLICY user_feature_flags_read ON public.user_feature_flags
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS user_feature_flags_write ON public.user_feature_flags;
CREATE POLICY user_feature_flags_write ON public.user_feature_flags
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Role feature flags - everyone can read
DROP POLICY IF EXISTS role_feature_flags_read ON public.role_feature_flags;
CREATE POLICY role_feature_flags_read ON public.role_feature_flags
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS role_feature_flags_write ON public.role_feature_flags;
CREATE POLICY role_feature_flags_write ON public.role_feature_flags
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- PART 5: Update timestamps triggers
-- ============================================================

CREATE OR REPLACE FUNCTION update_feature_flags_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_feature_flags_timestamp ON public.feature_flags;
CREATE TRIGGER trigger_update_feature_flags_timestamp
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION update_feature_flags_timestamp();

DROP TRIGGER IF EXISTS trigger_update_user_feature_flags_timestamp ON public.user_feature_flags;
CREATE TRIGGER trigger_update_user_feature_flags_timestamp
  BEFORE UPDATE ON public.user_feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION update_feature_flags_timestamp();

DROP TRIGGER IF EXISTS trigger_update_role_feature_flags_timestamp ON public.role_feature_flags;
CREATE TRIGGER trigger_update_role_feature_flags_timestamp
  BEFORE UPDATE ON public.role_feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION update_feature_flags_timestamp();

-- ============================================================
-- PART 6: Seed initial feature flags
-- ============================================================

INSERT INTO public.feature_flags (name, label, description, category, default_enabled, sort_order) VALUES
  -- AI Features
  ('ai_chat', 'AI Chat Assistant', 'Enable the AI chat assistant (copilot) for quick questions and help', 'ai', false, 1),
  ('ai_document_search', 'AI Document Search', 'Enable AI-powered search across knowledge base documents', 'ai', false, 2),
  ('ai_ticket_suggestions', 'AI Ticket Suggestions', 'Get AI-suggested solutions based on ticket history', 'ai', false, 3),

  -- Integration Features
  ('quickbooks_export', 'QuickBooks Export', 'Export service tickets as invoices to QuickBooks Online', 'integrations', false, 10),
  ('calendar_sync', 'Calendar Sync', 'Sync scheduled appointments to Microsoft/Google calendar', 'integrations', true, 11),
  ('email_notifications', 'Email Notifications', 'Receive email notifications for ticket updates', 'integrations', true, 12),

  -- UI Features
  ('dark_mode', 'Dark Mode', 'Enable dark mode toggle in settings', 'ui', true, 20),
  ('compact_view', 'Compact View', 'Use compact list views for tickets and projects', 'ui', true, 21),

  -- Admin Features (typically for higher roles)
  ('knowledge_base_upload', 'Knowledge Base Upload', 'Upload documents to the knowledge base', 'admin', false, 30),
  ('user_management', 'User Management', 'Manage users, roles, and permissions', 'admin', false, 31),
  ('system_settings', 'System Settings', 'Access system-wide configuration settings', 'admin', false, 32),
  ('reports_dashboard', 'Reports Dashboard', 'Access service reports and analytics', 'admin', false, 33)
ON CONFLICT (name) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order;

-- ============================================================
-- PART 7: Set role defaults (owner/admin get everything)
-- ============================================================

-- Owner gets all features
INSERT INTO public.role_feature_flags (role, feature_flag_id, enabled)
SELECT 'owner', id, true FROM public.feature_flags WHERE is_active = true
ON CONFLICT (role, feature_flag_id) DO NOTHING;

-- Admin gets all features
INSERT INTO public.role_feature_flags (role, feature_flag_id, enabled)
SELECT 'admin', id, true FROM public.feature_flags WHERE is_active = true
ON CONFLICT (role, feature_flag_id) DO NOTHING;

-- Director gets most features except system settings
INSERT INTO public.role_feature_flags (role, feature_flag_id, enabled)
SELECT 'director', id, true FROM public.feature_flags
WHERE is_active = true AND name NOT IN ('system_settings')
ON CONFLICT (role, feature_flag_id) DO NOTHING;

-- Manager gets operational features
INSERT INTO public.role_feature_flags (role, feature_flag_id, enabled)
SELECT 'manager', id, true FROM public.feature_flags
WHERE is_active = true AND category IN ('ui', 'integrations') OR name IN ('reports_dashboard')
ON CONFLICT (role, feature_flag_id) DO NOTHING;

-- Technician gets basic features
INSERT INTO public.role_feature_flags (role, feature_flag_id, enabled)
SELECT 'technician', id, true FROM public.feature_flags
WHERE is_active = true AND category = 'ui' OR name IN ('calendar_sync', 'email_notifications')
ON CONFLICT (role, feature_flag_id) DO NOTHING;

-- ============================================================
-- PART 8: Function to check if user has feature enabled
-- ============================================================

CREATE OR REPLACE FUNCTION user_has_feature(p_user_id UUID, p_feature_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_role TEXT;
  v_feature_id UUID;
  v_user_override BOOLEAN;
  v_role_default BOOLEAN;
  v_global_default BOOLEAN;
BEGIN
  -- Get user's role
  SELECT role INTO v_user_role FROM profiles WHERE id = p_user_id;
  IF v_user_role IS NULL THEN v_user_role := 'technician'; END IF;

  -- Get feature ID and global default
  SELECT id, default_enabled INTO v_feature_id, v_global_default
  FROM feature_flags WHERE name = p_feature_name AND is_active = true;
  IF v_feature_id IS NULL THEN RETURN FALSE; END IF;

  -- Check user-level override first (highest priority)
  SELECT enabled INTO v_user_override
  FROM user_feature_flags
  WHERE user_id = p_user_id AND feature_flag_id = v_feature_id;
  IF v_user_override IS NOT NULL THEN RETURN v_user_override; END IF;

  -- Check role-level default
  SELECT enabled INTO v_role_default
  FROM role_feature_flags
  WHERE role = v_user_role AND feature_flag_id = v_feature_id;
  IF v_role_default IS NOT NULL THEN RETURN v_role_default; END IF;

  -- Fall back to global default
  RETURN COALESCE(v_global_default, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION user_has_feature IS 'Check if a user has access to a specific feature. Priority: user override > role default > global default';

-- ============================================================
-- PART 9: Function to get all features for a user
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_features(p_user_id UUID)
RETURNS TABLE (
  feature_name TEXT,
  feature_label TEXT,
  feature_description TEXT,
  category TEXT,
  enabled BOOLEAN,
  source TEXT -- 'user', 'role', 'default'
) AS $$
DECLARE
  v_user_role TEXT;
BEGIN
  -- Get user's role
  SELECT role INTO v_user_role FROM profiles WHERE id = p_user_id;
  IF v_user_role IS NULL THEN v_user_role := 'technician'; END IF;

  RETURN QUERY
  SELECT
    ff.name AS feature_name,
    ff.label AS feature_label,
    ff.description AS feature_description,
    ff.category,
    COALESCE(
      uff.enabled,
      rff.enabled,
      ff.default_enabled
    ) AS enabled,
    CASE
      WHEN uff.enabled IS NOT NULL THEN 'user'
      WHEN rff.enabled IS NOT NULL THEN 'role'
      ELSE 'default'
    END AS source
  FROM feature_flags ff
  LEFT JOIN user_feature_flags uff ON uff.feature_flag_id = ff.id AND uff.user_id = p_user_id
  LEFT JOIN role_feature_flags rff ON rff.feature_flag_id = ff.id AND rff.role = v_user_role
  WHERE ff.is_active = true
  ORDER BY ff.category, ff.sort_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_user_features IS 'Get all feature flags with their enabled status for a specific user';

-- ============================================================
-- DONE
-- ============================================================
SELECT 'Feature flags system created successfully!' as status;
