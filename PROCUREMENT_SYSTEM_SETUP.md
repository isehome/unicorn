# Procurement & Purchase Order System - Setup Guide

## Overview

A comprehensive supplier and purchase order management system that integrates with your existing milestone tracking. This system allows you to:

1. **Manage Suppliers** - Maintain supplier catalog with contacts and account info
2. **Group Equipment by Supplier** - Automatically organize equipment by supplier for each milestone (prewire_prep, trim_prep)
3. **Generate Purchase Orders** - Create POs with auto-generated PO numbers (Format: `PO-2025-001-ABC-001`)
4. **Track Shipments** - Add tracking numbers and automatically fetch ETA data from carriers
5. **Monitor Delivery Status** - Real-time tracking updates and delivery notifications

## Database Setup

### 1. Run the Migration

Apply the procurement system migration to your Supabase database:

```bash
# Connect to your Supabase project
psql <your-connection-string>

# Run the migration
\i supabase/procurement_system.sql
```

Or via Supabase Dashboard:
1. Go to SQL Editor
2. Copy contents of `supabase/procurement_system.sql`
3. Click "Run"

### 2. Verify Tables Created

The migration creates these tables:
- `suppliers` - Master supplier catalog
- `purchase_orders` - Purchase order header records
- `purchase_order_items` - Line items for each PO
- `shipment_tracking` - Tracking information per PO
- `supplier_contacts` - Multiple contacts per supplier
- `po_sequence` - Auto-incrementing PO numbers

### 3. Add Sample Suppliers

The migration includes 5 sample suppliers:
- Amazon Business (AMZ)
- Crestron Electronics (CRS)
- Control4 (C4)
- ADI Global Distribution (ADI)
- Home Depot Pro (HDP)

You can add more via the UI or SQL.

## Carrier Tracking API Setup

The system supports multiple carrier tracking options:

### Option 1: Individual Carrier APIs (Free, More Setup)

#### USPS Tracking
1. Register for USPS Web Tools: https://www.usps.com/business/web-tools-apis/
2. Get your User ID
3. Add to `.env`:
   ```
   REACT_APP_USPS_USER_ID=your_user_id_here
   ```

#### UPS Tracking
1. Register for UPS Developer Kit: https://www.ups.com/upsdeveloperkit
2. Get OAuth credentials
3. Add to `.env`:
   ```
   REACT_APP_UPS_ACCESS_KEY=your_key_here
   REACT_APP_UPS_CLIENT_ID=your_client_id_here
   REACT_APP_UPS_CLIENT_SECRET=your_secret_here
   ```

#### FedEx Tracking
1. Register at FedEx Developer Portal: https://developer.fedex.com/
2. Get API credentials
3. Add to `.env`:
   ```
   REACT_APP_FEDEX_API_KEY=your_key_here
   REACT_APP_FEDEX_SECRET_KEY=your_secret_here
   ```

### Option 2: AfterShip (Recommended - Easiest)

AfterShip provides unified tracking for 900+ carriers with a single API.

**Free Tier**: 200 shipments/month

1. Sign up at https://www.aftership.com/
2. Get your API key from Settings
3. Add to `.env`:
   ```
   REACT_APP_AFTERSHIP_API_KEY=your_api_key_here
   ```

**Supported carriers**: USPS, UPS, FedEx, DHL, Amazon, and 900+ more

### Option 3: Manual Tracking (No API Required)

The system works without any API integration. You can:
- Add tracking numbers manually
- Use carrier tracking URLs (auto-generated)
- Update status manually

## Services

### supplierService.js

Manages supplier CRUD operations:

```javascript
import { supplierService } from './services/supplierService';

// Get all active suppliers
const suppliers = await supplierService.getAllSuppliers(true);

// Create new supplier
const supplier = await supplierService.createSupplier({
  name: 'Acme Electronics',
  short_code: 'ACME',  // 2-6 characters for PO numbers
  contact_name: 'John Doe',
  email: 'john@acme.com',
  phone: '555-1234',
  payment_terms: 'Net 30'
});

// Get equipment grouped by supplier for a milestone
const grouped = await supplierService.getEquipmentGroupedBySupplier(
  projectId,
  'prewire_prep'
);
```

### purchaseOrderService.js

Handles purchase order creation and management:

```javascript
import { purchaseOrderService } from './services/purchaseOrderService';

// Create PO from equipment selection
const po = await purchaseOrderService.createPOFromEquipment(
  projectId,
  supplierId,
  'prewire_prep',  // or 'trim_prep'
  [equipmentId1, equipmentId2, ...],
  {
    ship_to_address: '123 Main St...',
    requested_delivery_date: '2025-11-15',
    supplier_notes: 'Please rush this order'
  }
);

// Get all POs for a project
const pos = await purchaseOrderService.getProjectPurchaseOrders(projectId);

// Submit PO to supplier
await purchaseOrderService.submitPurchaseOrder(poId, userId);

// Mark items as received
await purchaseOrderService.receiveLineItem(lineItemId, quantityReceived, userId);
```

### trackingService.js

Manages shipment tracking:

```javascript
import { trackingService } from './services/trackingService';

// Add tracking to PO
const tracking = await trackingService.addTracking(poId, {
  tracking_number: '1Z999AA10123456784',
  carrier: 'UPS',
  carrier_service: 'Ground',
  shipped_date: '2025-11-01',
  auto_tracking_enabled: true
});

// Refresh tracking data from carrier API
await trackingService.refreshTracking(trackingId);

// Refresh all active shipments for a project
await trackingService.refreshAllActiveTracking(projectId);

// Get delivery summary
const summary = await trackingService.getProjectDeliverySummary(projectId);
// Returns: { total_shipments, in_transit, delivered, exceptions, ... }
```

## Workflow

### 1. Setup Suppliers

Add all your vendors to the supplier catalog with their information.

### 2. Import Equipment

Import your equipment CSV as usual. Ensure the `supplier` column contains supplier names that match your supplier records.

### 3. Create Purchase Orders by Milestone

For **Prewire Prep**:
```javascript
// Get equipment grouped by supplier
const grouped = await supplierService.getEquipmentGroupedBySupplier(
  projectId,
  'prewire_prep'
);

// For each supplier, create a PO
for (const [supplierName, data] of Object.entries(grouped)) {
  const equipmentIds = data.equipment.map(e => e.equipment_id);
  const po = await purchaseOrderService.createPOFromEquipment(
    projectId,
    data.supplier.id,
    'prewire_prep',
    equipmentIds
  );
}
```

For **Trim Prep**: Same process with `'trim_prep'` milestone stage.

### 4. Submit POs

Review and submit purchase orders to suppliers. The system generates a unique PO number like `PO-2025-001-AMZ-001`.

### 5. Add Tracking Information

When supplier provides tracking:
```javascript
await trackingService.addTracking(poId, {
  tracking_number: '...',
  carrier: 'UPS',
  auto_tracking_enabled: true
});
```

### 6. Monitor Deliveries

The system will:
- Auto-refresh tracking status (if APIs configured)
- Update estimated delivery dates
- Mark items as delivered
- Sync quantities to `project_equipment.received_quantity`
- Update milestone completion percentages automatically

## Auto-Calculations

The system automatically:

1. **Updates Equipment Quantities**
   - `ordered_quantity` = sum of all PO line item quantities
   - `received_quantity` = sum of all received quantities
   - These trigger milestone percentage recalculations

2. **Updates PO Status**
   - `partially_received` when some items received
   - `received` when all items received
   - Based on line item quantities

3. **Generates PO Numbers**
   - Format: `PO-YEAR-SEQ-SUPPLIER-SEQ`
   - Example: `PO-2025-001-ABC-001`
   - Unique per year, supplier, and overall sequence

4. **Calculates PO Totals**
   - Subtotal from line items
   - Total = subtotal + tax + shipping

## Database Views

### purchase_orders_summary

Pre-joined view with supplier, project, and item counts:

```sql
SELECT * FROM purchase_orders_summary
WHERE project_id = 'xxx'
ORDER BY created_at DESC;
```

### equipment_for_po

Shows equipment ready to be ordered, grouped by milestone:

```sql
SELECT * FROM equipment_for_po
WHERE project_id = 'xxx'
  AND milestone_stage = 'prewire_prep'
  AND quantity_to_order > 0
ORDER BY supplier, name;
```

## Integration with Milestones

The system seamlessly integrates with your existing milestone tracking:

- **Prewire Prep**: Orders/receives equipment where `required_for_prewire = true`
- **Trim Prep**: Orders/receives equipment where `required_for_prewire = false`

When you receive items:
1. `purchase_order_items.quantity_received` is updated
2. Trigger syncs to `project_equipment.received_quantity`
3. `milestoneService.calculatePrewirePrepPercentage()` automatically recalculates
4. Milestone percentages update in real-time

## Security

All tables have RLS (Row Level Security) enabled:
- Authenticated users: Full read/write access
- Anonymous users: Read-only access (for public dashboards)

Adjust policies in the migration SQL as needed for your security requirements.

## API Endpoints Needed (if using Vercel/Edge Functions)

For tracking APIs that require server-side calls, create these endpoints:

### `/api/tracking/refresh`
```javascript
// Calls carrier APIs from server-side to avoid CORS
POST /api/tracking/refresh
Body: { trackingId: 'xxx' }
```

### `/api/tracking/aftership`
```javascript
// AfterShip webhook endpoint for automatic updates
POST /api/tracking/aftership
Body: { /* AfterShip webhook payload */ }
```

## Troubleshooting

### PO Numbers Not Generating
- Ensure `po_sequence` table exists
- Check RLS policies allow inserts
- Verify `generate_po_number()` function exists

### Tracking Not Updating
- Check API credentials in `.env`
- Verify `auto_tracking_enabled = true`
- Check carrier name matches exactly (case-sensitive)
- Review browser console for API errors

### Quantities Not Syncing
- Verify triggers are created: `trg_sync_equipment_quantities`
- Check `project_equipment` has `ordered_quantity` and `received_quantity` columns
- Ensure foreign keys are correct

### Milestone Percentages Not Updating
- Ensure `global_parts.required_for_prewire` is set correctly
- Verify `project_equipment.global_part_id` is linked
- Check `milestoneService` is being called after quantity updates

## Next Steps

1. **Apply the migration** - Run `procurement_system.sql`
2. **Configure tracking APIs** - Choose your preferred option
3. **Build UI components** - Use the services to create React components
4. **Test workflow** - Create a test project and run through the full cycle
5. **Customize** - Adjust to your specific business rules

## Support

For issues or questions:
- Check the inline code comments in the service files
- Review the database migration comments
- Examine the view definitions for data relationships

---

**Created**: 2025-10-25
**Version**: 1.0
