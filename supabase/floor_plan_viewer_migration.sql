-- Floor Plan Viewer Migration
-- Phase 1: Database Schema Updates

-- 1. Update projects table - add Lucid document association
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS lucid_document_id TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS lucid_document_url TEXT;
CREATE INDEX IF NOT EXISTS idx_projects_lucid_doc ON public.projects(lucid_document_id);

-- 2. Create lucid_pages table - cache floor plan metadata and images
CREATE TABLE IF NOT EXISTS public.lucid_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL,
  page_title TEXT,
  page_index INTEGER,
  image_url TEXT, -- Supabase Storage URL
  image_width INTEGER,
  image_height INTEGER,
  bounding_box JSONB, -- {x, y, width, height} of content area
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, page_id)
);

CREATE INDEX IF NOT EXISTS idx_lucid_pages_project ON public.lucid_pages(project_id);

-- Enable RLS on lucid_pages
ALTER TABLE public.lucid_pages ENABLE ROW LEVEL SECURITY;

-- Create policies for lucid_pages
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lucid_pages' AND policyname='dev_read_all'
  ) THEN
    CREATE POLICY dev_read_all ON public.lucid_pages
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lucid_pages' AND policyname='dev_insert_all'
  ) THEN
    CREATE POLICY dev_insert_all ON public.lucid_pages
      FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lucid_pages' AND policyname='dev_update_all'
  ) THEN
    CREATE POLICY dev_update_all ON public.lucid_pages
      FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lucid_pages' AND policyname='dev_delete_all'
  ) THEN
    CREATE POLICY dev_delete_all ON public.lucid_pages
      FOR DELETE TO anon, authenticated USING (true);
  END IF;
END $$;

-- 3. Update wire_drops table - add shape association
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS lucid_shape_id TEXT;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS lucid_page_id TEXT;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS shape_x NUMERIC;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS shape_y NUMERIC;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS shape_width NUMERIC;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS shape_height NUMERIC;

CREATE INDEX IF NOT EXISTS idx_wire_drops_shape ON public.wire_drops(lucid_shape_id);
CREATE INDEX IF NOT EXISTS idx_wire_drops_page ON public.wire_drops(lucid_page_id);

-- Add helpful comment
COMMENT ON TABLE public.lucid_pages IS 'Cached floor plan pages from Lucid documents with image URLs and metadata';
COMMENT ON COLUMN public.projects.lucid_document_id IS 'Lucid document ID for this project''s floor plans';
COMMENT ON COLUMN public.wire_drops.lucid_shape_id IS 'Lucid shape ID that represents this wire drop on the floor plan';
