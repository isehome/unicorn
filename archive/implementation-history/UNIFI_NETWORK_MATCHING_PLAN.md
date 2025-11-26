# UniFi Network Device Matching - Implementation Plan

## 🎯 Overview

Integrate UniFi API client data with project equipment to show real-time network information (IP address, switch port, connection status) for each wire drop.

---

## Current Infrastructure

### Existing UniFi Integration
- **API Service**: `/src/services/unifiApi.js` - Frontend API calls
- **Proxy**: `/api/unifi-proxy.js` - Secure backend proxy
- **Test Page**: `/src/components/UnifiTestPage.js` (accessible via bottom app bar)
- **Project Field**: `projects.unifi_url` - Stores controller URL with site ID
- **Documentation**: `/UNIFI_INTEGRATION_GUIDE.md`

### Data Structure
```
wire_drops (1) → (1) wire_drop_room_end (client device)
           (1) → (1) wire_drop_head_end (switch port)
           (N) → (1) project_rooms

project_equipment (N) → (1) project_rooms
                  (N) → (1) global_parts

equipment (master catalog)
  - ip_address field
  - mac_address field
```

---

## 🎯 What We Can Achieve

### For Each Wire Drop, Display:
**Room End (Client Device):**
- Device name (Apple TV - Living Room)
- IP Address: 192.168.1.155
- MAC Address: 12:34:56:78:9A:BC
- Connection Status: Connected (last seen 2 hours ago)
- Connection Type: Wired/Wireless

**Head End (Switch Port):**
- Switch Name: US-24-250W
- Port Number: 18
- Port Config: POE+, 1000 Mbps
- VLAN: 10 (Devices)
- Cable run to: Living Room

---

## 🏗️ Architecture

```
Project.unifi_url
    ↓
Parse site ID → Fetch UniFi Clients via /api/unifi-proxy
    ↓
Match clients to equipment by:
  1. MAC address (exact match)
  2. Name similarity (fuzzy matching)
  3. Room/location context
    ↓
Store in wire_drop_room_end.unifi_data
Display in WireDropDetailEnhanced component
```

---

## 📋 Implementation Phases

### Phase 1: Implement Client API Endpoint ✓
**File**: `/src/services/unifiApi.js:80-82`

Currently returns empty array. Need to implement:
```javascript
export const fetchClients = async (hostId, controllerUrl) => {
  const response = await fetch('/api/unifi-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: '/v1/clients',
      params: { hostId }
    })
  });
  // Parse and return client data
};
```

### Phase 2: Database Schema Extensions

**Migration File**: `/supabase/add_unifi_network_tracking.sql`

```sql
-- Add network tracking to room-end equipment
ALTER TABLE wire_drop_room_end ADD COLUMN IF NOT EXISTS
  unifi_client_mac TEXT,           -- MAC address for matching
  unifi_last_seen TIMESTAMPTZ,     -- Last network activity
  unifi_last_ip TEXT,              -- Most recent IP address
  unifi_data JSONB;                -- Full client snapshot

-- Add switch port tracking to head-end
ALTER TABLE wire_drop_head_end ADD COLUMN IF NOT EXISTS
  unifi_switch_mac TEXT,           -- Switch device MAC
  unifi_port_idx INTEGER,          -- Physical port number
  unifi_last_sync TIMESTAMPTZ,     -- Last sync timestamp
  unifi_port_data JSONB;           -- Port config/stats

-- Optional: Add to equipment master catalog
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS
  unifi_client_mac TEXT,
  unifi_last_ip TEXT,
  unifi_last_seen TIMESTAMPTZ;

-- Create index for faster MAC lookups
CREATE INDEX IF NOT EXISTS idx_wire_drop_room_end_unifi_mac
  ON wire_drop_room_end(unifi_client_mac);
CREATE INDEX IF NOT EXISTS idx_equipment_mac
  ON equipment(mac_address);
```

### Phase 3: Matching Service

**New File**: `/src/services/unifiMatchingService.js`

```javascript
/**
 * Match UniFi clients to equipment and wire drops
 */
export const matchClientsToEquipment = (clients, equipment, wireDrops) => {
  // 1. Exact MAC match (100% confidence)
  // 2. Name-based fuzzy matching (70-90% confidence)
  // 3. Room context matching (50-70% confidence)
};

/**
 * Find which switch port a client is connected to
 */
export const findSwitchPort = (clientMac, devices) => {
  // Parse device port tables
  // Return switch MAC + port number
};

/**
 * Pull UniFi data and update database
 */
export const syncNetworkData = async (projectId) => {
  // 1. Fetch project.unifi_url
  // 2. Parse site ID
  // 3. Fetch clients from UniFi
  // 4. Fetch devices (switches) from UniFi
  // 5. Run matching algorithm
  // 6. Update wire_drop_room_end and wire_drop_head_end tables
  // 7. Return sync summary
};

/**
 * Get enriched network info for a wire drop
 */
export const getWireDropNetworkInfo = async (wireDropId) => {
  // Join wire_drop + room_end + head_end + unifi_data
  // Return formatted object for UI
};
```

### Phase 4: UI Enhancements

**File**: `/src/components/WireDropDetailEnhanced.js`

Add network info section to Room End card:

```jsx
{/* Room End Equipment */}
<div className="equipment-card">
  <h3>Room End: Living Room</h3>
  <p>Apple TV - Living Room</p>
  <p>Model: Apple TV 4K (2022)</p>

  {/* NEW: Network Info Section */}
  {networkInfo && (
    <div className="network-info">
      <h4>🌐 Network Info</h4>
      <div className="network-details">
        <span>IP: {networkInfo.ip_address}</span>
        <span>MAC: {networkInfo.mac_address}</span>
        <span className={networkInfo.is_connected ? 'connected' : 'disconnected'}>
          Status: {networkInfo.is_connected ? '● Connected' : '○ Offline'}
        </span>
        <span>Last Seen: {formatTimeAgo(networkInfo.last_seen)}</span>
        <span>Type: {networkInfo.is_wired ? 'Wired' : 'Wireless'}</span>
      </div>
    </div>
  )}
</div>

{/* Head End Equipment */}
<div className="equipment-card">
  <h3>Head End: Rack</h3>

  {/* NEW: Switch Port Info */}
  {portInfo && (
    <div className="port-info">
      <p>Connected to: {portInfo.switch_name}</p>
      <p>Port: {portInfo.port_number} ({portInfo.poe_mode}, {portInfo.speed})</p>
      <p>VLAN: {portInfo.vlan_id} ({portInfo.vlan_name})</p>
      <p>Cable run to: {wireDropData.room_name}</p>
    </div>
  )}
</div>
```

### Phase 5: Sync Integration

**File**: `/src/components/PMProjectViewEnhanced.js`

Add "Sync Network Devices" button:

```jsx
<Button
  onClick={handleSyncUnifiDevices}
  disabled={!project.unifi_url}
  title={!project.unifi_url ? 'Set UniFi URL first' : 'Sync network devices'}
>
  🔄 Sync Network Devices
</Button>

const handleSyncUnifiDevices = async () => {
  const summary = await unifiMatchingService.syncNetworkData(projectId);
  showToast(`Matched ${summary.matched} of ${summary.total} devices`);
};
```

---

## 🎨 Matching Algorithm Details

### 1. Exact MAC Match (100% Confidence)
```javascript
if (equipment.mac_address === client.mac) {
  return { match: true, confidence: 1.0, method: 'MAC' };
}
```

### 2. Name-Based Fuzzy Matching (70-90% Confidence)

**Examples:**
- `"Apple TV - Living Room"` (equipment) ↔ `"Apple-TV-Living-Room"` (UniFi hostname)
- `"Samsung TV"` (equipment in "Master Bedroom" room) ↔ `"SamsungTV-Master"` (UniFi)

**Algorithm:**
1. Normalize both names (lowercase, remove special chars)
2. Check for substring matches
3. Apply Levenshtein distance for typos
4. Boost score if room name appears in hostname
5. Boost score if manufacturer/model matches

```javascript
const normalized1 = name1.toLowerCase().replace(/[^a-z0-9]/g, '');
const normalized2 = name2.toLowerCase().replace(/[^a-z0-9]/g, '');

if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
  confidence = 0.85;
}

const distance = levenshteinDistance(normalized1, normalized2);
if (distance <= 3) {
  confidence = 0.75;
}
```

### 3. Room Context Matching (50-70% Confidence)

If equipment is in "Living Room" and only one Apple TV client seen on network:
```javascript
const roomClients = clients.filter(c =>
  c.hostname?.toLowerCase().includes(room.name.toLowerCase())
);

if (roomClients.length === 1) {
  return { match: true, confidence: 0.65, method: 'ROOM_CONTEXT' };
}
```

### 4. Manual Override

UI allows user to:
- Manually select a UniFi client from dropdown
- Accept/reject suggested matches
- Clear incorrect matches

---

## 🔌 Switch Port Discovery

**How UniFi Reports Connections:**

Clients include `sw_mac` and `sw_port` fields:
```json
{
  "mac": "12:34:56:78:9a:bc",
  "ip": "192.168.1.155",
  "hostname": "Apple-TV-Living-Room",
  "sw_mac": "fc:ec:da:11:22:33",  // Switch MAC
  "sw_port": 18,                   // Physical port
  "is_wired": true,
  "uptime": 86400
}
```

**Algorithm:**
1. Find client by MAC
2. Extract `sw_mac` and `sw_port`
3. Look up switch device by MAC in devices list
4. Fetch port configuration from switch `port_table`
5. Return enriched port info (VLAN, POE, speed)

---

## 📊 Data Flow Example

### Initial State
```
Wire Drop: "CAT6-001"
  Room: Living Room
  Room End: (empty)
  Head End: (empty)
```

### After Equipment Assignment
```
Wire Drop: "CAT6-001"
  Room: Living Room
  Room End:
    Equipment: "Apple TV - Living Room"
    Model: Apple TV 4K
  Head End: (empty)
```

### After UniFi Sync
```
Wire Drop: "CAT6-001"
  Room: Living Room
  Room End:
    Equipment: "Apple TV - Living Room"
    Model: Apple TV 4K
    Network:
      IP: 192.168.1.155
      MAC: 12:34:56:78:9a:bc
      Status: Connected (2h ago)
      Type: Wired
  Head End:
    Switch: US-24-250W
    Port: 18 (POE+, 1000 Mbps)
    VLAN: 10 (Devices)
```

---

## 🚧 Edge Cases to Handle

1. **Multiple devices with same name**
   - Require manual selection
   - Show confidence scores

2. **Wireless devices**
   - No switch port info
   - Show AP name instead

3. **Offline devices**
   - Show last seen timestamp
   - Keep cached data

4. **Guest/temporary devices**
   - Don't auto-match
   - Allow manual exclusion

5. **VLAN segmentation**
   - Same device name across VLANs
   - Use VLAN context for matching

---

## 🎯 Success Metrics

- **Match Rate**: 80%+ of wire drops auto-matched to clients
- **Accuracy**: <5% false positives requiring manual correction
- **Sync Speed**: <10 seconds for 100 wire drops
- **User Experience**: One-click sync, clear confidence indicators

---

## 📝 Future Enhancements

1. **Real-time Updates**: WebSocket connection to UniFi for live status
2. **Historical Data**: Track IP changes, connection drops over time
3. **Alerts**: Notify when expected device goes offline
4. **Port Monitoring**: Graph bandwidth usage per wire drop
5. **Auto-documentation**: Generate network diagrams from wire drop data

---

## 🔐 Security Considerations

- UniFi API key stored in environment variables only
- Client data cached in database (not sensitive)
- MAC addresses hashed if required for privacy
- RLS policies on wire_drop tables prevent unauthorized access

---

## 📚 Related Files

- `/src/services/unifiApi.js` - API client
- `/src/services/unifiService.js` - Supabase sync
- `/src/components/UnifiTestPage.js` - Test interface
- `/src/components/WireDropDetailEnhanced.js` - Wire drop detail view
- `/api/unifi-proxy.js` - Backend proxy
- `/UNIFI_INTEGRATION_GUIDE.md` - Setup documentation
