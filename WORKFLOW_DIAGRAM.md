# Project Workflow & Status Gauge System

## Complete Project Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PROJECT CREATION                            │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ 1. PM Creates Project                                       │    │
│  │    - Name, Address, Client                                  │    │
│  │    - Lucid diagram URL                                      │    │
│  │    - Portal proposal CSV                                    │    │
│  │    - SharePoint links                                       │    │
│  │                                                              │    │
│  │ Status: Planning & Design = 100%                            │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      EQUIPMENT SETUP                                │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ 2. PM Imports CSV                                           │    │
│  │    - project_equipment records created                      │    │
│  │    - planned_quantity set from CSV                          │    │
│  │    - Links to global_parts catalog                          │    │
│  │                                                              │    │
│  │ 3. PM Marks Prewire Items (in Global Catalog)              │    │
│  │    - global_parts.required_for_prewire = true               │    │
│  │    - Examples: CAT6 wire, brackets, conduit                 │    │
│  │    - Inherited by all projects automatically                │    │
│  │                                                              │    │
│  │ Status: Prewire Prep = 0%, Trim Prep = 0%                  │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      PREWIRE PHASE                                  │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ 4. PM Orders Prewire Equipment                              │    │
│  │    - Updates ordered_quantity for each item                 │    │
│  │    - Only items where required_for_prewire = true           │    │
│  │                                                              │    │
│  │ Status: Prewire Prep = 50% ████████░░░░░░░░░░              │    │
│  │         (ordered but not received)                          │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ 5. Technician Receives Shipment                             │    │
│  │    Route: /projects/:id/receiving                           │    │
│  │    Phase: Prewire                                           │    │
│  │                                                              │    │
│  │    Option A: Full Shipment                                  │    │
│  │      [Receive All 50 Items] ← Click                         │    │
│  │      → received_quantity = ordered_quantity                 │    │
│  │                                                              │    │
│  │    Option B: Partial Shipment                               │    │
│  │      CAT6 Cable                                             │    │
│  │      Planned: 200  Ordered: 200  Received: [150] ← Type    │    │
│  │      ⚠️ Shortage: 50 units needed                           │    │
│  │                                                              │    │
│  │ Status: Prewire Prep = 87.5% ████████████████░░░░          │    │
│  │         (ordered 100%, received 75%)                        │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ 6. PM Re-orders Shortage                                    │    │
│  │    - ordered_quantity = 200 → 250 (add 50)                  │    │
│  │    - Technician receives 50 more                            │    │
│  │    - received_quantity = 150 → 200                          │    │
│  │                                                              │    │
│  │ Status: Prewire Prep = 100% ████████████████████████        │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ 7. Technicians Install Prewire                              │    │
│  │    - Wire drops created in Lucid                            │    │
│  │    - Technicians upload prewire photos                      │    │
│  │    - Mark wire_drop_stages.completed = true                 │    │
│  │                                                              │    │
│  │ Status: Prewire = (photos uploaded / total drops) × 100     │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                        TRIM PHASE                                   │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ 8. PM Orders Trim Equipment                                 │    │
│  │    - Updates ordered_quantity for trim items                │    │
│  │    - Only items where required_for_prewire != true          │    │
│  │                                                              │    │
│  │ Status: Trim Prep = 50% ████████░░░░░░░░░░                 │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ 9. Technician Receives Trim Shipment                        │    │
│  │    Route: /projects/:id/receiving                           │    │
│  │    Phase: Trim ← Toggle to trim items                       │    │
│  │                                                              │    │
│  │    [Receive All 30 Items] ← Click                           │    │
│  │                                                              │    │
│  │ Status: Trim Prep = 100% ████████████████████████           │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ 10. Technicians Install Trim                                │    │
│  │     - Upload trim photos                                    │    │
│  │     - Mark equipment_attached = true                        │    │
│  │     - Mark wire_drop_stages.completed = true                │    │
│  │                                                              │    │
│  │ Status: Trim = (photos + equipment / total drops) × 100     │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                     COMMISSIONING & HANDOFF                         │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ 11. PM Assigns Equipment to Head-End                        │    │
│  │     - project_rooms.is_headend = true                       │    │
│  │     - project_equipment.room_id = head_end_room.id          │    │
│  │                                                              │    │
│  │ Status: Commissioning = 100%                                │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Status Gauge Calculation Details

### Prewire Prep & Trim Prep Formula

```javascript
// Get all items for this phase
const items = equipment.filter(item => {
  // Prewire: required_for_prewire = true
  // Trim: required_for_prewire != true
  return item.global_part?.required_for_prewire === isPrewire;
});

// Sum quantities
const totalPlanned = sum(items.map(i => i.planned_quantity));
const totalOrdered = sum(items.map(i => i.ordered_quantity));
const totalReceived = sum(items.map(i => i.received_quantity));

// Calculate percentage (additive)
const orderedPercent = (totalOrdered / totalPlanned) × 50;
const receivedPercent = (totalReceived / totalPlanned) × 50;
const finalPercent = orderedPercent + receivedPercent;
```

### Example Calculation

```
Prewire Items:
┌─────────────────┬─────────┬─────────┬──────────┐
│ Item            │ Planned │ Ordered │ Received │
├─────────────────┼─────────┼─────────┼──────────┤
│ CAT6 Cable      │ 200     │ 200     │ 150      │
│ Keystone Jack   │ 50      │ 50      │ 50       │
│ Wall Plate      │ 50      │ 50      │ 50       │
│ Wire Bracket    │ 100     │ 100     │ 100      │
├─────────────────┼─────────┼─────────┼──────────┤
│ TOTALS          │ 400     │ 400     │ 350      │
└─────────────────┴─────────┴─────────┴──────────┘

Calculation:
  Ordered% = (400 / 400) × 50 = 50%
  Received% = (350 / 400) × 50 = 43.75%

  Final = 50% + 43.75% = 93.75% ≈ 94%
```

---

## UI Screenshots (Conceptual)

### PM Dashboard View
```
┌───────────────────────────────────────────────────────────┐
│ Project: Smith Residence                                   │
│                                                            │
│ Prewire Prep   [████████████████░░░░] 87%  ⚠️ Shortage   │
│ Prewire        [██████████░░░░░░░░░░] 45%                │
│ Trim Prep      [░░░░░░░░░░░░░░░░░░░░]  0%                │
│ Trim           [░░░░░░░░░░░░░░░░░░░░]  0%                │
│ Commissioning  [░░░░░░░░░░░░░░░░░░░░]  0%                │
└───────────────────────────────────────────────────────────┘
```

### Parts Receiving Page (Technician View)
```
┌───────────────────────────────────────────────────────────┐
│ Parts Receiving                                  [← Back] │
├───────────────────────────────────────────────────────────┤
│                                                            │
│  [  Prewire Items  ]  [  Trim Items  ]  ← Phase Toggle   │
│                                                            │
│  [Receive All 5 Pending Items] ← Bulk Action             │
│                                                            │
├───────────────────────────────────────────────────────────┤
│                                                            │
│  ┌─────────────────────────────────────────────────┐     │
│  │ CAT6 Cable - Part #12345              ✓ Received│     │
│  │ Planned: 200  Ordered: 200  Received: 200       │     │
│  └─────────────────────────────────────────────────┘     │
│                                                            │
│  ┌─────────────────────────────────────────────────┐     │
│  │ Keystone Jack - Part #67890         ⚠️ Partial  │     │
│  │ Planned: 50   Ordered: 50   Received: [45]      │     │
│  │                                                  │     │
│  │ ⚠️ Shortage: 5 units still needed               │     │
│  │ [Receive All (50)] ← Quick receive button       │     │
│  └─────────────────────────────────────────────────┘     │
│                                                            │
│  ┌─────────────────────────────────────────────────┐     │
│  │ Wall Plate - Part #11111             📦 Ordered │     │
│  │ Planned: 50   Ordered: 50   Received: [  0]     │     │
│  │                                                  │     │
│  │ [Receive All (50)] ← Quick receive button       │     │
│  └─────────────────────────────────────────────────┘     │
│                                                            │
└───────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagram

```
┌──────────────────┐
│  Global Parts    │  ← PM sets required_for_prewire ONCE
│  Catalog         │
└────────┬─────────┘
         │ inherits flag
         ↓
┌──────────────────┐
│ Project          │  ← CSV import creates records
│ Equipment        │    with planned_quantity
└────────┬─────────┘
         │
         ↓
┌──────────────────┐
│ PM Orders        │  → Updates ordered_quantity
│                  │  → Status: 50% (ordered × 50%)
└────────┬─────────┘
         │
         ↓
┌──────────────────┐
│ Technician       │  → Updates received_quantity
│ Receives         │  → Status: 87.5% (if partial)
│                  │  → Status: 100% (if full)
└────────┬─────────┘
         │
         ↓
┌──────────────────┐
│ Milestone        │  ← Reads quantities from DB
│ Service          │  ← Calculates percentage
│                  │  → Returns to UI
└────────┬─────────┘
         │
         ↓
┌──────────────────┐
│ PM Dashboard     │  ← Displays progress bars
│ & Project Views  │  ← Shows warnings for shortages
└──────────────────┘
```

---

## Status Colors & Icons

```
Status Legend:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Fully Received (Green)
  - received_quantity >= planned_quantity
  - Ready for installation

⚠️ Partial (Yellow)
  - 0 < received_quantity < ordered_quantity
  - Shortage alert shown
  - PM needs to order more

📦 Ordered (Blue)
  - ordered_quantity > 0
  - received_quantity = 0
  - Waiting for shipment

⚪ Not Ordered (Gray)
  - ordered_quantity = 0
  - Not yet purchased
```

---

## Quick Reference: Key Fields

```
project_equipment table:
  planned_quantity    → From CSV import (how many needed)
  ordered_quantity    → PM enters (how many ordered)
  received_quantity   → Tech enters (how many arrived)

global_parts table:
  required_for_prewire → true/false (PM sets once)

Status Calculation:
  Prewire Prep % = (ordered_sum / planned_sum) × 50
                 + (received_sum / planned_sum) × 50

  Where items = required_for_prewire = true
```

---

## Navigation Paths

```
PM Workflows:
  Dashboard → Projects → Click Project → Project Detail
  Project Detail → Equipment Tab → Mark Prewire Items
  Project Detail → Order Equipment → Update ordered_quantity

Technician Workflows:
  Dashboard → Projects → Click Project → [Receive Items]
  /projects/:id/receiving → Select Phase → Receive Items

Quick Actions:
  - "Receive All" button → Bulk receive all pending items
  - Click quantity field → Enter partial receive amount
  - "Receive All (qty)" → Quick receive for one item
```

---

This visual guide should help everyone understand the complete system flow! 🎯
