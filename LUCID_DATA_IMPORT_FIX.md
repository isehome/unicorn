# Lucid Wire Drop Data Import Fix

## Problem Statement
Lucid shape custom properties were not being properly captured during wire drop import. The system was only storing partial data and not capturing important fields like shape color, drop type, wire type, and install notes from the Lucid diagram.

## Solution Implemented

### 1. Database Schema Updates
**File:** `supabase/lucid_wire_drop_fields_migration.sql`

Added the following columns to `wire_drops` table to store all Lucid custom properties:

**Lucid Data Fields:**
- `drop_name` - Drop identifier from Lucid (e.g., "Living Room TV")
- `drop_type` - Type of drop (e.g., "Keypad", "TV", "Camera")
- `wire_type` - Cable type (e.g., "18/4", "CAT6", "Fiber")
- `install_note` - Installation notes from Lucid
- `device` - Device type from Lucid

**Shape Visual Properties:**
- `shape_color` - Primary color of shape (hex format)
- `shape_fill_color` - Fill color of shape (hex format)
- `shape_line_color` - Line color of shape (hex format)

**Metadata:**
- `shape_data` - JSONB column storing complete shape data for reference
- `lucid_synced_at` - Timestamp of last Lucid sync
- `updated_at` - Auto-updated timestamp

### 2. Lucid API Enhancement
**File:** `src/services/lucidApi.js`

Updated the `extractShapes()` function to capture shape color information:
```javascript
// Extract color information from shape style or properties
const style = shape.style || {};
const properties = shape.properties || {};
const fillColor = style.fillColor || style.fill || properties.fillColor || properties.fill || null;
const lineColor = style.lineColor || style.stroke || properties.lineColor || properties.stroke || null;
const shapeColor = fillColor || lineColor || null;
```

Now each extracted shape includes:
- `fillColor` - Fill color from shape
- `lineColor` - Line/stroke color from shape
- `shapeColor` - Primary color (prioritizes fill, falls back to line)

### 3. Wire Drop Creation Logic Update
**File:** `src/components/PMProjectViewEnhanced.js`

Updated `handleCreateWireDropsFromSelected()` to properly extract and map ALL Lucid custom properties:

**Before:**
- Only captured: drop name, room name, wire type, location
- Stored partial data in notes field as JSON string

**After:**
- Captures ALL custom properties from Lucid:
  - Drop Name (from "Drop Name" custom field)
  - Room Name (from "Room Name" custom field)
  - Drop Type (from "Drop Type" custom field)
  - Wire Type (from "Wire Type" custom field)
  - Install Note (from "Install Note" custom field)
  - Device (from "Device" custom field)
  - Shape Color (from shape visual properties)

- Stores complete shape data in `shape_data` JSONB column
- Stores individual fields in dedicated columns for easy querying
- Sets `lucid_synced_at` timestamp for tracking

## Field Mapping Reference

Based on your Lucid custom properties screenshot:

| Lucid Custom Property | Database Column | Example Value |
|----------------------|----------------|---------------|
| Drop Name | `drop_name` | "Living Room TV" |
| Room Name | `room_name` | "Living Room" |
| Wire Type | `wire_type` | "18/4" |
| IS Drop | (filter only) | "true" |
| Install Note | `install_note` | "Mount at 42 inches" |
| Drop Type | `drop_type` | "Keypad" |
| Shape Color | `shape_color` | "#FF5733" |

## Next Steps

### 1. Apply Database Migration
Run this SQL in your Supabase SQL Editor:
```bash
# Navigate to Supabase Dashboard → SQL Editor
# Open and run: supabase/lucid_wire_drop_fields_migration.sql
```

### 2. Test Lucid Import
1. Go to PM Project View for a project with Lucid diagram
2. Click "Fetch Shape Data" button
3. Select shapes with "IS Drop = true"
4. Click "Create Wire Drops"
5. Verify in database that new columns are populated

### 3. Verify Data Capture
Check that wire drops now have:
- ✅ `drop_name` populated
- ✅ `drop_type` populated
- ✅ `wire_type` populated
- ✅ `install_note` populated (if set in Lucid)
- ✅ `device` populated (if set in Lucid)
- ✅ `shape_color` populated (hex color code)
- ✅ `shape_data` populated with complete JSON
- ✅ `lucid_synced_at` timestamp set

### 4. Display Lucid Data in Green (Next Phase)
The next step will be updating `WireDropDetailEnhanced.js` to:
- Display Lucid-sourced fields in green color
- Show them as read-only "Source of Truth" data
- Distinguish between Lucid data and user-entered data

## Benefits

1. **Complete Data Capture** - No Lucid information is lost during import
2. **Shape Color Preservation** - Visual indicators from Lucid are maintained
3. **Proper Field Storage** - Each property has its own column for easy querying
4. **Audit Trail** - `lucid_synced_at` tracks when data was last synced
5. **Backward Compatible** - Old wire drops still work, new ones have enhanced data

## Color Display Strategy (To Be Implemented)

In WireDropDetailEnhanced.js, Lucid-sourced fields should be displayed:
```
Drop Name: [value in green]     ← From Lucid
Room Name: [value in green]     ← From Lucid  
Drop Type: [value in green]     ← From Lucid
Wire Type: [value in green]     ← From Lucid
Install Note: [value in green]  ← From Lucid

Location: [value in normal color]  ← User-entered/editable
Notes: [value in normal color]     ← User-entered/editable
```

This visual distinction helps users understand which data comes from the authoritative Lucid diagram versus what has been manually added or edited.
