-- =====================================================
-- ADD IS_AUXILIARY FIELD TO WIRE_DROPS
-- =====================================================
-- Allows marking a wire drop as "auxiliary" (spare/future use)
-- Auxiliary wire drops:
--   - Don't require equipment to be linked
--   - Still require a trim photo for documentation
--   - Count as "complete" for trim percentage calculation
-- =====================================================

-- Add the is_auxiliary column
ALTER TABLE wire_drops
ADD COLUMN IF NOT EXISTS is_auxiliary BOOLEAN DEFAULT false;

-- Add comment explaining the field
COMMENT ON COLUMN wire_drops.is_auxiliary IS
  'When true, this wire drop is a spare/auxiliary run that does not require equipment. Still requires trim photo.';

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_wire_drops_is_auxiliary
ON wire_drops(is_auxiliary)
WHERE is_auxiliary = true;

-- Grant access
GRANT SELECT, UPDATE ON wire_drops TO authenticated;

SELECT 'Added is_auxiliary field to wire_drops' as status;
