-- Add SharePoint metadata columns for thumbnail support
-- Run this migration to enable fast thumbnail loading for all photos

-- First, ensure issue_photos table exists with all needed columns
CREATE TABLE IF NOT EXISTS public.issue_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  url text NOT NULL,
  file_name text,
  content_type text,
  size_bytes bigint,
  sharepoint_drive_id text,
  sharepoint_item_id text,
  created_at timestamptz DEFAULT now()
);

-- Add RLS policies for issue_photos if they don't exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'issue_photos' 
    AND policyname = 'dev_read_all'
  ) THEN
    CREATE POLICY dev_read_all ON public.issue_photos
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

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

-- For existing issue_photos tables, add missing columns
DO $$ BEGIN
  -- Check if table exists before altering
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'issue_photos') THEN
    -- Add file_name if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'issue_photos' AND column_name = 'file_name') THEN
      ALTER TABLE public.issue_photos ADD COLUMN file_name text;
    END IF;
    
    -- Add content_type if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'issue_photos' AND column_name = 'content_type') THEN
      ALTER TABLE public.issue_photos ADD COLUMN content_type text;
    END IF;
    
    -- Add size_bytes if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'issue_photos' AND column_name = 'size_bytes') THEN
      ALTER TABLE public.issue_photos ADD COLUMN size_bytes bigint;
    END IF;
    
    -- Add sharepoint_drive_id if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'issue_photos' AND column_name = 'sharepoint_drive_id') THEN
      ALTER TABLE public.issue_photos ADD COLUMN sharepoint_drive_id text;
    END IF;
    
    -- Add sharepoint_item_id if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'issue_photos' AND column_name = 'sharepoint_item_id') THEN
      ALTER TABLE public.issue_photos ADD COLUMN sharepoint_item_id text;
    END IF;
  END IF;
END $$;

-- Add SharePoint metadata columns to lucid_pages if table exists
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lucid_pages') THEN
    -- Add sharepoint_drive_id if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'lucid_pages' AND column_name = 'sharepoint_drive_id') THEN
      ALTER TABLE public.lucid_pages ADD COLUMN sharepoint_drive_id text;
    END IF;
    
    -- Add sharepoint_item_id if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'lucid_pages' AND column_name = 'sharepoint_item_id') THEN
      ALTER TABLE public.lucid_pages ADD COLUMN sharepoint_item_id text;
    END IF;
  END IF;
END $$;

-- Enable RLS on issue_photos if not already enabled
ALTER TABLE public.issue_photos ENABLE ROW LEVEL SECURITY;
