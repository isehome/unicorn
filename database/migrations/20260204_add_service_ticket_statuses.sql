-- Add new service ticket statuses: work_complete_needs_invoice and problem
-- 2026-02-04

-- First, drop any existing constraint on status column
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'service_tickets_status_check'
    ) THEN
        ALTER TABLE service_tickets DROP CONSTRAINT service_tickets_status_check;
    END IF;
END $$;

-- Add updated constraint with all valid statuses
-- Statuses workflow:
--   open -> triaged -> scheduled -> in_progress
--   in_progress -> waiting_parts, waiting_customer, resolved, problem
--   waiting_parts -> in_progress, resolved
--   waiting_customer -> in_progress, resolved, closed
--   resolved -> work_complete_needs_invoice -> closed
--   problem -> (escalation, can go back to in_progress or closed)
ALTER TABLE service_tickets
ADD CONSTRAINT service_tickets_status_check CHECK (
    status IN (
        'open',
        'triaged',
        'scheduled',
        'in_progress',
        'waiting_parts',
        'waiting_customer',
        'resolved',
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
'Ticket status: open, triaged, scheduled, in_progress, waiting_parts, waiting_customer, resolved, work_complete_needs_invoice, problem, closed.
work_complete_needs_invoice = Work done, needs QuickBooks invoice creation.
problem = Escalation needed, ticket stuck and needs manager attention.';
