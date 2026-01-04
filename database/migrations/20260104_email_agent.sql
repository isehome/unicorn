-- ============================================================================
-- AI Email Agent - Database Migration
-- ============================================================================
-- Tracks processed emails, stores AI analysis, and configures agent behavior
-- ============================================================================

-- Track all processed emails (prevents duplicate processing)
CREATE TABLE IF NOT EXISTS processed_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Email identification
    email_id TEXT UNIQUE NOT NULL,          -- Microsoft Graph message ID
    conversation_id TEXT,                    -- For threading
    internet_message_id TEXT,                -- Standard email Message-ID header

    -- Email metadata
    from_email TEXT NOT NULL,
    from_name TEXT,
    to_email TEXT,
    subject TEXT,
    body_preview TEXT,                       -- First 200 chars
    received_at TIMESTAMPTZ,

    -- Customer matching
    matched_contact_id UUID,                 -- FK to global_contacts if matched
    matched_customer_name TEXT,
    match_method TEXT,                       -- 'email', 'phone', 'manual', null

    -- AI Analysis
    ai_classification TEXT,                  -- 'support', 'sales', 'spam', 'internal', 'reply_to_notification', 'unknown'
    ai_summary TEXT,                         -- AI-generated summary
    ai_urgency TEXT,                         -- 'low', 'medium', 'high', 'critical'
    ai_sentiment TEXT,                       -- 'positive', 'neutral', 'negative', 'frustrated'
    ai_action_items JSONB DEFAULT '[]',      -- Extracted action items
    ai_suggested_response TEXT,              -- AI draft response
    ai_confidence DECIMAL(3,2),              -- 0.00 to 1.00
    ai_raw_response JSONB,                   -- Full AI response for debugging

    -- Action taken
    action_taken TEXT,                       -- 'ticket_created', 'replied', 'forwarded', 'ignored', 'pending_review'
    action_details JSONB DEFAULT '{}',

    -- Linked records
    ticket_id UUID,                          -- FK to service_tickets if created
    reply_email_id TEXT,                     -- Graph ID of reply sent
    forwarded_to TEXT,                       -- Email forwarded to

    -- Processing metadata
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    processed_by TEXT DEFAULT 'system',      -- 'system', 'manual', user_id
    processing_time_ms INTEGER,              -- How long processing took
    error_message TEXT,                      -- If processing failed

    -- Status
    status TEXT DEFAULT 'processed',         -- 'processed', 'failed', 'pending_review', 'manually_handled'
    requires_human_review BOOLEAN DEFAULT false,
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_processed_emails_from ON processed_emails(from_email);
CREATE INDEX IF NOT EXISTS idx_processed_emails_received ON processed_emails(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_processed_emails_classification ON processed_emails(ai_classification);
CREATE INDEX IF NOT EXISTS idx_processed_emails_status ON processed_emails(status);
CREATE INDEX IF NOT EXISTS idx_processed_emails_ticket ON processed_emails(ticket_id);
CREATE INDEX IF NOT EXISTS idx_processed_emails_contact ON processed_emails(matched_contact_id);
CREATE INDEX IF NOT EXISTS idx_processed_emails_conversation ON processed_emails(conversation_id);

-- RLS
ALTER TABLE processed_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "processed_emails_all"
ON processed_emails
FOR ALL TO anon, authenticated
USING (true)
WITH CHECK (true);

-- ============================================================================
-- Email Agent Configuration
-- ============================================================================

-- Add email agent settings to app_configuration
INSERT INTO app_configuration (key, value, description, category) VALUES
    -- Manager notification
    ('email_agent_cc_email', '', 'Email address to CC on all customer replies (e.g., managers@isehome.com)', 'email_agent'),
    ('email_agent_forward_email', '', 'Email address to forward unclassified emails to', 'email_agent'),

    -- Agent behavior
    ('email_agent_enabled', 'true', 'Enable/disable the email agent', 'email_agent'),
    ('email_agent_auto_reply', 'true', 'Automatically send AI-generated replies', 'email_agent'),
    ('email_agent_auto_create_tickets', 'true', 'Automatically create service tickets', 'email_agent'),
    ('email_agent_require_review_threshold', '0.7', 'Require human review if AI confidence below this (0-1)', 'email_agent'),

    -- Domain settings
    ('email_agent_internal_domains', 'isehome.com,intelligentsystems.com', 'Comma-separated internal domains to skip', 'email_agent'),
    ('email_agent_ignore_domains', 'noreply.com,mailer-daemon', 'Comma-separated domains/addresses to always ignore', 'email_agent'),

    -- AI System Prompt
    ('email_agent_system_prompt', 'You are the AI assistant for Intelligent Systems, a professional low-voltage technology company specializing in audio/video, networking, automation, and security systems.

Your role is to analyze incoming customer emails and help provide excellent customer service. You are professional, helpful, and knowledgeable about technology services.

Guidelines:
- Be professional and courteous in all responses
- Never make up information you don''t know
- If you''re unsure, recommend involving a human team member
- For technical issues, gather relevant details (what system, what''s happening, when it started)
- For urgent issues (no internet, security system down, etc.), flag as high priority
- Always acknowledge the customer''s concern before providing solutions
- Keep responses concise but complete

You have access to customer information and can create service tickets. When creating tickets, extract:
- Clear description of the issue
- Any relevant system/equipment mentioned
- Urgency level based on impact to customer', 'System prompt for the AI email agent', 'email_agent'),

    -- Response templates
    ('email_agent_signature', '

Best regards,
Intelligent Systems Support Team
support@isehome.com | (317) 555-1234

This email was processed by our AI assistant. A team member has been notified and will follow up if needed.', 'Signature appended to AI replies', 'email_agent')

ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- Email Thread Tracking (for conversation context)
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id TEXT UNIQUE NOT NULL,
    subject TEXT,
    contact_id UUID,                         -- Primary contact for this thread
    contact_email TEXT,
    ticket_id UUID,                          -- Associated service ticket
    email_count INTEGER DEFAULT 1,
    last_email_at TIMESTAMPTZ,
    last_email_from TEXT,                    -- 'customer' or 'system'
    status TEXT DEFAULT 'active',            -- 'active', 'resolved', 'archived'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_threads_contact ON email_threads(contact_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_ticket ON email_threads(ticket_id);

ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_threads_all"
ON email_threads
FOR ALL TO anon, authenticated
USING (true)
WITH CHECK (true);

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Get email agent config value
CREATE OR REPLACE FUNCTION get_email_agent_config(config_key TEXT, default_value TEXT DEFAULT NULL)
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

-- Check if email was already processed
CREATE OR REPLACE FUNCTION is_email_processed(p_email_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM processed_emails WHERE email_id = p_email_id
    );
END;
$$;

-- Get processing stats for dashboard
CREATE OR REPLACE FUNCTION get_email_agent_stats(days_back INTEGER DEFAULT 7)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_processed', COUNT(*),
        'tickets_created', COUNT(*) FILTER (WHERE action_taken = 'ticket_created'),
        'replies_sent', COUNT(*) FILTER (WHERE action_taken = 'replied'),
        'forwarded', COUNT(*) FILTER (WHERE action_taken = 'forwarded'),
        'ignored', COUNT(*) FILTER (WHERE action_taken = 'ignored'),
        'pending_review', COUNT(*) FILTER (WHERE status = 'pending_review'),
        'failed', COUNT(*) FILTER (WHERE status = 'failed'),
        'by_classification', jsonb_object_agg(
            COALESCE(ai_classification, 'unknown'),
            classification_count
        ),
        'avg_confidence', ROUND(AVG(ai_confidence)::numeric, 2),
        'avg_processing_time_ms', ROUND(AVG(processing_time_ms)::numeric, 0)
    ) INTO result
    FROM processed_emails
    CROSS JOIN LATERAL (
        SELECT ai_classification, COUNT(*) as classification_count
        FROM processed_emails
        WHERE processed_at > NOW() - (days_back || ' days')::interval
        GROUP BY ai_classification
    ) classifications
    WHERE processed_at > NOW() - (days_back || ' days')::interval;

    RETURN COALESCE(result, '{}'::jsonb);
END;
$$;
