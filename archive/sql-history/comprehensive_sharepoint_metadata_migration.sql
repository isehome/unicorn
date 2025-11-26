-- Comprehensive SharePoint Metadata Migration
-- Adds SharePoint metadata columns to all photo storage tables for proper thumbnail support

-- ============================================================================
-- 1. ISSUE PHOTOS - Add SharePoint metadata columns
-- ============================================================================
DO $$ 
BEGIN
  -- Add sharepoint_drive_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'issue_photos' 
    AND column_name = 'sharepoint_drive_id'
  ) THEN
    ALTER TABLE public.issue_photos 
    ADD COLUMN sharepoint_drive_id text;
  END IF;

  -- Add sharepoint_item_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'issue_photos' 
    AND column_name = 'sharepoint_item_id'
  ) THEN
    ALTER TABLE public.issue_photos 
    ADD COLUMN sharepoint_item_id text;
  END IF;

  -- Add file_name column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'issue_photos' 
    AND column_name = 'file_name'
  ) THEN
    ALTER TABLE public.issue_photos 
    ADD COLUMN file_name text;
  END IF;

  -- Add content_type column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'issue_photos' 
    AND column_name = 'content_type'
  ) THEN
    ALTER TABLE public.issue_photos 
    ADD COLUMN content_type text;
  END IF;

  -- Add size_bytes column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'issue_photos' 
    AND column_name = 'size_bytes'
  ) THEN
    ALTER TABLE public.issue_photos 
    ADD COLUMN size_bytes bigint;
  END IF;
END $$;

-- ============================================================================
-- 2. LUCID PAGES (Floor Plans) - Add SharePoint metadata columns
-- ============================================================================
DO $$ 
BEGIN
  -- Add sharepoint_drive_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'lucid_pages' 
    AND column_name = 'sharepoint_drive_id'
  ) THEN
    ALTER TABLE public.lucid_pages 
    ADD COLUMN sharepoint_drive_id text;
  END IF;

  -- Add sharepoint_item_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'lucid_pages' 
    AND column_name = 'sharepoint_item_id'
  ) THEN
    ALTER TABLE public.lucid_pages 
    ADD COLUMN sharepoint_item_id text;
  END IF;
END $$;

-- ============================================================================
-- 3. Add RLS policies for issue_photos if not exist
-- ============================================================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'issue_photos' 
    AND policyname = 'dev_insert_all'
  ) THEN
    CREATE POLICY dev_insert_all ON public.issue_photos
      FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'issue_photos' 
    AND policyname = 'dev_update_all'
  ) THEN
    CREATE POLICY dev_update_all ON public.issue_photos
      FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'issue_photos' 
    AND policyname = 'dev_delete_all'
  ) THEN
    CREATE POLICY dev_delete_all ON public.issue_photos
      FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- ============================================================================
-- Summary
-- ============================================================================
-- This migration adds SharePoint metadata columns to:
-- 1. issue_photos table (sharepoint_drive_id, sharepoint_item_id, file_name, content_type, size_bytes)
-- 2. lucid_pages table (sharepoint_drive_id, sharepoint_item_id)
--
-- These columns enable proper thumbnail generation via Microsoft Graph API
-- for all photos stored in SharePoint, providing:
-- - Fast thumbnail loading
-- - Reduced bandwidth usage
-- - Better user experience
-- - Backward compatibility (photos without metadata will use fallback method)
