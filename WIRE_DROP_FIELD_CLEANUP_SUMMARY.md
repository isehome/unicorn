# Wire Drop Field Cleanup Summary
Date: 2025-10-20

## Overview
Completed comprehensive audit and cleanup of wire drop database fields based on user notes to eliminate duplicates and consolidate data structure.

## Files Created/Modified

### 1. **WIRE_DROP_FIELDS_AUDIT.csv** (Created)
- Complete field-by-field analysis of all 35 wire drop database columns
- Identified critical duplicates and deprecated fields
- User provided notes on what to keep/delete

### 2. **supabase/wire_drop_field_cleanup_migration.sql** (Created)
Migration script that:
- **Preserves existing data** before removing columns
- **Removes 4 duplicate fields**: `name`, `type`, `location`, `device`
- **Tags 4 legacy fields** for future removal: `prewire_photo`, `installed_photo`, `room_end_equipment`, `head_end_equipment`
- **Documents metadata fields** needed for future features

### 3. **src/services/wireDropService.js** (Modified)
- Removed references to deleted fields: `name`, `type`, `location`, `device`, `room_end_equipment`, `head_end_equipment`
- Updated `createWireDrop` to use consolidated fields only
- Added `qr_code_url` field (core feature to implement)

### 4. **src/components/WireDropDetailEnhanced.js** (Modified)
- Updated edit form to use correct consolidated fields
- Removed references to duplicate fields

## Fields Removed (Data Preserved via Migration)

| Field | Reason | Data Migration |
|-------|---------|----------------|
| `name` | Duplicate of `drop_name` | Copied to `drop_name` where empty |
| `type` | Duplicate of `wire_type` | Merged into `wire_type` |
| `location` | Duplicate of `room_name` | Merged into `notes` where different from room_name |
| `device` | Overlaps with `drop_type` | Removed (minimal usage) |

## Fields Tagged as Deprecated (Not Yet Removed)

| Field | Reason | Status |
|-------|---------|--------|
| `prewire_photo` | Replaced by wire_drop_stages | Tagged for review |
| `installed_photo` | Replaced by wire_drop_stages | Tagged for review |
| `room_end_equipment` | Replaced by wire_drop_equipment_links | Tagged for review |
| `head_end_equipment` | Replaced by wire_drop_equipment_links | Tagged for review |

## Core Fields Retained

### System Fields (Locked)
- `id`, `project_id`, `uid`, `created_at`, `updated_at`
- `lucid_shape_id`, `lucid_page_id`, `lucid_synced_at`

### Data Fields (Editable)
- `drop_name` - Primary identifier (auto-generated on import as "room + drop type + increment")
- `room_name` - Primary room field
- `wire_type` - Consolidated wire type field (was `type` + `wire_type`)
- `drop_type` - Type of drop (TV, Keypad, Camera, etc.)
- `install_note` - Installation notes from Lucid
- `notes` - Manual notes field
- `floor` - Floor identifier
- `qr_code_url` - QR code for scanning (core feature to implement)
- `schematic_reference` - Reference to schematics

### Metadata Fields (For Future Features)
**Shape Position** (needed for "show on map" feature):
- `shape_x`, `shape_y`, `shape_width`, `shape_height`

**Shape Colors** (for visual continuity with Lucid):
- `shape_color`, `shape_fill_color`, `shape_line_color`

**Raw Data Backup**:
- `shape_data` (JSONB) - Complete Lucid shape data for offline access

## Next Steps

### 1. Run Database Migration
Execute `supabase/wire_drop_field_cleanup_migration.sql` in Supabase SQL Editor to:
- ✅ Preserve existing data
- ✅ Remove duplicate columns
- ✅ Add documentation comments

### 2. UI Improvements Needed

#### A. Wire Drop Detail Page Enhancements
Based on user notes from CSV:

**Drop Name Auto-Generation Logic:**
- When importing from Lucid, auto-generate drop_name as: `{room_name} {drop_type} {increment}`
- Example: "Living Room Speaker 1", "Living Room Speaker 2"
- Make editable by technicians after generation

**Color Continuity:**
- Use `shape_color` and `shape_fill_color` to style wire drop icons/headers
- Add colored indicator/badge on wire drop list items matching Lucid shape colors
- Apply colors to wire drop detail header for visual continuity

**Metadata Section UI:**
- Create collapsible "Metadata" section in light blue styling
- Minimize by default (user can expand when needed)
- Include shape position, colors, and other Lucid metadata
- Add "Show on Wire Map" button (future feature) using shape position data

**QR Code Feature:**
- Add QR code generation/display for each wire drop
- Core feature: scanning QR code label on physical wire opens wire drop detail page
- Add QR code print/download functionality

#### B. Edit Form Improvements
Current edit form fields to update:
- ✅ Remove: `name`, `type`, `location`, `device`
- ✅ Add: `wire_type`, `drop_type`, `install_note`, `floor`, `qr_code_url`
- Need to style form with proper field grouping

#### C. List View Improvements
- Add color-coded badges/icons matching shape colors
- Display consolidated fields only
- Show drop_name prominently (not legacy `name` field)

### 3. Lucid Import Logic Updates
Update import process to:
- Auto-generate drop_name from room_name + drop_type + increment
- Map to consolidated wire_type field (not type)
- Preserve shape colors for UI styling
- Store complete shape_data in JSONB field

### 4. Future Feature: "Show on Wire Map"
- Use shape position metadata (x, y, width, height)
- Highlight corresponding shape on Lucid diagram
- Navigate from wire drop detail to exact location on floor plan

## Key Decisions Made

1. **Consolidated wire_type**: Single field instead of `type` and `wire_type`
2. **drop_name over name**: Use Lucid field consistently
3. **Preserve metadata**: Keep shape position/colors for future features
4. **Tag legacy fields**: Don't remove yet, tag for future review
5. **QR codes are priority**: Core feature for technician workflow

## Testing Checklist

After running migration:
- [ ] Verify all existing wire drops retained data
- [ ] Test wire drop creation with new field structure
- [ ] Test wire drop editing with consolidated fields
- [ ] Verify Lucid import maps to correct fields
- [ ] Test UI displays consolidated fields correctly
- [ ] Verify no references to removed fields in codebase

## Benefits of Cleanup

1. **Eliminated confusion**: No more duplicate wire type fields
2. **Clearer data structure**: Each field has single, clear purpose  
3. **Better Lucid integration**: Consistent field mapping
4. **Future-proof**: Metadata preserved for upcoming features
5. **Simplified maintenance**: Fewer fields to manage
