# Equipment Receiving Workflow - Documentation Index

This directory contains comprehensive documentation of the equipment receiving workflow in the Unicorn project management system.

## Documentation Files

### 1. EQUIPMENT_RECEIVING_WORKFLOW.md (22KB)
**Comprehensive Reference Guide - START HERE**

The complete technical reference covering:
- File structure and component organization (3 sections)
- Full database schema with table definitions (5 detailed tables)
- Data flow architecture and diagrams
- Key functions and operations (PurchaseOrderService, ProjectEquipmentService)
- Component logic (PartsReceivingPageNew)
- QR code scanning implementation
- Legacy receiving workflows
- State updates and caching mechanisms
- PO-to-equipment links and relationships
- Routing and navigation
- Complete workflow walkthrough
- Data flow scenarios and examples
- Important notes on constraints and backward compatibility

**Best for:** Understanding complete system architecture, detailed schema, all operations

### 2. RECEIVING_WORKFLOW_QUICK_REFERENCE.md (6.3KB)
**Quick Lookup Guide - BOOKMARK THIS**

Fast reference for:
- File path summary with line counts
- Core services overview with key methods
- Database table quick reference
- Data flow overview diagram
- Key update flow steps
- Status calculation logic
- Important constraints
- Routes and navigation
- Legacy receiving alternatives
- PO-equipment relationship tables
- Important notes section

**Best for:** Quick lookups, finding specific functions, understanding workflows at a glance

## Key Files in Codebase

### Receiving Components
```
src/components/PartsReceivingPageNew.js (570 lines)
  - PO-based receiving system (MAIN)
  - Route: /projects/:projectId/receiving
  - Features: PO list, expandable line items, quantity updates, bulk receive, phase filter
  - Key method: handleUpdateReceived()

src/components/PartsReceivingPage.js (443 lines)
  - Legacy equipment-based receiving
  - Direct equipment updates without PO reference
  - Features: Phase filtering (prewire/trim), quick receive
```

### Services
```
src/services/purchaseOrderService.js (525 lines)
  - PO operations: create, read, update, delete
  - Key methods: receiveLineItem(), createPurchaseOrder(), getPurchaseOrder()
  - PO number auto-generation

src/services/projectEquipmentService.js (1292 lines)
  - Equipment management and procurement
  - Key methods: updateProcurementQuantities(), receiveAllForPhase()
  - Quantity validation and updates

src/services/milestoneCacheService.js
  - Cache invalidation for milestone recalculation
  - Called after each receiving update
```

### Database Schemas
```
supabase/procurement_system_fixed.sql
  - purchase_orders table definition
  - purchase_order_items table with quantity_received
  - suppliers table
  - shipment_tracking table
  - Indexes and RLS policies

supabase/add_quantity_tracking.sql
  - ordered_quantity and received_quantity fields
  - Constraint: received_quantity <= MAX(ordered_quantity, planned_quantity)
  - Trigger: trg_sync_procurement_flags (syncs boolean flags)

supabase/add_equipment_instances.sql
  - Instance tracking fields (instance_number, instance_name)
  - received_date and received_by fields
  - Parent import group for CSV-based instances
```

## Understanding the Workflow

### Quick Start (5 minutes)
1. Read RECEIVING_WORKFLOW_QUICK_REFERENCE.md
2. Look at the Data Flow Diagram section
3. Understand the 6-step Key Update Flow

### Complete Understanding (30 minutes)
1. Read EQUIPMENT_RECEIVING_WORKFLOW.md sections 1-5
2. Study PartsReceivingPageNew.js component
3. Review purchaseOrderService.js key functions
4. Check database schema tables

### Deep Dive (1+ hour)
1. Read all of EQUIPMENT_RECEIVING_WORKFLOW.md
2. Study all three service files
3. Review database schema files
4. Trace code through critical paths
5. Review the example scenarios

## Critical Information

### Data Capture
- **Primary method:** Manual quantity entry in PartsReceivingPageNew
- **QR scanning:** Available for wire drops (not equipment)
- **Bulk operations:** "Receive All Items in PO" button
- **Storage:** purchase_order_items.quantity_received

### State Flow
```
User edits quantity in UI
  ↓
purchase_order_items.quantity_received updated
  ↓
SUM query calculates total for equipment
  ↓
project_equipment.received_quantity updated
  ↓
project_equipment.received_date set to NOW()
  ↓
milestoneCacheService.invalidate() called
  ↓
Milestones recalculate with new material status
```

### Key Tables

| Table | Purpose | Key Receiving Field |
|-------|---------|---------------------|
| purchase_orders | PO header, supplier link | status (draft→received) |
| purchase_order_items | Line items per PO | **quantity_received** |
| project_equipment | Equipment master | received_quantity (aggregated) |
| suppliers | Supplier master | Used in PO creation |
| shipment_tracking | Carrier tracking | status (pending→delivered) |

### PO-Equipment Link
```
project_equipment.id
  ↓ (referenced by)
purchase_order_items.project_equipment_id
  ↓ (belongs to)
purchase_orders.id
  ↓ (from)
suppliers.id
```

Equipment totals are **summed from ALL line items** across **ALL POs** for that equipment.

## Routing Map

```
User in Project View
  ↓
"Order Equipment" button
  ↓ /projects/:projectId/order-equipment
  → PMOrderEquipmentPageEnhanced
    ├─ Select equipment
    ├─ Group by supplier
    └─ Create PO (POGenerationModal)
  ↓
"Receive Equipment" button
  ↓ /projects/:projectId/receiving
  → PartsReceivingPageNew
    ├─ View POs with line items
    ├─ Update quantity_received
    └─ Track progress
```

## Common Tasks

### Find receiving code
- Main: `src/components/PartsReceivingPageNew.js` - handleUpdateReceived()
- Service: `src/services/projectEquipmentService.js` - updateProcurementQuantities()
- Database: `supabase/add_quantity_tracking.sql`

### Understand quantity flow
1. Read RECEIVING_WORKFLOW_QUICK_REFERENCE.md section "Key Update Flow"
2. Study PartsReceivingPageNew.js lines 101-154 (handleUpdateReceived)
3. Review projectEquipmentService.js lines 1172-1231

### Find PO creation logic
- Component: `src/components/procurement/POGenerationModal.js`
- Service: `src/services/purchaseOrderService.js` - createPurchaseOrder()
- Database: Lines 40-98 in procurement_system_fixed.sql

### Check database schema
- See EQUIPMENT_RECEIVING_WORKFLOW.md section 2
- Or review schema files in /supabase/ directory

## Important Concepts

### Two Implementations
1. **PO-Based (NEW)** - PartsReceivingPageNew.js
   - Uses purchase_order_items for tracking
   - Supplier and shipment context
   - PO status tracking
   - More complex but complete

2. **Equipment-Based (LEGACY)** - PartsReceivingPage.js
   - Direct equipment updates
   - No PO reference
   - Simpler but less context
   - Phase-based filtering

### Backward Compatibility
- Boolean fields (ordered_confirmed, onsite_confirmed) auto-updated by trigger
- Existing code can still use boolean flags
- New code uses numeric quantities

### Constraints
- Cannot receive more than ordered
- Cannot receive more than planned
- Validation in updateProcurementQuantities()
- Database constraints ensure data integrity

## Related Documentation

Other workflow documents in this repository:
- EQUIPMENT_IMPORT_AND_LINKING_GUIDE.md - Equipment import process
- PM_ORDER_EQUIPMENT_PAGE.md - Equipment ordering details

## Questions & Answers

**Q: Where are received items recorded?**
A: In two places:
1. `purchase_order_items.quantity_received` (per line item)
2. `project_equipment.received_quantity` (aggregated total)

**Q: How is equipment tracked after receipt?**
A: Via:
- received_quantity (numeric total)
- received_date (timestamp)
- received_by (user)
- onsite_confirmed (boolean flag)

**Q: What triggers milestone updates?**
A: `milestoneCacheService.invalidate(projectId)` called after each receive.

**Q: Can one equipment be received from multiple POs?**
A: Yes - totals are summed from ALL line items across ALL POs.

**Q: Is QR scanning used for equipment?**
A: No - current scanning (ScanTagPage.js) handles wire drops only. Equipment uses manual entry.

**Q: How do I bulk receive items?**
A: Click "Receive All Items in PO" button in PartsReceivingPageNew.

**Q: What happens to PO status when items arrive?**
A: Status updates as items received: draft → submitted → confirmed → partially_received → received

## Navigation Tips

1. **Start with:** RECEIVING_WORKFLOW_QUICK_REFERENCE.md
2. **For details:** EQUIPMENT_RECEIVING_WORKFLOW.md
3. **For code:** Jump to specific file paths listed above
4. **For schema:** See section 2 of EQUIPMENT_RECEIVING_WORKFLOW.md

## File Locations (Absolute Paths)

```
/Users/stepheblansette/Desktop/unicorn/src/components/PartsReceivingPageNew.js
/Users/stepheblansette/Desktop/unicorn/src/components/PartsReceivingPage.js
/Users/stepheblansette/Desktop/unicorn/src/services/purchaseOrderService.js
/Users/stepheblansette/Desktop/unicorn/src/services/projectEquipmentService.js
/Users/stepheblansette/Desktop/unicorn/supabase/procurement_system_fixed.sql
/Users/stepheblansette/Desktop/unicorn/supabase/add_quantity_tracking.sql
/Users/stepheblansette/Desktop/unicorn/supabase/add_equipment_instances.sql
```

---

**Last Updated:** October 26, 2025
**Exploration Thoroughness:** VERY THOROUGH
**Documents Created:** 2 comprehensive guides + 1 index
