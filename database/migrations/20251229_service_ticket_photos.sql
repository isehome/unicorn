-- Service Ticket Photos Migration
-- Creates table for storing photo metadata with SharePoint integration

-- Create service_ticket_photos table
CREATE TABLE IF NOT EXISTS public.service_ticket_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.service_tickets(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  sharepoint_drive_id TEXT,
  sharepoint_item_id TEXT,
  category TEXT NOT NULL CHECK (category IN ('before', 'during', 'after', 'documentation')),
  caption TEXT,
  taken_at TIMESTAMPTZ,
  uploaded_by UUID REFERENCES public.profiles(id),
  uploaded_by_name TEXT,
  file_name TEXT,
  file_size INTEGER,
  content_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add SharePoint folder URL to service_tickets if not exists
ALTER TABLE public.service_tickets
ADD COLUMN IF NOT EXISTS sharepoint_folder_url TEXT;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_service_ticket_photos_ticket_id
ON public.service_ticket_photos(ticket_id);

CREATE INDEX IF NOT EXISTS idx_service_ticket_photos_category
ON public.service_ticket_photos(category);

CREATE INDEX IF NOT EXISTS idx_service_ticket_photos_created_at
ON public.service_ticket_photos(created_at DESC);

-- Enable RLS
ALTER TABLE public.service_ticket_photos ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "service_ticket_photos_select" ON public.service_ticket_photos
  FOR SELECT USING (true);

CREATE POLICY "service_ticket_photos_insert" ON public.service_ticket_photos
  FOR INSERT WITH CHECK (true);

CREATE POLICY "service_ticket_photos_update" ON public.service_ticket_photos
  FOR UPDATE USING (true);

CREATE POLICY "service_ticket_photos_delete" ON public.service_ticket_photos
  FOR DELETE USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_service_ticket_photos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_service_ticket_photos_updated_at ON public.service_ticket_photos;
CREATE TRIGGER trigger_service_ticket_photos_updated_at
  BEFORE UPDATE ON public.service_ticket_photos
  FOR EACH ROW
  EXECUTE FUNCTION update_service_ticket_photos_updated_at();

-- Function to get photos for a ticket grouped by category
CREATE OR REPLACE FUNCTION get_service_ticket_photos(p_ticket_id UUID)
RETURNS TABLE (
  id UUID,
  photo_url TEXT,
  sharepoint_drive_id TEXT,
  sharepoint_item_id TEXT,
  category TEXT,
  caption TEXT,
  taken_at TIMESTAMPTZ,
  uploaded_by UUID,
  uploaded_by_name TEXT,
  file_name TEXT,
  file_size INTEGER,
  content_type TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.photo_url,
    p.sharepoint_drive_id,
    p.sharepoint_item_id,
    p.category,
    p.caption,
    p.taken_at,
    p.uploaded_by,
    p.uploaded_by_name,
    p.file_name,
    p.file_size,
    p.content_type,
    p.created_at
  FROM public.service_ticket_photos p
  WHERE p.ticket_id = p_ticket_id
  ORDER BY p.category, p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get photo count by category for a ticket
CREATE OR REPLACE FUNCTION get_service_ticket_photo_counts(p_ticket_id UUID)
RETURNS TABLE (
  category TEXT,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.category,
    COUNT(*)::BIGINT
  FROM public.service_ticket_photos p
  WHERE p.ticket_id = p_ticket_id
  GROUP BY p.category;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT ALL ON public.service_ticket_photos TO authenticated;
GRANT ALL ON public.service_ticket_photos TO service_role;
GRANT EXECUTE ON FUNCTION get_service_ticket_photos TO authenticated;
GRANT EXECUTE ON FUNCTION get_service_ticket_photo_counts TO authenticated;
