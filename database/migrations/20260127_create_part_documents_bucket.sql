-- Create storage bucket for part documents (if it doesn't exist)
-- This bucket stores documents downloaded from Manus before uploading to SharePoint

-- Insert the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'part-documents',
  'part-documents',
  false,
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'text/markdown', 'text/plain', 'application/json', 'text/html']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Create policy to allow service role to upload
CREATE POLICY IF NOT EXISTS "Service role can upload part documents"
ON storage.objects
FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'part-documents');

-- Create policy to allow service role to read
CREATE POLICY IF NOT EXISTS "Service role can read part documents"
ON storage.objects
FOR SELECT
TO service_role
USING (bucket_id = 'part-documents');

-- Create policy to allow service role to delete (for cleanup)
CREATE POLICY IF NOT EXISTS "Service role can delete part documents"
ON storage.objects
FOR DELETE
TO service_role
USING (bucket_id = 'part-documents');
