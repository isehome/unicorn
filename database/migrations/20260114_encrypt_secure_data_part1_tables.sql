-- ============================================================
-- Migration Part 1: Create Base Tables
-- Run this FIRST, then run part2
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pgsodium;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- Create project_secure_data table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.project_secure_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  equipment_id uuid,
  data_type text NOT NULL CHECK (data_type IN ('credentials', 'network', 'api_key', 'certificate', 'other')),
  name text NOT NULL,
  username text,
  password text,
  url text,
  ip_address text,
  port integer,
  additional_info jsonb,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  last_accessed timestamptz
);

-- Create contact_secure_data table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.contact_secure_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  data_type text NOT NULL DEFAULT 'other' CHECK (data_type IN ('credentials', 'network', 'api_key', 'certificate', 'other')),
  name text NOT NULL,
  username text,
  password text,
  url text,
  ip_address text,
  port integer,
  notes text,
  additional_info jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_project_secure_data_project ON public.project_secure_data(project_id);
CREATE INDEX IF NOT EXISTS idx_project_secure_data_equipment ON public.project_secure_data(equipment_id);
CREATE INDEX IF NOT EXISTS idx_contact_secure_data_contact ON public.contact_secure_data(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_secure_data_type ON public.contact_secure_data(data_type);

-- Enable RLS
ALTER TABLE public.project_secure_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_secure_data ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_secure_data' AND policyname = 'project_secure_data_select') THEN
    CREATE POLICY project_secure_data_select ON public.project_secure_data FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_secure_data' AND policyname = 'project_secure_data_insert') THEN
    CREATE POLICY project_secure_data_insert ON public.project_secure_data FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_secure_data' AND policyname = 'project_secure_data_update') THEN
    CREATE POLICY project_secure_data_update ON public.project_secure_data FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_secure_data' AND policyname = 'project_secure_data_delete') THEN
    CREATE POLICY project_secure_data_delete ON public.project_secure_data FOR DELETE TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contact_secure_data' AND policyname = 'contact_secure_data_select') THEN
    CREATE POLICY contact_secure_data_select ON public.contact_secure_data FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contact_secure_data' AND policyname = 'contact_secure_data_insert') THEN
    CREATE POLICY contact_secure_data_insert ON public.contact_secure_data FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contact_secure_data' AND policyname = 'contact_secure_data_update') THEN
    CREATE POLICY contact_secure_data_update ON public.contact_secure_data FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contact_secure_data' AND policyname = 'contact_secure_data_delete') THEN
    CREATE POLICY contact_secure_data_delete ON public.contact_secure_data FOR DELETE TO anon, authenticated USING (true);
  END IF;
END $$;

SELECT 'Part 1 complete - tables created. Now run part2.' as status;
