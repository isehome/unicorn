# Status Gauge System Documentation

## Overview

This document describes how status gauges are calculated across the entire application, ensuring consistency and accuracy in project progress tracking.

---

## System Architecture

### 1. Data Model

#### Global Parts (`global_parts` table)
- **Purpose**: Single source of truth for all equipment/parts
- **Key Field**: `required_for_prewire` (boolean)
  - `true` = Item needed for prewire phase (wire, brackets, construction materials)
  - `false/null` = Item needed for trim phase (panels, cameras, speakers)
- **Inheritance**: When equipment is imported into a project, it inherits the `required_for_prewire` flag from global_parts

#### Project Equipment (`project_equipment` table)
- **Purpose**: Project-specific equipment instances
- **Quantity Fields**:
  - `planned_quantity` - From CSV import (how many items project needs)
  - `ordered_quantity` - How many units PM ordered from supplier
  - `received_quantity` - How many units arrived on-site/warehouse
- **Legacy Boolean Fields** (backward compatible):
  - `ordered_confirmed` - Auto-set to `true` when `ordered_quantity > 0`
  - `onsite_confirmed` - Auto-set to `true` when `received_quantity >= planned_quantity`

---

## Status Gauge Calculations

### Formula: Quantity-Based Additive Calculation

**All prep milestones use this formula:**

```
Percentage = (Ordered% × 50) + (Received% × 50)

Where:
  Ordered% = (total_ordered_quantity / total_planned_quantity)
  Received% = (total_received_quantity / total_planned_quantity)
```

### Example Calculations

#### Example 1: Prewire Prep at 75%
```
Items:
- CAT6 Cable: planned=200, ordered=200, received=150
- Keystone Jack: planned=50, ordered=50, received=50

Total Planned: 250
Total Ordered: 250 (100%)
Total Received: 200 (80%)

Calculation:
(250/250 × 50) + (200/250 × 50) = 50 + 40 = 90%
```

#### Example 2: Trim Prep at 50%
```
Items:
- Touch Panel: planned=10, ordered=10, received=0
- Camera: planned=20, ordered=0, received=0

Total Planned: 30
Total Ordered: 10 (33.33%)
Total Received: 0 (0%)

Calculation:
(10/30 × 50) + (0/30 × 50) = 16.67 + 0 = 16.67% ≈ 17%
```

---

## Milestone Definitions

### 1. Planning & Design (planning_design)
- **Trigger**: Manual - PM enters URLs
- **Calculation**:
  - 0% = Neither URL present
  - 50% = One URL present (Lucid OR Portal)
  - 100% = Both URLs present (Lucid AND Portal)
- **Required Data**:
  - `wiring_diagram_url` (Lucid chart)
  - `portal_proposal_url` (CSV source)

### 2. Prewire Prep (prewire_prep)
- **Trigger**: Automated - based on equipment quantities
- **Calculation**: Additive quantity-based (ordered × 50% + received × 50%)
- **Scope**: All equipment where `global_parts.required_for_prewire = true`
- **Target Date**: Auto-calculated as 14 days before Prewire date
- **Service**: [milestoneService.js:68-108](milestoneService.js#L68-L108)

### 3. Prewire (prewire)
- **Trigger**: Automated - based on wire drop stage completion
- **Calculation**: `(completed_prewire_stages / total_wire_drops) × 100`
- **Completion Criteria**: Wire drop has prewire stage marked complete OR has prewire photo
- **Service**: [milestoneService.js:110-148](milestoneService.js#L110-L148)

### 4. Trim Prep (trim_prep)
- **Trigger**: Automated - based on equipment quantities
- **Calculation**: Additive quantity-based (ordered × 50% + received × 50%)
- **Scope**: All equipment where `global_parts.required_for_prewire != true`
- **Target Date**: Auto-calculated as 14 days before Trim date
- **Service**: [milestoneService.js:154-194](milestoneService.js#L154-L194)

### 5. Trim (trim)
- **Trigger**: Automated - based on wire drop stage completion
- **Calculation**: `(completed_trim_stages / total_wire_drops) × 100`
- **Completion Criteria**: Wire drop has trim stage marked complete OR (has trim photo AND equipment attached)
- **Service**: [milestoneService.js:196-231](milestoneService.js#L196-L231)

### 6. Commissioning (commissioning)
- **Trigger**: Automated - based on head-end equipment assignment
- **Calculation**:
  - 0% = No equipment assigned to head-end rooms
  - 100% = Any equipment assigned to head-end rooms
- **Service**: [milestoneService.js:233-264](milestoneService.js#L233-L264)

---

## Key Workflows

### Workflow 1: Project Manager Orders Equipment

1. **PM imports CSV** → `planned_quantity` populated
2. **PM marks items as prewire** → Sets `global_parts.required_for_prewire = true`
3. **PM confirms order placed** → Updates `ordered_quantity`
4. **Status gauge updates** → Prewire Prep jumps to ~50%

### Workflow 2: Technician Receives Shipment

1. **Tech navigates to**: `/projects/:projectId/receiving`
2. **Tech selects phase**: Prewire or Trim
3. **Tech has 3 options**:

   **Option A: Receive All (full shipment)**
   - Clicks "Receive All" button
   - Sets `received_quantity = ordered_quantity` for all items

   **Option B: Receive Individual Item (full)**
   - Clicks "Receive All (qty)" button on item card
   - Sets `received_quantity = ordered_quantity` for that item

   **Option C: Partial Receive (shortage)**
   - Clicks on received quantity field
   - Types actual received amount (e.g., 150 instead of 200)
   - System shows **warning badge**: "⚠️ Shortage: 50 units still needed"

4. **Status gauge updates** → Received% increases, overall prep % increases

### Workflow 3: Handling Shortages

When `received_quantity < ordered_quantity`:

1. **UI shows warning** on item card (yellow highlight)
2. **PM Dashboard** shows percentage but doesn't block progress
3. **PM can**:
   - Order additional units (increase `ordered_quantity`)
   - Proceed with project (acknowledge shortage)
   - Mark item as "not needed" (reduce `planned_quantity`)

---

## UI Display Locations

### 1. PM Dashboard ([PMDashboard.js](PMDashboard.js))
- **Location**: Project cards in main list
- **Shows**: 5 milestone gauges per project (Prewire Prep, Prewire, Trim Prep, Trim, Commissioning)
- **Format**: Compact horizontal bars with percentage
- **Updates**: Cached (instant load) + background refresh

### 2. Project Detail View
- **Location**: Top of project page
- **Shows**: Full milestone breakdown with target dates
- **Format**: Expanded cards with dates and status

### 3. Parts Receiving Page ([PartsReceivingPage.js](PartsReceivingPage.js))
- **Location**: `/projects/:projectId/receiving`
- **Shows**: Individual item status (Ordered, Received, Shortage warnings)
- **Format**: Interactive cards with editable quantity fields
- **Features**:
  - Phase toggle (Prewire/Trim)
  - "Receive All" bulk action
  - Per-item quick receive
  - Shortage alerts

---

## Database Triggers & Automation

### Trigger: `sync_procurement_boolean_flags()`
**Location**: [add_quantity_tracking.sql:49-71](add_quantity_tracking.sql#L49-L71)

**Purpose**: Keep legacy boolean flags in sync with new quantity fields

**Logic**:
```sql
-- Auto-update ordered_confirmed when ordered_quantity changes
NEW.ordered_confirmed := (NEW.ordered_quantity > 0);

-- Auto-update onsite_confirmed when received matches planned
NEW.onsite_confirmed := (
  NEW.received_quantity > 0 AND
  NEW.received_quantity >= COALESCE(NEW.planned_quantity, 0)
);
```

**Benefit**: Backward compatibility with existing code that checks boolean flags

---

## Caching Strategy

### Implementation: [milestoneCacheService.js](milestoneCacheService.js)

**Cache Keys**: `milestone_cache:${projectId}`

**Cache Duration**: 5 minutes

**Strategy**:
1. **On load**: Read from cache immediately (instant display)
2. **Background**: Fetch fresh data from database
3. **On update**: Invalidate cache, force refresh

**Invalidation Triggers**:
- Equipment quantity updated
- Wire drop stage completed
- Project URLs changed

---

## Testing Checklist

### Test 1: Prewire Prep Calculation
- [ ] Import CSV with 10 prewire items (200 total quantity)
- [ ] Mark 5 items as ordered (100 quantity) → Expect ~25%
- [ ] Receive 3 items fully (60 quantity) → Expect ~40%
- [ ] Receive remaining 2 items → Expect ~50%

### Test 2: Partial Shipment
- [ ] Order 200 CAT6 cables
- [ ] Receive only 150
- [ ] Verify warning shows "Shortage: 50 units"
- [ ] Verify gauge shows ~87.5% (not 100%)
- [ ] Order additional 50, receive them
- [ ] Verify gauge reaches 100%

### Test 3: Phase Separation
- [ ] Mark 5 items as `required_for_prewire = true`
- [ ] Mark 5 items as `required_for_prewire = false`
- [ ] Order/receive all prewire items
- [ ] Verify Prewire Prep = 100%, Trim Prep = 0%

### Test 4: Cache Performance
- [ ] Load PM Dashboard with 20 projects
- [ ] Verify instant display (cached data)
- [ ] Wait for background refresh
- [ ] Update equipment quantity
- [ ] Verify cache invalidated and gauge updates

---

## Migration Guide

### For Existing Projects

Run this SQL migration: [add_quantity_tracking.sql](add_quantity_tracking.sql)

**What it does**:
1. Adds `ordered_quantity` and `received_quantity` columns
2. Migrates existing boolean data:
   - `ordered_confirmed = true` → `ordered_quantity = planned_quantity`
   - `onsite_confirmed = true` → `received_quantity = planned_quantity`
3. Creates trigger to keep booleans in sync
4. Adds validation constraint (can't receive more than ordered)

**Rollback**: Boolean flags remain functional, can continue using them

---

## API Reference

### Service Methods

#### projectEquipmentService.updateProcurementQuantities()
```javascript
await projectEquipmentService.updateProcurementQuantities(
  equipmentId,
  {
    orderedQty: 200,      // Optional: update ordered quantity
    receivedQty: 150,     // Optional: update received quantity
    userId: currentUser.id // Optional: track who made change
  }
);
```

#### projectEquipmentService.receiveAllForPhase()
```javascript
const result = await projectEquipmentService.receiveAllForPhase(
  projectId,
  'prewire' // or 'trim'
);
// Returns: { updated: 10, message: "Successfully received 10 items..." }
```

#### milestoneService.calculateAllPercentages()
```javascript
const percentages = await milestoneService.calculateAllPercentages(projectId);
// Returns:
// {
//   planning_design: 100,
//   prewire_prep: 87,
//   prewire: 45,
//   trim_prep: 0,
//   trim: 0,
//   commissioning: 0
// }
```

---

## Best Practices

### For Project Managers

1. **Mark prewire items in global catalog FIRST**
   - Set `required_for_prewire = true` before importing CSV
   - This ensures all projects inherit correct classification

2. **Order in batches**
   - Don't wait to order everything at once
   - Order prewire items first (2+ weeks before prewire date)
   - Order trim items later (2+ weeks before trim date)

3. **Monitor shortages**
   - Check Parts Receiving page regularly
   - Yellow highlights = partial shipment
   - Order additional quantities as needed

### For Technicians

1. **Use "Receive All" when possible**
   - Fastest way to update when full shipment arrives
   - Automatically sets received = ordered for all items

2. **Enter exact quantities for partial shipments**
   - Click on received field and type actual amount
   - This alerts PM to shortages automatically

3. **Verify phase before receiving**
   - Double-check Prewire vs. Trim toggle
   - Items are filtered by phase for easier scanning

---

## Troubleshooting

### Issue: Gauge stuck at 0% despite ordering items
**Solution**: Check that `ordered_quantity` is set, not just boolean flag

### Issue: Gauge shows >100%
**Cause**: Database constraint violation bypass
**Solution**: Run: `UPDATE project_equipment SET received_quantity = LEAST(received_quantity, ordered_quantity)`

### Issue: Cache not updating after changes
**Solution**: Call `milestoneCacheService.invalidate(projectId)` after mutations

### Issue: Items not showing in correct phase
**Solution**:
1. Check `global_parts.required_for_prewire` flag
2. Verify `project_equipment.global_part_id` is set
3. Re-import CSV if needed to link global_part_id

---

## Future Enhancements

### Planned Features

1. **Notification System** (Phase 2)
   - Email PM when shortage detected
   - Push notification for critical items
   - Daily digest of pending orders

2. **Global Warehouse Inventory** (Phase 3)
   - Track `quantity_on_hand` at warehouse level
   - Reserve quantities for specific projects
   - Auto-allocate from warehouse before ordering

3. **Quantity History Tracking** (Phase 4)
   - Audit log of all quantity changes
   - Who received items and when
   - Shipment tracking integration

4. **Smart Ordering** (Phase 5)
   - Suggest order quantities based on project history
   - Bulk discounts calculation
   - Lead time warnings

---

## Change Log

### Version 1.0 (Current)
- Added `ordered_quantity` and `received_quantity` fields
- Implemented additive status gauge calculation (50% ordered + 50% received)
- Created PartsReceivingPage for technician workflow
- Added "Receive All" bulk action
- Implemented phase separation (Prewire vs. Trim)
- Added partial fulfillment warnings

### Version 0.9 (Legacy)
- Boolean-only flags: `ordered_confirmed`, `onsite_confirmed`
- All-or-nothing calculation (both flags required for 100%)
- No quantity tracking
