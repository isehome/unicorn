-- ============================================================
-- ADD supplier_id TO project_equipment
-- Links equipment to suppliers table for procurement workflow
-- ============================================================

-- Add supplier_id column to project_equipment
alter table if exists public.project_equipment
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;

-- Create index for faster lookups
create index if not exists idx_project_equipment_supplier
  on public.project_equipment(supplier_id);

-- Comment
comment on column public.project_equipment.supplier_id is 'References supplier in suppliers table. Linked automatically during CSV import via fuzzy matching.';

-- Note: The existing 'supplier' text column is kept for backward compatibility
-- and as the source data from CSV imports. The supplier_id is populated
-- automatically by matching the supplier text to the suppliers table.
