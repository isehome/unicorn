# Wire Drop Equipment System - Complete Implementation Guide

## Overview
This document provides complete instructions for implementing three integrated features:
1. **Automatic Room Reassignment** - Equipment rooms auto-update to match wire drop locations
2. **UniFi Client Integration** - Link equipment to network devices with MAC address matching
3. **HomeKit QR Storage** - Upload and store HomeKit setup QR codes for equipment

---

## STEP 1: Database Migration

### Run the SQL Migration
1. Open your Supabase Dashboard
2. Navigate to SQL Editor
3. Copy and execute the migration from: `database-backup/wire_drop_equipment_features_migration.sql`

**What this does:**
- Adds `homekit_qr_photo`, `homekit_setup_code`, and `unifi_synced_at` columns to `project_equipment`
- Creates performance indexes for room and MAC address lookups
- Creates `update_equipment_rooms()` RPC function for batch room updates

---

## STEP 2: Create Supabase Storage Bucket

### Setup Equipment Photos Storage
1. Go to **Supabase Dashboard** → **Storage**
2. Click **"New bucket"**
3. Configure the bucket:
   - **Name:** `equipment-photos`
   - **Public bucket:** ✅ YES (check this box)
   - **File size limit:** 5MB
   - **Allowed MIME types:** `image/jpeg, image/png, image/gif, image/webp`
4. Click **"Create bucket"**

### Set Bucket Policies (if needed)
If you need custom policies, add these in Storage → Policies:

```sql
-- Allow authenticated users to upload
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'equipment-photos');

-- Allow public read access
CREATE POLICY "Allow public read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'equipment-photos');
```

---

## STEP 3: Verify Component Files

All component files have been created in `src/components/`:

✅ **RoomChangeConfirmation.jsx** - Modal for confirming room changes  
✅ **HomeKitQRUpload.jsx** - QR code photo upload component  
✅ **UniFiClientSelectorEnhanced.jsx** - Enhanced UniFi client selector  
✅ **WireDropEquipmentSection.jsx** - Main integration component  

---

## STEP 4: Integration Options

You have two options for integrating these features:

### Option A: Use the New WireDropEquipmentSection Component (Recommended)

This is a standalone section you can add to any wire drop detail page:

```jsx
import WireDropEquipmentSection from './components/WireDropEquipmentSection';

// In your wire drop detail component:
<WireDropEquipmentSection
  wireDrop={currentWireDrop}
  projectEquipment={projectEquipmentList}
  onSave={handleWireDropSave}
/>
```

**Props:**
- `wireDrop` - Current wire drop object with room info
- `projectEquipment` - Array of all equipment in the project
- `onSave` - Callback function when equipment is saved

### Option B: Use Individual Components

For more granular control, use the components separately:

```jsx
import RoomChangeConfirmation from './components/RoomChangeConfirmation';
import UniFiClientSelectorEnhanced from './components/UniFiClientSelectorEnhanced';
import HomeKitQRUpload from './components/HomeKitQRUpload';

// UniFi Integration
<UniFiClientSelectorEnhanced 
  equipment={selectedEquipment}
  onClientLinked={handleUniFiLink}
/>

// HomeKit QR Upload
<HomeKitQRUpload
  equipment={selectedEquipment}
  onUpload={handleHomeKitUpload}
/>

// Room Change Confirmation Modal
<RoomChangeConfirmation
  changes={pendingChanges}
  onConfirm={handleConfirm}
  onCancel={handleCancel}
/>
```

---

## STEP 5: Verify UniFi Proxy Function

Make sure your `api/unifi-proxy.js` edge function supports the `getClients` action:

```javascript
// In api/unifi-proxy.js
export default async function handler(req, res) {
  const { action, site = 'default' } = req.body;
  
  if (action === 'getClients') {
    // Fetch clients from UniFi controller
    const clients = await fetchUniFiClients(site);
    return res.json({ clients });
  }
  
  // ... other actions
}
```

If you need to update this function, refer to `UNIFI_INTEGRATION_GUIDE.md`.

---

## STEP 6: Testing Checklist

### 1. Test Room Reassignment

**Steps:**
1. Navigate to a wire drop in a specific room (e.g., "Living Room")
2. Use the equipment selector to choose equipment from a different room (e.g., "Bedroom")
3. Click "Save Equipment Assignment"
4. **Expected:** Modal appears showing the room change: "Bedroom → Living Room"
5. Click "Confirm Changes"
6. **Expected:** Equipment's room updates successfully
7. Verify in database that `project_equipment.room` and `project_equipment.room_name` updated

**Alternative Test:**
- Click "Keep Original Rooms" in the modal
- **Expected:** Wire drop saves but equipment room stays unchanged

### 2. Test UniFi Integration

**Steps:**
1. Select equipment for a wire drop
2. Scroll to "UniFi Network Connection" section
3. Click "Refresh Data" button
4. **Expected:** 
   - Button shows spinning animation while loading
   - "Updated" checkmark appears after success
   - Client dropdown populates with devices
5. If equipment has a MAC address, **Expected:** Auto-matches and selects client
6. Manually select a different client from dropdown
7. **Expected:** 
   - Connected device info displays (hostname, IP, MAC, switch, port)
   - Database updates with client information

**Verify in Database:**
```sql
SELECT 
  name,
  mac_address,
  ip_address,
  switch_mac,
  switch_port,
  network_info,
  unifi_synced_at
FROM project_equipment
WHERE id = '<equipment-id>';
```

### 3. Test HomeKit QR Upload

**Steps:**
1. Select equipment for a wire drop
2. Scroll to "HomeKit QR Code" section
3. Click "Add QR Code"
4. **Option A:** Click "Choose File" and select an image
5. **Option B:** Click "Take Photo" (on mobile devices)
6. **Expected:** 
   - Image preview appears
   - Photo uploads to Supabase Storage
   - Remove button (X) appears in corner
7. Add setup code in format: "1234-5678"
8. Click checkmark to save
9. **Expected:** Setup code saves to database

**Test Replace/Remove:**
- Click "Replace QR Code" to upload a new image
- Click the X button to remove the photo
- **Expected:** Confirmation dialog, then photo removes from display and database

**Verify in Supabase Storage:**
- Go to Storage → equipment-photos → homekit-qr → [project-id]
- Verify uploaded images are present

**Verify in Database:**
```sql
SELECT 
  name,
  homekit_qr_photo,
  homekit_setup_code
FROM project_equipment
WHERE id = '<equipment-id>';
```

### 4. Test Dark Mode Compatibility

**Steps:**
1. Enable dark mode in your app
2. Navigate to wire drop with equipment selected
3. **Expected:** All three feature components display correctly with:
   - Proper contrast for text
   - Dark-themed backgrounds
   - Visible borders and buttons

---

## STEP 7: Data Flow Architecture

### Room Reassignment Flow
```
User selects equipment → Detects room mismatch → Shows warning → 
User saves → Modal confirms changes → Updates equipment.room → 
Updates wire_drop.room_equipment_id → Success!
```

### UniFi Integration Flow
```
User clicks Refresh → Fetches clients from UniFi API → 
Auto-matches by MAC (if present) → User selects client → 
Updates project_equipment with network data → Syncs timestamp
```

### HomeKit QR Flow
```
User uploads image → Compresses (if needed) → 
Uploads to Supabase Storage → Gets public URL → 
Updates project_equipment.homekit_qr_photo → Optional: Add setup code
```

---

## Database Schema Reference

### New Columns in `project_equipment`

| Column | Type | Description |
|--------|------|-------------|
| `homekit_qr_photo` | TEXT | Public URL to QR code image in Supabase Storage |
| `homekit_setup_code` | TEXT | 8-digit HomeKit pairing code (XXXX-XXXX format) |
| `unifi_synced_at` | TIMESTAMPTZ | Last sync timestamp for UniFi client data |
| `mac_address` | TEXT | (Existing) Used for auto-matching UniFi clients |
| `ip_address` | TEXT | (Existing) Updated from UniFi client data |
| `switch_mac` | TEXT | (Existing) UniFi switch MAC address |
| `switch_port` | INTEGER | (Existing) Port number on switch |
| `network_info` | JSONB | (Existing) Additional UniFi client metadata |

---

## Troubleshooting

### Issue: Storage bucket upload fails
**Solution:** 
- Verify bucket is set to PUBLIC
- Check file size is under 5MB
- Verify allowed MIME types include image formats

### Issue: UniFi clients not loading
**Solution:**
- Check `unifi-proxy.js` edge function is deployed
- Verify project has `unifi_url` and `unifi_network_api_key` configured
- Check browser console for API errors
- Verify UniFi controller is accessible

### Issue: Room changes not saving
**Solution:**
- Run the database migration to create `update_equipment_rooms()` function
- Check user has `authenticated` role in Supabase
- Verify RLS policies allow updates to `project_equipment`

### Issue: Components not styling correctly in dark mode
**Solution:**
- All components use `dark:` Tailwind classes
- Ensure your app's theme context is working
- Check that Tailwind's dark mode is configured in `tailwind.config.js`

---

## Next Steps

### Additional Enhancements You Could Add:

1. **Batch Operations**
   - Select multiple equipment items at once
   - Bulk room reassignment

2. **QR Code Scanning**
   - Use device camera to scan HomeKit QR codes
   - Auto-extract setup code from QR data

3. **UniFi Monitoring**
   - Real-time device online/offline status
   - Network performance metrics
   - Auto-update commission stage when device comes online

4. **Equipment Templates**
   - Save common equipment configurations
   - Quick-apply to new wire drops

5. **Export/Reporting**
   - Generate equipment inventory reports
   - Export wire drop assignments to CSV
   - Print equipment labels with QR codes

---

## Support & References

- **Database Migration:** `database-backup/wire_drop_equipment_features_migration.sql`
- **UniFi Integration:** See existing `UNIFI_INTEGRATION_GUIDE.md`
- **Supabase Storage Docs:** https://supabase.com/docs/guides/storage
- **Component Files:** `src/components/` directory

---

## Summary

This implementation provides three powerful features that work seamlessly together:

✅ **Automatic Room Reassignment** - Keeps equipment locations in sync with wire drops  
✅ **UniFi Client Integration** - Tracks network connectivity with MAC address matching  
✅ **HomeKit QR Storage** - Stores setup codes for easy reference during installation  

All features include:
- Dark mode support
- Mobile-responsive design
- Error handling and user feedback
- Database persistence
- Optimized performance with indexes

**Total Implementation Time:** ~30 minutes  
**Total Files Created:** 4 React components + 1 SQL migration  
**Breaking Changes:** None - fully backward compatible  

---

*Last Updated: November 15, 2025*
