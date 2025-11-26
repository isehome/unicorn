-- Create storage bucket for Lucid Chart page images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lucid-chart-cache',
  'lucid-chart-cache', 
  true, -- Public bucket for read access
  5242880, -- 5MB limit
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET 
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']::text[];

-- Create table to track cached Lucid Chart images
CREATE TABLE IF NOT EXISTS lucid_chart_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id TEXT NOT NULL,
  page_index INTEGER NOT NULL,
  page_title TEXT,
  page_id TEXT,
  storage_path TEXT NOT NULL, -- Path in storage bucket
  image_url TEXT, -- Public URL for the cached image
  last_fetched TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'), -- Cache for 7 days
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_id, page_index)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_lucid_chart_cache_document 
ON lucid_chart_cache(document_id);

CREATE INDEX IF NOT EXISTS idx_lucid_chart_cache_expires 
ON lucid_chart_cache(expires_at);

-- Create RLS policies
ALTER TABLE lucid_chart_cache ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "lucid_chart_cache_read" ON lucid_chart_cache;
CREATE POLICY "lucid_chart_cache_read" ON lucid_chart_cache
FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "lucid_chart_cache_insert" ON lucid_chart_cache;
CREATE POLICY "lucid_chart_cache_insert" ON lucid_chart_cache
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "lucid_chart_cache_update" ON lucid_chart_cache;
CREATE POLICY "lucid_chart_cache_update" ON lucid_chart_cache
FOR UPDATE USING (auth.role() = 'authenticated');

-- Storage policies for the bucket
DROP POLICY IF EXISTS "lucid_chart_cache_storage_read" ON storage.objects;
CREATE POLICY "lucid_chart_cache_storage_read" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'lucid-chart-cache');

DROP POLICY IF EXISTS "lucid_chart_cache_storage_insert" ON storage.objects;
CREATE POLICY "lucid_chart_cache_storage_insert" 
ON storage.objects FOR INSERT 
WITH CHECK (
  bucket_id = 'lucid-chart-cache' 
  AND auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "lucid_chart_cache_storage_update" ON storage.objects;
CREATE POLICY "lucid_chart_cache_storage_update" 
ON storage.objects FOR UPDATE 
USING (
  bucket_id = 'lucid-chart-cache' 
  AND auth.role() = 'authenticated'
);

-- Function to clean up expired cache entries
CREATE OR REPLACE FUNCTION clean_expired_lucid_cache()
RETURNS void AS $$
BEGIN
  -- Delete expired cache entries and their storage files
  DELETE FROM lucid_chart_cache 
  WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists and recreate it
DROP TRIGGER IF EXISTS update_lucid_chart_cache_updated_at ON lucid_chart_cache;
CREATE TRIGGER update_lucid_chart_cache_updated_at 
BEFORE UPDATE ON lucid_chart_cache
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
