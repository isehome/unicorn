# Wire Drop Tabs & UniFi Integration - Complete Analysis

## Executive Summary

This document provides a comprehensive analysis of:
1. **Wire Drop Tabs Structure** - How the 4 tabs are organized and what data/functionality is in each
2. **UniFi API Integration** - Current implementation, data access, and gaps
3. **Wire Drop Stages & Photo Requirements** - How completion is tracked
4. **Equipment Assignment Logic** - How equipment is linked and room/head end differentiation

---

## Part 1: Wire Drop Tabs Structure

### Tab Organization
Located in: `/src/components/WireDropDetailEnhanced.js` (lines 1420-1436)

```javascript
['prewire', 'room', 'head-end', 'commission'].map((tab) => (
```

### Tab 1: PREWIRE (Stage 1 of 3)

**Location**: Lines 1439-1555

**Purpose**: Cable run and initial installation photography

**Data/Functionality**:
- **Stage Status Display**:
  - Shows completion status (green checkmark or yellow warning)
  - Displays `completed_at` timestamp
  - Shows `completed_by` user name
- **Photo Management**:
  - Photo URL stored in `wire_drop_stages.photo_url`
  - SharePoint metadata stored (`sharepoint_drive_id`, `sharepoint_item_id`)
  - Supports offline photo upload (queued state)
  - Can replace photo with "Re-upload Photo" button
- **Upload Flow**:
  ```
  User clicks "Take/Upload Photo"
  → Opens file picker or camera
  → Compresses image
  → Uploads to SharePoint
  → Marks stage as completed
  → Stores timestamp and user name
  ```
- **Completion Trigger**: Photo upload automatically marks stage complete

**Key Fields**:
- `wire_drop_stages.photo_url` - SharePoint URL
- `wire_drop_stages.completed` - Boolean
- `wire_drop_stages.completed_at` - Timestamp
- `wire_drop_stages.completed_by` - User email
- `wire_drop_stages.sharepoint_drive_id` - Metadata
- `wire_drop_stages.sharepoint_item_id` - Metadata

---

### Tab 2: ROOM (Contains Stage 2: Trim Out)

**Location**: Lines 1557-1881

**Purpose**: Installation completion and room-side equipment assignment

**Data/Functionality**:

#### Section A: Trim Out Stage (Stage 2)
- Same photo management system as Prewire
- Photo marks stage 2 complete
- "Stage 2: Trim Out" header

#### Section B: Room End Equipment Selection
**Sub-sections**:
1. **Selected Equipment Display** (green pill badges)
   - Shows currently linked room_end equipment
   - Displays equipment name with X button to remove
   
2. **Equipment Selection List** (scrollable)
   - Grouped by room name
   - Checkboxes for each equipment item
   - Shows: name, location, SKU
   - Max height 60 viewport units with scroll
   
3. **Save Button**
   - Calls `wireDropService.updateEquipmentLinks(wireDropId, 'room_end', equipmentIds)`
   - Updates `wire_drop_equipment_links` table with `link_side='room_end'`

**Key Service Call**:
```javascript
await wireDropService.updateEquipmentLinks(id, 'room_end', roomEquipmentSelection)
```

**Stored Data**:
- `wire_drop_equipment_links.wire_drop_id`
- `wire_drop_equipment_links.project_equipment_id`
- `wire_drop_equipment_links.link_side` = 'room_end'
- `wire_drop_equipment_links.sort_order`

---

### Tab 3: HEAD END (Equipment Assignment)

**Location**: Lines 1883-2087

**Purpose**: Head-end equipment (switches, panels, servers) assignment and network port connection

**Data/Functionality**:

#### Section A: Commission Stage Display
- Shows stage 3 completion status
- Commission notes display
- Same green checkmark/yellow warning styling

#### Section B: Head End Equipment Selection
- Same UI pattern as Room tab
- Filters to `install_side='head_end'` equipment only
- Purple pill badges for selected items
- Scrollable list with grouping by room
- Shows manufacturer and model information

#### Section C: Network Port Assignment
- **Switch Dropdown**: Lists available UniFi switches
  - Displays: `device_name (location)`
  - Source: `unifi_switches` table joined from `wire_drops`
  
- **Port Dropdown**: When switch selected, shows ports from `unifi_switch_ports`
  - Displays: `Port {port_idx} ({port_name}) - VLAN {vlan_id}`
  
- **Cable Label Field**: Custom cable identifier
  - Example: "CAT6-101-A"
  
- **Patch Panel Port Field**: Patch panel reference
  - Example: "PP1-24"
  
- **Assign Port Button**: 
  - Calls `unifiService.linkWireDropToPort()`
  - Stores in `wire_drop_ports` table

**Key Service Call**:
```javascript
await unifiService.linkWireDropToPort(id, selectedPort, {
  cableLabel,
  patchPanelPort
})
```

**Stored Data**:
- `wire_drop_equipment_links.wire_drop_id`
- `wire_drop_equipment_links.project_equipment_id`
- `wire_drop_equipment_links.link_side` = 'head_end'
- `wire_drop_ports.switch_port_id` - UniFi port reference
- `wire_drop_ports.cable_label`
- `wire_drop_ports.patch_panel_port`

---

### Tab 4: COMMISSION (Network Verification)

**Location**: Lines 2208-2323

**Purpose**: Verify network connectivity by assigning UniFi clients to equipment

**Data/Functionality**:

#### Section A: Network Commissioning Header
- Shows stage 3 (commission) completion status
- Icon: `<Network size={20} />`
- Description: "Verify network connectivity by assigning UniFi clients to equipment endpoints"

#### Section B: Room End Device UniFi Client Assignment
- **Display**:
  - Shows first selected room equipment
  - Displays: name, manufacturer, model
  
- **UniFi Client Selector Component**:
  - Component: `<UniFiClientSelector />`
  - Props:
    - `projectId` - For fetching project's UniFi URL
    - `equipmentId` - Equipment being assigned
    - `wireDropId` - Wire drop being commissioned
    - `onAssign` - Callback to reload wire drop
  
- **What It Does**:
  1. Parses UniFi URL to extract console ID
  2. Fetches UniFi hosts/sites
  3. Fetches connected clients
  4. User selects a client from dropdown
  5. Stores in `project_equipment`:
     - `unifi_client_mac` - Client MAC address
     - `unifi_last_ip` - Last IP from UniFi
     - `unifi_last_seen` - Timestamp
     - `unifi_data` - Full UniFi client JSON
  6. **AUTO-COMPLETES commission stage**:
     - Inserts/upserts `wire_drop_stages` with `completed=true`
     - Sets stage notes to device info
     - Sets timestamp and user

#### Section C: Head End Connection
- **Display**:
  - Shows first selected head equipment
  - Displays: name, manufacturer, model
  
- **Placeholder**:
  - Blue info box: "UniFi switch port selector coming in next phase"
  - Ready for future switch port assignment

#### Section D: Auto-Complete Notice
- Green info box (appears when not complete)
- Text: "This stage will be automatically marked complete when you assign a UniFi client to the room equipment."

---

## Part 2: UniFi API Integration - Current Implementation

### 2.1 Services & Files

#### Main Services:
1. **`/src/services/unifiApi.js`** - API communication layer
2. **`/src/services/unifiService.js`** - Supabase data management
3. **`/src/components/UniFiClientSelector.js`** - Client assignment component
4. **`/api/unifi-proxy.js`** - Serverless backend proxy

### 2.2 Current UniFi API Calls

#### A. Fetch Sites/Hosts
**File**: `unifiApi.js` (lines 281-291)
```javascript
export const fetchSites = async (controllerUrl) => {
  return await callUnifiProxy({ 
    endpoint: '/v1/hosts',
    controllerUrl
  });
}
```
- **Endpoint**: `/v1/hosts` (UniFi Cloud API)
- **Returns**: Array of UniFi hosts (multi-tenant controller support)
- **Usage**: Get list of all sites/hosts accessible to API key

#### B. Fetch Devices
**File**: `unifiApi.js` (lines 301-419)
```javascript
export const fetchDevices = async (hostIds, controllerUrl = null, options = {}) => {
  // Filters devices by hostIds
  // Returns: unique devices with host metadata
  // Supports pagination with nextToken and pageSize
}
```
- **Endpoint**: `/v1/devices`
- **Filters**: Can request specific host IDs
- **Returns**:
  ```javascript
  {
    data: [device objects],      // Deduplicated list
    nextToken,                    // For pagination
    pagesFetched,                 // Number of pages fetched
    hosts: [hostSummaries],       // List of hosts found
    raw: lastResponse             // Raw API response
  }
  ```
- **Enrichment**: Adds `hostId`, `hostSiteId`, `siteId` to each device
- **Device Fields Available**:
  - `mac` - Device MAC address
  - `id` - Device ID
  - `name` - Device name
  - `model` - Device model
  - `state` - Device state (1 = connected, etc.)
  - `port_table` - For switches, array of port objects
  - `last_seen` - Timestamp
  - `serial`, `serialNumber`

#### C. Fetch Clients
**File**: `unifiApi.js` (lines 428-438)
```javascript
export const fetchClients = async (hostId, controllerUrl) => {
  console.warn('Clients endpoint not yet implemented - check API docs for correct endpoint');
  return { data: [] };
}
```
- **Status**: NOT IMPLEMENTED
- **Issue**: Placeholder returns empty array
- **Needed**: Actual UniFi clients endpoint integration

#### D. Fetch Switch Ports
**File**: `unifiApi.js` (lines 447-468)
```javascript
export const fetchSwitchPorts = async (siteId, deviceMac, controllerUrl) => {
  // Fetches devices matching the MAC
  // Extracts port_table from switch device
  // Returns: port array
}
```
- **Returns**: `port_table` from switch device
- **Port Fields**:
  - `port_idx` - Port number
  - `name` - Port name
  - `vlan` - VLAN ID
  - `poe_mode` - PoE configuration
  - `portconf_id` - Profile ID
  - `is_uplink` - Is uplink port
  - `speed` - Port speed

#### E. Test Connection
**File**: `unifiApi.js` (lines 475-489)
```javascript
export const testConnection = async (controllerUrl) => {
  try {
    await fetchSites(controllerUrl);
    return { success: true, message: 'Successfully connected to UniFi API' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

### 2.3 Database Integration - UniFi Data Storage

#### Tables Created:
1. **`unifi_sites`** (from `unifiService.syncSites()`)
   - `project_id` - Project owning the site
   - `site_id` - UniFi site ID
   - `site_name` - Site name
   - `site_desc` - Site description
   - `controller_url` - Controller URL

2. **`unifi_switches`** (from `unifiService.syncSwitches()`)
   - `project_id`
   - `unifi_site_id` - FK to unifi_sites
   - `device_id` - MAC address of switch
   - `device_name` - Switch name
   - `device_model` - Model
   - `ip_address` - IP address
   - `total_ports` - Port count
   - `last_seen` - Last active timestamp
   - `is_active` - Active status

3. **`unifi_switch_ports`** (from `unifiService.syncSwitchPorts()`)
   - `switch_id` - FK to unifi_switches
   - `port_idx` - Port number
   - `port_name` - Port name
   - `vlan_id` - VLAN
   - `poe_mode` - PoE mode
   - `port_profile_name` - Profile ID
   - `is_uplink` - Is uplink

4. **`wire_drop_ports`** (from `unifiService.linkWireDropToPort()`)
   - `wire_drop_id` - FK to wire_drops
   - `switch_port_id` - FK to unifi_switch_ports
   - `patch_panel_port` - Human-readable patch panel label
   - `cable_label` - Cable identifier

#### Equipment UniFi Fields (in `project_equipment`):
```javascript
{
  unifi_device_mac: "aa:bb:cc:dd:ee:ff",    // Hardware MAC
  unifi_device_serial: "ABC123",             // Serial number
  unifi_client_mac: "aa:bb:cc:dd:ee:ff",    // Network client MAC
  unifi_last_ip: "192.168.1.100",           // Last known IP
  unifi_last_seen: "2025-01-15T10:30:00Z",  // Last online
  unifi_data: { /* full UniFi client object */ } // Raw data
}
```

### 2.4 How Client Data is Currently Fetched

**Component**: `UniFiClientSelector.js` (lines 53-89)

**Flow**:
1. Load project's `unifi_url` from `projects` table
2. Extract console ID from URL regex: `/consoles/([^\/]+)`
3. Call `unifiApi.fetchSites(unifiUrl)` to get hosts
4. Call `unifiApi.fetchClients(hostId, unifiUrl)` for connected clients
5. **Problem**: `fetchClients` returns empty array (not implemented)

**Current Workaround**: None - clients aren't actually fetched

### 2.5 MAC Address & IP Address Handling

**Storage Locations**:
```javascript
// In project_equipment:
unifi_device_mac           // Device hardware MAC (e.g., switch port)
unifi_device_serial        // Device serial number
unifi_client_mac           // Client MAC (assigned device)
unifi_last_ip              // Last IP address
unifi_last_seen            // Last seen timestamp
unifi_data                 // Full UniFi snapshot (JSONB)

// In wire_drop_ports:
wire_drop_ports.patch_panel_port  // Manual reference
wire_drop_ports.cable_label       // Manual cable label
```

**Current Usage**:
- When user assigns equipment in Commission tab via `UniFiClientSelector`
- Component extracts from UniFi response:
  - `client.mac` → `unifi_client_mac`
  - `client.ip` → `unifi_last_ip`
  - Full `client` → `unifi_data`
- Also tries to read:
  - `client.sw_mac` - Switch MAC (exists in some clients)
  - `client.sw_port` - Switch port number (exists in some clients)

### 2.6 Switch & Port Information

**Switch Information Pulled**:
From `fetchDevices()` response:
```javascript
{
  mac: "aa:bb:cc:dd:ee:ff",     // Switch MAC
  name: "Office Switch",         // Switch name
  model: "USW-Pro-48-PoE",       // Switch model
  state: 1,                      // Connected state
  ip: "192.168.1.50",            // Management IP
  num_port: 48,                  // Total ports
  port_table: [                  // Detailed port info
    {
      port_idx: 1,
      name: "Port 1",
      vlan: 1,
      poe_mode: "auto",
      speed: 1000,
      is_uplink: false
    },
    // ... more ports
  ]
}
```

**Current Access**:
- Switches are loaded in `WireDropDetailEnhanced.js` (lines 2103-2120)
- Stores in state: `availableSwitches`
- When switch selected, port dropdown populates from `unifi_switch_ports`
- User can manually assign wire drop to port with cable label

---

## Part 3: Wire Drop Stages & Photo Requirements

### 3.1 Stage Structure

**Database**: `wire_drop_stages` table

**Auto-Created on Wire Drop Creation**:
```javascript
const stages = ['prewire', 'trim_out', 'commission'];
```

**Fields Per Stage**:
```javascript
{
  id: UUID,
  wire_drop_id: FK,
  stage_type: 'prewire' | 'trim_out' | 'commission',
  completed: BOOLEAN,
  completed_at: TIMESTAMP (null if incomplete),
  completed_by: TEXT (user email or name),
  photo_url: TEXT (SharePoint URL for prewire/trim_out),
  notes: TEXT (optional stage notes),
  sharepoint_drive_id: UUID,        // SharePoint metadata
  sharepoint_item_id: UUID,         // SharePoint metadata
  stage_data: JSONB (optional)       // Commission-specific data
}
```

### 3.2 Photo Workflow

**Upload Process** (from `WireDropDetailEnhanced.js`):

```javascript
const handlePhotoUpload = async (stageType, isReplace = false) => {
  1. User clicks "Take/Upload Photo"
  2. Opens file picker dialog
  3. Selected file is compressed: compressImage(file)
  4. For offline: enqueueUpload(wireDrop.id, stageType, file)
  5. For online:
     a. wireDropService.uploadStagePhoto(
          wireDropId,
          stageType,  // 'prewire' or 'trim_out'
          file,
          user.email  // for completed_by
        )
     b. Service uploads to SharePoint via sharePointStorageService
     c. Gets back: { url, driveId, itemId }
     d. Calls updateStage() with:
        - photo_url: uploadResult.url
        - sharepoint_drive_id: uploadResult.driveId
        - sharepoint_item_id: uploadResult.itemId
        - completed: true
        - completed_by: currentUserName
  6. Wire drop reloads and photo displays
}
```

**SharePoint Storage**:
- Photos stored in SharePoint
- Path structure: `Projects/{ProjectName}/WireDrops/{DropUID}/{StageType}/`
- File name: timestamp-based
- Returns metadata for caching and offline sync

### 3.3 Completion Criteria Per Stage

#### Stage 1: Prewire
- **Required**: Photo upload
- **Automatically Completed**: When photo successfully uploads
- **Fields Set**:
  - `completed = true`
  - `completed_at = now()`
  - `completed_by = currentUser`
  - `photo_url = sharePointUrl`
  - `sharepoint_drive_id = uuid`
  - `sharepoint_item_id = uuid`

#### Stage 2: Trim Out (Install)
- **Required**: Photo upload
- **Automatically Completed**: When photo successfully uploads
- **Same data fields as Prewire**
- **UI Location**: "Room" tab (confusingly named - the tab also has equipment selection)

#### Stage 3: Commission
- **Two Paths**:
  
  **Path A: Manual Completion** (original)
  - User clicks "Mark as Commissioned"
  - Optional notes field
  - Sets: `completed=true`, `completed_by=user`, timestamp
  - No photo required
  
  **Path B: UniFi Auto-Complete** (current implementation)
  - User selects UniFi client in Commission tab
  - `UniFiClientSelector` component handles assignment
  - Calls `wireDropService.updateStage()` with:
    ```javascript
    {
      completed: true,
      notes: `Device verified online: ${hostname || mac}`,
      completed_at: now(),
      completed_by: user.email
    }
    ```
  - **Happens automatically** when client is assigned

### 3.4 Photo Requirements

**Prewire Photos**:
- File: JPEG or PNG
- Compressed before upload
- Shows cable runs and installation staging
- Required for completion

**Trim Out Photos**:
- Same requirements as Prewire
- Shows finished installation
- Wall plates, terminations, etc.

**Commission Photos**:
- **Not required** currently
- No photo upload in commission stage
- Completion via notes or UniFi client assignment

**Offline Support**:
- Photos can be queued offline
- Displayed with "Queued for Upload" overlay
- Syncs when connection restored
- Uses `enqueueUpload()` from `/src/lib/offline.js`

---

## Part 4: Equipment Assignment Logic

### 4.1 How Equipment is Assigned to Wire Drops

**Junction Table**: `wire_drop_equipment_links`

**Columns**:
```javascript
{
  id: UUID,
  wire_drop_id: FK to wire_drops,
  project_equipment_id: FK to project_equipment,
  link_side: 'room_end' | 'head_end' | 'both',
  sort_order: INTEGER (for ordering display),
  created_by: UUID,
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP
}
```

**Constraint**: 
```sql
UNIQUE(wire_drop_id, project_equipment_id, link_side)
```
- Prevents duplicate links
- Same equipment can be in multiple wire drops
- Same equipment can be on both sides of a drop

### 4.2 Room End vs Head End Differentiation

**Determined By**: `project_equipment.install_side` field

**Values**:
```javascript
install_side: 'room_end' | 'head_end' | 'both' | 'unspecified'
```

**Set During**: CSV Import
**Logic** (from `projectEquipmentService.js`):
```javascript
// Room name-based detection
if (roomName.toLowerCase().includes('head') || 
    roomName.toLowerCase().includes('server') ||
    roomName.toLowerCase().includes('main')) {
  install_side = 'head_end';
} else {
  install_side = 'room_end';
}
```

**In Wire Drops**:
- **Room Tab**: Shows only `install_side='room_end'` equipment
- **Head End Tab**: Shows only `install_side='head_end'` equipment
- Can also assign `'both'` equipment to both sides

### 4.3 Multiple Wire Drops Per Equipment

**YES - Supported**

**How**:
```javascript
// Same equipment in wire drop A, wire drop B, and wire drop C
wire_drop_equipment_links:
- wire_drop_id=A, project_equipment_id=X, link_side=room_end
- wire_drop_id=B, project_equipment_id=X, link_side=room_end
- wire_drop_id=C, project_equipment_id=X, link_side=head_end
```

**Use Case**: 
- Single switch connected to multiple wire drops
- Single cabinet equipment used in multiple rooms
- Network patching points shared across drops

**UI Indication**:
- In Head End tab (line 1996):
  ```
  "The same device can be linked to multiple wire drops if needed."
  ```

### 4.4 Equipment Link Management

**Service**: `wireDropService.updateEquipmentLinks()` (lines 761-820)

**Process**:
```javascript
async updateEquipmentLinks(wireDropId, linkSide, equipmentIds = []) {
  1. Get existing links for (wireDropId, linkSide)
  2. Calculate:
     - toInsert = new IDs not currently linked
     - toRemove = old IDs not in new list
  3. If toInsert.length > 0:
     - INSERT new rows into wire_drop_equipment_links
  4. If toRemove.length > 0:
     - DELETE old rows
  5. For all equipmentIds:
     - UPDATE sort_order to array index position
}
```

**Limitations**:
- Only 1:1 links (no quantities on links)
- Only side + sort_order stored on links
- No metadata on links themselves

---

## Part 5: Current Gaps & What Needs Merging

### 5.1 Major Gaps

#### Gap 1: Clients Endpoint Not Implemented
- **Problem**: `fetchClients()` in `unifiApi.js` returns empty array
- **Impact**: Commission tab can't show UniFi clients to assign
- **Needs**: Implementation of actual UniFi clients endpoint
- **Current**: Using `fetchDevices()` and filtering manually (not done yet)

#### Gap 2: Clients Auto-Selection UI Missing
- **Problem**: No UI to show available UniFi clients to user
- **Current**: `UniFiClientSelector` tries to call `fetchClients()` but gets nothing
- **Result**: Assignment form doesn't populate with client list
- **File**: `src/components/UniFiClientSelector.js` (lines 79-81)

#### Gap 3: Switch Port Assignment Not Working
- **Problem**: Network Port Assignment section in Head End tab never fully integrated
- **Current State**: 
  - UI exists to select switch and port (lines 2103-2141)
  - Save button calls `unifiService.linkWireDropToPort()`
  - But this never triggers commission completion
  - No feedback to user about what port is connected

#### Gap 4: No Merge of Room End & Head End Commissioning
- **Current**: Only room end equipment can be commissioned via UniFi client
- **Missing**: Head end equipment commissioning via UniFi switch port
- **Notes**: Placeholder says "coming in next phase" (line 2291)

#### Gap 5: MAC Address Field Access Inconsistent
- **Issue**: Fields exist but not clearly tied to equipment assignment
- **Current**: `project_equipment.unifi_client_mac` gets set but no bulk access
- **Missing**: Easy way to see which equipment has which MAC assigned
- **Needed**: Equipment detail view showing UniFi status

### 5.2 What Needs to Be Merged

#### To Make Commission Tab Fully Functional:

1. **Implement Clients Endpoint** (`unifiApi.js`)
   - Replace placeholder `fetchClients()` with real implementation
   - Could be:
     - Parsing clients from device data
     - New `/v1/clients` endpoint call
     - Tracking via device associations

2. **Fix UniFiClientSelector Component** (`UniFiClientSelector.js`)
   - Wait for actual client data from API
   - Current logic is correct, just needs data
   - Lines 53-89: already tries to fetch

3. **Implement Head End Port Assignment**
   - Add unifi_switch_port support to equipment assignment
   - Link head equipment to switch ports
   - Store port assignment for network tracking

4. **Add Equipment Detail View**
   - Show UniFi status for each equipment item
   - Display MAC addresses (device and client)
   - Show switch port assignment if applicable
   - Show last seen online timestamp

5. **Create Commissioning Workflow Summary**
   - Show both room and head end links for each wire drop
   - Display end-to-end path (room device → cable → switch port → head device)
   - Show verification status

---

## Part 6: Data Flow Summary

### 6.1 Creation Flow

```
User creates wire drop
  ↓
3 stages created (prewire, trim_out, commission)
  ↓
Wire drop appears in list with 0% completion
```

### 6.2 Room/Head End Equipment Assignment Flow

```
User opens wire drop detail
  ↓
Loads project equipment from project_equipment table
  ↓
Tabs display:
  - Room tab: shows room_end and both equipment
  - Head End tab: shows head_end and both equipment
  ↓
User checks checkboxes
  ↓
Calls wireDropService.updateEquipmentLinks()
  ↓
Updates wire_drop_equipment_links table
  ↓
Page reloads, shows selected equipment as badges
```

### 6.3 Stage Completion Flow (Prewire/Trim Out)

```
User clicks "Take/Upload Photo"
  ↓
File picker/camera dialog
  ↓
Image compressed
  ↓
Uploaded to SharePoint
  ↓
wireDropService.uploadStagePhoto() completes
  ↓
wire_drop_stages row updated:
  - completed=true
  - photo_url=sharePointUrl
  - completed_at=now
  - completed_by=user
  ↓
Wire drop % completion recalculated (33% per stage)
  ↓
Photo displays in stage tab
```

### 6.4 Commission Stage Completion Flow

```
User opens Commission tab
  ↓
Checks for room equipment (must be assigned first in Room tab)
  ↓
Displays UniFiClientSelector component
  ↓
User clicks "Load UniFi Clients"
  ↓
API fetches... (empty currently)
  ↓
User selects from dropdown (empty currently)
  ↓
Clicks "Assign Client & Complete Commission"
  ↓
Updates project_equipment:
  - unifi_client_mac=selectedMac
  - unifi_last_ip=ip
  - unifi_last_seen=now
  - unifi_data=fullData
  ↓
Updates wire_drop_stages:
  - completed=true
  - completed_by=user
  - completed_at=now
  ↓
Wire drop shows 100% completion
```

---

## Part 7: Key Files Reference

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| Wire Drop List | `/src/components/WireDropsList.js` | 125-150 | Completion tracking |
| Wire Drop Detail | `/src/components/WireDropDetailEnhanced.js` | 1-2500+ | Full detail + all tabs |
| Tabs Logic | `/src/components/WireDropDetailEnhanced.js` | 1420-1436 | Tab switching |
| Prewire Tab | `/src/components/WireDropDetailEnhanced.js` | 1439-1555 | Stage 1 photo |
| Room Tab | `/src/components/WireDropDetailEnhanced.js` | 1557-1881 | Stage 2 + room equipment |
| Head End Tab | `/src/components/WireDropDetailEnhanced.js` | 1883-2087 | Head equipment + ports |
| Commission Tab | `/src/components/WireDropDetailEnhanced.js` | 2208-2323 | UniFi verification |
| Wire Drop Service | `/src/services/wireDropService.js` | 1-826 | CRUD + stages |
| UniFi API | `/src/services/unifiApi.js` | 1-498 | API calls |
| UniFi Service | `/src/services/unifiService.js` | 1-189 | DB sync |
| UniFi Client Selector | `/src/components/UniFiClientSelector.js` | 1-253 | Equipment assignment |
| Equipment Service | `/src/services/projectEquipmentService.js` | 1-1341 | CSV import + CRUD |

---

## Conclusion

The wire drop system is **well-structured** with:
- Clear 4-tab organization (Prewire, Room, Head End, Commission)
- 3-stage completion tracking with photos
- Equipment linking via junction table
- Room/head end differentiation
- Partial UniFi integration

**Critical Missing**: UniFi clients endpoint implementation blocks commission workflow
**Ready to Integrate**: Head end port assignment UI exists, just needs finishing

