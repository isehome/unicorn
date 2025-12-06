-- Create table for tracking Shade CSV Imports (for round-tripping)
CREATE TABLE IF NOT EXISTS project_shade_batches (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
    original_filename text,
    original_headers text[], -- Stores the header row for reproduction
    created_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES auth.users(id)
);

-- Add Batch Link to Project Shades
ALTER TABLE project_shades 
ADD COLUMN IF NOT EXISTS shade_batch_id uuid REFERENCES project_shade_batches(id);

-- Add JSONB column to store original row data for exact reproduction
ALTER TABLE project_shades 
ADD COLUMN IF NOT EXISTS original_csv_row jsonb;

-- Link to Designer Stakeholder (Who approves this?)
ALTER TABLE project_shades 
ADD COLUMN IF NOT EXISTS designer_stakeholder_id uuid REFERENCES project_stakeholders(id);

-- Link to Vendor (Who are we ordering from?)
ALTER TABLE project_shades 
ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES suppliers(id);

-- Ensure we have a status for "Ordered" if not already covered
-- Existing check: check (design_review_status in ('pending', 'sent', 'approved', 'rejected'))
-- We might need an overall 'status' or just use 'ordered' flag?
-- The previous migration added 'design_review_status'.
-- Let's add 'order_status' for Procurement tracking.
ALTER TABLE project_shades 
ADD COLUMN IF NOT EXISTS order_status text DEFAULT 'planning' 
CHECK (order_status IN ('planning', 'ready_to_order', 'ordered', 'received', 'installed'));
