-- ============================================================================
-- System Account Feature - Database Migration
-- ============================================================================
-- Purpose: Store OAuth tokens for the application's own Microsoft identity
-- This allows Unicorn to send emails/manage calendar as itself, not as a user
-- ============================================================================

-- Table: system_account_credentials
-- Stores the OAuth tokens for the system account
CREATE TABLE IF NOT EXISTS system_account_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_email TEXT NOT NULL,
    account_name TEXT,
    tenant_id TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expires_at TIMESTAMPTZ NOT NULL,
    scopes TEXT[] DEFAULT ARRAY[]::TEXT[],
    connected_at TIMESTAMPTZ DEFAULT NOW(),
    connected_by UUID,
    connected_by_name TEXT,
    last_refreshed_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    consecutive_failures INTEGER DEFAULT 0,
    last_error TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only allow one active system account at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_system_account_active
ON system_account_credentials (is_active)
WHERE is_active = true;

-- Table: system_account_refresh_log
-- Audit trail for token refresh operations
CREATE TABLE IF NOT EXISTS system_account_refresh_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credential_id UUID REFERENCES system_account_credentials(id) ON DELETE CASCADE,
    refresh_type TEXT NOT NULL, -- 'cron', 'proactive', 'manual', 'initial'
    success BOOLEAN NOT NULL,
    error_message TEXT,
    old_expires_at TIMESTAMPTZ,
    new_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying recent refresh attempts
CREATE INDEX IF NOT EXISTS idx_refresh_log_created
ON system_account_refresh_log (created_at DESC);

-- Table: system_account_usage_log
-- Track what the system account is used for (optional, for auditing)
CREATE TABLE IF NOT EXISTS system_account_usage_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation TEXT NOT NULL, -- 'send_mail', 'create_event', 'update_event', etc.
    target TEXT, -- email recipient or event subject
    success BOOLEAN NOT NULL,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for usage analytics
CREATE INDEX IF NOT EXISTS idx_usage_log_operation
ON system_account_usage_log (operation, created_at DESC);

-- ============================================================================
-- RLS Policies (MSAL pattern - include anon)
-- ============================================================================

ALTER TABLE system_account_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_account_refresh_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_account_usage_log ENABLE ROW LEVEL SECURITY;

-- System account credentials - only admins should access
-- For now, allow all authenticated/anon (admin check done in app layer)
CREATE POLICY "system_account_credentials_all"
ON system_account_credentials
FOR ALL TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "system_account_refresh_log_all"
ON system_account_refresh_log
FOR ALL TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "system_account_usage_log_all"
ON system_account_usage_log
FOR ALL TO anon, authenticated
USING (true)
WITH CHECK (true);

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function: is_system_account_healthy()
-- Returns true if system account is connected and token is valid
CREATE OR REPLACE FUNCTION is_system_account_healthy()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    cred RECORD;
BEGIN
    SELECT * INTO cred
    FROM system_account_credentials
    WHERE is_active = true
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- Check if token is expired (with 5 min buffer)
    IF cred.token_expires_at < (NOW() + INTERVAL '5 minutes') THEN
        RETURN false;
    END IF;

    -- Check for consecutive failures
    IF cred.consecutive_failures >= 3 THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$;

-- Function: get_system_account_status()
-- Returns detailed status of the system account
CREATE OR REPLACE FUNCTION get_system_account_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    cred RECORD;
    recent_refreshes JSONB;
    result JSONB;
BEGIN
    SELECT * INTO cred
    FROM system_account_credentials
    WHERE is_active = true
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'connected', false,
            'healthy', false,
            'message', 'No system account connected'
        );
    END IF;

    -- Get recent refresh attempts
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'type', refresh_type,
            'success', success,
            'error', error_message,
            'at', created_at
        ) ORDER BY created_at DESC
    ), '[]'::jsonb) INTO recent_refreshes
    FROM system_account_refresh_log
    WHERE credential_id = cred.id
    AND created_at > NOW() - INTERVAL '7 days'
    LIMIT 10;

    RETURN jsonb_build_object(
        'connected', true,
        'healthy', is_system_account_healthy(),
        'accountEmail', cred.account_email,
        'accountName', cred.account_name,
        'connectedAt', cred.connected_at,
        'connectedByName', cred.connected_by_name,
        'tokenExpiresAt', cred.token_expires_at,
        'lastRefreshedAt', cred.last_refreshed_at,
        'lastUsedAt', cred.last_used_at,
        'consecutiveFailures', cred.consecutive_failures,
        'lastError', cred.last_error,
        'scopes', cred.scopes,
        'recentRefreshes', recent_refreshes
    );
END;
$$;

-- Function: cleanup_system_account_logs()
-- Removes old log entries (run periodically)
CREATE OR REPLACE FUNCTION cleanup_system_account_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_refresh INTEGER;
    deleted_usage INTEGER;
BEGIN
    -- Keep 30 days of refresh logs
    DELETE FROM system_account_refresh_log
    WHERE created_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS deleted_refresh = ROW_COUNT;

    -- Keep 90 days of usage logs
    DELETE FROM system_account_usage_log
    WHERE created_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS deleted_usage = ROW_COUNT;

    RETURN deleted_refresh + deleted_usage;
END;
$$;

-- ============================================================================
-- Configuration Table for Multi-Tenant Support
-- ============================================================================
-- This table stores tenant-specific configuration that can be customized
-- when deploying Unicorn for different companies

CREATE TABLE IF NOT EXISTS app_configuration (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value TEXT,
    value_json JSONB,
    description TEXT,
    is_sensitive BOOLEAN DEFAULT false,
    category TEXT DEFAULT 'general',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for app_configuration
ALTER TABLE app_configuration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_configuration_all"
ON app_configuration
FOR ALL TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Insert default configuration values
INSERT INTO app_configuration (key, value, description, category) VALUES
    ('company_name', 'Intelligent Systems', 'Company name displayed in the app', 'branding'),
    ('company_email', 'support@isehome.com', 'Default support email address', 'branding'),
    ('company_phone', '', 'Company phone number', 'branding'),
    ('company_address', '', 'Company address', 'branding'),
    ('company_logo_url', '', 'URL to company logo', 'branding'),
    ('notification_from_name', 'Unicorn', 'Name shown in email From field', 'notifications'),
    ('notification_reply_to', '', 'Reply-to email for notifications', 'notifications'),
    ('service_default_rate', '150', 'Default hourly rate for service tickets', 'general'),
    ('timezone', 'America/Indiana/Indianapolis', 'Default timezone for the app', 'general')
ON CONFLICT (key) DO NOTHING;

-- Function to get config value
CREATE OR REPLACE FUNCTION get_app_config(config_key TEXT, default_value TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result TEXT;
BEGIN
    SELECT value INTO result
    FROM app_configuration
    WHERE key = config_key;

    RETURN COALESCE(result, default_value);
END;
$$;

-- Function to set config value
CREATE OR REPLACE FUNCTION set_app_config(config_key TEXT, config_value TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO app_configuration (key, value, updated_at)
    VALUES (config_key, config_value, NOW())
    ON CONFLICT (key) DO UPDATE SET
        value = config_value,
        updated_at = NOW();
END;
$$;
