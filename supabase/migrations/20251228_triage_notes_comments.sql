-- ============================================================
-- TRIAGE NOTES TO JSONB COMMENTS MIGRATION
-- Converts triage_notes from TEXT to JSONB array with timestamps
-- ============================================================

-- Step 1: Add new triage_comments column as JSONB
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'service_tickets' AND column_name = 'triage_comments') THEN
    ALTER TABLE service_tickets ADD COLUMN triage_comments JSONB DEFAULT '[]'::JSONB;
  END IF;
END $$;

-- Step 2: Migrate existing triage_notes to new format
-- If there's existing triage_notes, convert to first comment
UPDATE service_tickets
SET triage_comments = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid(),
    'content', triage_notes,
    'author_id', triaged_by,
    'author_name', triaged_by_name,
    'created_at', COALESCE(triaged_at, NOW())
  )
)
WHERE triage_notes IS NOT NULL
  AND triage_notes != ''
  AND (triage_comments IS NULL OR triage_comments = '[]'::JSONB);

-- Step 3: Add comment for documentation
COMMENT ON COLUMN service_tickets.triage_comments IS 'Array of timestamped triage comments: [{id, content, author_id, author_name, created_at}]';

-- Note: Keeping triage_notes column for backward compatibility
-- It can be removed in a future migration after confirming all code uses triage_comments

-- ============================================================
-- DONE
-- ============================================================
SELECT 'Triage comments migration completed successfully!' as status;
