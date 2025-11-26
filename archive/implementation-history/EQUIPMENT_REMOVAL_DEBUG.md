# Equipment Removal Debug Guide

## Issue
The Remove button is not successfully removing equipment links from wire drops.

## Debug Steps

### 1. Open Browser Console
Press F12 or right-click → Inspect → Console tab

### 2. Click the Remove Button
When you click Remove, you should see these console logs:

```
[Equipment] Remove button clicked
[Equipment] Current room equipment selection: ["equipment-id-here"]
[Equipment] Primary room equipment ID: equipment-id-here
[Equipment] Starting equipment removal for wire drop: wire-drop-id-here
[Equipment] Calling updateEquipmentLinks with empty array
[Equipment] Update result: {success: true, ...}
[Equipment] Reloading wire drop data after delay
[Equipment] Equipment unlinked successfully
[Equipment] New room equipment selection: []
```

### 3. Check for Errors
Look for any red error messages in the console, especially:
- Network errors (404, 500, etc.)
- Permission errors
- Database constraint errors

### 4. Check Network Tab
1. Go to Network tab in Developer Tools
2. Click the Remove button
3. Look for the API call to update equipment links
4. Check the request payload - should be `[]` (empty array)
5. Check the response - should be success

## Common Issues & Solutions

### Issue: Equipment reappears after removal
**Possible Causes:**
1. Database update isn't actually happening
2. The loadWireDrop() is fetching old cached data
3. There's a database trigger preventing deletion

**Solution:**
Check the Supabase logs for any RLS policy violations or trigger errors.

### Issue: Network request fails
**Possible Causes:**
1. Authentication expired
2. Incorrect permissions
3. API endpoint issue

**Solution:**
1. Try logging out and back in
2. Check user permissions in Supabase
3. Verify the wireDropService.updateEquipmentLinks method

## Manual Database Check

Run this in Supabase SQL editor to check equipment links:

```sql
-- Check current equipment links for a wire drop
SELECT 
    wdel.*,
    pe.name as equipment_name
FROM wire_drop_equipment_links wdel
LEFT JOIN project_equipment pe ON pe.id = wdel.equipment_id
WHERE wdel.wire_drop_id = 'YOUR-WIRE-DROP-ID-HERE'
ORDER BY wdel.created_at DESC;
```

## Temporary Workaround

If the UI isn't working, you can manually remove the link in Supabase:

```sql
-- Remove all equipment links for a specific wire drop
DELETE FROM wire_drop_equipment_links 
WHERE wire_drop_id = 'YOUR-WIRE-DROP-ID-HERE' 
AND link_side = 'room_end';
```

## Report Back

Please share:
1. All console logs when clicking Remove
2. Network request details (request and response)
3. Any error messages
4. Results from the manual database check

This will help identify whether the issue is:
- Frontend (state management)
- API (service method)
- Backend (database/RLS policies)
