# Equipment Receiving Workflow - Complete Map

## Overview
This document provides a comprehensive map of the equipment receiving workflow in the Unicorn codebase, including PO-based receiving, data capture, tracking, and state management.

---

## 1. FILE STRUCTURE & COMPONENTS

### Core Receiving Pages/Components
| File Path | Purpose | Type |
|-----------|---------|------|
| `/src/components/PartsReceivingPageNew.js` | **Main receiving page** - PO-based receiving system. Lists all purchase orders by project with expandable line items for quantity tracking | React Component |
| `/src/components/PartsReceivingPage.js` | **Legacy equipment-based receiving** - Receives equipment directly without PO reference. Filters by phase (prewire/trim) | React Component |
| `/src/components/ScanTagPage.js` | **QR/Barcode scanning** for wire drops. Uses Html5Qrcode for camera-based scanning | React Component |
| `/src/components/PMOrderEquipmentPageEnhanced.js` | **Equipment ordering interface** - Links equipment to POs and prepares for receiving | React Component |

### Procurement Management Components
| File Path | Purpose |
|-----------|---------|
| `/src/components/procurement/ProcurementDashboard.js` | Dashboard for supplier and PO overview |
| `/src/components/procurement/PODetailsModal.js` | Modal for viewing/editing PO details and adding tracking info |
| `/src/components/procurement/POGenerationModal.js` | Modal for creating new POs from selected equipment |

### Core Services
| File Path | Purpose |
|-----------|---------|
| `/src/services/purchaseOrderService.js` | Service for all PO operations: create, update, receive line items, manage shipment tracking |
| `/src/services/projectEquipmentService.js` | Service for equipment management: update procurement quantities, bulk receiving |
| `/src/services/equipmentService.js` | Legacy equipment service for project equipment operations |
| `/src/services/milestoneCacheService.js` | Cache invalidation for milestone calculations after receiving updates |

---

## 2. DATABASE SCHEMA

### Primary Tables

#### `purchase_orders`
Tracks purchase orders at the project/supplier/milestone level.

**Key Columns:**
- `id` (uuid) - Primary key
- `project_id` (uuid) - References projects
- `supplier_id` (uuid) - References suppliers
- `po_number` (text unique) - Auto-generated: PO-YYYY-NNN-SUP-NNN
- `milestone_stage` (text) - 'prewire_prep', 'trim_prep', 'other'
- `status` (text) - 'draft', 'submitted', 'confirmed', 'partially_received', 'received', 'cancelled'
- `order_date` (date)
- `requested_delivery_date` (date)
- `expected_delivery_date` (date)
- `actual_delivery_date` (date)
- `subtotal`, `tax_amount`, `shipping_cost`, `total_amount` (numeric)
- `payment_method`, `payment_status` (text)
- `ship_to_address`, `ship_to_contact`, `ship_to_phone` (text)
- `internal_notes`, `supplier_notes` (text)
- `created_by`, `submitted_by` (text)
- `created_at`, `updated_at`, `submitted_at` (timestamptz)

**Indexes:**
- `idx_purchase_orders_project` - Filter by project
- `idx_purchase_orders_status` - Filter by status
- `idx_purchase_orders_milestone` - Filter by milestone stage
- `idx_purchase_orders_po_number` - Lookup by PO number

---

#### `purchase_order_items`
Line items within each purchase order.

**Key Columns:**
- `id` (uuid) - Primary key
- `po_id` (uuid) - References purchase_orders (cascade delete)
- `project_equipment_id` (uuid) - References project_equipment
- `line_number` (integer) - Order of items in PO
- `quantity_ordered` (numeric) - Units ordered
- **`quantity_received` (numeric)** - **Units received (key field for tracking)**
- `unit_cost` (numeric)
- `line_total` (numeric GENERATED) - quantity_ordered * unit_cost
- `expected_delivery_date` (date)
- `actual_delivery_date` (date)
- `received_by` (text)
- `received_at` (timestamptz)
- `notes` (text)
- `created_at`, `updated_at` (timestamptz)

**Constraints:**
- `quantity_received >= 0` AND `quantity_received <= quantity_ordered`
- Unique constraint: `(po_id, project_equipment_id)`

**Indexes:**
- `idx_po_items_po` - Filter items by PO
- `idx_po_items_equipment` - Filter items by equipment

---

#### `project_equipment`
Tracks equipment/materials for projects with quantity and receiving status.

**Key Procurement Columns:**
- `id` (uuid) - Primary key
- `project_id` (uuid)
- `part_number` (text)
- `name` (text)
- `description` (text)
- `equipment_type` (text) - 'part', 'fee', 'service', 'labor'
- `planned_quantity` (numeric) - Original plan
- **`ordered_quantity` (numeric DEFAULT 0)** - **Quantity ordered**
- **`received_quantity` (numeric DEFAULT 0)** - **Quantity received**
- `unit_cost` (numeric)
- `unit_price` (numeric)

**Receiving & Tracking Columns:**
- `ordered_confirmed` (boolean) - Backward compatible flag
- `ordered_confirmed_at` (timestamptz)
- `ordered_confirmed_by` (text)
- `onsite_confirmed` (boolean) - Backward compatible flag
- `onsite_confirmed_at` (timestamptz)
- `onsite_confirmed_by` (text)
- **`received_date` (timestamptz)** - When item was received
- **`received_by` (text)** - Who received it
- **`received_quantity` (integer)** - For instance tracking (0 or 1)

**Instance Management Columns:**
- `instance_number` (integer DEFAULT 1) - Instance number within room/part
- `instance_name` (text) - Human-readable name like "Living Room - Speaker 1"
- `parent_import_group` (uuid) - Links instances created from same CSV line

**Indexes:**
- `idx_project_equipment_quantities` - For filtering by procurement status
- `idx_project_equipment_instance` - For instance lookups
- `idx_project_equipment_parent_group` - For grouped instance lookups

**Constraint:**
```sql
CHECK (received_quantity <= GREATEST(COALESCE(ordered_quantity, 0), COALESCE(planned_quantity, 0)))
```

**Trigger:**
- `trg_sync_procurement_flags` - Auto-updates boolean flags when quantities change

---

#### `suppliers`
Supplier/vendor master catalog.

**Key Columns:**
- `id` (uuid)
- `name` (text)
- `short_code` (text unique) - Used in PO number generation
- `contact_name`, `email`, `phone` (text)
- `address`, `city`, `state`, `zip`, `country` (text)
- `payment_terms` (text DEFAULT 'Net 30')
- `is_active` (boolean DEFAULT true)
- `is_preferred` (boolean DEFAULT false)

---

#### `shipment_tracking`
Tracks shipment status for purchase orders.

**Key Columns:**
- `id` (uuid)
- `po_id` (uuid) - References purchase_orders
- `tracking_number` (text)
- `carrier` (text) - 'USPS', 'UPS', 'FedEx', 'DHL', 'Other'
- `carrier_service` (text)
- `status` (text) - 'pending', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'returned'
- `shipped_date`, `estimated_delivery_date`, `actual_delivery_date` (date)
- `tracking_url` (text)
- `tracking_data` (jsonb) - Raw API response
- `auto_tracking_enabled` (boolean)
- `last_checked_at` (timestamptz)

---

## 3. DATA FLOW: RECEIVING WORKFLOW

### Flow Diagram

```
Equipment Planning
    ↓
Create Purchase Order (PO)
    ↓
Link Equipment to PO Line Items
    ↓
Submit PO (status → 'submitted')
    ↓
Add Shipment Tracking Info
    ↓
RECEIVING WORKFLOW:
    ├─ Open PartsReceivingPageNew
    ├─ Page loads POs for project (with status != 'received')
    ├─ Expand PO to see line items
    ├─ For each line item:
    │   ├─ Display: equipment part#, name, quantity_ordered, quantity_received
    │   ├─ Click received quantity to edit
    │   ├─ Update quantity_received (0 to quantity_ordered)
    │   ├─ Save → update purchase_order_items.quantity_received
    │   └─ Recalculate project_equipment.received_quantity
    ├─ OR: Click "Receive All Items in PO" button
    │   └─ Sets all items' quantity_received = quantity_ordered
    ↓
After Each Update:
    ├─ update purchase_order_items.quantity_received
    ├─ SUM all quantity_received for that equipment from ALL line items
    ├─ update project_equipment.received_quantity = sum
    ├─ Set project_equipment.received_date = NOW()
    └─ Invalidate milestone cache for recalculation
    ↓
Track Status:
    ├─ PartsReceivingPageNew calculates PO status: percent = (total_received / total_ordered) * 100
    ├─ Status labels: "Not Received" (0%), "% Received" (1-99%), "Fully Received" (100%)
    └─ Auto-expand outstanding POs (percent < 100)
```

---

## 4. KEY FUNCTIONS & OPERATIONS

### A. PurchaseOrderService (`purchaseOrderService.js`)

#### Core Receiving Functions

**`receiveLineItem(lineItemId, quantityReceived, receivedBy)`**
- **Purpose:** Mark a single PO line item as received
- **Parameters:**
  - `lineItemId` (uuid) - purchase_order_items.id
  - `quantityReceived` (numeric) - Quantity to mark as received
  - `receivedBy` (text) - User who received it
- **Updates:**
  - `purchase_order_items.quantity_received = quantityReceived`
  - `purchase_order_items.actual_delivery_date = today`
  - `purchase_order_items.received_by = receivedBy`
  - `purchase_order_items.received_at = NOW()`
- **Returns:** Updated line item record

**`createPurchaseOrder(poData, lineItems)`**
- **Purpose:** Create new PO with line items
- **Generates:** PO number via `generatePONumber(supplierId)` RPC
- **Line items created with:** `quantity_received: 0` (initial state)
- **Updates:** equipment `ordered_quantity` through subsequent calling code

#### PO Management Functions

**`getPurchaseOrder(poId)`**
- Fetches full PO with related supplier, project, items, and tracking
- Includes nested equipment details

**`getProjectPurchaseOrders(projectId, filters)`**
- Fetches all POs for a project
- Optional filters: milestone_stage, status, supplier_id

**`updatePurchaseOrder(poId, updates)`**
- Updates PO header info (status, dates, amounts)

**`submitPurchaseOrder(poId, submittedBy)`**
- Changes status to 'submitted'
- Records submission timestamp and user

**`addLineItem(poId, lineItem)`**
- Adds new line to existing PO
- Auto-calculates next line_number

**`updateLineItem(lineItemId, updates)`**
- Updates existing line item

**`removeLineItem(lineItemId)`**
- Deletes a line item (before submission)

---

### B. ProjectEquipmentService (`projectEquipmentService.js`)

#### Receiving & Procurement Functions

**`fetchProjectEquipmentByPhase(projectId, phase)`**
- **Purpose:** Get all equipment for a project, optionally filtered by phase
- **Parameters:**
  - `projectId` (uuid)
  - `phase` ('all' | 'prewire' | 'trim')
- **Returns:** Equipment array with quantities and global_part info
- **Key fields returned:**
  - `planned_quantity`, `ordered_quantity`, `received_quantity`
  - `ordered_confirmed`, `onsite_confirmed` (backward compat)
  - `global_part.required_for_prewire` (used for filtering)

**`updateProcurementQuantities(equipmentId, { orderedQty, receivedQty, userId })`**
- **Purpose:** Update ordered/received quantities for equipment
- **Validation:**
  - `receivedQty <= max(orderedQty, plannedQty)`
  - Auto-updates timestamps: `ordered_confirmed_at`, `onsite_confirmed_at`
- **Auto-updates:** Boolean flags for backward compatibility
- **Invalidates:** Milestone cache after update
- **Returns:** Updated equipment record

**`receiveAllForPhase(projectId, phase)`**
- **Purpose:** Bulk mark all ordered equipment as fully received for a phase
- **Logic:**
  1. Fetch all equipment with `ordered_quantity > 0`
  2. Filter by phase (prewire vs trim based on `required_for_prewire`)
  3. Skip already fully received items
  4. Set `received_quantity = ordered_quantity` for all
- **Updates:** `onsite_confirmed_at = NOW()`
- **Returns:** `{ updated: count, message: string }`

**`updateProcurementStatus(equipmentId, { ordered, onsite, userId })`**
- **Purpose:** Toggle boolean procurement flags (legacy)
- **Deprecated:** New code uses `updateProcurementQuantities` instead

---

### C. PartsReceivingPageNew Component Logic

**Key State & Updates:**

1. **Load Purchase Orders**
   ```javascript
   // Fetch all POs with nested line items and equipment details
   .select(`
     *,
     supplier:suppliers(name),
     items:purchase_order_items(
       *,
       equipment:project_equipment(
         id, name, part_number, received_quantity, 
         ordered_quantity, global_part:global_part_id(required_for_prewire)
       )
     )
   `)
   .eq('project_id', projectId)
   .order('order_date', { ascending: false })
   ```

2. **Calculate PO Status**
   ```javascript
   const totalOrdered = items.reduce((sum, item) => 
     sum + (item.quantity_ordered || 0), 0);
   const totalReceived = items.reduce((sum, item) => 
     sum + (item.quantity_received || 0), 0);
   const percent = (totalReceived / totalOrdered) * 100;
   // Returns: "Not Received" (0%), "XX% Received" (1-99%), "Fully Received" (100%)
   ```

3. **Update Single Line Item**
   ```javascript
   // Updates purchase_order_items.quantity_received
   await supabase.from('purchase_order_items')
     .update({ quantity_received: newQuantity })
     .eq('id', lineItemId);
   
   // Recalculate total received for equipment
   const { data: allItems } = await supabase
     .from('purchase_order_items')
     .select('quantity_received')
     .eq('project_equipment_id', projectEquipmentId);
   
   const totalReceived = allItems.reduce(
     (sum, item) => sum + (item.quantity_received || 0), 0
   );
   
   // Update equipment with new total
   await supabase.from('project_equipment')
     .update({
       received_quantity: totalReceived,
       received_date: NOW()
     })
     .eq('id', projectEquipmentId);
   
   // Invalidate cache
   milestoneCacheService.invalidate(projectId);
   ```

4. **Receive All Items in PO**
   - Loops through all items in PO
   - Sets quantity_received = quantity_ordered for each
   - Triggers same update cascade as above

---

## 5. QR CODE & BARCODE SCANNING

### ScanTagPage Component

**Technology:** Html5Qrcode library with fallback to native BarcodeDetector API

**Features:**
- Primary: Uses BarcodeDetector API (Chrome/Android)
- Fallback: Html5Qrcode for iOS Safari and other browsers
- Manual UID entry fallback for camera failures

**Scan Flow:**
```
Point camera at QR tag
    ↓
Detect QR code value (UID)
    ↓
Call wireDropService.getWireDropByUid(uid)
    ↓
Navigate to /wire-drops/{wireDropId}
    ↓
Wire drop detail page opens with scanned context
```

**Note:** Current implementation scans for WIRE DROP tags, not equipment receiving. Equipment receiving uses manual quantity entry in PartsReceivingPageNew.

---

## 6. RECEIVING WITHOUT PURCHASE ORDERS (Legacy)

### PartsReceivingPage (Legacy)

**Alternative workflow** for direct equipment receiving without PO reference:

1. **Load Equipment by Phase**
   - Fetches all equipment for project
   - Filters by phase (prewire/trim based on `required_for_prewire`)
   - Sorts by items with orders first

2. **Update Received Quantities**
   - Calls `projectEquipmentService.updateProcurementQuantities()`
   - Directly updates `project_equipment.received_quantity`

3. **Quick Receive**
   - Button: "Receive All" sets received_quantity = ordered_quantity

**Differences from PO-based:**
- No PO line item tracking
- No supplier/shipping info
- Direct equipment updates
- No intermediate line_items table

---

## 7. STATE UPDATES & CACHING

### When Equipment is Received:

1. **Database Updates (Cascading):**
   ```
   purchase_order_items.quantity_received
        ↓
   SUM for each project_equipment
        ↓
   project_equipment.received_quantity
   project_equipment.received_date
   project_equipment.onsite_confirmed_at
   ```

2. **Cache Invalidation:**
   ```javascript
   milestoneCacheService.invalidate(projectId)
   // Triggers recalculation of:
   // - Milestone progress
   // - Material readiness
   // - Budget tracking
   ```

3. **UI Updates:**
   - Page reloads equipment/POs
   - PO status recalculated
   - Badges updated (Fully Received, % Received, etc.)
   - Outstanding POs auto-expanded

---

## 8. LINKS BETWEEN RECEIVING & PURCHASE ORDERS

### Connection Points:

| Concept | Table 1 | Table 2 | Link Field |
|---------|---------|---------|-----------|
| Equipment → PO Items | project_equipment | purchase_order_items | `purchase_order_items.project_equipment_id` |
| PO Items → PO | purchase_order_items | purchase_orders | `purchase_order_items.po_id` |
| Equipment Quantities | project_equipment | purchase_order_items | Summed from all line items |
| Project Context | project_equipment | purchase_orders | Both have `project_id` |
| Supplier Context | purchase_orders | project_equipment.supplier | No direct FK; match by supplier field |

### Query Example: Get All Equipment for PO
```sql
SELECT 
  pe.*,
  poi.quantity_ordered,
  poi.quantity_received,
  poi.expected_delivery_date,
  poi.actual_delivery_date
FROM project_equipment pe
JOIN purchase_order_items poi ON pe.id = poi.project_equipment_id
WHERE poi.po_id = $1
ORDER BY poi.line_number;
```

---

## 9. ROUTING & NAVIGATION

### Routes in App.js

```javascript
// Receiving (PO-based)
path: "/projects/:projectId/receiving"
component: PartsReceivingPageNew

// Order Equipment (Create/manage POs)
path: "/projects/:projectId/order-equipment"
component: PMOrderEquipmentPageEnhanced

// Scan Wire Drops
path: "/scan-tag"
component: ScanTagPage
```

### Navigation Flow

```
Project View
    ↓
"Order Equipment" button → /projects/:projectId/order-equipment
    ├─ Select equipment
    ├─ Group by supplier
    ├─ Create PO (via POGenerationModal)
    └─ Opens PODetailsModal to review
    
    ↓
"Receive Equipment" button → /projects/:projectId/receiving
    ├─ View all POs
    ├─ Expand outstanding POs
    ├─ Update received quantities
    └─ Track receiving progress
```

---

## 10. COMPLETE RECEIVING WORKFLOW SUMMARY

### Step-by-Step

**1. Planning Phase**
- Equipment is added to project
- Quantities set in `project_equipment.planned_quantity`
- Equipment assigned to global parts (prewire/trim categorization)

**2. Ordering Phase**
- Navigate to "Order Equipment"
- Select equipment to order
- Group by supplier
- Create PO → auto-generates PO number, creates line items
- Status: `draft` → `submitted`
- `project_equipment.ordered_quantity` updated
- `project_equipment.ordered_confirmed_at` set

**3. Shipment Tracking Phase**
- Add tracking numbers to PO
- Optionally set expected delivery dates
- Track shipment status via carrier APIs

**4. Receiving Phase**
- Navigate to "Receive Equipment"
- For each PO:
  - View line items with current received quantities
  - Update `quantity_received` for each line (click to edit)
  - OR click "Receive All Items in PO" for bulk receive
  - After each update:
    - `purchase_order_items.quantity_received` updated
    - Sum calculated from ALL line items for that equipment
    - `project_equipment.received_quantity` updated
    - `project_equipment.received_date` set
    - Milestone cache invalidated

**5. Completion**
- PO status updates as items received
- When all items received: status → `received`
- Equipment marked as `onsite_confirmed`
- Milestones recalculate with updated material status

---

## 11. EXAMPLE DATA FLOW

### Scenario: Receive Part of a Purchase Order

```
Starting State:
├─ PO-123: 10 network switches ordered
├─ purchase_order_items[line-1]:
│   ├─ quantity_ordered: 10
│   ├─ quantity_received: 0
│   └─ project_equipment_id: eq-456
└─ project_equipment[eq-456]:
    ├─ ordered_quantity: 10
    └─ received_quantity: 0

User Action: Update line-1 received quantity to 5

Updates Applied:
1. purchase_order_items[line-1]:
   └─ quantity_received: 5

2. Calculate sum for eq-456:
   ├─ SELECT SUM(quantity_received) 
   ├─ FROM purchase_order_items
   ├─ WHERE project_equipment_id = 'eq-456'
   └─ Result: 5

3. project_equipment[eq-456]:
   ├─ received_quantity: 5
   └─ received_date: 2025-10-26T14:30:00Z

4. Cache invalidation:
   └─ milestoneCacheService.invalidate(projectId)

5. UI Updates:
   ├─ PO status: "50% Received"
   ├─ Line item shows: "5/10 received"
   └─ Outstanding POs remain expanded
```

---

## 12. KEY FILES REFERENCE

### Services
- `/src/services/purchaseOrderService.js` - 525 lines
- `/src/services/projectEquipmentService.js` - 1292 lines
- `/src/services/milestoneCacheService.js` - Cache management
- `/src/services/equipmentService.js` - Legacy equipment ops

### Components
- `/src/components/PartsReceivingPageNew.js` - 570 lines (Main receiving)
- `/src/components/PartsReceivingPage.js` - 443 lines (Legacy)
- `/src/components/PMOrderEquipmentPageEnhanced.js` - Equipment ordering
- `/src/components/procurement/PODetailsModal.js` - PO details/tracking
- `/src/components/ScanTagPage.js` - QR code scanning

### Database Schemas
- `/supabase/procurement_system_fixed.sql` - Purchase order tables
- `/supabase/add_quantity_tracking.sql` - Quantity fields & triggers
- `/supabase/add_equipment_instances.sql` - Instance tracking

---

## 13. IMPORTANT NOTES

### About `received_quantity` in project_equipment

There are **TWO different uses** depending on context:

1. **Quantity Tracking** (numeric field in `project_equipment`):
   - Represents total units received for equipment
   - Summed from all purchase_order_items for that equipment
   - Used in PartsReceivingPageNew workflow

2. **Instance Tracking** (boolean 0/1 in `project_equipment`):
   - Used when equipment split into individual instances
   - 0 = not received, 1 = received
   - For individual device tracking (e.g., each access point separately)

### Backward Compatibility

Boolean fields are **automatically synced** with numeric quantities:
- `ordered_confirmed` ← auto-updated from `ordered_quantity > 0`
- `onsite_confirmed` ← auto-updated from `received_quantity >= planned_quantity`
- Trigger: `trg_sync_procurement_flags` handles this

### Constraint Validation

Cannot receive more than planned or ordered:
```sql
CHECK (received_quantity <= GREATEST(
  COALESCE(ordered_quantity, 0), 
  COALESCE(planned_quantity, 0)
))
```

---

## Summary

The equipment receiving workflow is **PO-centric** in the primary implementation (PartsReceivingPageNew), with:

1. **Data capture** via expandable PO line items
2. **Quantity tracking** in two tables: purchase_order_items (per-line) and project_equipment (aggregated)
3. **Phase-based organization** (prewire/trim) tied to global parts
4. **State synchronization** via cascading updates and automatic flag syncing
5. **Milestone impact** through cache invalidation after each receive
6. **Optional QR scanning** for wire drops (not equipment receiving directly)
7. **Supplier linkage** through purchase_orders and shipment_tracking

The workflow supports both **granular per-item receiving** (edit each line) and **bulk operations** (receive all items in PO).
