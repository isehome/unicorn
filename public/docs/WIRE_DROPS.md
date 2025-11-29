# Wire Drop System & Equipment Management Architecture Analysis

## Executive Summary

This document provides a comprehensive analysis of the current wire drop system and equipment management implementation in the Unicorn project. It identifies existing architecture, database schemas, and highlights gaps for meeting new requirements around project-specific equipment fields (MAC addresses, QR codes, etc.).

---

## 1. Current Wire Drop System Architecture

### 1.1 Core Wire Drop Structure

**File**: `/src/components/WireDropsList.js`, `/src/services/wireDropService.js`

**Wire Drop Table Schema**:
- `id` - Primary key (UUID)
- `project_id` - Foreign key to projects
- `uid` - Human-readable identifier (format: ROOM-DROP-TIMESTAMP)
- `drop_name` - Display name (e.g., "Living Room Speaker 1")
- `room_name` - Room identifier (from Lucid shapes)
- `floor` - Floor level for filtering
- `wire_type` - Type of wire (CAT6, 22/4, etc.)
- `drop_type` - Drop classification (Speaker, Network, Alarm, etc.)
- `location` - Additional location details
- `install_note` - Installation notes
- `project_room_id` - Foreign key to project_rooms
- `qr_code_url` - URL to QR code image
- `shape_data` - JSONB storage of Lucid shape data
- `shape_color`, `shape_fill_color`, `shape_line_color` - Visual properties
- `lucid_shape_id`, `lucid_page_id` - Lucid integration fields
- `schematic_reference` - Reference to schematic

### 1.2 Wire Drop Stages System

**Table**: `wire_drop_stages`

Each wire drop has 3 associated stages:
1. **prewire** - Initial cable run phase
2. **trim_out** - Installation phase
3. **commission** - Final testing/activation

**Stage Fields**:
- `stage_type` - Type of stage (prewire, trim_out, commission)
- `completed` - Boolean completion status
- `completed_at` - Timestamp of completion
- `completed_by` - User who completed
- `photo_url` - SharePoint URL to stage photo
- `notes` - Stage-specific notes
- `sharepoint_drive_id`, `sharepoint_item_id` - SharePoint metadata

**Key Service**: `wireDropService.updateStage()` in `/src/services/wireDropService.js`

### 1.3 Wire Drop Room-End & Head-End Data

**Tables**: 
- `wire_drop_room_end` - Room-side equipment information
- `wire_drop_head_end` - Head-end (network/distribution) side information

These are separate from equipment links and store side-specific metadata.

---

## 2. Current Equipment Management Architecture

### 2.1 Three-Tier Equipment System

The project uses THREE levels of equipment management:

#### Level 1: Global Parts (`global_parts` table)
**Purpose**: Master catalog of all unique parts/SKUs across all projects

**Schema Fields**:
- `id`, `part_number` (UNIQUE)
- `name`, `description`, `manufacturer`, `model`
- `category`, `unit_of_measure`
- `quantity_on_hand`, `quantity_reserved`, `quantity_available` (calculated)
- `is_wire_drop_visible` - Can be added to wire drops
- `is_inventory_item` - Track inventory
- `required_for_prewire` - Classification for scheduling
- `resource_links` - JSONB array of manuals, schematics, etc.
- `attributes` - Flexible JSONB metadata
- Timestamps: `created_at`, `updated_at`

**Key Service**: `/src/services/partsService.js`

**Related View**: 
- `global_part_documents` - Richer document records (manuals, schematics, datasheets, etc.)

#### Level 2: Project Equipment (`project_equipment` table)
**Purpose**: Project-specific bill of materials from CSV imports

**Schema Fields** (extends global parts concept):
- `id`, `project_id`, `catalog_id`, `global_part_id`
- `room_id` - Foreign key to `project_rooms`
- `name`, `description`, `manufacturer`, `model`, `part_number`
- `install_side` - 'head_end', 'room_end', 'both', 'unspecified'
- `equipment_type` - 'part', 'labor', 'service', 'fee', 'other'
- `planned_quantity`, `unit_of_measure`, `unit_cost`, `unit_price`
- `supplier`, `supplier_id` - Vendor references
- **Procurement Tracking**:
  - `ordered_confirmed`, `ordered_confirmed_at`, `ordered_confirmed_by`
  - `onsite_confirmed`, `onsite_confirmed_at`, `onsite_confirmed_by`
  - `ordered_quantity`, `received_quantity` - Quantity tracking
- **Instance Tracking**:
  - `instance_number` - Instance within room/part combination
  - `instance_name` - Human-readable instance name
  - `parent_import_group` - UUID linking instances from same CSV line
  - `metadata` - Flexible JSONB for device-specific data
- **UniFi Integration Fields**:
  - `unifi_device_mac` - MAC address of UniFi device
  - `unifi_device_serial` - Serial number
  - `unifi_client_mac` - MAC address of assigned client
  - `unifi_last_ip`, `unifi_last_seen` - Network status
  - `unifi_data` - Full UniFi client snapshot (JSONB)
- **Receiving Fields**:
  - `received_date`, `received_by` - Per-instance receiving tracking
  - `received_quantity` - For instance tracking (0 or 1)
- `csv_batch_id` - Foreign key to import batch
- Timestamps: `created_at`, `created_by`, `updated_at`

**Key Service**: `/src/services/projectEquipmentService.js`

**Related Tables**:
- `project_equipment_inventory` - Warehouse/stock levels per equipment item
- `project_equipment_instances` - Optional per-unit tracking (serial numbers, assignments)

#### Level 3: Equipment Links (`wire_drop_equipment_links`)
**Purpose**: Junction table linking wire drops to project equipment

**Schema**:
- `wire_drop_id` - Foreign key to wire_drops
- `project_equipment_id` - Foreign key to project_equipment
- `link_side` - 'room_end', 'head_end', 'both'
- `sort_order` - Display order
- `created_by`, `created_at`, `updated_at`
- **Constraint**: UNIQUE(wire_drop_id, project_equipment_id, link_side)

### 2.2 CSV Import & Equipment Processing

**File**: `/src/services/projectEquipmentService.js`

**Flow**:
1. **Parse CSV** - Detects columns: ItemType, Area, Brand, PartNumber, ShortDescription, Cost, SellPrice, Supplier
2. **Create/Normalize Rooms** - Creates `project_rooms` entries, handles aliases
3. **Build Equipment Records** - Converts CSV rows to equipment items
   - Splits quantities > 1 into individual instances
   - Generates instance names (e.g., "Living Room - Speaker 1", "Living Room - Speaker 2")
   - Groups instances with `parent_import_group` UUID
   - Detects headend vs room_end based on room name keywords
4. **Create Labor Records** - Separate tracking for labor line items
5. **Mode Selection**:
   - **REPLACE**: Deletes all existing equipment, imports fresh
   - **MERGE/UPDATE**: Updates existing items by matching key
   - **APPEND**: Adds all items as new
6. **Wire Drop Preservation** (REPLACE mode only):
   - Before deletion, fetches all wire drop links
   - Attempts to re-link after new equipment inserted
   - Matches by part_number, room_id, install_side, name
7. **Global Parts Sync** - Creates/updates global_parts entries via RPC
8. **Supplier Matching** - Fuzzy matches CSV supplier names to existing suppliers
9. **Inventory Creation** - Creates inventory records for new equipment

---

## 3. Current Database Tables & Relationships

### 3.1 Core Tables

```
projects (1) --< wire_drops (1) --< wire_drop_stages
                                  --< wire_drop_room_end
                                  --< wire_drop_head_end
                                  --< wire_drop_equipment_links (N) --< project_equipment

projects (1) --< project_rooms (1) --< project_equipment
                                    --< project_room_aliases

projects (1) --< project_equipment (N) --< project_equipment_inventory
                                      --< project_equipment_instances
                                      --< wire_drop_equipment_links

equipment_import_batches --< project_equipment
                         --< project_labor_budget

global_parts (1) --< project_equipment (0..N)
              --< global_part_documents

suppliers (1) --< project_equipment (0..N)
```

### 3.2 Key Indexes

**Wire Drop Queries**:
- `idx_wire_drops_project_floor` - (project_id, floor)
- `idx_wire_drop_equipment_links_wire_drop` - (wire_drop_id, link_side, sort_order)

**Equipment Queries**:
- `idx_project_equipment_project` - (project_id)
- `idx_project_equipment_room` - (room_id)
- `idx_project_equipment_unifi_mac` - (unifi_device_mac) - MAC address lookups
- `idx_project_equipment_instance` - (project_id, part_number, room_id, instance_number)

---

## 4. How Equipment Is Currently Added to Wire Drops

### 4.1 Manual Room End Assignment (Most Common)

**File**: `WireDropDetailEnhanced.js` (lines 1485-1607)

**UI Flow**:
1. User clicks "Room" tab on wire drop detail
2. Views "Room End Equipment" section showing currently selected items
3. Scrolls to "Choose equipment to link" section
4. Sees equipment grouped by room
5. Checks checkboxes for equipment to add
6. Clicks "Save Room End Equipment"

**Code Flow**:
```javascript
// Load equipment for project
const equipment = await projectEquipmentService.fetchProjectEquipment(projectId);

// Get current wire drop links
const links = await wireDropService.getEquipmentLinks(wireDropId);

// User selects checkboxes -> updates local state
setRoomEquipmentSelection([id1, id2, ...]);

// Save selected equipment
await wireDropService.updateEquipmentLinks(wireDropId, 'room_end', equipmentIds);
```

### 4.2 Head End Assignment

**File**: `WireDropDetailEnhanced.js` (lines 1620-1750)

**Similar to room end, but**:
- Filters to head_end equipment only
- Shows "Head End Equipment" section
- Typically switches, routers, network panels

### 4.3 Current Limitations

1. **No Auto-Association**: Head end requires manual selection despite predictable patterns
   - CAT6 always goes to network switch
   - 22/4 alarm wire always goes to alarm panel
   
2. **No Search/Filter**: Must scroll through entire room list

3. **No Instance Visibility**: Can't easily distinguish "Speaker 1" vs "Speaker 2"

4. **No Equipment Details**: User sees only name, not model/specs

5. **No Equipment Status**: Can't see if equipment is ordered/received

---

## 5. Current Global Parts Access

### 5.1 Bottom Navigation Access

**File**: `/src/components/BottomNavigation.js`

```javascript
const navItems = [
  { icon: Home, label: 'Home', path: '/' },
  { icon: Boxes, label: 'Parts', path: '/parts' },  // <-- Global Parts
  { icon: Users, label: 'People', path: '/people' },
  { icon: Activity, label: 'UniFi Test', path: '/unifi-test' },
  { icon: QrCode, label: 'Scan Tag', path: '/scan-tag' },
];
```

**Access Point**: The "Parts" bottom nav button navigates to `/parts`

**Components**: 
- `PartsListPage.js` - Lists all global parts
- `GlobalPartsManager.js` - Management interface
- `PartsReceivingPage.js`, `PartsReceivingPageNew.js` - Receiving workflows

---

## 6. Existing Fields for Project-Specific Data

### 6.1 In project_equipment (Already Present)

Column | Type | Usage | Gap?
---|---|---|---
`unifi_device_mac` | TEXT | MAC address for UniFi matching | EXISTS
`unifi_device_serial` | TEXT | Serial number | EXISTS
`unifi_client_mac` | TEXT | MAC address of assigned client | EXISTS
`unifi_last_ip` | TEXT | Last IP from UniFi | EXISTS
`unifi_last_seen` | TIMESTAMPTZ | Last seen online | EXISTS
`unifi_data` | JSONB | Full UniFi snapshot | EXISTS
`metadata` | JSONB | Flexible JSON storage | EXISTS
`instance_number` | INTEGER | Instance within room | EXISTS
`instance_name` | TEXT | Human-readable instance name | EXISTS
`received_date` | TIMESTAMPTZ | Per-instance received date | EXISTS
`received_by` | TEXT | Who received this | EXISTS
`qr_code_url` | TEXT (wire_drops) | QR code image URL | On wire_drops, not equipment

### 6.2 What's Missing for Requirements

**Requirement**: Store project-specific fields (MAC addresses, QR codes) linked to equipment

**Current Gaps**:
- MAC address fields exist but are UniFi-specific
- No generic "QR code URL" field on equipment items (only on wire drops)
- No field for "custom project identifier" or "asset tag"
- No generic "configuration data" beyond metadata JSONB
- No "scan history" or "assignment history" tracking

---

## 7. What's Missing for Full Implementation

### 7.1 Database Schema Enhancements Needed

To fully support the requirements, add to `project_equipment`:

```sql
ALTER TABLE project_equipment ADD COLUMN IF NOT EXISTS
  qr_code_url TEXT;  -- URL to QR code image

ALTER TABLE project_equipment ADD COLUMN IF NOT EXISTS
  qr_code_data JSONB;  -- QR code content/metadata

ALTER TABLE project_equipment ADD COLUMN IF NOT EXISTS
  asset_tag TEXT;  -- Custom project identifier

ALTER TABLE project_equipment ADD COLUMN IF NOT EXISTS
  project_identifier TEXT;  -- Another project-specific code

ALTER TABLE project_equipment ADD COLUMN IF NOT EXISTS
  custom_fields JSONB;  -- Flexible project-specific data
```

### 7.2 Component Enhancements Needed

#### Equipment Selection UI Improvements
- Search/filter for equipment
- Show equipment details (model, specs)
- Display instances separately
- Show procurement status
- Show UniFi status if available

#### Equipment Detail View
- Add QR code display/generation
- Show all project-specific fields
- Display MAC addresses (both formats)
- Show assignment history
- Link to wire drops

#### CSV Import Enhancement
- New columns for QR code data
- Support for custom project fields in metadata
- Validation of project-specific identifiers

### 7.3 Service/Business Logic Enhancements

**File**: `/src/services/projectEquipmentService.js`

New methods needed:
- `generateQRCode(equipmentId)` - Generate and store QR codes
- `assignProjectIdentifier(equipmentId, identifier)` - Store custom IDs
- `updateProjectFields(equipmentId, fields)` - Update custom data
- `getEquipmentWithHistory(equipmentId)` - Track assignments
- `bulkUpdateProjectFields()` - Batch updates

---

## 8. CSV Import Workflow Details

### 8.1 CSV Expected Columns

From `projectEquipmentService.buildEquipmentRecords()`:

```javascript
const itemTypeRaw = row.ItemType;      // 'Equipment', 'Labor', 'Fee', etc.
const areaQty = row.AreaQty;           // Quantity
const roomName = row.Area;             // Room/location
const manufacturer = row.Brand;        // Brand/manufacturer
const model = row['Model or Labor/Fee Name'];
const partNumber = row.PartNumber || row['Part Number'] || row.part_number;
const description = row.ShortDescription || row['Short Description'] || row.Description;
const supplier = row.Supplier;
const cost = row.Cost;                 // Unit cost
const sellPrice = row.SellPrice;       // Unit price
```

### 8.2 Quantity Splitting Logic

```
CSV Row: Area Qty = 4, Item = Speaker
Creates:
  - project_equipment entry: instance_number=1, instance_name="Room - Speaker 1"
  - project_equipment entry: instance_number=2, instance_name="Room - Speaker 2"
  - project_equipment entry: instance_number=3, instance_name="Room - Speaker 3"
  - project_equipment entry: instance_number=4, instance_name="Room - Speaker 4"

All 4 entries linked by: parent_import_group = UUID
```

### 8.3 Import Modes

**REPLACE** (default):
- Deletes ALL existing equipment
- Preserves wire drop links (matches by part_number, room_id, install_side)
- Inserts fresh equipment

**MERGE/UPDATE**:
- Matches existing equipment by key
- Updates existing items
- Inserts new items

**APPEND**:
- Adds all items as new
- No deletion

---

## 9. Wire Drop -> Equipment Linking Details

### 9.1 Link Creation Process

From `wireDropService.updateEquipmentLinks()`:

```javascript
async updateEquipmentLinks(wireDropId, linkSide, equipmentIds = []) {
  // Get existing links for this wire drop + side
  const existing = await supabase
    .from('wire_drop_equipment_links')
    .select('id, project_equipment_id')
    .eq('wire_drop_id', wireDropId)
    .eq('link_side', linkSide);
  
  // Calculate: toInsert = new IDs, toRemove = old IDs
  // Insert new links, delete removed links
  // Update sort_order for all
}
```

### 9.2 Link Retrieval

From `wireDropDetailEnhanced.js` query:

```javascript
const { data, error } = await supabase
  .from('wire_drops')
  .select(`
    *,
    wire_drop_equipment_links (
      id,
      link_side,
      sort_order,
      project_equipment (
        *,
        project_rooms(name, is_headend)
      )
    )
  `)
  .eq('id', wireDropId)
  .single();
```

### 9.3 Constraints & Limitations

- **UNIQUE Constraint**: Only one link per (wire_drop, equipment, side)
- **No Quantities**: Links are 1:1, not 1:N
- **No Link Metadata**: Links store only side and sort order
- **Cascade Delete**: Deleting equipment or wire drops cascades

---

## 10. Summary: Current vs. Missing

### What EXISTS

Technology | Component | Status
---|---|---
Databases | Wire drops table | Complete
 | Wire drop stages system | Complete
 | Project equipment table | Complete
 | Equipment instances & grouping | Complete with parent_import_group
 | Equipment -> Wire drop linking | Complete via wire_drop_equipment_links
 | Global parts catalog | Complete
CSV Import | Full import pipeline | Complete
 | Quantity splitting | Complete
 | Wire drop link preservation | Complete with matching
 | Supplier fuzzy matching | Complete
 | Global parts sync | Complete via RPC
Equipment Fields | UniFi MAC tracking | Complete
 | Instance tracking | Complete (instance_number, instance_name)
 | Metadata JSONB | Complete
 | Received tracking | Complete
 | Procurement status | Complete
UI | Wire drop detail view | Complete
 | Equipment selection (room/head end) | Complete
 | Global parts manager | Complete
 | Bottom nav to parts | Complete
 | Stage completion workflow | Complete

### What's MISSING

Functionality | Status | Notes
---|---|---
QR Code Generation | Not implemented | Storage field exists on wire_drops, not on equipment
QR Code Storage | Partial | wire_drops.qr_code_url exists, equipment needs it
Generic MAC Address Storage | Partial | UniFi-specific fields exist, not generic
Custom Project Identifiers | Not implemented | Could use metadata JSONB but no UI
Equipment Detail Enhancement | Partial | Exists in detail view but could be improved
Search/Filter Equipment | Not implemented | No search in wire drop assignment UI
Equipment Procurement Integration | Partial | Status tracking exists but UI is limited
Instance-Specific Assignment History | Not implemented | No history table for assignments
Bulk QR Code Generation | Not implemented | No batch processing
CSV Fields for Project Data | Not implemented | No CSV columns for QR codes or custom fields

---

## 11. Implementation Strategy for New Requirements

### Phase 1: Database (Low Risk)
1. Add `qr_code_url` to `project_equipment`
2. Add `asset_tag` and `project_identifier` to `project_equipment`
3. Create `equipment_assignment_history` table (optional)

### Phase 2: QR Code Service (Medium Risk)
1. Create QR code generation service
2. Store URLs in project_equipment
3. Integrate with equipment detail view

### Phase 3: UI/UX (Medium Risk)
1. Enhance equipment selection with search
2. Show QR codes in equipment details
3. Display project-specific fields
4. Add equipment status indicators

### Phase 4: CSV Integration (Low Risk)
1. Support new CSV columns for custom fields
2. Auto-populate QR code URLs or generate them
3. Handle asset tags from CSV

---

## 12. Key Files Reference

Component | File | Lines | Purpose
---|---|---|---
Wire Drops List | `/src/components/WireDropsList.js` | 1-400 | Display all wire drops
Wire Drop Detail | `/src/components/WireDropDetailEnhanced.js` | 1-31420+ | Full detail view with equipment assignment
Wire Drop Service | `/src/services/wireDropService.js` | 1-826 | CRUD operations for wire drops
Equipment Service | `/src/services/projectEquipmentService.js` | 1-1341 | Equipment import, CRUD, procurement
Equipment Service | `/src/services/equipmentService.js` | 1-530 | Generic equipment operations
Parts Service | `/src/services/partsService.js` | 1-180 | Global parts CRUD
Bottom Nav | `/src/components/BottomNavigation.js` | 1-45 | Navigation to Parts page

---

## 13. Prewire Mode Feature

### Overview
**Changed:** 2025-11-29
**Files:**
- `src/components/PrewireMode.js` - Main prewire mode view
- `src/components/PrewirePhotoModal.js` - Quick photo capture modal
- `src/components/WireDropsHub.js` - Navigation to prewire mode
- `src/services/wireDropService.js` - markLabelsPrinted() method
- `database/migrations/2025-11-29_add_labels_printed.sql` - Database migration

### Purpose
Dedicated technician workflow for the prewire phase. Allows technicians to:
1. Print 2x QR wire labels for each drop
2. Capture prewire completion photos
3. Track which labels have been printed
4. Filter by floor and room

### Database Fields Added to `wire_drops`
| Column | Type | Purpose |
|--------|------|---------|
| `labels_printed` | BOOLEAN DEFAULT false | Whether labels have been printed |
| `labels_printed_at` | TIMESTAMPTZ | When labels were printed |
| `labels_printed_by` | TEXT | User who printed the labels |

### UI Features
- **Entry Point:** WireDropsHub → "Prewire Mode" button
- **Filters:** Floor dropdown, Room dropdown
- **Sorting:** Room name (A-Z), then labels_printed (unprinted first)
- **Per-drop actions:**
  - Print Wire Labels button (violet = unprinted, emerald = printed)
  - Camera icon for quick prewire photo capture
  - Prewire completion status indicator

### Print Flow
1. User taps "Print Labels" button
2. System generates label bitmap via labelRenderService
3. Prints 2x copies to connected Brady printer
4. Updates `labels_printed`, `labels_printed_at`, `labels_printed_by` in database
5. Button changes to emerald (green) to indicate printed
6. Drop moves to bottom of its room group in the list

### Photo Capture Flow
1. User taps camera icon
2. Modal opens with wire drop info
3. User captures photo (opens camera directly)
4. User can preview and retake
5. On "Save Photo", photo is uploaded to SharePoint
6. Prewire stage marked complete
7. Camera icon changes to checkmark

### Access Requirements
- Technician role (not PM-only)
- Project context required (via ?project=UUID query param)
- Printer connection required for label printing

---

## Conclusion

The current implementation has a **solid foundation** for equipment management with:
- Comprehensive equipment tracking at project level
- Instance-based quantity handling
- Global parts catalog
- Wire drop to equipment linking
- CSV import with intelligence

**Key gaps** are primarily in:
- Project-specific field storage on equipment (can use metadata JSONB)
- QR code generation and management
- Equipment search/filtering UI
- Equipment assignment history tracking

The `metadata` JSONB field in `project_equipment` already provides flexible storage for arbitrary project-specific data, which can serve as a bridge solution until specific columns are added.
