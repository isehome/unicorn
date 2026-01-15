-- ============================================================
-- Home Assistant Integration Schema
-- Uses existing encrypt_field/decrypt_field from Workstream 1
-- ============================================================

-- Main table for HA credentials per project
CREATE TABLE IF NOT EXISTS project_home_assistant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Connection details (encrypted using existing Vault infrastructure)
  ha_url_encrypted text,           -- Nabu Casa URL or local URL
  access_token_encrypted text,     -- Long-lived access token

  -- Metadata (not sensitive - stored plaintext)
  instance_name text,               -- Friendly name (e.g., "Smith Residence HA")
  nabu_casa_enabled boolean DEFAULT true,

  -- Status tracking
  last_connected_at timestamptz,
  last_error text,
  device_count integer DEFAULT 0,

  -- Audit
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,

  UNIQUE(project_id)
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_project_ha_project ON project_home_assistant(project_id);

-- RLS
ALTER TABLE project_home_assistant ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view project HA settings" ON project_home_assistant;
DROP POLICY IF EXISTS "Users can insert project HA settings" ON project_home_assistant;
DROP POLICY IF EXISTS "Users can update project HA settings" ON project_home_assistant;
DROP POLICY IF EXISTS "Users can delete project HA settings" ON project_home_assistant;
DROP POLICY IF EXISTS "Anon can view project HA settings" ON project_home_assistant;
DROP POLICY IF EXISTS "Anon can insert project HA settings" ON project_home_assistant;
DROP POLICY IF EXISTS "Anon can update project HA settings" ON project_home_assistant;
DROP POLICY IF EXISTS "Anon can delete project HA settings" ON project_home_assistant;

-- RLS Policies (include anon for MSAL auth pattern)
CREATE POLICY "Users can view project HA settings"
ON project_home_assistant FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Users can insert project HA settings"
ON project_home_assistant FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Users can update project HA settings"
ON project_home_assistant FOR UPDATE
TO anon, authenticated
USING (true);

CREATE POLICY "Users can delete project HA settings"
ON project_home_assistant FOR DELETE
TO anon, authenticated
USING (true);

-- Decrypted view (uses existing decrypt_field function from Workstream 1)
CREATE OR REPLACE VIEW project_home_assistant_decrypted AS
SELECT
  id,
  project_id,
  decrypt_field(ha_url_encrypted, 'project_secure_data_key') as ha_url,
  decrypt_field(access_token_encrypted, 'project_secure_data_key') as access_token,
  instance_name,
  nabu_casa_enabled,
  last_connected_at,
  last_error,
  device_count,
  created_at,
  updated_at,
  created_by
FROM project_home_assistant;

GRANT SELECT ON project_home_assistant_decrypted TO anon, authenticated;

-- RPC function to create HA config with encryption
CREATE OR REPLACE FUNCTION create_project_home_assistant(
  p_project_id uuid,
  p_ha_url text,
  p_access_token text,
  p_instance_name text DEFAULT NULL,
  p_nabu_casa_enabled boolean DEFAULT true,
  p_created_by uuid DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  new_id uuid;
BEGIN
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'project_id is required';
  END IF;

  IF p_ha_url IS NULL OR p_ha_url = '' THEN
    RAISE EXCEPTION 'ha_url is required';
  END IF;

  IF p_access_token IS NULL OR p_access_token = '' THEN
    RAISE EXCEPTION 'access_token is required';
  END IF;

  INSERT INTO project_home_assistant (
    project_id,
    ha_url_encrypted,
    access_token_encrypted,
    instance_name,
    nabu_casa_enabled,
    created_by
  ) VALUES (
    p_project_id,
    encrypt_field(p_ha_url, 'project_secure_data_key'),
    encrypt_field(p_access_token, 'project_secure_data_key'),
    p_instance_name,
    p_nabu_casa_enabled,
    p_created_by
  )
  ON CONFLICT (project_id) DO UPDATE SET
    ha_url_encrypted = encrypt_field(p_ha_url, 'project_secure_data_key'),
    access_token_encrypted = encrypt_field(p_access_token, 'project_secure_data_key'),
    instance_name = COALESCE(p_instance_name, project_home_assistant.instance_name),
    nabu_casa_enabled = p_nabu_casa_enabled,
    updated_at = now()
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function to update HA config
CREATE OR REPLACE FUNCTION update_project_home_assistant(
  p_project_id uuid,
  p_ha_url text DEFAULT NULL,
  p_access_token text DEFAULT NULL,
  p_instance_name text DEFAULT NULL,
  p_nabu_casa_enabled boolean DEFAULT NULL,
  p_last_connected_at timestamptz DEFAULT NULL,
  p_last_error text DEFAULT NULL,
  p_device_count integer DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  result_id uuid;
BEGIN
  UPDATE project_home_assistant SET
    ha_url_encrypted = CASE
      WHEN p_ha_url IS NOT NULL THEN encrypt_field(p_ha_url, 'project_secure_data_key')
      ELSE ha_url_encrypted
    END,
    access_token_encrypted = CASE
      WHEN p_access_token IS NOT NULL THEN encrypt_field(p_access_token, 'project_secure_data_key')
      ELSE access_token_encrypted
    END,
    instance_name = COALESCE(p_instance_name, instance_name),
    nabu_casa_enabled = COALESCE(p_nabu_casa_enabled, nabu_casa_enabled),
    last_connected_at = COALESCE(p_last_connected_at, last_connected_at),
    last_error = p_last_error,  -- Allow setting to NULL
    device_count = COALESCE(p_device_count, device_count),
    updated_at = now()
  WHERE project_id = p_project_id
  RETURNING id INTO result_id;

  RETURN result_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION create_project_home_assistant TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_project_home_assistant TO anon, authenticated;

-- Add comments
COMMENT ON TABLE project_home_assistant IS 'Home Assistant connection credentials per project (encrypted)';
COMMENT ON VIEW project_home_assistant_decrypted IS 'Decrypted view of project_home_assistant credentials';
