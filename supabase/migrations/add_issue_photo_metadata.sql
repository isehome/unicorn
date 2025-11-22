-- ============================================================
-- ADD ISSUE PHOTO METADATA
-- Ensures issue_photos table stores SharePoint metadata and user stamps
-- Run-safe (IF NOT EXISTS guards) for repeated executions.
-- ============================================================

BEGIN;

ALTER TABLE public.issue_photos
  ADD COLUMN IF NOT EXISTS sharepoint_drive_id text,
  ADD COLUMN IF NOT EXISTS sharepoint_item_id text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS content_type text,
  ADD COLUMN IF NOT EXISTS size_bytes bigint,
  ADD COLUMN IF NOT EXISTS uploaded_by text,
  ADD COLUMN IF NOT EXISTS updated_by text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Backfill uploaded_by with created_by if the column exists, otherwise leave null
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'issue_photos'
      AND column_name = 'created_by'
  ) THEN
    UPDATE public.issue_photos
    SET uploaded_by = COALESCE(uploaded_by, created_by)
    WHERE uploaded_by IS NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.issue_photos.sharepoint_drive_id IS 'SharePoint drive ID for direct Graph operations';
COMMENT ON COLUMN public.issue_photos.sharepoint_item_id IS 'SharePoint item ID for direct Graph operations';
COMMENT ON COLUMN public.issue_photos.uploaded_by IS 'Display name or email of the person who uploaded the photo';
COMMENT ON COLUMN public.issue_photos.updated_by IS 'Display name or email of the person who last updated the photo';

COMMIT;
