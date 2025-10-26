# Equipment Instance Splitting Design

## Overview
Split CSV line items with quantity > 1 into individual equipment instances, each trackable separately for receiving, UniFi device matching, and wire drop connections.

## Example Transformation

### CSV Input:
```csv
Area,AreaQty,Brand,Model,PartNumber,Cost,SellPrice,Type,Supplier
Living Room,2,Ubiquiti,24-Port Switch,USW-24-POE,299.00,450.00,part,Davis Distribution
Bedroom,4,Sonos,Speaker,SONOS-ONE,199.00,299.00,part,Davis Distribution
```

### Current Behavior (WRONG):
```javascript
// 2 database records:
{
  name: "24-Port Switch",
  part_number: "USW-24-POE",
  room_id: "room-uuid-1",
  planned_quantity: 2  // ❌ Can't track which one was received
}
{
  name: "Speaker",
  part_number: "SONOS-ONE",
  room_id: "room-uuid-2",
  planned_quantity: 4  // ❌ Can't link individual wire drops
}
```

### New Behavior (CORRECT):
```javascript
// 6 database records (2 + 4):
parent_group_1 = uuid()
{
  name: "24-Port Switch",
  instance_name: "Living Room - 24-Port Switch 1",
  instance_number: 1,
  part_number: "USW-24-POE",
  room_id: "room-uuid-1",
  planned_quantity: 1,
  parent_import_group: parent_group_1
}
{
  name: "24-Port Switch",
  instance_name: "Living Room - 24-Port Switch 2",
  instance_number: 2,
  part_number: "USW-24-POE",
  room_id: "room-uuid-1",
  planned_quantity: 1,
  parent_import_group: parent_group_1
}

parent_group_2 = uuid()
{
  name: "Speaker",
  instance_name: "Bedroom - Speaker 1",
  instance_number: 1,
  part_number: "SONOS-ONE",
  room_id: "room-uuid-2",
  planned_quantity: 1,
  parent_import_group: parent_group_2
}
{
  name: "Speaker",
  instance_name: "Bedroom - Speaker 2",
  instance_number: 2,
  ...
}
// ... instances 3 and 4
```

## Implementation Steps

### 1. Database Migration
File: `supabase/add_equipment_instances.sql`

Adds columns:
- `instance_number` - Sequential number per room/part
- `instance_name` - Human-readable "Room - Part N"
- `parent_import_group` - Links instances from same CSV line
- `metadata` - Flexible JSONB for UniFi API data, port mappings, etc.
- `unifi_device_mac`, `unifi_device_serial` - Device matching
- `received_date`, `received_by`, `received_quantity` - Individual receiving

### 2. CSV Import Logic Changes
File: `src/services/projectEquipmentService.js`

#### Current `buildEquipmentRecords()`:
```javascript
// Creates 1 record per CSV row
equipmentRecords.push({
  name: model,
  part_number: partNumber,
  planned_quantity: areaQty,  // e.g., 4
  room_id: room.id
});
```

#### New `buildEquipmentRecords()`:
```javascript
const areaQty = toNumber(row.AreaQty);
const roomName = normalizeString(row.Area);
const room = roomMap.get(normalizeRoomKey(roomName));

// Generate parent group ID for this CSV line
const parentGroupId = crypto.randomUUID();

// Create instance for each quantity
for (let i = 1; i <= areaQty; i++) {
  equipmentRecords.push({
    name: model,
    instance_number: i,
    instance_name: generateInstanceName(roomName, model, i),
    parent_import_group: parentGroupId,
    part_number: partNumber,
    planned_quantity: 1,  // ✅ Always 1 per instance
    room_id: room?.id || null,
    // ... other fields
  });
}

function generateInstanceName(roomName, partName, instanceNum) {
  return `${roomName} - ${partName} ${instanceNum}`;
}
```

### 3. Instance Numbering Per Room
Instances should be numbered per room + part type:

```javascript
// Track instance numbers per room/part combination
const instanceCounters = new Map();

for (const row of parsedRows) {
  const key = `${roomName}|${partNumber}`;

  if (!instanceCounters.has(key)) {
    instanceCounters.set(key, 0);
  }

  const instanceNum = instanceCounters.get(key) + 1;
  instanceCounters.set(key, instanceNum);

  // Use instanceNum for this instance
}
```

Result:
- Living Room - Speaker 1
- Living Room - Speaker 2
- Bedroom - Speaker 1  (numbering restarts)
- Bedroom - Speaker 2

### 4. Wire Drop Preservation
File: `src/services/projectEquipmentService.js`

#### Current Matching:
```javascript
const matchKey = [
  part_number,
  room_id,
  install_side,
  name
].join('|');
```

#### New Matching (Link to Instance #1):
```javascript
// Step 1: Save wire drop links before deletion
const preservedLinks = [...]; // Has old equipment IDs

// Step 2: After creating new instances, find instance #1 for each part
const newEquipment = [...]; // All new instances

preservedLinks.forEach(oldLink => {
  const matchKey = [
    oldLink.equipment.part_number,
    oldLink.equipment.room_id,
    oldLink.equipment.install_side,
    oldLink.equipment.name
  ].join('|');

  // Find the FIRST instance (instance_number = 1) that matches
  const newMatch = newEquipment.find(item => {
    const newKey = [
      item.part_number,
      item.room_id,
      item.install_side,
      item.name
    ].join('|');

    return newKey === matchKey && item.instance_number === 1;  // ✅ Link to instance #1
  });

  if (newMatch) {
    // Restore wire drop link to instance #1
    linkInserts.push({
      wire_drop_id: oldLink.wire_drop_id,
      project_equipment_id: newMatch.id,  // New instance #1 ID
      quantity: oldLink.quantity,
      notes: oldLink.notes
    });
  }
});
```

### 5. PO Generation (No Change Needed)
POs should group instances by part type:

```javascript
// Query gets all instances
const equipment = [
  { name: "Speaker", instance_number: 1, unit_cost: 199 },
  { name: "Speaker", instance_number: 2, unit_cost: 199 },
  { name: "Speaker", instance_number: 3, unit_cost: 199 },
  { name: "Speaker", instance_number: 4, unit_cost: 199 }
];

// Group for PO display
const grouped = equipment.reduce((acc, item) => {
  const key = item.part_number;
  if (!acc[key]) {
    acc[key] = {
      name: item.name,
      quantity: 0,
      unit_cost: item.unit_cost,
      instances: []
    };
  }
  acc[key].quantity += 1;
  acc[key].instances.push(item);
  return acc;
}, {});

// PO shows:
// Speaker × 4   $796.00

// But internally tracks which instances are on the PO
```

### 6. Receiving (Individual Instance Tracking)
```javascript
// Receive individual instances
async function receiveInstance(equipmentId, receivedBy) {
  await supabase
    .from('project_equipment')
    .update({
      received_date: new Date().toISOString(),
      received_by: receivedBy,
      received_quantity: 1
    })
    .eq('id', equipmentId);
}

// Query receiving status for a PO
const { data: instances } = await supabase
  .from('project_equipment')
  .select('instance_name, received_date, received_by')
  .in('id', [instanceIds]);

// Shows:
// ✓ Living Room - Speaker 1 - Received 2025-01-15 by John
// ✓ Living Room - Speaker 2 - Received 2025-01-15 by John
// ⏳ Bedroom - Speaker 1 - Not received
// ⏳ Bedroom - Speaker 2 - Not received
```

### 7. UniFi Device Matching
```javascript
// After installation, link UniFi device to instance
async function linkUniFiDevice(equipmentId, macAddress) {
  // Fetch device info from UniFi API
  const deviceInfo = await fetchUniFiDevice(macAddress);

  await supabase
    .from('project_equipment')
    .update({
      unifi_device_mac: macAddress,
      unifi_device_serial: deviceInfo.serial,
      metadata: {
        unifi: {
          mac: macAddress,
          serial: deviceInfo.serial,
          model: deviceInfo.model,
          ip_address: deviceInfo.ip,
          firmware: deviceInfo.version,
          port_count: deviceInfo.num_ports,
          ports: deviceInfo.port_table  // Full port mapping
        },
        installation_date: new Date().toISOString()
      }
    })
    .eq('id', equipmentId);
}

// Query devices with UniFi data
const { data: devices } = await supabase
  .from('project_equipment')
  .select('instance_name, unifi_device_mac, metadata')
  .eq('project_id', projectId)
  .not('unifi_device_mac', 'is', null);

// Shows all installed devices with their UniFi data
```

## Migration Strategy

### Option A: Clean Re-import (RECOMMENDED)
1. Apply database migration (`add_equipment_instances.sql`)
2. Delete all existing project equipment
3. Re-import all CSV files with new instance splitting
4. PM re-links wire drops (they'll link to instance #1 automatically if using same CSV)

### Option B: Migrate Existing Data
1. Apply database migration
2. Run migration script to split existing equipment:
```sql
-- For each equipment with quantity > 1, split into instances
DO $$
DECLARE
  rec RECORD;
  parent_id UUID;
  i INTEGER;
BEGIN
  FOR rec IN
    SELECT * FROM project_equipment
    WHERE planned_quantity > 1
  LOOP
    parent_id := gen_random_uuid();

    FOR i IN 1..rec.planned_quantity LOOP
      INSERT INTO project_equipment (
        -- copy all fields from rec
        instance_number,
        instance_name,
        parent_import_group,
        planned_quantity
      ) VALUES (
        i,
        rec.room_name || ' - ' || rec.name || ' ' || i,
        parent_id,
        1
      );
    END LOOP;

    -- Delete original record
    DELETE FROM project_equipment WHERE id = rec.id;
  END LOOP;
END $$;
```

**User chose: Option A** - Clean re-import with test data

## Testing Checklist

- [ ] Apply `add_equipment_instances.sql` migration
- [ ] Import CSV with quantity=1 items (should work same as before)
- [ ] Import CSV with quantity>1 items (should create multiple instances)
- [ ] Verify instance_name format: "Room - Part N"
- [ ] Verify instance_number restarts per room/part
- [ ] Verify parent_import_group links all instances from same CSV line
- [ ] Re-import same CSV in REPLACE mode
- [ ] Verify wire drops link to instance #1 after re-import
- [ ] Test PO generation groups instances correctly
- [ ] Test receiving individual instances
- [ ] Test UniFi device linking to specific instance

## Questions Answered

**Q: Room name in instance_name before room matching?**
**A:** Use CSV room name initially. After room matching updates room_id, optionally regenerate instance_name with actual room record name.

**Q: Global parts multi-instance tracking?**
**A:** No - global parts remain single reference records. Instance tracking only on project equipment.

**Q: Wire drop preservation?**
**A:** Link to instance #1 when matching by part_number + room + name.

**Q: Instance numbering?**
**A:** Per room per part. "Living Room - Speaker 1, Living Room - Speaker 2, Bedroom - Speaker 1"

**Q: Head end equipment metadata?**
**A:** Use `metadata` JSONB field for flexible API data, port mappings, custom fields.
