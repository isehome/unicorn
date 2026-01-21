# Network Tab Equipment Connection Debug - Session Prompt

## Context

I'm working on the **Unicorn** project - a React/Supabase app for low-voltage installation management. The Rack Layout page has a Network tab that shows switch port connections.

## The Bug

A device (DHI-NVR42A16-16P) shows a network link (IP/MAC address) on the **Front tab** but doesn't appear in the **Network tab** port connections list. The Network tab should show all devices connected to switch ports.

## Reference Documentation

Read **AGENT.md** section: **"Network Tab Port Connections & Equipment Edit Modal (January 2026)"**

This section documents:
- The `getPortConnections()` function that builds port-to-device mappings
- How equipment is linked via `ha_client_mac`
- The 4 data sources checked (equipment networkInfo, haClients, haDevices, port_table)
- Known causes for missing equipment

## Key Files to Investigate

| File | Purpose |
|------|---------|
| `src/components/Rack/RackBackView.jsx` | Network tab component - contains `getPortConnections()` around line 1350 |
| `src/pages/RackLayoutPage.js` | Parent page - provides `haClients`, `haDevices`, `equipment` props |
| `src/components/Rack/EquipmentEditModal.jsx` | Shared modal - shows network info for equipment |

## Key Function: `getPortConnections()`

Located in `RackBackView.jsx` around line 1350. This builds a Map of switch ports to connected devices.

**The function checks 4 data sources:**
1. Equipment already linked to switch (via `networkInfo.switchPort`)
2. HA clients (via `haClients` prop) - matches `client.switch_name` and `client.switch_port`
3. HA devices (via `haDevices` prop) - matches `device.uplink_switch_name` and `device.uplink_switch_port`
4. Raw port table from UniFi (fills in remaining active ports)

**Bug likely occurs in Section 2 or 3** - the equipment lookup:
```javascript
const linkedEquipment = client.mac
  ? equipment.find(e => e.ha_client_mac?.toLowerCase() === client.mac.toLowerCase())
  : null;
```

## Testing Environment

- **Browser:** Use Claude in Chrome extension (already connected)
- **URL:** `http://localhost:3001/projects/32e2fa08-3551-4749-b749-7478aa4781ce/rack-layout`
- **Tab ID:** 1810287877 (may change - use `tabs_context_mcp` to verify)

## Debug Steps

1. Add console logging to `getPortConnections()` to trace:
   - What `haClients` data exists for the DHI-NVR device
   - Whether `client.switch_name` matches the switch equipment
   - Whether `client.switch_port` is populated
   - Whether the MAC lookup finds the equipment

2. Check if the device's HA client data has:
   - `switch_name` that matches "USW-Pro-24-PoE" or similar
   - `switch_port` with a valid port number
   - `mac` that matches `project_equipment.ha_client_mac`

3. Verify data flow from `RackLayoutPage.js`:
   - Is the DHI-NVR included in `haClients` array?
   - Does its `switch_port` field have a value?

## Expected Outcome

The DHI-NVR device should appear in the Network tab as a connected device, showing:
- Which switch port it's connected to
- A connection line when clicking on that port
- The device's IP/hostname in the port's device list

---

**Start the dev server:** `cd /sessions/ecstatic-keen-rubin/mnt/unicorn && npm start`
