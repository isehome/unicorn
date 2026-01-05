-- ============================================
-- FIX TRAINED_BY FOREIGN KEY
-- The trained_by column references auth.users(id) but the app uses
-- profiles.id which is different. Drop the FK constraint.
-- Created: 2026-01-04
-- ============================================

-- Drop the foreign key constraint on trained_by
ALTER TABLE ai_training_transcripts
  DROP CONSTRAINT IF EXISTS ai_training_transcripts_trained_by_fkey;

-- Also drop on page_ai_context if it exists
ALTER TABLE page_ai_context
  DROP CONSTRAINT IF EXISTS page_ai_context_last_trained_by_fkey;

-- Make trained_by nullable (it was probably already, but ensure it)
ALTER TABLE ai_training_transcripts
  ALTER COLUMN trained_by DROP NOT NULL;

-- Add a comment explaining the change
COMMENT ON COLUMN ai_training_transcripts.trained_by IS 'Profile ID of the trainer (no FK - profiles.id is separate from auth.users.id)';
COMMENT ON COLUMN page_ai_context.last_trained_by IS 'Profile ID of the last trainer (no FK - profiles.id is separate from auth.users.id)';
