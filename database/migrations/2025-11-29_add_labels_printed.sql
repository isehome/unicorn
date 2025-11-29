-- Migration: Add labels_printed tracking to wire_drops
-- Date: 2025-11-29
-- Purpose: Track which wire drops have had their QR labels printed for prewire mode

ALTER TABLE wire_drops ADD COLUMN IF NOT EXISTS labels_printed BOOLEAN DEFAULT false;
ALTER TABLE wire_drops ADD COLUMN IF NOT EXISTS labels_printed_at TIMESTAMPTZ;
ALTER TABLE wire_drops ADD COLUMN IF NOT EXISTS labels_printed_by TEXT;

-- Add index for sorting (unprinted first within rooms)
CREATE INDEX IF NOT EXISTS idx_wire_drops_labels_printed ON wire_drops(room_name, labels_printed);
