-- Cleanup script: Delete contacts where addresses were imported as names
-- Run this in Supabase SQL Editor to remove the bad imports
--
-- WARNING: Review the SELECT first before running DELETE!

-- First, preview what will be deleted:
SELECT id, name, full_name, email, phone, company, address, created_at
FROM contacts
WHERE
  -- Names that look like addresses (contain common address patterns)
  (
    name ~ '^\d+\s' -- Starts with numbers (like "100 S. Main")
    OR name ~ '\d{5}' -- Contains 5-digit zip code
    OR name ~* '\s(st|street|ave|avenue|dr|drive|rd|road|ln|lane|blvd|ct|court|way|pl|place)[\s,\.]'
    OR name ~* '\s(fl|in|ca|tx|ny|oh|pa|il|ga|nc|mi|nj|va|wa|az|ma|tn|mo|md|wi|mn|co|al|sc|la|ky|or|ok|ct|ia|ms|ar|ks|ut|nv|nm|ne|wv|id|hi|me|nh|ri|mt|de|sd|nd|ak|vt|wy|dc)\s*$' -- Ends with state abbreviation
    OR name ~* 'united states'
    OR name ~* ',\s*(fl|in|ca|tx|ny|oh)\s*\d' -- Has state abbrev followed by zip
  )
  -- And doesn't have a valid email (real contacts usually have email)
  AND (email IS NULL OR email = '')
  -- And was created recently (adjust date as needed)
  AND created_at > NOW() - INTERVAL '1 day'
ORDER BY created_at DESC;

-- If the preview looks correct, uncomment and run the DELETE:
/*
DELETE FROM contacts
WHERE
  (
    name ~ '^\d+\s'
    OR name ~ '\d{5}'
    OR name ~* '\s(st|street|ave|avenue|dr|drive|rd|road|ln|lane|blvd|ct|court|way|pl|place)[\s,\.]'
    OR name ~* '\s(fl|in|ca|tx|ny|oh|pa|il|ga|nc|mi|nj|va|wa|az|ma|tn|mo|md|wi|mn|co|al|sc|la|ky|or|ok|ct|ia|ms|ar|ks|ut|nv|nm|ne|wv|id|hi|me|nh|ri|mt|de|sd|nd|ak|vt|wy|dc)\s*$'
    OR name ~* 'united states'
    OR name ~* ',\s*(fl|in|ca|tx|ny|oh)\s*\d'
  )
  AND (email IS NULL OR email = '')
  AND created_at > NOW() - INTERVAL '1 day';
*/

-- Alternative: Delete ALL contacts created in the last hour (if you just did the bad import)
-- SELECT * FROM contacts WHERE created_at > NOW() - INTERVAL '1 hour';
-- DELETE FROM contacts WHERE created_at > NOW() - INTERVAL '1 hour';
