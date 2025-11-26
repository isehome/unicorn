-- Add supplier column to project_labor_budget table
-- This allows tracking which vendor/supplier provides the labor

ALTER TABLE project_labor_budget
ADD COLUMN IF NOT EXISTS supplier TEXT;

-- Add index for better query performance when filtering by supplier
CREATE INDEX IF NOT EXISTS idx_project_labor_budget_supplier
ON project_labor_budget(supplier);

-- Add comment to document the column
COMMENT ON COLUMN project_labor_budget.supplier IS 'Vendor/supplier name from CSV import for labor budget items';
