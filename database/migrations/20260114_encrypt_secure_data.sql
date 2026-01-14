-- ============================================================
-- Migration: Encrypt Secure Data with Supabase Vault (TCE)
-- Date: 2026-01-14
-- Description: Implements field-level encryption for all sensitive
--              data in project_secure_data and contact_secure_data
--              tables using Supabase Vault's Transparent Column Encryption.
-- ============================================================

-- ============================================================
-- PHASE 0: Enable required extensions FIRST
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pgsodium;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- ============================================================
-- PHASE 1: Ensure base tables exist (without FK constraints)
-- ============================================================
-- Note: FK constraints removed because parent tables may not exist.
-- The tables are created standalone - the application layer handles integrity.

-- Create project_secure_data table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.project_secure_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  equipment_id uuid,
  data_type text NOT NULL CHECK (data_type IN ('credentials', 'network', 'api_key', 'certificate', 'other')),
  name text NOT NULL,
  username text,
  password text,
  url text,
  ip_address text,
  port integer,
  additional_info jsonb,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  last_accessed timestamptz
);

-- Create contact_secure_data table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.contact_secure_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  data_type text NOT NULL DEFAULT 'other' CHECK (data_type IN ('credentials', 'network', 'api_key', 'certificate', 'other')),
  name text NOT NULL,
  username text,
  password text,
  url text,
  ip_address text,
  port integer,
  notes text,
  additional_info jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_project_secure_data_project ON public.project_secure_data(project_id);
CREATE INDEX IF NOT EXISTS idx_project_secure_data_equipment ON public.project_secure_data(equipment_id);
CREATE INDEX IF NOT EXISTS idx_contact_secure_data_contact ON public.contact_secure_data(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_secure_data_type ON public.contact_secure_data(data_type);

-- Enable RLS on tables
ALTER TABLE public.project_secure_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_secure_data ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (matching MSAL auth pattern - include anon)
DO $$
BEGIN
  -- project_secure_data policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_secure_data' AND policyname = 'project_secure_data_select') THEN
    CREATE POLICY project_secure_data_select ON public.project_secure_data FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_secure_data' AND policyname = 'project_secure_data_insert') THEN
    CREATE POLICY project_secure_data_insert ON public.project_secure_data FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_secure_data' AND policyname = 'project_secure_data_update') THEN
    CREATE POLICY project_secure_data_update ON public.project_secure_data FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_secure_data' AND policyname = 'project_secure_data_delete') THEN
    CREATE POLICY project_secure_data_delete ON public.project_secure_data FOR DELETE TO anon, authenticated USING (true);
  END IF;

  -- contact_secure_data policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contact_secure_data' AND policyname = 'contact_secure_data_select') THEN
    CREATE POLICY contact_secure_data_select ON public.contact_secure_data FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contact_secure_data' AND policyname = 'contact_secure_data_insert') THEN
    CREATE POLICY contact_secure_data_insert ON public.contact_secure_data FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contact_secure_data' AND policyname = 'contact_secure_data_update') THEN
    CREATE POLICY contact_secure_data_update ON public.contact_secure_data FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contact_secure_data' AND policyname = 'contact_secure_data_delete') THEN
    CREATE POLICY contact_secure_data_delete ON public.contact_secure_data FOR DELETE TO anon, authenticated USING (true);
  END IF;
END $$;

-- ============================================================
-- PHASE 2: Create encryption keys in Vault
-- ============================================================
-- Using vault.create_secret to store encryption keys

-- Create key for project secure data (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'project_secure_data_key') THEN
    PERFORM vault.create_secret(
      'project_secure_data_encryption_key_v1',
      'project_secure_data_key',
      'Encryption key for project_secure_data table'
    );
    RAISE NOTICE 'Created project_secure_data_key in vault';
  ELSE
    RAISE NOTICE 'project_secure_data_key already exists in vault';
  END IF;
END $$;

-- Create key for contact secure data (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'contact_secure_data_key') THEN
    PERFORM vault.create_secret(
      'contact_secure_data_encryption_key_v1',
      'contact_secure_data_key',
      'Encryption key for contact_secure_data table'
    );
    RAISE NOTICE 'Created contact_secure_data_key in vault';
  ELSE
    RAISE NOTICE 'contact_secure_data_key already exists in vault';
  END IF;
END $$;

-- ============================================================
-- PHASE 3: Add encrypted columns to both tables
-- ============================================================

-- Add encrypted columns to project_secure_data
ALTER TABLE project_secure_data
ADD COLUMN IF NOT EXISTS password_encrypted text,
ADD COLUMN IF NOT EXISTS username_encrypted text,
ADD COLUMN IF NOT EXISTS url_encrypted text,
ADD COLUMN IF NOT EXISTS ip_address_encrypted text,
ADD COLUMN IF NOT EXISTS notes_encrypted text,
ADD COLUMN IF NOT EXISTS additional_info_encrypted text;

-- Add encrypted columns to contact_secure_data
ALTER TABLE contact_secure_data
ADD COLUMN IF NOT EXISTS password_encrypted text,
ADD COLUMN IF NOT EXISTS username_encrypted text,
ADD COLUMN IF NOT EXISTS url_encrypted text,
ADD COLUMN IF NOT EXISTS ip_address_encrypted text,
ADD COLUMN IF NOT EXISTS notes_encrypted text,
ADD COLUMN IF NOT EXISTS additional_info_encrypted text;

-- ============================================================
-- PHASE 4: Create encrypt/decrypt helper functions using Vault
-- ============================================================

-- Encrypt function using vault secrets
CREATE OR REPLACE FUNCTION encrypt_field(plaintext text, secret_name text)
RETURNS text AS $$
DECLARE
  secret_value text;
  encrypted_result text;
BEGIN
  IF plaintext IS NULL OR plaintext = '' THEN
    RETURN NULL;
  END IF;

  -- Get the encryption key from vault
  SELECT decrypted_secret INTO secret_value
  FROM vault.decrypted_secrets
  WHERE name = secret_name;

  IF secret_value IS NULL THEN
    RAISE EXCEPTION 'Secret % not found in vault', secret_name;
  END IF;

  -- Use pgcrypto for encryption (more accessible than pgsodium raw functions)
  SELECT encode(
    pgp_sym_encrypt(plaintext, secret_value),
    'base64'
  ) INTO encrypted_result;

  RETURN encrypted_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Decrypt function using vault secrets
CREATE OR REPLACE FUNCTION decrypt_field(ciphertext text, secret_name text)
RETURNS text AS $$
DECLARE
  secret_value text;
  decrypted_result text;
BEGIN
  IF ciphertext IS NULL OR ciphertext = '' THEN
    RETURN NULL;
  END IF;

  -- Get the decryption key from vault
  SELECT decrypted_secret INTO secret_value
  FROM vault.decrypted_secrets
  WHERE name = secret_name;

  IF secret_value IS NULL THEN
    RAISE EXCEPTION 'Secret % not found in vault', secret_name;
  END IF;

  -- Use pgcrypto for decryption
  BEGIN
    SELECT pgp_sym_decrypt(
      decode(ciphertext, 'base64'),
      secret_value
    ) INTO decrypted_result;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Decryption failed: %', SQLERRM;
    RETURN NULL;
  END;

  RETURN decrypted_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- PHASE 5: Migrate existing data (encrypt plaintext to encrypted columns)
-- ============================================================

-- Migrate project_secure_data
UPDATE project_secure_data SET
  password_encrypted = CASE
    WHEN password_encrypted IS NULL AND password IS NOT NULL AND password != ''
    THEN encrypt_field(password, 'project_secure_data_key')
    ELSE password_encrypted
  END,
  username_encrypted = CASE
    WHEN username_encrypted IS NULL AND username IS NOT NULL AND username != ''
    THEN encrypt_field(username, 'project_secure_data_key')
    ELSE username_encrypted
  END,
  url_encrypted = CASE
    WHEN url_encrypted IS NULL AND url IS NOT NULL AND url != ''
    THEN encrypt_field(url, 'project_secure_data_key')
    ELSE url_encrypted
  END,
  ip_address_encrypted = CASE
    WHEN ip_address_encrypted IS NULL AND ip_address IS NOT NULL AND ip_address != ''
    THEN encrypt_field(ip_address, 'project_secure_data_key')
    ELSE ip_address_encrypted
  END,
  notes_encrypted = CASE
    WHEN notes_encrypted IS NULL AND notes IS NOT NULL AND notes != ''
    THEN encrypt_field(notes, 'project_secure_data_key')
    ELSE notes_encrypted
  END,
  additional_info_encrypted = CASE
    WHEN additional_info_encrypted IS NULL AND additional_info IS NOT NULL
    THEN encrypt_field(additional_info::text, 'project_secure_data_key')
    ELSE additional_info_encrypted
  END
WHERE password IS NOT NULL OR username IS NOT NULL OR url IS NOT NULL
   OR ip_address IS NOT NULL OR notes IS NOT NULL OR additional_info IS NOT NULL;

-- Migrate contact_secure_data
UPDATE contact_secure_data SET
  password_encrypted = CASE
    WHEN password_encrypted IS NULL AND password IS NOT NULL AND password != ''
    THEN encrypt_field(password, 'contact_secure_data_key')
    ELSE password_encrypted
  END,
  username_encrypted = CASE
    WHEN username_encrypted IS NULL AND username IS NOT NULL AND username != ''
    THEN encrypt_field(username, 'contact_secure_data_key')
    ELSE username_encrypted
  END,
  url_encrypted = CASE
    WHEN url_encrypted IS NULL AND url IS NOT NULL AND url != ''
    THEN encrypt_field(url, 'contact_secure_data_key')
    ELSE url_encrypted
  END,
  ip_address_encrypted = CASE
    WHEN ip_address_encrypted IS NULL AND ip_address IS NOT NULL AND ip_address != ''
    THEN encrypt_field(ip_address, 'contact_secure_data_key')
    ELSE ip_address_encrypted
  END,
  notes_encrypted = CASE
    WHEN notes_encrypted IS NULL AND notes IS NOT NULL AND notes != ''
    THEN encrypt_field(notes, 'contact_secure_data_key')
    ELSE notes_encrypted
  END,
  additional_info_encrypted = CASE
    WHEN additional_info_encrypted IS NULL AND additional_info IS NOT NULL
    THEN encrypt_field(additional_info::text, 'contact_secure_data_key')
    ELSE additional_info_encrypted
  END
WHERE password IS NOT NULL OR username IS NOT NULL OR url IS NOT NULL
   OR ip_address IS NOT NULL OR notes IS NOT NULL OR additional_info IS NOT NULL;

-- ============================================================
-- PHASE 6: Create decrypted views for transparent reading
-- ============================================================

DROP VIEW IF EXISTS project_secure_data_decrypted;
DROP VIEW IF EXISTS contact_secure_data_decrypted;

-- Create view for project_secure_data with automatic decryption
CREATE VIEW project_secure_data_decrypted AS
SELECT
  id,
  project_id,
  equipment_id,
  data_type,
  name,
  port,
  created_at,
  updated_at,
  created_by,
  last_accessed,
  decrypt_field(username_encrypted, 'project_secure_data_key') as username,
  decrypt_field(password_encrypted, 'project_secure_data_key') as password,
  decrypt_field(url_encrypted, 'project_secure_data_key') as url,
  decrypt_field(ip_address_encrypted, 'project_secure_data_key') as ip_address,
  decrypt_field(notes_encrypted, 'project_secure_data_key') as notes,
  CASE
    WHEN additional_info_encrypted IS NOT NULL
    THEN decrypt_field(additional_info_encrypted, 'project_secure_data_key')::jsonb
    ELSE NULL
  END as additional_info
FROM project_secure_data;

-- Create view for contact_secure_data with automatic decryption
CREATE VIEW contact_secure_data_decrypted AS
SELECT
  id,
  contact_id,
  data_type,
  name,
  port,
  created_at,
  updated_at,
  created_by,
  decrypt_field(username_encrypted, 'contact_secure_data_key') as username,
  decrypt_field(password_encrypted, 'contact_secure_data_key') as password,
  decrypt_field(url_encrypted, 'contact_secure_data_key') as url,
  decrypt_field(ip_address_encrypted, 'contact_secure_data_key') as ip_address,
  decrypt_field(notes_encrypted, 'contact_secure_data_key') as notes,
  CASE
    WHEN additional_info_encrypted IS NOT NULL
    THEN decrypt_field(additional_info_encrypted, 'contact_secure_data_key')::jsonb
    ELSE NULL
  END as additional_info
FROM contact_secure_data;

-- Grant SELECT on views (matching MSAL auth pattern)
GRANT SELECT ON project_secure_data_decrypted TO anon, authenticated;
GRANT SELECT ON contact_secure_data_decrypted TO anon, authenticated;

-- ============================================================
-- PHASE 7: Create RPC functions for secure INSERT operations
-- ============================================================

CREATE OR REPLACE FUNCTION create_project_secure_data(
  p_project_id uuid,
  p_equipment_id uuid DEFAULT NULL,
  p_data_type text DEFAULT 'credentials',
  p_name text DEFAULT NULL,
  p_username text DEFAULT NULL,
  p_password text DEFAULT NULL,
  p_url text DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_port integer DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_additional_info jsonb DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  new_id uuid;
BEGIN
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'project_id is required';
  END IF;
  IF p_name IS NULL OR p_name = '' THEN
    RAISE EXCEPTION 'name is required';
  END IF;

  INSERT INTO project_secure_data (
    project_id, equipment_id, data_type, name, port, created_by,
    username_encrypted, password_encrypted, url_encrypted,
    ip_address_encrypted, notes_encrypted, additional_info_encrypted
  ) VALUES (
    p_project_id,
    p_equipment_id,
    COALESCE(p_data_type, 'credentials'),
    p_name,
    p_port,
    p_created_by,
    encrypt_field(p_username, 'project_secure_data_key'),
    encrypt_field(p_password, 'project_secure_data_key'),
    encrypt_field(p_url, 'project_secure_data_key'),
    encrypt_field(p_ip_address, 'project_secure_data_key'),
    encrypt_field(p_notes, 'project_secure_data_key'),
    CASE WHEN p_additional_info IS NOT NULL
         THEN encrypt_field(p_additional_info::text, 'project_secure_data_key')
    END
  ) RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION create_contact_secure_data(
  p_contact_id uuid,
  p_data_type text DEFAULT 'credentials',
  p_name text DEFAULT NULL,
  p_username text DEFAULT NULL,
  p_password text DEFAULT NULL,
  p_url text DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_port integer DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_additional_info jsonb DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  new_id uuid;
BEGIN
  IF p_contact_id IS NULL THEN
    RAISE EXCEPTION 'contact_id is required';
  END IF;
  IF p_name IS NULL OR p_name = '' THEN
    RAISE EXCEPTION 'name is required';
  END IF;

  INSERT INTO contact_secure_data (
    contact_id, data_type, name, port, created_by,
    username_encrypted, password_encrypted, url_encrypted,
    ip_address_encrypted, notes_encrypted, additional_info_encrypted
  ) VALUES (
    p_contact_id,
    COALESCE(p_data_type, 'credentials'),
    p_name,
    p_port,
    p_created_by,
    encrypt_field(p_username, 'contact_secure_data_key'),
    encrypt_field(p_password, 'contact_secure_data_key'),
    encrypt_field(p_url, 'contact_secure_data_key'),
    encrypt_field(p_ip_address, 'contact_secure_data_key'),
    encrypt_field(p_notes, 'contact_secure_data_key'),
    CASE WHEN p_additional_info IS NOT NULL
         THEN encrypt_field(p_additional_info::text, 'contact_secure_data_key')
    END
  ) RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- PHASE 8: Create RPC functions for secure UPDATE operations
-- ============================================================

CREATE OR REPLACE FUNCTION update_project_secure_data(
  p_id uuid,
  p_name text DEFAULT NULL,
  p_data_type text DEFAULT NULL,
  p_username text DEFAULT NULL,
  p_password text DEFAULT NULL,
  p_url text DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_port integer DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_additional_info jsonb DEFAULT NULL
) RETURNS uuid AS $$
BEGIN
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'id is required';
  END IF;

  UPDATE project_secure_data SET
    name = COALESCE(p_name, name),
    data_type = COALESCE(p_data_type, data_type),
    port = COALESCE(p_port, port),
    username_encrypted = CASE
      WHEN p_username IS NOT NULL THEN encrypt_field(p_username, 'project_secure_data_key')
      ELSE username_encrypted
    END,
    password_encrypted = CASE
      WHEN p_password IS NOT NULL THEN encrypt_field(p_password, 'project_secure_data_key')
      ELSE password_encrypted
    END,
    url_encrypted = CASE
      WHEN p_url IS NOT NULL THEN encrypt_field(p_url, 'project_secure_data_key')
      ELSE url_encrypted
    END,
    ip_address_encrypted = CASE
      WHEN p_ip_address IS NOT NULL THEN encrypt_field(p_ip_address, 'project_secure_data_key')
      ELSE ip_address_encrypted
    END,
    notes_encrypted = CASE
      WHEN p_notes IS NOT NULL THEN encrypt_field(p_notes, 'project_secure_data_key')
      ELSE notes_encrypted
    END,
    additional_info_encrypted = CASE
      WHEN p_additional_info IS NOT NULL THEN encrypt_field(p_additional_info::text, 'project_secure_data_key')
      ELSE additional_info_encrypted
    END,
    updated_at = now()
  WHERE id = p_id;

  RETURN p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_contact_secure_data(
  p_id uuid,
  p_name text DEFAULT NULL,
  p_data_type text DEFAULT NULL,
  p_username text DEFAULT NULL,
  p_password text DEFAULT NULL,
  p_url text DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_port integer DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_additional_info jsonb DEFAULT NULL
) RETURNS uuid AS $$
BEGIN
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'id is required';
  END IF;

  UPDATE contact_secure_data SET
    name = COALESCE(p_name, name),
    data_type = COALESCE(p_data_type, data_type),
    port = COALESCE(p_port, port),
    username_encrypted = CASE
      WHEN p_username IS NOT NULL THEN encrypt_field(p_username, 'contact_secure_data_key')
      ELSE username_encrypted
    END,
    password_encrypted = CASE
      WHEN p_password IS NOT NULL THEN encrypt_field(p_password, 'contact_secure_data_key')
      ELSE password_encrypted
    END,
    url_encrypted = CASE
      WHEN p_url IS NOT NULL THEN encrypt_field(p_url, 'contact_secure_data_key')
      ELSE url_encrypted
    END,
    ip_address_encrypted = CASE
      WHEN p_ip_address IS NOT NULL THEN encrypt_field(p_ip_address, 'contact_secure_data_key')
      ELSE ip_address_encrypted
    END,
    notes_encrypted = CASE
      WHEN p_notes IS NOT NULL THEN encrypt_field(p_notes, 'contact_secure_data_key')
      ELSE notes_encrypted
    END,
    additional_info_encrypted = CASE
      WHEN p_additional_info IS NOT NULL THEN encrypt_field(p_additional_info::text, 'contact_secure_data_key')
      ELSE additional_info_encrypted
    END,
    updated_at = now()
  WHERE id = p_id;

  RETURN p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- PHASE 9: Update trigger function for auto-created entries
-- ============================================================

CREATE OR REPLACE FUNCTION create_default_secure_entries(p_contact_id UUID)
RETURNS void AS $$
BEGIN
  -- Create gate code entry if doesn't exist
  INSERT INTO contact_secure_data (contact_id, data_type, name, password_encrypted, notes_encrypted)
  SELECT p_contact_id, 'credentials', 'Gate Code',
         encrypt_field('', 'contact_secure_data_key'),
         encrypt_field('Auto-created', 'contact_secure_data_key')
  WHERE NOT EXISTS (
      SELECT 1 FROM contact_secure_data csd
      WHERE csd.contact_id = p_contact_id AND csd.name = 'Gate Code'
  );

  -- Create house code entry if doesn't exist
  INSERT INTO contact_secure_data (contact_id, data_type, name, password_encrypted, notes_encrypted)
  SELECT p_contact_id, 'credentials', 'House Code',
         encrypt_field('', 'contact_secure_data_key'),
         encrypt_field('Auto-created', 'contact_secure_data_key')
  WHERE NOT EXISTS (
      SELECT 1 FROM contact_secure_data csd
      WHERE csd.contact_id = p_contact_id AND csd.name = 'House Code'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- PHASE 10: Grant execute permissions on functions
-- ============================================================

GRANT EXECUTE ON FUNCTION encrypt_field(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION decrypt_field(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_project_secure_data TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_contact_secure_data TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_project_secure_data TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_contact_secure_data TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_default_secure_entries(uuid) TO anon, authenticated;

-- ============================================================
-- PHASE 11: Add documentation comments
-- ============================================================

COMMENT ON FUNCTION encrypt_field(text, text) IS 'Encrypts plaintext using Vault secret for key management';
COMMENT ON FUNCTION decrypt_field(text, text) IS 'Decrypts ciphertext using Vault secret for key management';
COMMENT ON FUNCTION create_project_secure_data IS 'Creates project secure data with automatic encryption';
COMMENT ON FUNCTION create_contact_secure_data IS 'Creates contact secure data with automatic encryption';
COMMENT ON FUNCTION update_project_secure_data IS 'Updates project secure data with automatic encryption';
COMMENT ON FUNCTION update_contact_secure_data IS 'Updates contact secure data with automatic encryption';
COMMENT ON VIEW project_secure_data_decrypted IS 'Decrypted view of project_secure_data';
COMMENT ON VIEW contact_secure_data_decrypted IS 'Decrypted view of contact_secure_data';

-- ============================================================
-- DONE
-- ============================================================
-- Plaintext columns remain for rollback safety.
-- After verification (1 week), run cleanup to drop them.

SELECT 'Secure data encryption migration complete!' as status;
