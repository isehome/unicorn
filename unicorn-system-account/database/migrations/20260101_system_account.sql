-- =============================================================================
-- System Account Credentials
-- =============================================================================
-- Stores OAuth tokens for the system account (e.g., unicorn@isehome.com)
-- This allows the system to send email, manage calendar, etc. as itself
-- =============================================================================

-- System account credentials table
CREATE TABLE IF NOT EXISTS system_account_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Account identification
  account_type TEXT NOT NULL DEFAULT 'microsoft_365',
  account_email TEXT NOT NULL,
  display_name TEXT,
  user_id TEXT, -- Microsoft user ID from Graph API
  
  -- OAuth tokens (stored encrypted - Supabase handles encryption at rest)
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  
  -- Scopes that were granted
  granted_scopes TEXT[],
  
  -- Status tracking
  is_active BOOLEAN DEFAULT true,
  last_token_refresh TIMESTAMPTZ,
  last_successful_use TIMESTAMPTZ,
  consecutive_failures INTEGER DEFAULT 0,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  
  -- Audit trail
  configured_by UUID,
  configured_by_name TEXT,
  configured_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Only one system account per type
  CONSTRAINT unique_account_type UNIQUE (account_type)
);

-- Create index for quick lookup
CREATE INDEX IF NOT EXISTS idx_system_account_type ON system_account_credentials(account_type);
CREATE INDEX IF NOT EXISTS idx_system_account_active ON system_account_credentials(is_active);

-- Enable RLS
ALTER TABLE system_account_credentials ENABLE ROW LEVEL SECURITY;

-- RLS policy: Only admin-level users can access
-- Since we use MSAL (not Supabase Auth), we need anon access but will check role in application
CREATE POLICY "System account access for anon and authenticated"
  ON system_account_credentials
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_system_account_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_system_account_updated_at ON system_account_credentials;
CREATE TRIGGER trigger_system_account_updated_at
  BEFORE UPDATE ON system_account_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_system_account_updated_at();

-- =============================================================================
-- System Account Token Refresh Log
-- =============================================================================
-- Tracks token refresh attempts for debugging and monitoring

CREATE TABLE IF NOT EXISTS system_account_refresh_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_type TEXT NOT NULL DEFAULT 'microsoft_365',
  refresh_type TEXT NOT NULL, -- 'cron', 'on_demand', 'proactive'
  success BOOLEAN NOT NULL,
  error_message TEXT,
  token_expires_at TIMESTAMPTZ, -- New expiry after refresh
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for cleanup and querying
CREATE INDEX IF NOT EXISTS idx_refresh_log_created ON system_account_refresh_log(created_at);
CREATE INDEX IF NOT EXISTS idx_refresh_log_account ON system_account_refresh_log(account_type);

-- Enable RLS
ALTER TABLE system_account_refresh_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Refresh log access"
  ON system_account_refresh_log
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Function to clean up old refresh logs (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_system_account_refresh_log()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM system_account_refresh_log
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Helper function to check if system account is healthy
-- =============================================================================
CREATE OR REPLACE FUNCTION is_system_account_healthy(p_account_type TEXT DEFAULT 'microsoft_365')
RETURNS JSONB AS $$
DECLARE
  v_account RECORD;
  v_result JSONB;
BEGIN
  SELECT * INTO v_account
  FROM system_account_credentials
  WHERE account_type = p_account_type AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'healthy', false,
      'reason', 'not_configured',
      'message', 'System account not configured'
    );
  END IF;
  
  -- Check if token exists
  IF v_account.refresh_token IS NULL THEN
    RETURN jsonb_build_object(
      'healthy', false,
      'reason', 'no_token',
      'message', 'No refresh token stored'
    );
  END IF;
  
  -- Check consecutive failures
  IF v_account.consecutive_failures >= 3 THEN
    RETURN jsonb_build_object(
      'healthy', false,
      'reason', 'too_many_failures',
      'message', 'Too many consecutive token refresh failures',
      'last_error', v_account.last_error
    );
  END IF;
  
  -- Check if token was refreshed recently (within 7 days)
  IF v_account.last_token_refresh IS NULL OR 
     v_account.last_token_refresh < NOW() - INTERVAL '7 days' THEN
    RETURN jsonb_build_object(
      'healthy', false,
      'reason', 'stale_token',
      'message', 'Token has not been refreshed recently'
    );
  END IF;
  
  -- All checks passed
  RETURN jsonb_build_object(
    'healthy', true,
    'account_email', v_account.account_email,
    'display_name', v_account.display_name,
    'last_refresh', v_account.last_token_refresh,
    'last_use', v_account.last_successful_use,
    'token_expires', v_account.token_expires_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to anon/authenticated
GRANT EXECUTE ON FUNCTION is_system_account_healthy TO anon, authenticated;

-- =============================================================================
-- Comments
-- =============================================================================
COMMENT ON TABLE system_account_credentials IS 
  'Stores OAuth credentials for the system account (unicorn@isehome.com) allowing the app to act as itself for email, calendar, etc.';

COMMENT ON COLUMN system_account_credentials.access_token IS 
  'Current access token (expires ~1 hour). Refreshed automatically.';

COMMENT ON COLUMN system_account_credentials.refresh_token IS 
  'Long-lived refresh token (90 days). Used to get new access tokens.';

COMMENT ON COLUMN system_account_credentials.consecutive_failures IS 
  'Number of consecutive token refresh failures. Resets to 0 on success.';
