-- Migration: Add address field to contacts table
-- Date: 2025-12-01
-- Description: Adds an address field to the contacts table to store physical addresses
--              for stakeholders. This allows displaying addresses in project details
--              and opening them in map applications.

-- Add address column if it doesn't exist
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address text;

-- Add comment for documentation
COMMENT ON COLUMN contacts.address IS 'Physical address for the contact, can be opened in map applications';
