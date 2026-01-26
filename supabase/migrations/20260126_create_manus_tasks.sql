-- Create manus_tasks table to track async Manus API tasks
-- This allows the webhook to find the part associated with a completed task

CREATE TABLE IF NOT EXISTS manus_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  manus_task_id TEXT NOT NULL UNIQUE,
  part_id UUID NOT NULL REFERENCES global_parts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
  prompt TEXT,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Index for fast lookup by manus task ID
  CONSTRAINT manus_tasks_manus_task_id_key UNIQUE (manus_task_id)
);

-- Index for finding tasks by part
CREATE INDEX IF NOT EXISTS idx_manus_tasks_part_id ON manus_tasks(part_id);

-- Index for finding pending tasks
CREATE INDEX IF NOT EXISTS idx_manus_tasks_status ON manus_tasks(status);

-- Enable RLS
ALTER TABLE manus_tasks ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role can manage manus_tasks"
  ON manus_tasks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Comment on table
COMMENT ON TABLE manus_tasks IS 'Tracks async Manus AI tasks for document research. Webhook updates this when tasks complete.';
