-- Add separate field for UPS battery backup outlets
-- Differentiates between surge-only outlets and battery backup outlets

ALTER TABLE global_parts
ADD COLUMN IF NOT EXISTS ups_outlets_provided INTEGER DEFAULT 0;

COMMENT ON COLUMN global_parts.ups_outlets_provided IS 'Number of outlets with battery backup (UPS). power_outlets_provided is for surge-only outlets.';
