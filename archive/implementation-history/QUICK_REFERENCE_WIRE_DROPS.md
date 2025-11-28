# Quick Reference: Wire Drop & Equipment System

## Core Concepts at a Glance

### The Three Layers

```
Global Parts (across all projects)
          |
          v
Project Equipment (bill of materials for ONE project)
          |
          v
Wire Drop Equipment Links (which equipment goes into which wire drop)
```

### Wire Drop Lifecycle

```
Create Wire Drop
    |
    +-> 3 Stages Created: prewire, trim_out, commission
    |
    +-> Equipment Added to Wire Drop
    |   - Room End (one side of the drop)
    |   - Head End (other side of the drop)
    |
    +-> Stage Completion
        +-> Prewire: Cable run + photo
        +-> Trim Out: Installation + photo
        +-> Commission: Testing + notes
```

---

## Database Quick Lookup

### Tables You'll Touch Most

| Table | Purpose | Key Columns | Notes |
|-------|---------|-------------|-------|
| `wire_drops` | One wire drop per cable run | id, project_id, drop_name, room_name, floor | Parent record |
| `wire_drop_stages` | Track 3-stage completion | wire_drop_id, stage_type (prewire/trim_out/commission), completed, photo_url | Created automatically |
| `project_equipment` | Equipment for this project | id, project_id, name, part_number, instance_number, metadata | Can have 1+ rows per line item |
| `wire_drop_equipment_links` | Which equipment in which drop | wire_drop_id, project_equipment_id, link_side (room_end/head_end) | The connection |
| `project_rooms` | Room metadata | id, project_id, name, is_headend | Created during CSV import |
| `global_parts` | Master parts catalog | id, part_number, name, is_wire_drop_visible | Shared across all projects |

### Example Query: "Show me all equipment in wire drop X"

```sql
SELECT pe.*
FROM project_equipment pe
JOIN wire_drop_equipment_links wdel 
  ON pe.id = wdel.project_equipment_id
WHERE wdel.wire_drop_id = 'wire-drop-uuid'
ORDER BY wdel.link_side, wdel.sort_order;
```

### Example Query: "Show me all wire drops that use equipment Y"

```sql
SELECT wd.*
FROM wire_drops wd
JOIN wire_drop_equipment_links wdel 
  ON wd.id = wdel.wire_drop_id
WHERE wdel.project_equipment_id = 'equipment-uuid';
```

---

## Key Files by Task

### I want to...

| Task | Go to File | Key Function/Component |
|------|-----------|------------------------|
| Add a new wire drop | `/src/components/WireDropNew.js` | Component to create drop |
| View all wire drops | `/src/components/WireDropsList.js` | List view |
| View one wire drop details | `/src/components/WireDropDetailEnhanced.js` | Full detail + equipment assignment |
| Add equipment to a wire drop | `/src/components/WireDropDetailEnhanced.js` lines 1485-1750 | Room/Head end tabs |
| Import equipment from CSV | `/src/services/projectEquipmentService.js` | `importCsv()` |
| Complete a stage (photo) | `/src/services/wireDropService.js` | `uploadStagePhoto()` or `updateStage()` |
| Access global parts | `/src/components/PartsListPage.js` or `/parts` route | Bottom nav -> Parts |
| Fetch equipment for project | `/src/services/projectEquipmentService.js` | `fetchProjectEquipment()` |
| Link/unlink equipment | `/src/services/wireDropService.js` | `updateEquipmentLinks()` |

---

## Feature Tour: Equipment Assignment

### Current: Manual Room End Selection

**Location**: `WireDropDetailEnhanced.js` Tab: "Room"

```
Wire Drop Detail View
    |
    +-> Tabs: [Prewire] [Room] [Head End] [Commission]
        |
        +-> Click "Room" tab
            |
            +-> Section 1: "Room End Equipment" (green pill badges showing selected)
            |
            +-> Section 2: "Choose equipment to link"
                    |
                    +-> List grouped by room name
                    +-> Checkboxes for each equipment
                    +-> Save button at bottom
```

### Current: Head End Selection

Same flow but filters equipment by `install_side = 'head_end'`

### Current Limitations

1. No search - must scroll through all equipment
2. No equipment details (model, specs) shown
3. No instance-level visibility (can't tell Speaker 1 vs Speaker 2 visually)
4. No procurement status shown
5. No UniFi status shown
6. Must manually select every time (no defaults)

---

## Instance Handling in CSV Import

### What Happens When You Import CSV

```
CSV Row:  Area="Living Room", AreaQty=4, Item="Speaker"

Creates 4 database records:
  - instance_number: 1, instance_name: "Living Room - Speaker 1"
  - instance_number: 2, instance_name: "Living Room - Speaker 2"
  - instance_number: 3, instance_name: "Living Room - Speaker 3"
  - instance_number: 4, instance_name: "Living Room - Speaker 4"

All 4 linked by: parent_import_group = <same UUID>
```

### Why This Matters

- Each instance is a trackable unit
- Can track received/ordered per instance
- Can assign UniFi MACs per instance
- Can generate individual QR codes

---

## Wire Drop Linking Constraints

### What You CAN Do

✓ Link multiple equipment to one wire drop  
✓ Link one equipment to multiple wire drops  
✓ Assign equipment to room_end OR head_end OR both  
✓ Reorder equipment (sort_order field)  
✓ Change equipment at any time (before/during/after stages)  

### What You CANNOT Do

✗ Have duplicate links (UNIQUE constraint prevents it)  
✗ Store quantities on links (always 1:1)  
✗ Store metadata on links (only side and sort_order)  

---

## Global Parts vs Project Equipment

### Global Parts
- Shared across ALL projects
- Created on-demand during CSV import (if new part_number)
- Can add documentation (manuals, schematics)
- Can mark as "wire_drop_visible" or "is_inventory_item"

### Project Equipment
- Specific to ONE project (project_id foreign key)
- Created from CSV import
- References global_part_id if match found
- Tracks instance numbers and metadata
- Stores project-specific fields (UniFi MACs, etc.)

### Relationship

```
1 Global Part (e.g., "SpeakerX-100")
    |
    can be used in MANY project_equipment rows
    (1 per instance in each project)
```

---

## Procurement Status Fields

All in `project_equipment` table:

| Field | Type | Meaning |
|-------|------|---------|
| `ordered_confirmed` | BOOLEAN | Has this been ordered? |
| `ordered_confirmed_at` | TIMESTAMP | When was it ordered? |
| `ordered_confirmed_by` | UUID | Who ordered it? |
| `ordered_quantity` | NUMBER | How many ordered? |
| `onsite_confirmed` | BOOLEAN | Has it arrived? |
| `onsite_confirmed_at` | TIMESTAMP | When did it arrive? |
| `onsite_confirmed_by` | UUID | Who received it? |
| `received_quantity` | NUMBER | How many received? |
| `received_date` | TIMESTAMP | Date received |
| `received_by` | TEXT | Who received |

---

## Current Project-Specific Data Options

### Option 1: metadata JSONB (No Schema Needed)
```javascript
// Flexible, no database schema change needed
equipment.metadata = {
  qr_code_url: "https://...",
  asset_tag: "PROJ-123-456",
  custom_field_1: "value",
  installation_notes: "..."
}
```

### Option 2: UniFi Fields (Already in DB)
```javascript
equipment.unifi_device_mac = "aa:bb:cc:dd:ee:ff"
equipment.unifi_device_serial = "..."
equipment.unifi_client_mac = "..."
equipment.unifi_data = { /* full UniFi response */ }
```

### Option 3: Add New Columns (Requires Migration)
Would add to `project_equipment`:
- `qr_code_url` TEXT
- `asset_tag` TEXT
- `project_identifier` TEXT
- `custom_fields` JSONB

---

## CSV Import Modes

### REPLACE (Default)
```
1. Delete ALL equipment for this project
2. Preserve wire drop links (save before delete)
3. Import new equipment from CSV
4. Attempt to re-link equipment based on matching keys
```
Use when: Completely replacing old BOM

### MERGE/UPDATE
```
1. Match existing equipment by key (part_number, room_id, install_side)
2. Update matching rows
3. Insert new rows
```
Use when: Updating existing equipment

### APPEND
```
1. Insert all CSV rows as new equipment
2. No deletion, no merging
```
Use when: Adding to existing equipment

---

## UniFi Integration Fields

These fields are pre-populated if you:
1. Use the UniFi Test page to scan devices
2. Manually link equipment to UniFi clients

| Field | Source | Usage |
|-------|--------|-------|
| `unifi_device_mac` | Hardware MAC | For finding device in UniFi |
| `unifi_device_serial` | Device info | Serial number tracking |
| `unifi_client_mac` | UniFi API | Current network client MAC |
| `unifi_last_ip` | UniFi API | Last IP address seen |
| `unifi_last_seen` | UniFi API | Last online timestamp |
| `unifi_data` | UniFi API (full dump) | Complete client info |

---

## Bottom Navigation Access Points

From `/src/components/BottomNavigation.js`:

| Icon | Label | Route | Purpose |
|------|-------|-------|---------|
| Home | Home | / | Dashboard |
| Boxes | Parts | /parts | Global parts manager |
| Users | People | /people | Contacts/stakeholders |
| Activity | UniFi Test | /unifi-test | Network device assignment |
| QrCode | Scan Tag | /scan-tag | QR code scanner |

**The "Parts" button is where users access the global parts catalog.**

---

## Key Service Methods

### wireDropService

```javascript
// Core operations
getProjectWireDrops(projectId)
getWireDrop(wireDropId)
createWireDrop(projectId, data)
updateWireDrop(wireDropId, updates)
deleteWireDrop(wireDropId)

// Stage management
updateStage(wireDropId, stageType, updates)
uploadStagePhoto(wireDropId, stageType, file, userName)
completeCommission(wireDropId, data)

// Equipment linking
getEquipmentLinks(wireDropId)
updateEquipmentLinks(wireDropId, linkSide, equipmentIds)
```

### projectEquipmentService

```javascript
// Import operations
importCsv(projectId, file, options)

// Fetching
fetchProjectEquipment(projectId)
fetchProjectEquipmentByPhase(projectId, phase) // prewire/trim
fetchProjectLabor(projectId)
fetchRooms(projectId)

// Updates
updateProcurementStatus(equipmentId, {ordered, onsite, userId})
updateProcurementQuantities(equipmentId, {orderedQty, receivedQty})
receiveAllForPhase(projectId, phase)
```

### partsService

```javascript
// Global parts operations
list({search})
getById(id)
create(payload)
update(id, updates)
remove(id)
```

---

## Common Workflows

### Workflow 1: Create & Complete a Wire Drop

```javascript
// 1. Create wire drop
const drop = await wireDropService.createWireDrop(projectId, {
  drop_name: "Speaker 1",
  room_name: "Living Room",
  wire_type: "Speaker Wire",
  drop_type: "Speaker"
})

// 2. Add equipment to wire drop
await wireDropService.updateEquipmentLinks(
  drop.id,
  'room_end',
  [equipmentId1, equipmentId2]
)

// 3. Complete prewire stage with photo
await wireDropService.uploadStagePhoto(
  drop.id,
  'prewire',
  photoFile,
  "John Smith"
)

// 4. Complete trim out stage
await wireDropService.uploadStagePhoto(
  drop.id,
  'trim_out',
  photoFile2,
  "John Smith"
)

// 5. Complete commission
await wireDropService.completeCommission(drop.id, {
  notes: "All tested and working",
  completed_by: "John Smith"
})
```

### Workflow 2: Import Equipment from CSV

```javascript
// 1. User selects file in upload component
const file = event.target.files[0]

// 2. Call import service
const result = await projectEquipmentService.importCsv(
  projectId,
  file,
  { mode: 'replace', userId: currentUser.id }
)

// Results contain:
// - equipmentInserted: number
// - equipmentUpdated: number
// - laborInserted: number
// - roomsCreated: number
```

### Workflow 3: View & Filter Wire Drops

```javascript
// Wire drop list loads automatically
// User can:
// - Search by name, room, location, type
// - Filter by floor
// - See completion percentage for each
// - Click to view detail
```

---

## Debugging Tips

### "Wire drops showing empty equipment"
- Check `wire_drop_equipment_links` table for links
- Verify `project_equipment` records exist
- Check RLS policies if using authentication

### "Equipment disappearing after CSV import"
- Check if mode was 'replace' (deletes old equipment)
- Look in `equipment_import_batches` table for batch record
- Check if wire drop links were preserved/restored

### "CSV import not creating instances"
- Verify AreaQty column is numeric > 1
- Check ItemType is not 'Labor'
- Look for errors in console during import

### "Stages not marking complete"
- Verify stage exists (should auto-create, but check wire_drop_stages)
- Check if user is authenticated (needed for completed_by)
- Verify photo file uploaded successfully to SharePoint

---

## Quick Database Checks

### Count wire drops by project
```sql
SELECT project_id, COUNT(*) as count 
FROM wire_drops 
GROUP BY project_id;
```

### Find wire drops with no equipment
```sql
SELECT wd.id, wd.drop_name
FROM wire_drops wd
LEFT JOIN wire_drop_equipment_links wdel ON wd.id = wdel.wire_drop_id
WHERE wdel.id IS NULL;
```

### Count equipment instances by parent group
```sql
SELECT parent_import_group, COUNT(*) as count
FROM project_equipment
WHERE parent_import_group IS NOT NULL
GROUP BY parent_import_group;
```

### Find equipment without global_part_id
```sql
SELECT id, part_number, name
FROM project_equipment
WHERE global_part_id IS NULL
AND project_id = 'project-uuid';
```

---

## Performance Notes

### Indexes in Place
- Wire drops by project + floor
- Equipment by project + room
- Equipment links by wire drop + side
- UniFi MAC lookups

### Query Tips
- Always filter by `project_id` first
- Use `room_id` index when filtering by room
- Instance lookups are indexed by (project_id, part_number, room_id, instance_number)

### N+1 Prevention
All main queries use Supabase `select()` with relationships to avoid N+1:
```javascript
// Good (single query with joins)
.select(`*, project_equipment(*)`)

// Avoid (N queries)
for each link { fetch equipment separately }
```

