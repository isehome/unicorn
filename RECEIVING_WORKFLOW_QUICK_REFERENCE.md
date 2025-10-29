# Equipment Receiving Workflow - Quick Reference

## File Paths Summary

### Main Receiving Interface
- **PartsReceivingPageNew.js** (570 lines) - PO-based receiving with expandable line items
  - Route: `/projects/:projectId/receiving`
  - Features: View POs, expand line items, update quantities, bulk receive, phase filter
  
### Legacy Alternative  
- **PartsReceivingPage.js** (443 lines) - Direct equipment receiving without POs
  - Features: Phase-based (prewire/trim), quick receive options

### QR Code Scanning
- **ScanTagPage.js** - Camera-based QR code scanning for wire drops
  - Tech: Html5Qrcode + BarcodeDetector API fallback
  - Note: Scans wire drops, not equipment receiving

### Equipment Ordering
- **PMOrderEquipmentPageEnhanced.js** - Create/manage POs from equipment list
  - Route: `/projects/:projectId/order-equipment`
  - Components: POGenerationModal, PODetailsModal

## Core Services

### PurchaseOrderService
**Location:** `/src/services/purchaseOrderService.js` (525 lines)

Key methods:
- `createPurchaseOrder(poData, lineItems)` - Create new PO with auto-generated number
- `getPurchaseOrder(poId)` - Fetch PO with related data
- `getProjectPurchaseOrders(projectId, filters)` - Get all POs for project
- `receiveLineItem(lineItemId, quantityReceived, receivedBy)` - Mark line as received
- `updatePurchaseOrder(poId, updates)` - Update PO details
- `submitPurchaseOrder(poId, submittedBy)` - Change status to submitted
- `addLineItem(poId, lineItem)` - Add item to existing PO
- `updateLineItem(lineItemId, updates)` - Update line item
- `removeLineItem(lineItemId)` - Delete line item

### ProjectEquipmentService
**Location:** `/src/services/projectEquipmentService.js` (1292 lines)

Key receiving methods:
- `fetchProjectEquipmentByPhase(projectId, phase)` - Get equipment filtered by phase
- `updateProcurementQuantities(equipmentId, {orderedQty, receivedQty})` - Update quantities
- `receiveAllForPhase(projectId, phase)` - Bulk mark all as received

## Database Tables

### purchase_orders
- `po_number` - Auto-generated unique identifier
- `status` - draft, submitted, confirmed, partially_received, received, cancelled
- `milestone_stage` - prewire_prep, trim_prep, other
- Records shipment and delivery info

### purchase_order_items
- **`quantity_received`** - KEY FIELD for tracking received amount
- `quantity_ordered` - How many were ordered
- Links to `project_equipment` and `purchase_orders`
- Constraints: quantity_received <= quantity_ordered

### project_equipment
- **`ordered_quantity`** - Total units ordered across all POs
- **`received_quantity`** - Total units received across all PO line items
- **`received_date`** - When last item was received
- **`received_by`** - Who received the last item
- Synced boolean fields: `ordered_confirmed`, `onsite_confirmed`

### suppliers
- Supplier master data with contact info
- `short_code` - Used in PO number generation

### shipment_tracking
- Carrier tracking information
- Status: pending, in_transit, out_for_delivery, delivered, exception, returned

## Data Flow Overview

```
ORDERING PHASE
  Equipment List (planned_quantity)
           ↓
  Create PO (links equipment to supplier)
           ↓
  purchase_order_items created (quantity_ordered set)
           ↓
  project_equipment.ordered_quantity updated
           ↓

RECEIVING PHASE
  PartsReceivingPageNew loads POs
           ↓
  User clicks to edit quantity_received in line item
           ↓
  purchase_order_items.quantity_received updated
           ↓
  Automatic SUM calculation for equipment
           ↓
  project_equipment.received_quantity updated
           ↓
  project_equipment.received_date = NOW()
           ↓
  milestoneCacheService.invalidate(projectId)
           ↓
  Milestones recalculate with new material status
```

## Key Update Flow

When user updates received quantity in PartsReceivingPageNew:

1. Update `purchase_order_items.quantity_received = newValue`
2. Query all items for equipment: `SELECT SUM(quantity_received) FROM purchase_order_items WHERE project_equipment_id = X`
3. Update `project_equipment.received_quantity = sum`
4. Set `project_equipment.received_date = NOW()`
5. Call `milestoneCacheService.invalidate(projectId)`
6. Reload UI with updated PO status

## Status Calculation

```javascript
totalOrdered = SUM(quantity_ordered) for all items in PO
totalReceived = SUM(quantity_received) for all items in PO
percent = (totalReceived / totalOrdered) * 100

Status:
- 0% = "Not Received"
- 1-99% = "XX% Received"
- 100% = "Fully Received"
```

## Important Constraints

- Cannot receive more than ordered: `CHECK (received_quantity <= quantity_ordered)`
- Cannot receive more than planned/ordered: `CHECK (received_quantity <= MAX(ordered_quantity, planned_quantity))`
- Backward compat trigger automatically updates boolean flags
- Equipment instance tracking: received_quantity is 0 or 1 per instance

## Routes

```javascript
/projects/:projectId/receiving        // PartsReceivingPageNew (main receiving)
/projects/:projectId/order-equipment  // PMOrderEquipmentPageEnhanced (create/manage POs)
/scan-tag                             // ScanTagPage (QR code scanning)
```

## Receiving Without POs (Legacy)

PartsReceivingPage provides alternative:
- Direct equipment receiving
- No PO reference
- Phase-based filtering
- Same quantity tracking but simpler workflow

## Links to Purchase Orders

| From | To | Via |
|------|----|----|
| project_equipment | purchase_order_items | equipment_id |
| purchase_order_items | purchase_orders | po_id |
| purchase_orders | suppliers | supplier_id |

Received quantity aggregation:
```sql
SUM(purchase_order_items.quantity_received) WHERE project_equipment_id = X
→ project_equipment.received_quantity
```

## Important Notes

1. **Two uses of received_quantity:**
   - Numeric field: total units received
   - Instance tracking (0/1): individual device tracking

2. **Boolean flag sync:**
   - ordered_confirmed ← ordered_quantity > 0
   - onsite_confirmed ← received_quantity >= planned_quantity
   - Auto-updated by trigger

3. **Milestone impact:**
   - Cache must be invalidated after receiving
   - Causes recalculation of material readiness
   - Updates project milestone progress

4. **QR scanning:**
   - Current: Wire drops only
   - Equipment receiving: Manual quantity entry
   - Future: Could be extended for barcode equipment tracking
