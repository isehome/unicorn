# Wire Drop Equipment Implementation Plan
**Final Scope Based on User Requirements**

---

## 📋 Summary of Findings

### ✅ What Already Exists

1. **`is_wire_drop_visible` Field** - Already implemented!
   - **Database**: `global_parts.is_wire_drop_visible` (boolean, default `true`)
   - **UI Locations**:
     - [PartsListPage.js](src/components/PartsListPage.js) - Quick toggle in list view ([line 175-183](src/components/PartsListPage.js#L175-L183))
     - [PartDetailPage.js](src/components/PartDetailPage.js) - Checkbox in edit form ([line 363-368](src/components/PartDetailPage.js#L363-L368))
   - **Already Filtered**: [WireDropDetailEnhanced.js:595](src/components/WireDropDetailEnhanced.js#L595) filters out items where `global_part?.is_wire_drop_visible !== false`

2. **Global Parts System**
   - **Access**: Bottom app bar → "Parts" button (2nd from left)
   - **List View**: [PartsListPage.js](src/components/PartsListPage.js)
   - **Detail View**: [PartDetailPage.js](src/components/PartDetailPage.js)
   - **Manager**: [GlobalPartsManager.js](src/components/GlobalPartsManager.js)

3. **Project Equipment System**
   - **Access**: Technician dashboard → Project detail → "Equipment List" dropdown → "Manage Project Equipment"
   - **List View**: [EquipmentListPage.js](src/components/EquipmentListPage.js)
   - **Manager**: [ProjectEquipmentManager.js](src/components/ProjectEquipmentManager.js)
   - **Relationship**: `project_equipment` table links to `global_parts` via `global_part_id`

4. **Wire Drop Equipment Links**
   - **Junction Table**: `wire_drop_equipment_links` (many-to-many)
   - **Service**: [wireDropService.js](src/services/wireDropService.js) has `updateEquipmentLinks()`
   - **Currently Used**: Room End and Head End tabs in [WireDropDetailEnhanced.js](src/components/WireDropDetailEnhanced.js)

---

## 🎯 Implementation Tasks

### Task 1: Add Equipment → Wire Drop Navigation ⭐ **NEW**

**Goal**: When viewing project equipment, show which wire drops are connected to it

**Location**: [EquipmentListPage.js](src/components/EquipmentListPage.js)

#### 1.1 Fetch Wire Drop Links
Add to equipment loading:

```javascript
// In loadEquipment function (line 106)
const loadEquipment = useCallback(async () => {
  try {
    setLoading(true);
    setError('');

    // Existing fetch
    const data = await projectEquipmentService.fetchProjectEquipment(projectId);

    // NEW: Fetch wire drop links for all equipment
    const { data: wireDropLinks } = await supabase
      .from('wire_drop_equipment_links')
      .select(`
        equipment_id,
        link_side,
        wire_drops (
          id,
          name,
          drop_name,
          type
        )
      `)
      .in('equipment_id', data.map(eq => eq.id));

    // Map wire drop links to equipment
    const wireDropsByEquipment = {};
    wireDropLinks?.forEach(link => {
      if (!wireDropsByEquipment[link.equipment_id]) {
        wireDropsByEquipment[link.equipment_id] = [];
      }
      wireDropsByEquipment[link.equipment_id].push({
        wireDropId: link.wire_drops.id,
        wireDropName: link.wire_drops.drop_name || link.wire_drops.name,
        wireDropType: link.wire_drops.type,
        linkSide: link.link_side
      });
    });

    // Update mapEquipmentRecord to include wire drops
    const mapped = (data || []).map(item => ({
      ...mapEquipmentRecord(item),
      wireDrops: wireDropsByEquipment[item.id] || []
    }));

    setEquipment(mapped);
  } catch (err) {
    console.error('Failed to load project equipment:', err);
    setError(err.message || 'Failed to load project equipment');
    setEquipment([]);
  } finally {
    setLoading(false);
  }
}, [projectId]);
```

#### 1.2 Display Wire Drops in Equipment Cards

Find the equipment card rendering section and add wire drop badges:

```jsx
{/* Equipment Card - add after notes/description */}
{item.wireDrops && item.wireDrops.length > 0 && (
  <div className="mt-3 pt-3 border-t" style={{ borderColor: cardStyles.borderColor }}>
    <div className="flex items-center gap-2 mb-2">
      <Cable size={14} className="text-violet-500" />
      <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
        Connected Wire Drops
      </span>
    </div>
    <div className="flex flex-wrap gap-2">
      {item.wireDrops.map(wd => (
        <button
          key={wd.wireDropId}
          onClick={() => navigate(`/wire-drops/${wd.wireDropId}`)}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:hover:bg-violet-900/50"
        >
          <span>{wd.wireDropName}</span>
          {wd.wireDropType && (
            <span className="text-[10px] opacity-75">({wd.wireDropType})</span>
          )}
        </button>
      ))}
    </div>
  </div>
)}
```

**Result**: User can click equipment in project → see connected wire drops → click to jump to wire drop detail

---

### Task 2: Improve Wire Drop Room Equipment Selector 🎨

**Goal**: Smart sorting with same-room equipment first, assigned items moved to bottom

**Location**: [WireDropDetailEnhanced.js](src/components/WireDropDetailEnhanced.js) lines 1545-1602

#### 2.1 Create Smart Sorted Equipment List

Replace current `roomGroupsForDisplay` with smarter sorting:

```javascript
// NEW: Smart sorted equipment for room end selector
const sortedRoomEquipment = useMemo(() => {
  const wireDropRoom = wireDrop?.room_name?.toLowerCase().trim();
  const alreadyAssignedIds = new Set(roomEquipmentSelection);

  // Categorize equipment
  const sameRoomUnassigned = [];
  const sameRoomAssigned = [];
  const otherRoomsUnassigned = [];
  const otherRoomsAssigned = [];

  nonHeadEquipment.forEach(item => {
    const itemRoom = item.project_rooms?.name?.toLowerCase().trim();
    const isSameRoom = itemRoom === wireDropRoom;
    const isAssigned = alreadyAssignedIds.has(item.id);

    if (isSameRoom && !isAssigned) {
      sameRoomUnassigned.push(item);
    } else if (isSameRoom && isAssigned) {
      sameRoomAssigned.push(item);
    } else if (!isSameRoom && !isAssigned) {
      otherRoomsUnassigned.push(item);
    } else {
      otherRoomsAssigned.push(item);
    }
  });

  // Sort each category alphabetically
  const sortAlpha = (a, b) => (a.name || '').localeCompare(b.name || '');
  sameRoomUnassigned.sort(sortAlpha);
  sameRoomAssigned.sort(sortAlpha);
  otherRoomsUnassigned.sort(sortAlpha);
  otherRoomsAssigned.sort(sortAlpha);

  return {
    sameRoomUnassigned,
    sameRoomAssigned,
    otherRoomsUnassigned,
    otherRoomsAssigned,
    hasOtherRooms: otherRoomsUnassigned.length > 0 || otherRoomsAssigned.length > 0
  };
}, [nonHeadEquipment, wireDrop, roomEquipmentSelection]);
```

#### 2.2 Update Rendering with "Show More" Button

```jsx
<div className="space-y-3">
  <div>
    <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
      Equipment in {wireDrop.room_name || 'this room'}
    </label>

    {/* Same Room - Unassigned (Primary List) */}
    {sortedRoomEquipment.sameRoomUnassigned.length > 0 ? (
      <div className="space-y-1 mb-3">
        {sortedRoomEquipment.sameRoomUnassigned.map(item => (
          <EquipmentSelectButton
            key={item.id}
            item={item}
            isSelected={roomEquipmentSelection.includes(item.id)}
            onClick={() => handleSelectRoomEquipment(item.id)}
            disabled={false}
          />
        ))}
      </div>
    ) : (
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
        No available equipment in this room
      </p>
    )}

    {/* Same Room - Assigned (Greyed Out, Bottom of Room List) */}
    {sortedRoomEquipment.sameRoomAssigned.length > 0 && (
      <div className="space-y-1 mb-3 pb-3 border-b border-dashed" style={{ borderColor: styles.card.borderColor }}>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
          Already Assigned
        </p>
        {sortedRoomEquipment.sameRoomAssigned.map(item => (
          <EquipmentSelectButton
            key={item.id}
            item={item}
            isSelected={true}
            onClick={() => handleDeselectRoomEquipment(item.id)}
            disabled={false}
            greyed={true}
          />
        ))}
      </div>
    )}

    {/* Show More Button */}
    {sortedRoomEquipment.hasOtherRooms && (
      <div className="mt-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAllRooms(!showAllRooms)}
          className="w-full"
        >
          {showAllRooms ? 'Hide Other Rooms' : 'Show Equipment from All Rooms'}
        </Button>
      </div>
    )}

    {/* Other Rooms (Expanded) */}
    {showAllRooms && (
      <div className="mt-3 pt-3 border-t" style={{ borderColor: styles.card.borderColor }}>
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
          Other Rooms
        </p>

        {/* Group by room */}
        {Object.entries(
          [...sortedRoomEquipment.otherRoomsUnassigned, ...sortedRoomEquipment.otherRoomsAssigned]
            .reduce((acc, item) => {
              const room = item.project_rooms?.name || 'Unassigned';
              if (!acc[room]) acc[room] = [];
              acc[room].push(item);
              return acc;
            }, {})
        ).map(([roomName, items]) => (
          <div key={roomName} className="mb-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{roomName}</p>
            <div className="space-y-1">
              {items.map(item => (
                <EquipmentSelectButton
                  key={item.id}
                  item={item}
                  isSelected={roomEquipmentSelection.includes(item.id)}
                  onClick={() => roomEquipmentSelection.includes(item.id)
                    ? handleDeselectRoomEquipment(item.id)
                    : handleSelectRoomEquipment(item.id)
                  }
                  greyed={roomEquipmentSelection.includes(item.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
</div>
```

#### 2.3 Create Reusable Equipment Button Component

```jsx
const EquipmentSelectButton = ({ item, isSelected, onClick, greyed = false, disabled = false }) => {
  const opacity = greyed ? '0.75' : '1';
  const bgColor = isSelected
    ? 'bg-violet-50 border-2 border-violet-400 dark:bg-violet-900/20 dark:border-violet-500'
    : 'border-2 border-transparent hover:bg-gray-50 dark:hover:bg-gray-800';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left p-3 rounded-lg transition-all ${bgColor}`}
      style={{ opacity }}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="font-medium text-gray-900 dark:text-gray-100">
            {item.name}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
            {item.project_rooms?.name && `${item.project_rooms.name} • `}
            {item.manufacturer} {item.model}
          </div>
          {item.part_number && (
            <div className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
              P/N: {item.part_number}
            </div>
          )}
        </div>
        {isSelected && (
          <div className="ml-3 flex-shrink-0">
            {greyed ? (
              <div className="px-2 py-1 rounded-md bg-gray-200 dark:bg-gray-700 text-xs font-medium text-gray-600 dark:text-gray-400">
                Assigned
              </div>
            ) : (
              <CheckCircle size={20} className="text-violet-600 dark:text-violet-400" />
            )}
          </div>
        )}
      </div>
    </button>
  );
};
```

#### 2.4 Add State Management

```javascript
// Add new state
const [showAllRooms, setShowAllRooms] = useState(false);

// Single-select behavior (replaces current multi-select for room end)
const handleSelectRoomEquipment = (equipmentId) => {
  setRoomEquipmentSelection([equipmentId]); // Single selection only
};

const handleDeselectRoomEquipment = (equipmentId) => {
  setRoomEquipmentSelection(prev => prev.filter(id => id !== equipmentId));
};
```

**Result**:
- Same room equipment shows first
- Assigned items move to bottom (75% opacity + "Assigned" badge)
- "Show More" reveals all other rooms
- Single-click selection (not checkboxes)

---

### Task 3: Add Equipment Display to Wire Drop Header 📍

**Goal**: Show connected equipment at top of wire drop page

**Location**: [WireDropDetailEnhanced.js](src/components/WireDropDetailEnhanced.js) after line 999

#### 3.1 Add After Info Badges

Insert this code block after the `infoBadges` section (line 999):

```jsx
{/* Connected Equipment Display */}
{!editing && selectedRoomEquipmentDetails.length > 0 && (
  <div className="mt-3">
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg border-2"
      style={{
        backgroundColor: mode === 'dark' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(187, 247, 208, 0.5)',
        borderColor: mode === 'dark' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(34, 197, 94, 0.6)'
      }}
    >
      <Monitor size={20} className="text-green-600 dark:text-green-400 flex-shrink-0" />
      <div className="flex-1">
        <div className="text-xs font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide">
          Room Equipment
        </div>
        <div className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5">
          {selectedRoomEquipmentDetails[0].name}
        </div>
        {(selectedRoomEquipmentDetails[0].manufacturer || selectedRoomEquipmentDetails[0].model) && (
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
            {selectedRoomEquipmentDetails[0].manufacturer} {selectedRoomEquipmentDetails[0].model}
          </div>
        )}
      </div>
      {selectedRoomEquipmentDetails.length > 1 && (
        <span className="ml-2 px-2 py-0.5 rounded-full bg-green-600 text-white text-xs font-bold">
          +{selectedRoomEquipmentDetails.length - 1}
        </span>
      )}
    </div>
  </div>
)}

{/* Not Connected State */}
{!editing && selectedRoomEquipmentDetails.length === 0 && (
  <div className="mt-3">
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-dashed"
      style={{
        backgroundColor: mode === 'dark' ? 'rgba(156, 163, 175, 0.1)' : 'rgba(243, 244, 246, 0.8)',
        borderColor: mode === 'dark' ? 'rgba(156, 163, 175, 0.3)' : 'rgba(156, 163, 175, 0.5)'
      }}
    >
      <AlertCircle size={20} className="text-gray-500 dark:text-gray-400 flex-shrink-0" />
      <div>
        <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
          Room Equipment
        </div>
        <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 mt-0.5">
          Not Connected
        </div>
      </div>
    </div>
  </div>
)}
```

**Result**: User sees equipment status immediately at top of page without scrolling

---

### Task 4: Create Commission Tab with UniFi Client Selector 🌐 **NEW**

**Goal**: Add 4th tab for commissioning with UniFi network client assignment

**Location**: [WireDropDetailEnhanced.js](src/components/WireDropDetailEnhanced.js)

#### 4.1 Update Tab Navigation

Find the tab buttons (search for `activeTab === 'prewire'`) and add Commission tab:

```jsx
{/* Tab Navigation */}
<div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
  <button
    onClick={() => setActiveTab('prewire')}
    className={`px-4 py-2 font-medium text-sm transition-colors ${
      activeTab === 'prewire'
        ? 'border-b-2 border-violet-500 text-violet-600 dark:text-violet-400'
        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
    }`}
  >
    Pre-Wire
  </button>

  <button
    onClick={() => setActiveTab('room')}
    className={`px-4 py-2 font-medium text-sm transition-colors ${
      activeTab === 'room'
        ? 'border-b-2 border-violet-500 text-violet-600 dark:text-violet-400'
        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
    }`}
  >
    Room
  </button>

  <button
    onClick={() => setActiveTab('head-end')}
    className={`px-4 py-2 font-medium text-sm transition-colors ${
      activeTab === 'head-end'
        ? 'border-b-2 border-violet-500 text-violet-600 dark:text-violet-400'
        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
    }`}
  >
    Head End
  </button>

  {/* NEW: Commission Tab */}
  <button
    onClick={() => setActiveTab('commission')}
    className={`px-4 py-2 font-medium text-sm transition-colors flex items-center gap-2 ${
      activeTab === 'commission'
        ? 'border-b-2 border-violet-500 text-violet-600 dark:text-violet-400'
        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
    }`}
  >
    <Network size={16} />
    Commission
  </button>
</div>
```

#### 4.2 Add Commission Tab Content

After the head-end tab content, add new commission tab:

```jsx
{/* Commission Tab */}
{activeTab === 'commission' && (
  <div className="space-y-6">
    <div className="rounded-2xl overflow-hidden" style={styles.card}>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2" style={styles.textPrimary}>
            <Network size={20} />
            Network Commissioning
          </h3>
          {commissionStage?.completed ? (
            <CheckCircle size={24} className="text-green-500" />
          ) : (
            <Circle size={24} className="text-gray-400" />
          )}
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400">
          Verify network connectivity by assigning UniFi clients to equipment endpoints.
        </p>

        {/* Room End Equipment + UniFi Client */}
        <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2" style={styles.textPrimary}>
            <Monitor size={16} />
            Room End Device
          </h4>

          {selectedRoomEquipmentDetails.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {selectedRoomEquipmentDetails[0].name}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {selectedRoomEquipmentDetails[0].manufacturer} {selectedRoomEquipmentDetails[0].model}
                  </div>
                </div>
              </div>

              {/* UniFi Client Dropdown */}
              <UniFiClientSelector
                projectId={wireDrop.project_id}
                equipmentId={selectedRoomEquipmentDetails[0].id}
                wireDropId={wireDrop.id}
                onAssign={handleUniFiClientAssign}
              />
            </div>
          ) : (
            <div className="p-3 rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                No room equipment assigned. Go to the Room tab to select equipment first.
              </p>
            </div>
          )}
        </div>

        {/* Head End Equipment + UniFi Port (Future) */}
        <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2" style={styles.textPrimary}>
            <Server size={16} />
            Head End Connection
          </h4>

          {selectedHeadEquipmentDetails.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {selectedHeadEquipmentDetails[0].name}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {selectedHeadEquipmentDetails[0].manufacturer} {selectedHeadEquipmentDetails[0].model}
                  </div>
                </div>
              </div>

              {/* Placeholder for UniFi Port Selector */}
              <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  🚧 UniFi switch port selector coming in next phase
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-md bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                No head-end equipment assigned yet.
              </p>
            </div>
          )}
        </div>

        {/* Auto-Complete Notice */}
        {!commissionStage?.completed && (
          <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700">
            <div className="flex items-start gap-3">
              <CheckCircle size={20} className="text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-900 dark:text-green-100 mb-1">
                  Auto-Complete Enabled
                </p>
                <p className="text-xs text-green-700 dark:text-green-300">
                  This stage will be automatically marked complete when you assign a UniFi client to the room equipment.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
)}
```

#### 4.3 Create UniFi Client Selector Component

**New File**: `src/components/UniFiClientSelector.js`

```javascript
import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import unifiApi from '../services/unifiApi';
import { Network, Wifi, WifiOff, CheckCircle, Loader } from 'lucide-react';
import Button from './ui/Button';

const UniFiClientSelector = ({ projectId, equipmentId, wireDropId, onAssign }) => {
  const { mode } = useTheme();
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState([]);
  const [selectedClientMac, setSelectedClientMac] = useState('');
  const [currentAssignment, setCurrentAssignment] = useState(null);
  const [unifiUrl, setUnifiUrl] = useState('');
  const [error, setError] = useState('');

  // Load project UniFi URL
  useEffect(() => {
    const loadProject = async () => {
      const { data } = await supabase
        .from('projects')
        .select('unifi_url')
        .eq('id', projectId)
        .single();

      if (data?.unifi_url) {
        setUnifiUrl(data.unifi_url);
      } else {
        setError('No UniFi URL configured for this project');
      }
    };
    loadProject();
  }, [projectId]);

  // Load current assignment
  useEffect(() => {
    const loadAssignment = async () => {
      const { data } = await supabase
        .from('project_equipment')
        .select('unifi_client_mac, unifi_last_ip, unifi_last_seen, unifi_data')
        .eq('id', equipmentId)
        .single();

      if (data?.unifi_client_mac) {
        setCurrentAssignment(data);
        setSelectedClientMac(data.unifi_client_mac);
      }
    };
    loadAssignment();
  }, [equipmentId]);

  // Fetch UniFi clients
  const handleFetchClients = async () => {
    if (!unifiUrl) {
      setError('No UniFi URL configured');
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Parse site ID from URL
      const match = unifiUrl.match(/\/consoles\/([^\/]+)/);
      const consoleId = match ? match[1] : null;

      if (!consoleId) {
        throw new Error('Could not parse console ID from UniFi URL');
      }

      // Fetch sites/hosts
      const sitesData = await unifiApi.fetchSites(unifiUrl);
      const hostId = sitesData.data[0]?.id;

      if (!hostId) {
        throw new Error('No UniFi host found');
      }

      // Fetch clients
      const clientsData = await unifiApi.fetchClients(hostId, unifiUrl);
      setClients(clientsData.data || []);

    } catch (err) {
      console.error('Failed to fetch UniFi clients:', err);
      setError(err.message || 'Failed to fetch UniFi clients');
    } finally {
      setLoading(false);
    }
  };

  // Handle assignment
  const handleAssign = async () => {
    const selectedClient = clients.find(c => c.mac === selectedClientMac);
    if (!selectedClient) return;

    try {
      setLoading(true);

      // Update equipment with UniFi data
      const { error: updateError } = await supabase
        .from('project_equipment')
        .update({
          unifi_client_mac: selectedClient.mac,
          unifi_last_ip: selectedClient.ip,
          unifi_last_seen: new Date().toISOString(),
          unifi_data: selectedClient
        })
        .eq('id', equipmentId);

      if (updateError) throw updateError;

      // Mark commission stage complete
      await supabase.rpc('complete_wire_drop_stage', {
        p_wire_drop_id: wireDropId,
        p_stage_type: 'commission',
        p_notes: `Device verified online: ${selectedClient.hostname || selectedClient.name || selectedClient.mac}`,
        p_completed_by: (await supabase.auth.getUser()).data.user?.id
      });

      setCurrentAssignment({
        unifi_client_mac: selectedClient.mac,
        unifi_last_ip: selectedClient.ip,
        unifi_last_seen: new Date().toISOString(),
        unifi_data: selectedClient
      });

      if (onAssign) onAssign(selectedClient);

    } catch (err) {
      console.error('Failed to assign UniFi client:', err);
      setError(err.message || 'Failed to assign client');
    } finally {
      setLoading(false);
    }
  };

  // Format last seen time
  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000 / 60); // minutes
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return `${Math.floor(diff / 1440)}d ago`;
  };

  return (
    <div className="space-y-4">
      {/* Current Assignment Display */}
      {currentAssignment && (
        <div className="p-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700">
          <div className="flex items-start gap-3">
            <CheckCircle size={20} className="text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-900 dark:text-green-100">
                Network Client Assigned
              </p>
              <div className="mt-2 space-y-1 text-xs text-green-800 dark:text-green-200">
                <div><strong>IP:</strong> {currentAssignment.unifi_last_ip || 'N/A'}</div>
                <div><strong>MAC:</strong> {currentAssignment.unifi_client_mac}</div>
                <div><strong>Last Seen:</strong> {formatLastSeen(currentAssignment.unifi_last_seen)}</div>
                {currentAssignment.unifi_data?.hostname && (
                  <div><strong>Hostname:</strong> {currentAssignment.unifi_data.hostname}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fetch Button */}
      {!currentAssignment && (
        <Button
          variant="primary"
          icon={loading ? Loader : Network}
          onClick={handleFetchClients}
          disabled={loading || !unifiUrl}
          loading={loading}
        >
          {loading ? 'Loading Clients...' : 'Load UniFi Clients'}
        </Button>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Client Selector Dropdown */}
      {clients.length > 0 && (
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
            Select Network Client
          </label>

          <select
            value={selectedClientMac}
            onChange={(e) => setSelectedClientMac(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          >
            <option value="">-- Select a device --</option>
            {clients.map(client => {
              const displayName = client.hostname || client.name || 'Unknown Device';
              const isOnline = client.is_wired !== undefined || client.uptime > 0;

              return (
                <option key={client.mac} value={client.mac}>
                  {displayName} - {client.ip || 'No IP'} - {client.mac}
                  {isOnline ? ' (Online)' : ' (Offline)'}
                </option>
              );
            })}
          </select>

          <Button
            variant="primary"
            onClick={handleAssign}
            disabled={!selectedClientMac || loading}
            loading={loading}
          >
            Assign Client
          </Button>
        </div>
      )}
    </div>
  );
};

export default UniFiClientSelector;
```

#### 4.4 Add Database Fields to project_equipment

**Migration**: `supabase/add_unifi_fields_to_equipment.sql`

```sql
-- Add UniFi tracking fields to project_equipment table
ALTER TABLE project_equipment ADD COLUMN IF NOT EXISTS
  unifi_client_mac TEXT;

ALTER TABLE project_equipment ADD COLUMN IF NOT EXISTS
  unifi_last_ip TEXT;

ALTER TABLE project_equipment ADD COLUMN IF NOT EXISTS
  unifi_last_seen TIMESTAMPTZ;

ALTER TABLE project_equipment ADD COLUMN IF NOT EXISTS
  unifi_data JSONB;

-- Create index for MAC lookups
CREATE INDEX IF NOT EXISTS idx_project_equipment_unifi_mac
  ON project_equipment(unifi_client_mac)
  WHERE unifi_client_mac IS NOT NULL;

COMMENT ON COLUMN project_equipment.unifi_client_mac IS 'MAC address of assigned UniFi network client';
COMMENT ON COLUMN project_equipment.unifi_last_ip IS 'Most recent IP address from UniFi';
COMMENT ON COLUMN project_equipment.unifi_last_seen IS 'Last time device was seen online via UniFi';
COMMENT ON COLUMN project_equipment.unifi_data IS 'Full UniFi client data snapshot (JSON)';
```

**Result**: Commission tab allows manual UniFi client assignment and auto-completes the stage

---

## 📊 Implementation Order

1. **Task 1** - Equipment → Wire Drop links (30 min)
2. **Task 3** - Equipment display in header (20 min)
3. **Task 2** - Smart sorted equipment selector (45 min)
4. **Task 4** - Commission tab + UniFi selector (90 min)

**Total Estimated Time**: ~3 hours

---

## ✅ Testing Checklist

- [ ] Global parts `is_wire_drop_visible` checkbox works in Parts list/detail pages
- [ ] Equipment list shows wire drop badges for connected items
- [ ] Clicking wire drop badge navigates to wire drop detail
- [ ] Wire drop header shows connected equipment (green badge)
- [ ] Wire drop header shows "Not Connected" when no equipment
- [ ] Room equipment selector shows same-room items first
- [ ] Assigned equipment moves to bottom with 75% opacity
- [ ] "Show More" button reveals other rooms
- [ ] Single-click selection (not multi-select)
- [ ] Commission tab loads and displays
- [ ] UniFi clients fetch from API successfully
- [ ] Client dropdown populates with all devices
- [ ] Assigning client updates equipment record
- [ ] Commission stage auto-completes after assignment
- [ ] Network data (IP, MAC, hostname) displays correctly

---

## 🚀 Next Phase (Deferred)

- Head-end UniFi port selector (switch + port number)
- Auto-matching clients to equipment by name/room
- Real-time network status updates
- Historical connection data tracking

---

## 📝 Questions Answered

1. ✅ **is_wire_drop_visible already exists** - Use existing field, already implemented in UI
2. ✅ **Equipment detail page** - Create wire drop links in EquipmentListPage cards
3. ✅ **Commission tab location** - 4th tab in WireDropDetailEnhanced
4. ✅ **UniFi assignment** - Manual dropdown selection, auto-completes stage
5. ✅ **Single vs multi-select** - Single selection for room end
6. ✅ **Visual treatment** - 75% opacity + "Assigned" badge at bottom of room section
