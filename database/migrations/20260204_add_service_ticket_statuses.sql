-- Update service ticket statuses - replace 'resolved' with 'work_complete_needs_invoice'
-- Add 'problem' status for escalation
-- 2026-02-04

-- First, update any existing 'resolved' tickets to 'work_complete_needs_invoice'
UPDATE service_tickets
SET status = 'work_complete_needs_invoice'
WHERE status = 'resolved';

-- Drop any existing constraint on status column
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'service_tickets_status_check'
    ) THEN
        ALTER TABLE service_tickets DROP CONSTRAINT service_tickets_status_check;
    END IF;
END $$;

-- Add updated constraint with final statuses (no 'resolved')
-- Statuses:
--   open - New ticket, not yet reviewed
--   triaged - Reviewed, estimated hours set
--   scheduled - Visit scheduled
--   in_progress - Work in progress
--   waiting_parts - Blocked waiting for parts
--   waiting_customer - Waiting for customer response
--   work_complete_needs_invoice - Work done, needs QuickBooks invoice
--   problem - Escalation needed, ticket stuck
--   closed - Ticket closed (invoiced or no charge)
ALTER TABLE service_tickets
ADD CONSTRAINT service_tickets_status_check CHECK (
    status IN (
        'open',
        'triaged',
        'scheduled',
        'in_progress',
        'waiting_parts',
        'waiting_customer',
        'work_complete_needs_invoice',
        'problem',
        'closed'
    )
);

-- Add index for the new statuses (for dashboard queries)
CREATE INDEX IF NOT EXISTS idx_service_tickets_status_invoice
ON service_tickets(status)
WHERE status = 'work_complete_needs_invoice';

CREATE INDEX IF NOT EXISTS idx_service_tickets_status_problem
ON service_tickets(status)
WHERE status = 'problem';

-- Add comment for documentation
COMMENT ON COLUMN service_tickets.status IS
'Ticket status: open, triaged, scheduled, in_progress, waiting_parts, waiting_customer, work_complete_needs_invoice, problem, closed.
work_complete_needs_invoice = Work done, needs QuickBooks invoice creation.
problem = Escalation needed, ticket stuck and needs manager attention.';
