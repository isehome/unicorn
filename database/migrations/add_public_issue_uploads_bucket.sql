-- Create storage bucket for public issue uploads from external stakeholders
-- Run this in Supabase SQL Editor

-- Create the bucket (private by default)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'public-issue-uploads',
  'public-issue-uploads',
  false,
  8388608,  -- 8MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain', 'text/csv']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies for the bucket
-- Allow service role to do everything (used by serverless API)
CREATE POLICY "Service role full access to public-issue-uploads"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'public-issue-uploads')
WITH CHECK (bucket_id = 'public-issue-uploads');

-- Allow authenticated users to read files (for internal staff reviewing uploads)
CREATE POLICY "Authenticated users can read public-issue-uploads"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'public-issue-uploads');

-- Allow authenticated users to delete files (for approving/rejecting uploads)
CREATE POLICY "Authenticated users can delete public-issue-uploads"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'public-issue-uploads');

-- Allow anon role to read files (client app uses anon key since MSAL users don't have Supabase sessions)
DROP POLICY IF EXISTS "Anon users can read public-issue-uploads" ON storage.objects;
CREATE POLICY "Anon users can read public-issue-uploads"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'public-issue-uploads');

-- Allow anon role to delete files (for cleanup after approval/rejection)
DROP POLICY IF EXISTS "Anon users can delete public-issue-uploads" ON storage.objects;
CREATE POLICY "Anon users can delete public-issue-uploads"
ON storage.objects
FOR DELETE
TO anon
USING (bucket_id = 'public-issue-uploads');
