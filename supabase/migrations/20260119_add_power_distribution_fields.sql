-- Add power distribution fields to global_parts
-- For devices that PROVIDE power (UPS, PDU, surge protectors, power strips)

-- Flag to mark device as a power distribution unit
ALTER TABLE global_parts
ADD COLUMN IF NOT EXISTS is_power_device BOOLEAN DEFAULT FALSE;

-- Number of outlets the device PROVIDES (female outlets for other devices)
ALTER TABLE global_parts
ADD COLUMN IF NOT EXISTS power_outlets_provided INTEGER DEFAULT 0;

-- Maximum power OUTPUT capacity in watts (what the device can deliver)
ALTER TABLE global_parts
ADD COLUMN IF NOT EXISTS power_output_watts INTEGER;

-- Battery backup capacity in VA (for UPS devices)
ALTER TABLE global_parts
ADD COLUMN IF NOT EXISTS ups_va_rating INTEGER;

-- Battery runtime in minutes at typical load (for UPS devices)
ALTER TABLE global_parts
ADD COLUMN IF NOT EXISTS ups_runtime_minutes INTEGER;

-- Comments for clarity
COMMENT ON COLUMN global_parts.is_power_device IS 'True if this is a power distribution device (UPS, PDU, surge protector, power strip)';
COMMENT ON COLUMN global_parts.power_outlets_provided IS 'Number of power outlets this device provides to other equipment';
COMMENT ON COLUMN global_parts.power_output_watts IS 'Maximum power output capacity in watts';
COMMENT ON COLUMN global_parts.ups_va_rating IS 'VA rating for UPS devices';
COMMENT ON COLUMN global_parts.ups_runtime_minutes IS 'Estimated battery runtime in minutes at typical load';

-- Rename existing field for clarity (power_outlets -> power_outlets_required)
-- Note: We keep the old column name for backward compatibility but add a comment
COMMENT ON COLUMN global_parts.power_outlets IS 'Number of power outlets this device REQUIRES (consumes). See power_outlets_provided for outlets it provides.';
