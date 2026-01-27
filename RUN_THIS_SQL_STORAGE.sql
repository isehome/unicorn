-- =====================================================
-- RUN THIS SQL IN SUPABASE SQL EDITOR
-- Creates the storage bucket for part documents
-- =====================================================

-- Create storage bucket for part documents (if it doesn't exist)
-- This bucket stores documents downloaded from Manus before uploading to SharePoint

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'part-documents',
  'part-documents',
  false,
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'text/markdown', 'text/plain', 'application/json', 'text/html']::text[]
)
ON CONFLICT (id) DO NOTHING;
