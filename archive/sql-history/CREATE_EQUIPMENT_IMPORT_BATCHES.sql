-- Create equipment_import_batches table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.equipment_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  raw_payload JSONB,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_equipment_import_batches_project
  ON public.equipment_import_batches(project_id);

-- Enable RLS
ALTER TABLE public.equipment_import_batches ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
DROP POLICY IF EXISTS equipment_import_batches_read_all ON public.equipment_import_batches;
CREATE POLICY equipment_import_batches_read_all ON public.equipment_import_batches
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS equipment_import_batches_write_authenticated ON public.equipment_import_batches;
CREATE POLICY equipment_import_batches_write_authenticated ON public.equipment_import_batches
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
