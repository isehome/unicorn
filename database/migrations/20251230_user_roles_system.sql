-- ============================================================
-- USER ROLES SYSTEM
-- Comprehensive role-based access control
-- Roles: technician, manager, director, admin, owner
-- ============================================================

-- ============================================================
-- PART 1: Update role column on profiles with new levels
-- ============================================================

-- First, drop the existing check constraint if it exists
DO $$
BEGIN
  -- Try to drop old constraint
  ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- Ensure role column exists with proper type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'profiles' AND column_name = 'role') THEN
    ALTER TABLE profiles ADD COLUMN role TEXT DEFAULT 'technician';
  END IF;
END $$;

-- Add the new check constraint with all role levels
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('technician', 'manager', 'director', 'admin', 'owner'));

-- Update existing 'pm' roles to 'manager'
UPDATE profiles SET role = 'manager' WHERE role = 'pm';

-- Add comment
COMMENT ON COLUMN profiles.role IS 'User role level: technician (field tech), manager (project manager), director (department head), admin (system admin), owner (full access + billing)';

-- ============================================================
-- PART 2: Add is_active column for user management
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'profiles' AND column_name = 'is_active') THEN
    ALTER TABLE profiles ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
  END IF;
END $$;

COMMENT ON COLUMN profiles.is_active IS 'Whether the user account is active';

-- ============================================================
-- PART 3: Add last_login tracking
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'profiles' AND column_name = 'last_login_at') THEN
    ALTER TABLE profiles ADD COLUMN last_login_at TIMESTAMPTZ;
  END IF;
END $$;

COMMENT ON COLUMN profiles.last_login_at IS 'Timestamp of last user login';

-- ============================================================
-- PART 4: Add invited_by for tracking who invited users
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'profiles' AND column_name = 'invited_by') THEN
    ALTER TABLE profiles ADD COLUMN invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'profiles' AND column_name = 'invited_at') THEN
    ALTER TABLE profiles ADD COLUMN invited_at TIMESTAMPTZ;
  END IF;
END $$;

-- ============================================================
-- PART 5: Create system_settings table for first-time setup
-- ============================================================

CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read settings
DROP POLICY IF EXISTS system_settings_read_all ON public.system_settings;
CREATE POLICY system_settings_read_all ON public.system_settings
  FOR SELECT TO anon, authenticated USING (true);

-- Only authenticated users can write (will be further restricted in app logic)
DROP POLICY IF EXISTS system_settings_write_auth ON public.system_settings;
CREATE POLICY system_settings_write_auth ON public.system_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.system_settings IS 'System-wide settings including first-time setup status';

-- ============================================================
-- PART 6: Set up initial owner (stephe@isehome.com)
-- ============================================================

-- Update the owner user if they exist
UPDATE profiles
SET role = 'owner', is_active = true
WHERE email = 'stephe@isehome.com';

-- Mark system as initialized if owner exists
INSERT INTO system_settings (key, value)
SELECT 'system_initialized', jsonb_build_object(
  'initialized_at', NOW(),
  'initialized_by', 'stephe@isehome.com',
  'version', '1.0'
)
WHERE EXISTS (SELECT 1 FROM profiles WHERE email = 'stephe@isehome.com')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- PART 7: Function to check user role level
-- ============================================================

CREATE OR REPLACE FUNCTION get_role_level(p_role TEXT)
RETURNS INTEGER AS $$
BEGIN
  RETURN CASE p_role
    WHEN 'owner' THEN 100
    WHEN 'admin' THEN 80
    WHEN 'director' THEN 60
    WHEN 'manager' THEN 40
    WHEN 'technician' THEN 20
    ELSE 0
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION get_role_level IS 'Returns numeric level for role comparison. Higher = more permissions.';

-- ============================================================
-- PART 8: Function to check if user can manage another user
-- ============================================================

CREATE OR REPLACE FUNCTION can_manage_user(manager_id UUID, target_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  manager_role TEXT;
  target_role TEXT;
BEGIN
  SELECT role INTO manager_role FROM profiles WHERE id = manager_id;
  SELECT role INTO target_role FROM profiles WHERE id = target_id;

  -- Owner can manage everyone
  IF manager_role = 'owner' THEN RETURN TRUE; END IF;

  -- Can't manage yourself for role changes
  IF manager_id = target_id THEN RETURN FALSE; END IF;

  -- Admin can manage director and below
  IF manager_role = 'admin' AND get_role_level(target_role) < get_role_level('admin') THEN
    RETURN TRUE;
  END IF;

  -- Director can manage manager and below
  IF manager_role = 'director' AND get_role_level(target_role) < get_role_level('director') THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION can_manage_user IS 'Check if manager can modify target user based on role hierarchy';

-- ============================================================
-- DONE
-- ============================================================
SELECT 'User roles system created successfully!' as status;
