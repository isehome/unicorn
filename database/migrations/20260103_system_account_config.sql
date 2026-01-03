-- ============================================================================
-- System Account Configuration
-- ============================================================================
-- Simple configuration table for system account email and other tenant settings
-- Uses Application Permissions (no OAuth tokens needed)
-- ============================================================================

-- App Configuration Table
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

-- RLS (MSAL pattern - include anon)
ALTER TABLE app_configuration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_configuration_all"
ON app_configuration
FOR ALL TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Insert default configuration values
INSERT INTO app_configuration (key, value, description, category) VALUES
    ('system_account_email', 'unicorn@isehome.com', 'Email address used for system notifications and calendar', 'integrations'),
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

-- Helper function to get config value
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

-- Helper function to set config value
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

-- Usage logging table (optional, for auditing)
CREATE TABLE IF NOT EXISTS system_account_usage_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation TEXT NOT NULL,
    target TEXT,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE system_account_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_account_usage_log_all"
ON system_account_usage_log
FOR ALL TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_usage_log_created
ON system_account_usage_log (created_at DESC);
