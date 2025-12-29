-- QuickBooks Online Integration Migration
-- Creates tables for QBO authentication and sync tracking

-- QBO OAuth tokens storage (encrypted at rest via Supabase)
CREATE TABLE IF NOT EXISTS public.qbo_auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id TEXT NOT NULL UNIQUE,
  company_name TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  refresh_token_expires_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customer mapping between our contacts and QBO customers
CREATE TABLE IF NOT EXISTS public.qbo_customer_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  qbo_customer_id TEXT NOT NULL,
  qbo_display_name TEXT,
  qbo_realm_id TEXT NOT NULL,
  sync_status TEXT DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'error')),
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contact_id, qbo_realm_id)
);

-- Add QBO sync columns to service_tickets
ALTER TABLE public.service_tickets
ADD COLUMN IF NOT EXISTS qbo_invoice_id TEXT;

ALTER TABLE public.service_tickets
ADD COLUMN IF NOT EXISTS qbo_invoice_number TEXT;

ALTER TABLE public.service_tickets
ADD COLUMN IF NOT EXISTS qbo_synced_at TIMESTAMPTZ;

ALTER TABLE public.service_tickets
ADD COLUMN IF NOT EXISTS qbo_sync_status TEXT DEFAULT NULL CHECK (
  qbo_sync_status IS NULL OR qbo_sync_status IN ('pending', 'synced', 'failed', 'skipped')
);

ALTER TABLE public.service_tickets
ADD COLUMN IF NOT EXISTS qbo_sync_error TEXT;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_qbo_customer_mapping_contact_id
ON public.qbo_customer_mapping(contact_id);

CREATE INDEX IF NOT EXISTS idx_qbo_customer_mapping_qbo_customer_id
ON public.qbo_customer_mapping(qbo_customer_id);

CREATE INDEX IF NOT EXISTS idx_service_tickets_qbo_invoice_id
ON public.service_tickets(qbo_invoice_id);

CREATE INDEX IF NOT EXISTS idx_service_tickets_qbo_sync_status
ON public.service_tickets(qbo_sync_status);

-- Enable RLS
ALTER TABLE public.qbo_auth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qbo_customer_mapping ENABLE ROW LEVEL SECURITY;

-- RLS Policies for qbo_auth_tokens
CREATE POLICY "qbo_auth_tokens_select" ON public.qbo_auth_tokens
  FOR SELECT USING (true);

CREATE POLICY "qbo_auth_tokens_insert" ON public.qbo_auth_tokens
  FOR INSERT WITH CHECK (true);

CREATE POLICY "qbo_auth_tokens_update" ON public.qbo_auth_tokens
  FOR UPDATE USING (true);

CREATE POLICY "qbo_auth_tokens_delete" ON public.qbo_auth_tokens
  FOR DELETE USING (true);

-- RLS Policies for qbo_customer_mapping
CREATE POLICY "qbo_customer_mapping_select" ON public.qbo_customer_mapping
  FOR SELECT USING (true);

CREATE POLICY "qbo_customer_mapping_insert" ON public.qbo_customer_mapping
  FOR INSERT WITH CHECK (true);

CREATE POLICY "qbo_customer_mapping_update" ON public.qbo_customer_mapping
  FOR UPDATE USING (true);

CREATE POLICY "qbo_customer_mapping_delete" ON public.qbo_customer_mapping
  FOR DELETE USING (true);

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_qbo_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
DROP TRIGGER IF EXISTS trigger_qbo_auth_tokens_updated_at ON public.qbo_auth_tokens;
CREATE TRIGGER trigger_qbo_auth_tokens_updated_at
  BEFORE UPDATE ON public.qbo_auth_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_qbo_updated_at();

DROP TRIGGER IF EXISTS trigger_qbo_customer_mapping_updated_at ON public.qbo_customer_mapping;
CREATE TRIGGER trigger_qbo_customer_mapping_updated_at
  BEFORE UPDATE ON public.qbo_customer_mapping
  FOR EACH ROW
  EXECUTE FUNCTION update_qbo_updated_at();

-- Function to get QBO connection status
CREATE OR REPLACE FUNCTION get_qbo_connection_status()
RETURNS TABLE (
  is_connected BOOLEAN,
  realm_id TEXT,
  company_name TEXT,
  token_expires_at TIMESTAMPTZ,
  is_token_expired BOOLEAN,
  needs_refresh BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    TRUE as is_connected,
    t.realm_id,
    t.company_name,
    t.access_token_expires_at as token_expires_at,
    t.access_token_expires_at < NOW() as is_token_expired,
    t.access_token_expires_at < (NOW() + INTERVAL '5 minutes') as needs_refresh
  FROM public.qbo_auth_tokens t
  ORDER BY t.updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, FALSE, FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get customer QBO mapping
CREATE OR REPLACE FUNCTION get_qbo_customer_mapping(p_contact_id UUID)
RETURNS TABLE (
  qbo_customer_id TEXT,
  qbo_display_name TEXT,
  last_synced_at TIMESTAMPTZ
) AS $$
DECLARE
  v_realm_id TEXT;
BEGIN
  -- Get current realm_id
  SELECT t.realm_id INTO v_realm_id
  FROM public.qbo_auth_tokens t
  ORDER BY t.updated_at DESC
  LIMIT 1;

  IF v_realm_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    m.qbo_customer_id,
    m.qbo_display_name,
    m.last_synced_at
  FROM public.qbo_customer_mapping m
  WHERE m.contact_id = p_contact_id
    AND m.qbo_realm_id = v_realm_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT ALL ON public.qbo_auth_tokens TO authenticated;
GRANT ALL ON public.qbo_auth_tokens TO service_role;
GRANT ALL ON public.qbo_customer_mapping TO authenticated;
GRANT ALL ON public.qbo_customer_mapping TO service_role;
GRANT EXECUTE ON FUNCTION get_qbo_connection_status TO authenticated;
GRANT EXECUTE ON FUNCTION get_qbo_customer_mapping TO authenticated;
