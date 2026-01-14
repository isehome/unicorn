-- ============================================================
-- Migration Part 2: Add Encryption
-- Run this AFTER part1 has completed successfully
-- ============================================================

-- Create encryption keys in Vault (if not exists)
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

-- Create encrypt function
CREATE OR REPLACE FUNCTION encrypt_field(plaintext text, secret_name text)
RETURNS text AS $$
DECLARE
  secret_value text;
  encrypted_result text;
BEGIN
  IF plaintext IS NULL OR plaintext = '' THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO secret_value
  FROM vault.decrypted_secrets
  WHERE name = secret_name;

  IF secret_value IS NULL THEN
    RAISE EXCEPTION 'Secret % not found in vault', secret_name;
  END IF;

  SELECT encode(pgp_sym_encrypt(plaintext, secret_value), 'base64') INTO encrypted_result;
  RETURN encrypted_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create decrypt function
CREATE OR REPLACE FUNCTION decrypt_field(ciphertext text, secret_name text)
RETURNS text AS $$
DECLARE
  secret_value text;
  decrypted_result text;
BEGIN
  IF ciphertext IS NULL OR ciphertext = '' THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO secret_value
  FROM vault.decrypted_secrets
  WHERE name = secret_name;

  IF secret_value IS NULL THEN
    RAISE EXCEPTION 'Secret % not found in vault', secret_name;
  END IF;

  BEGIN
    SELECT pgp_sym_decrypt(decode(ciphertext, 'base64'), secret_value) INTO decrypted_result;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Decryption failed: %', SQLERRM;
    RETURN NULL;
  END;

  RETURN decrypted_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migrate existing data in project_secure_data
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

-- Migrate existing data in contact_secure_data
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

-- Create decrypted views
DROP VIEW IF EXISTS project_secure_data_decrypted;
DROP VIEW IF EXISTS contact_secure_data_decrypted;

CREATE VIEW project_secure_data_decrypted AS
SELECT
  id, project_id, equipment_id, data_type, name, port,
  created_at, updated_at, created_by, last_accessed,
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

CREATE VIEW contact_secure_data_decrypted AS
SELECT
  id, contact_id, data_type, name, port,
  created_at, updated_at, created_by,
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

GRANT SELECT ON project_secure_data_decrypted TO anon, authenticated;
GRANT SELECT ON contact_secure_data_decrypted TO anon, authenticated;

-- Create RPC functions for INSERT
CREATE OR REPLACE FUNCTION create_project_secure_data(
  p_project_id uuid, p_equipment_id uuid DEFAULT NULL, p_data_type text DEFAULT 'credentials',
  p_name text DEFAULT NULL, p_username text DEFAULT NULL, p_password text DEFAULT NULL,
  p_url text DEFAULT NULL, p_ip_address text DEFAULT NULL, p_port integer DEFAULT NULL,
  p_notes text DEFAULT NULL, p_additional_info jsonb DEFAULT NULL, p_created_by uuid DEFAULT NULL
) RETURNS uuid AS $$
DECLARE new_id uuid;
BEGIN
  IF p_project_id IS NULL THEN RAISE EXCEPTION 'project_id is required'; END IF;
  IF p_name IS NULL OR p_name = '' THEN RAISE EXCEPTION 'name is required'; END IF;

  INSERT INTO project_secure_data (
    project_id, equipment_id, data_type, name, port, created_by,
    username_encrypted, password_encrypted, url_encrypted,
    ip_address_encrypted, notes_encrypted, additional_info_encrypted
  ) VALUES (
    p_project_id, p_equipment_id, COALESCE(p_data_type, 'credentials'), p_name, p_port, p_created_by,
    encrypt_field(p_username, 'project_secure_data_key'),
    encrypt_field(p_password, 'project_secure_data_key'),
    encrypt_field(p_url, 'project_secure_data_key'),
    encrypt_field(p_ip_address, 'project_secure_data_key'),
    encrypt_field(p_notes, 'project_secure_data_key'),
    CASE WHEN p_additional_info IS NOT NULL THEN encrypt_field(p_additional_info::text, 'project_secure_data_key') END
  ) RETURNING id INTO new_id;
  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION create_contact_secure_data(
  p_contact_id uuid, p_data_type text DEFAULT 'credentials', p_name text DEFAULT NULL,
  p_username text DEFAULT NULL, p_password text DEFAULT NULL, p_url text DEFAULT NULL,
  p_ip_address text DEFAULT NULL, p_port integer DEFAULT NULL, p_notes text DEFAULT NULL,
  p_additional_info jsonb DEFAULT NULL, p_created_by uuid DEFAULT NULL
) RETURNS uuid AS $$
DECLARE new_id uuid;
BEGIN
  IF p_contact_id IS NULL THEN RAISE EXCEPTION 'contact_id is required'; END IF;
  IF p_name IS NULL OR p_name = '' THEN RAISE EXCEPTION 'name is required'; END IF;

  INSERT INTO contact_secure_data (
    contact_id, data_type, name, port, created_by,
    username_encrypted, password_encrypted, url_encrypted,
    ip_address_encrypted, notes_encrypted, additional_info_encrypted
  ) VALUES (
    p_contact_id, COALESCE(p_data_type, 'credentials'), p_name, p_port, p_created_by,
    encrypt_field(p_username, 'contact_secure_data_key'),
    encrypt_field(p_password, 'contact_secure_data_key'),
    encrypt_field(p_url, 'contact_secure_data_key'),
    encrypt_field(p_ip_address, 'contact_secure_data_key'),
    encrypt_field(p_notes, 'contact_secure_data_key'),
    CASE WHEN p_additional_info IS NOT NULL THEN encrypt_field(p_additional_info::text, 'contact_secure_data_key') END
  ) RETURNING id INTO new_id;
  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create RPC functions for UPDATE
CREATE OR REPLACE FUNCTION update_project_secure_data(
  p_id uuid, p_name text DEFAULT NULL, p_data_type text DEFAULT NULL,
  p_username text DEFAULT NULL, p_password text DEFAULT NULL, p_url text DEFAULT NULL,
  p_ip_address text DEFAULT NULL, p_port integer DEFAULT NULL, p_notes text DEFAULT NULL,
  p_additional_info jsonb DEFAULT NULL
) RETURNS uuid AS $$
BEGIN
  IF p_id IS NULL THEN RAISE EXCEPTION 'id is required'; END IF;
  UPDATE project_secure_data SET
    name = COALESCE(p_name, name), data_type = COALESCE(p_data_type, data_type), port = COALESCE(p_port, port),
    username_encrypted = CASE WHEN p_username IS NOT NULL THEN encrypt_field(p_username, 'project_secure_data_key') ELSE username_encrypted END,
    password_encrypted = CASE WHEN p_password IS NOT NULL THEN encrypt_field(p_password, 'project_secure_data_key') ELSE password_encrypted END,
    url_encrypted = CASE WHEN p_url IS NOT NULL THEN encrypt_field(p_url, 'project_secure_data_key') ELSE url_encrypted END,
    ip_address_encrypted = CASE WHEN p_ip_address IS NOT NULL THEN encrypt_field(p_ip_address, 'project_secure_data_key') ELSE ip_address_encrypted END,
    notes_encrypted = CASE WHEN p_notes IS NOT NULL THEN encrypt_field(p_notes, 'project_secure_data_key') ELSE notes_encrypted END,
    additional_info_encrypted = CASE WHEN p_additional_info IS NOT NULL THEN encrypt_field(p_additional_info::text, 'project_secure_data_key') ELSE additional_info_encrypted END,
    updated_at = now()
  WHERE id = p_id;
  RETURN p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_contact_secure_data(
  p_id uuid, p_name text DEFAULT NULL, p_data_type text DEFAULT NULL,
  p_username text DEFAULT NULL, p_password text DEFAULT NULL, p_url text DEFAULT NULL,
  p_ip_address text DEFAULT NULL, p_port integer DEFAULT NULL, p_notes text DEFAULT NULL,
  p_additional_info jsonb DEFAULT NULL
) RETURNS uuid AS $$
BEGIN
  IF p_id IS NULL THEN RAISE EXCEPTION 'id is required'; END IF;
  UPDATE contact_secure_data SET
    name = COALESCE(p_name, name), data_type = COALESCE(p_data_type, data_type), port = COALESCE(p_port, port),
    username_encrypted = CASE WHEN p_username IS NOT NULL THEN encrypt_field(p_username, 'contact_secure_data_key') ELSE username_encrypted END,
    password_encrypted = CASE WHEN p_password IS NOT NULL THEN encrypt_field(p_password, 'contact_secure_data_key') ELSE password_encrypted END,
    url_encrypted = CASE WHEN p_url IS NOT NULL THEN encrypt_field(p_url, 'contact_secure_data_key') ELSE url_encrypted END,
    ip_address_encrypted = CASE WHEN p_ip_address IS NOT NULL THEN encrypt_field(p_ip_address, 'contact_secure_data_key') ELSE ip_address_encrypted END,
    notes_encrypted = CASE WHEN p_notes IS NOT NULL THEN encrypt_field(p_notes, 'contact_secure_data_key') ELSE notes_encrypted END,
    additional_info_encrypted = CASE WHEN p_additional_info IS NOT NULL THEN encrypt_field(p_additional_info::text, 'contact_secure_data_key') ELSE additional_info_encrypted END,
    updated_at = now()
  WHERE id = p_id;
  RETURN p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update trigger function for auto-created entries
CREATE OR REPLACE FUNCTION create_default_secure_entries(p_contact_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO contact_secure_data (contact_id, data_type, name, password_encrypted, notes_encrypted)
  SELECT p_contact_id, 'credentials', 'Gate Code',
         encrypt_field('', 'contact_secure_data_key'),
         encrypt_field('Auto-created', 'contact_secure_data_key')
  WHERE NOT EXISTS (SELECT 1 FROM contact_secure_data csd WHERE csd.contact_id = p_contact_id AND csd.name = 'Gate Code');

  INSERT INTO contact_secure_data (contact_id, data_type, name, password_encrypted, notes_encrypted)
  SELECT p_contact_id, 'credentials', 'House Code',
         encrypt_field('', 'contact_secure_data_key'),
         encrypt_field('Auto-created', 'contact_secure_data_key')
  WHERE NOT EXISTS (SELECT 1 FROM contact_secure_data csd WHERE csd.contact_id = p_contact_id AND csd.name = 'House Code');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION encrypt_field(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION decrypt_field(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_project_secure_data TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_contact_secure_data TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_project_secure_data TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_contact_secure_data TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_default_secure_entries(uuid) TO anon, authenticated;

-- Add comments
COMMENT ON FUNCTION encrypt_field(text, text) IS 'Encrypts plaintext using Vault secret';
COMMENT ON FUNCTION decrypt_field(text, text) IS 'Decrypts ciphertext using Vault secret';
COMMENT ON VIEW project_secure_data_decrypted IS 'Decrypted view of project_secure_data';
COMMENT ON VIEW contact_secure_data_decrypted IS 'Decrypted view of contact_secure_data';

SELECT 'Part 2 complete - encryption implemented!' as status;
