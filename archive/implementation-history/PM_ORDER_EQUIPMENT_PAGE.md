# PM Order Equipment Page - Implementation

## Summary

Created a **PM-facing Order Equipment page** that mirrors the technician receiving page, allowing project managers to efficiently order equipment by phase (Prewire vs. Trim).

---

## What Was Built

### 1. **PMOrderEquipmentPage Component** ([PMOrderEquipmentPage.js](src/components/PMOrderEquipmentPage.js))

A dedicated page for project managers to order equipment before technicians need to receive it.

#### Key Features:

**Phase Toggle**
- Switch between "Prewire Items" and "Trim Items"
- Automatically filters equipment based on `global_parts.required_for_prewire` flag

**Cost Tracking**
- Shows total planned cost for all items in phase
- Shows total ordered cost (running total)
- Progress bar: ordered cost / planned cost

**Bulk Actions**
- "Order All X Pending Items" button
- Sets `ordered_quantity = planned_quantity` for all items

**Per-Item Actions**
- "Order Full Quantity (qty)" button per item
- Editable `ordered_quantity` field (click to edit)
- View `received_quantity` (read-only for PM)

**Status Indicators**
- ✅ **Received** (green) - Technician has received items
- 🛒 **Ordered** (blue) - PM has ordered, waiting for delivery
- ⚠️ **Partial Order** (yellow) - Only some quantity ordered
- ⚪ **Not Ordered** (gray) - No order placed yet

**Cost Display**
- Unit cost per item
- Total cost per item (`unit_cost × planned_quantity`)
- Ordered cost per item (`unit_cost × ordered_quantity`)

---

## User Interface

### Header
```
┌─────────────────────────────────────────────────┐
│ ← Order Equipment                               │
└─────────────────────────────────────────────────┘
```

### Phase Toggle
```
┌──────────────────────┬──────────────────────┐
│  Prewire Items      │  Trim Items         │
│  (selected)          │                      │
└──────────────────────┴──────────────────────┘
```

### Cost Summary
```
┌─────────────────────────────────────────────────┐
│ Total Cost (Planned)    Ordered Cost            │
│ $15,450.00              $12,300.00              │
│                                                  │
│ Ordered: ████████████████░░░░ 80%              │
└─────────────────────────────────────────────────┘
```

### Bulk Action
```
┌─────────────────────────────────────────────────┐
│ [Order All 15 Pending Items]                   │
└─────────────────────────────────────────────────┘
```

### Equipment Item Card
```
┌─────────────────────────────────────────────────┐
│ CAT6 Cable - Part #12345            🛒 Ordered │
│ Unit Cost: $1.50 • Total: $300.00              │
│                                                  │
│ Planned: 200  Ordered: 200  Received: 150      │
│                                                  │
│ Ordered Cost: $300.00                           │
└─────────────────────────────────────────────────┘
```

### Partial Order Warning
```
┌─────────────────────────────────────────────────┐
│ Wall Plate - Part #67890         ⚠️ Partial    │
│ Unit Cost: $2.00 • Total: $100.00              │
│                                                  │
│ Planned: 50   Ordered: 30   Received: 0        │
│                                                  │
│ [Order Full Quantity (50)]                     │
│                                                  │
│ ⚠️ Partial order: 20 units still needed         │
└─────────────────────────────────────────────────┘
```

---

## Complete Workflow

### Step 1: PM Orders Equipment

```
PM Dashboard → Project → [Order Equipment]
                            ↓
                  Order Equipment Page
                            ↓
                  Select Phase: Prewire
                            ↓
              Option A: [Order All Items]
              Option B: Order individual items
                            ↓
                  ordered_quantity updated
                            ↓
                  Status Gauge → 50%
```

### Step 2: Technician Receives Equipment

```
Project Detail → [Receive Items]
                      ↓
            Parts Receiving Page
                      ↓
            Select Phase: Prewire
                      ↓
          Option A: [Receive All Items]
          Option B: Receive individual items
          Option C: Enter partial quantities
                      ↓
            received_quantity updated
                      ↓
            Status Gauge → 87.5% or 100%
```

---

## Navigation

### PM Access Points

**From PM Project View** ([PMProjectViewEnhanced.js](src/components/PMProjectViewEnhanced.js)):
```
Quick Actions Section:
  [Order Equipment] ← Primary button, top of page
```

**Route**: `/projects/:projectId/order-equipment`

---

## Status Gauge Impact

### Before Ordering
```
Prewire Prep: 0%  ░░░░░░░░░░░░░░░░░░░░
(nothing ordered or received)
```

### After PM Orders
```
Prewire Prep: 50%  ██████████░░░░░░░░░░
(all items ordered, none received)
```

### After Technician Receives (Full)
```
Prewire Prep: 100%  ████████████████████
(all items ordered and received)
```

### After Technician Receives (Partial: 150/200)
```
Prewire Prep: 87.5%  █████████████████░░░
(200 ordered, 150 received = 50% + 37.5%)
```

---

## Data Flow

```
PM Order Equipment Page
    ↓
projectEquipmentService.updateProcurementQuantities()
    ↓
Updates: ordered_quantity in project_equipment table
    ↓
Trigger: sync_procurement_boolean_flags()
    ↓
Auto-sets: ordered_confirmed = true
    ↓
milestoneCacheService.invalidate()
    ↓
milestoneService.calculatePrewirePrepPercentage()
    ↓
Formula: (ordered_qty / planned_qty) × 50% + (received_qty / planned_qty) × 50%
    ↓
PM Dashboard / Project View shows updated percentage
```

---

## Key Features Explained

### 1. **Phase Separation**
- **Prewire Items**: Items where `global_parts.required_for_prewire = true`
  - Example: CAT6 cable, brackets, conduit, wire
- **Trim Items**: Items where `required_for_prewire != true`
  - Example: Touch panels, cameras, speakers, access points

### 2. **Cost Tracking**
PM can see financial impact before ordering:
```
Total Planned: $15,450.00
Ordered: $12,300.00 (80%)
Remaining: $3,150.00
```

### 3. **Editable Quantities**
PM can order partial quantities if needed:
- Click on "Ordered" number
- Type new quantity (e.g., 150 instead of 200)
- Press Enter or click ✓ to save

### 4. **Status Visibility**
PM can see what technicians have received:
```
Planned: 200
Ordered: 200
Received: 150  ← Technician updated this
```

---

## Files Created/Modified

### New Files
1. `/src/components/PMOrderEquipmentPage.js` - PM ordering UI
2. `/PM_ORDER_EQUIPMENT_PAGE.md` - This documentation

### Modified Files
1. `/src/App.js` - Added route for `/projects/:projectId/order-equipment`
2. `/src/components/PMProjectViewEnhanced.js` - Added "Order Equipment" button

---

## Comparison: PM vs. Technician Pages

| Feature | PM Order Equipment | Technician Receive Items |
|---------|-------------------|-------------------------|
| **Phase Toggle** | ✅ Prewire/Trim | ✅ Prewire/Trim |
| **Bulk Action** | Order All | Receive All |
| **Edit Field** | ordered_quantity | received_quantity |
| **Read-Only Field** | received_quantity | ordered_quantity |
| **Cost Display** | ✅ Shows costs | ❌ No costs |
| **Status Colors** | Blue (Ordered), Yellow (Partial) | Green (Received), Yellow (Partial) |
| **Primary Action** | "Order Full Quantity" | "Receive All (qty)" |

---

## Benefits

### For Project Managers
✅ **Centralized ordering**: All equipment in one place, separated by phase
✅ **Cost visibility**: See financial impact before ordering
✅ **Bulk actions**: Order entire phase with one click
✅ **Partial ordering**: Can order some now, rest later
✅ **Delivery tracking**: See what's been received by technicians

### For Technicians
✅ **Clear expectations**: Can see what PM ordered
✅ **Easy receiving**: Match received quantities to orders
✅ **Shortage detection**: Yellow warnings when shipment is short

### For the System
✅ **Progressive visibility**: Status gauges update as orders are placed
✅ **Accurate tracking**: Separate ordered vs. received quantities
✅ **Phase separation**: Prewire items don't mix with trim items
✅ **Cost reporting**: Can calculate total project costs

---

## Testing Checklist

- [ ] Navigate from PM Project View → Order Equipment
- [ ] Verify phase toggle switches between Prewire and Trim
- [ ] Verify cost summary displays correctly
- [ ] Click "Order All" and verify all items update
- [ ] Click individual "Order Full Quantity" button
- [ ] Edit ordered_quantity by clicking and typing
- [ ] Verify partial order warning shows for incomplete orders
- [ ] Verify status gauge updates on PM Dashboard
- [ ] Have technician receive items, verify PM can see received_quantity
- [ ] Test on mobile device (responsive layout)

---

## Next Steps

1. **Add PM Dashboard indicator**: Show which projects need ordering
2. **Email notifications**: Alert PM when items are received
3. **Purchase order generation**: Export order list to PDF/CSV
4. **Vendor management**: Track which vendor supplies each part
5. **Lead time tracking**: Estimate delivery dates based on vendor data

---

## Example Use Case

**Scenario**: Smith Residence - Prewire Phase

1. **PM reviews equipment**:
   - Navigates to Order Equipment page
   - Selects "Prewire Items"
   - Sees 50 items totaling $8,500

2. **PM orders equipment**:
   - Clicks "Order All 50 Pending Items"
   - System sets ordered_quantity = planned_quantity for all
   - Status gauge jumps to 50%

3. **2 weeks later - Shipment arrives**:
   - Technician opens Receive Items page
   - Selects "Prewire Items"
   - Clicks "Receive All 50 Items"
   - Status gauge jumps to 100%

4. **Partial shipment scenario**:
   - Only 180 of 200 CAT6 cables arrive
   - Technician enters "180" in received field
   - Yellow warning: "Shortage: 20 units needed"
   - PM sees the shortage on Order Equipment page
   - PM orders additional 20 cables
   - Technician receives them later
   - Status gauge reaches 100%

---

The PM Order Equipment page completes the procurement workflow loop! 🎯
