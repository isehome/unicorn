-- Migration: Add contact secure data tables
-- Date: 2024-12-15
-- Description: Creates tables for storing secure data globally linked to contacts
--              (separate from project_secure_data which is project-scoped)

-- ============================================
-- 1. Create contact_secure_data table
-- ============================================
-- This table stores credentials/sensitive data that is linked to a contact
-- GLOBALLY (not project-scoped). Examples: gate codes, Sonos accounts, etc.

CREATE TABLE IF NOT EXISTS contact_secure_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  data_type TEXT NOT NULL DEFAULT 'other' CHECK (data_type IN ('credentials', 'network', 'api_key', 'certificate', 'other')),
  name TEXT NOT NULL,
  username TEXT,
  password TEXT,
  url TEXT,
  ip_address TEXT,
  port INTEGER,
  notes TEXT,
  additional_info JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- Index for fast lookup by contact
CREATE INDEX IF NOT EXISTS idx_contact_secure_data_contact ON contact_secure_data(contact_id);

-- Index for data type filtering
CREATE INDEX IF NOT EXISTS idx_contact_secure_data_type ON contact_secure_data(data_type);

-- ============================================
-- 2. Create audit log table for contact secure data
-- ============================================
CREATE TABLE IF NOT EXISTS contact_secure_data_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secure_data_id UUID REFERENCES contact_secure_data(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('view', 'create', 'update', 'delete')),
  performed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  performed_at TIMESTAMPTZ DEFAULT now(),
  ip_address INET,
  user_agent TEXT,
  details JSONB
);

-- Index for audit log queries
CREATE INDEX IF NOT EXISTS idx_contact_secure_data_audit_contact ON contact_secure_data_audit_log(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_secure_data_audit_secure_data ON contact_secure_data_audit_log(secure_data_id);
CREATE INDEX IF NOT EXISTS idx_contact_secure_data_audit_performed_at ON contact_secure_data_audit_log(performed_at DESC);

-- ============================================
-- 3. Row Level Security (RLS)
-- ============================================

-- Enable RLS on contact_secure_data
ALTER TABLE contact_secure_data ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can view all contact secure data
CREATE POLICY "Authenticated users can view contact secure data"
  ON contact_secure_data
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Authenticated users can insert contact secure data
CREATE POLICY "Authenticated users can insert contact secure data"
  ON contact_secure_data
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Authenticated users can update contact secure data
CREATE POLICY "Authenticated users can update contact secure data"
  ON contact_secure_data
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy: Authenticated users can delete contact secure data
CREATE POLICY "Authenticated users can delete contact secure data"
  ON contact_secure_data
  FOR DELETE
  TO authenticated
  USING (true);

-- Enable RLS on audit log
ALTER TABLE contact_secure_data_audit_log ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can view audit logs
CREATE POLICY "Authenticated users can view contact secure data audit logs"
  ON contact_secure_data_audit_log
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Authenticated users can insert audit logs
CREATE POLICY "Authenticated users can insert contact secure data audit logs"
  ON contact_secure_data_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================
-- 4. Comments for documentation
-- ============================================
COMMENT ON TABLE contact_secure_data IS 'Stores secure credentials and sensitive data linked to contacts globally (not project-scoped)';
COMMENT ON COLUMN contact_secure_data.contact_id IS 'The contact this secure data belongs to';
COMMENT ON COLUMN contact_secure_data.data_type IS 'Type of data: credentials, network, api_key, certificate, other';
COMMENT ON COLUMN contact_secure_data.name IS 'Human-readable name for this credential (e.g., "Gate Code", "Sonos Account")';
COMMENT ON COLUMN contact_secure_data.password IS 'The secret value (stored as plain text - consider encryption in production)';
COMMENT ON COLUMN contact_secure_data.additional_info IS 'Flexible JSON field for extra data specific to the data type';

COMMENT ON TABLE contact_secure_data_audit_log IS 'Audit trail for all access to contact secure data';
