-- Migration: 3-Step Approval Workflow for Service Scheduling
-- Date: 2025-12-28
-- Description: Adds support for PM → Tech → Customer approval flow with Graph webhook integration

-- =====================================================
-- Step 1: Update schedule_status constraint
-- =====================================================

-- Drop existing constraint first
ALTER TABLE service_schedules
DROP CONSTRAINT IF EXISTS service_schedules_schedule_status_check;

-- Force ALL rows to a valid status - unconditional update
-- This handles: tentative, NULL, empty string, or any other value
UPDATE service_schedules
SET schedule_status = CASE
    WHEN schedule_status = 'confirmed' THEN 'confirmed'
    WHEN schedule_status = 'cancelled' THEN 'cancelled'
    ELSE 'pending_tech'
END;

-- NOW add the new constraint (all rows should be valid)
ALTER TABLE service_schedules
ADD CONSTRAINT service_schedules_schedule_status_check
CHECK (schedule_status IN ('pending_tech', 'pending_customer', 'confirmed', 'cancelled'));

-- =====================================================
-- Step 2: Add tracking columns to service_schedules
-- =====================================================

-- Track when technician accepted the calendar invite
ALTER TABLE service_schedules
ADD COLUMN IF NOT EXISTS technician_accepted_at TIMESTAMPTZ;

-- Track when customer accepted the calendar invite
ALTER TABLE service_schedules
ADD COLUMN IF NOT EXISTS customer_accepted_at TIMESTAMPTZ;

-- Track technician's calendar response status
ALTER TABLE service_schedules
ADD COLUMN IF NOT EXISTS tech_calendar_response TEXT DEFAULT 'none'
CHECK (tech_calendar_response IN ('accepted', 'declined', 'tentative', 'none'));

-- Track customer's calendar response status
ALTER TABLE service_schedules
ADD COLUMN IF NOT EXISTS customer_calendar_response TEXT DEFAULT 'none'
CHECK (customer_calendar_response IN ('accepted', 'declined', 'tentative', 'none'));

-- =====================================================
-- Step 3: Create graph_subscriptions table
-- =====================================================

CREATE TABLE IF NOT EXISTS graph_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Who this subscription is for (technician's user ID)
    user_id UUID NOT NULL,
    user_email TEXT NOT NULL,

    -- Microsoft Graph subscription details
    subscription_id TEXT UNIQUE NOT NULL,
    resource TEXT NOT NULL,           -- e.g., /users/{id}/calendar/events
    change_types TEXT[] NOT NULL,     -- ['updated', 'deleted']
    notification_url TEXT NOT NULL,   -- webhook endpoint URL
    client_state TEXT NOT NULL,       -- secret for validation

    -- Lifecycle tracking
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_renewed_at TIMESTAMPTZ,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'failed', 'deleted')),

    -- Error tracking
    error_message TEXT,
    error_count INTEGER DEFAULT 0,
    last_error_at TIMESTAMPTZ
);

-- Index for finding subscriptions by user
CREATE INDEX IF NOT EXISTS idx_graph_subscriptions_user_id ON graph_subscriptions(user_id);

-- Index for finding expiring subscriptions
CREATE INDEX IF NOT EXISTS idx_graph_subscriptions_expires_at ON graph_subscriptions(expires_at)
WHERE status = 'active';

-- Index for finding subscriptions by Graph subscription ID
CREATE INDEX IF NOT EXISTS idx_graph_subscriptions_subscription_id ON graph_subscriptions(subscription_id);

-- =====================================================
-- Step 4: Create graph_change_notifications table
-- =====================================================

CREATE TABLE IF NOT EXISTS graph_change_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Link to subscription
    subscription_id TEXT NOT NULL,

    -- Notification details from Graph
    change_type TEXT NOT NULL,        -- 'updated', 'deleted', etc.
    resource_url TEXT NOT NULL,       -- e.g., /users/{id}/events/{eventId}
    resource_id TEXT,                 -- Extracted event ID
    tenant_id TEXT,                   -- Azure tenant
    client_state TEXT,                -- For validation

    -- Raw payload for debugging
    raw_payload JSONB,

    -- Processing status
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    processed_result TEXT,            -- 'success', 'error', 'skipped'
    error_message TEXT,

    -- Link to what was affected
    schedule_id UUID REFERENCES service_schedules(id),

    CONSTRAINT fk_subscription
        FOREIGN KEY (subscription_id)
        REFERENCES graph_subscriptions(subscription_id)
        ON DELETE CASCADE
);

-- Index for unprocessed notifications (cron job query)
CREATE INDEX IF NOT EXISTS idx_graph_notifications_unprocessed
ON graph_change_notifications(created_at)
WHERE processed_at IS NULL;

-- Index for finding notifications by resource
CREATE INDEX IF NOT EXISTS idx_graph_notifications_resource_id
ON graph_change_notifications(resource_id);

-- =====================================================
-- Step 5: RLS Policies (using anon for MSAL auth pattern)
-- =====================================================

-- Enable RLS
ALTER TABLE graph_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_change_notifications ENABLE ROW LEVEL SECURITY;

-- graph_subscriptions policies
CREATE POLICY "graph_subscriptions_select" ON graph_subscriptions
FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "graph_subscriptions_insert" ON graph_subscriptions
FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "graph_subscriptions_update" ON graph_subscriptions
FOR UPDATE TO anon, authenticated
USING (true);

CREATE POLICY "graph_subscriptions_delete" ON graph_subscriptions
FOR DELETE TO anon, authenticated
USING (true);

-- graph_change_notifications policies
CREATE POLICY "graph_notifications_select" ON graph_change_notifications
FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "graph_notifications_insert" ON graph_change_notifications
FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "graph_notifications_update" ON graph_change_notifications
FOR UPDATE TO anon, authenticated
USING (true);

-- =====================================================
-- Step 6: Helper function to get pending notifications
-- =====================================================

CREATE OR REPLACE FUNCTION get_pending_calendar_notifications(batch_size INTEGER DEFAULT 50)
RETURNS TABLE (
    notification_id UUID,
    subscription_id TEXT,
    change_type TEXT,
    resource_id TEXT,
    schedule_id UUID,
    calendar_event_id TEXT,
    technician_id UUID,
    customer_email TEXT,
    current_status TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        n.id AS notification_id,
        n.subscription_id,
        n.change_type,
        n.resource_id,
        s.id AS schedule_id,
        s.calendar_event_id,
        s.technician_id,
        t.customer_email,
        s.schedule_status AS current_status
    FROM graph_change_notifications n
    LEFT JOIN service_schedules s ON s.calendar_event_id = n.resource_id
    LEFT JOIN service_tickets t ON s.ticket_id = t.id
    WHERE n.processed_at IS NULL
    ORDER BY n.created_at ASC
    LIMIT batch_size;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Step 7: Update default for new schedules
-- =====================================================

-- Change default from 'tentative' to 'pending_tech'
ALTER TABLE service_schedules
ALTER COLUMN schedule_status SET DEFAULT 'pending_tech';

-- =====================================================
-- Comments for documentation
-- =====================================================

COMMENT ON TABLE graph_subscriptions IS
'Tracks Microsoft Graph webhook subscriptions for calendar event change notifications';

COMMENT ON TABLE graph_change_notifications IS
'Queue of incoming Graph webhook notifications, processed by cron job';

COMMENT ON COLUMN service_schedules.schedule_status IS
'Approval workflow status: pending_tech (waiting for tech to accept), pending_customer (waiting for customer), confirmed (all accepted), cancelled';

COMMENT ON COLUMN service_schedules.tech_calendar_response IS
'Technician calendar invite response: accepted, declined, tentative, none';

COMMENT ON COLUMN service_schedules.customer_calendar_response IS
'Customer calendar invite response: accepted, declined, tentative, none';
