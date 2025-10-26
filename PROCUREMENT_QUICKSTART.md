# Procurement System - Quick Start Guide

## 10-Minute Setup

Follow these steps to get the procurement system running:

### Step 1: Database Migration (2 minutes)

**IMPORTANT:** Use the fixed version that works without the profiles table:

```bash
# Option A: Via Supabase Dashboard
1. Go to SQL Editor in Supabase Dashboard
2. Copy contents of supabase/procurement_system_fixed.sql
3. Paste and click "Run"

# Option B: Via psql
psql <your-supabase-connection-string> -f supabase/procurement_system_fixed.sql
```

**Note:** If you get an error about "relation public.profiles does not exist", see [FIX_PROCUREMENT_ERROR.md](FIX_PROCUREMENT_ERROR.md) for details.

Verify tables created:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('suppliers', 'purchase_orders', 'purchase_order_items', 'shipment_tracking');
```

### Step 2: Environment Variables (1 minute)

Add to your `.env` file:

```env
# === REQUIRED ===
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_anon_key

# === OPTIONAL: Tracking APIs ===

# Option 1: AfterShip (Recommended - easiest, 200 free/month)
REACT_APP_AFTERSHIP_API_KEY=your_aftership_key

# Option 2: Individual carriers (more setup, free)
REACT_APP_USPS_USER_ID=your_usps_user_id
REACT_APP_UPS_ACCESS_KEY=your_ups_key
REACT_APP_UPS_CLIENT_ID=your_ups_client_id
REACT_APP_UPS_CLIENT_SECRET=your_ups_secret
REACT_APP_FEDEX_API_KEY=your_fedex_key
REACT_APP_FEDEX_SECRET_KEY=your_fedex_secret
REACT_APP_DHL_API_KEY=your_dhl_key

# Note: System works WITHOUT APIs - tracking URLs still function
```

### Step 3: Add Services to Your App (2 minutes)

The services are already created in `src/services/`:
- ✅ `supplierService.js`
- ✅ `purchaseOrderService.js`
- ✅ `trackingService.js`

No additional setup needed!

### Step 4: Test Basic Functionality (5 minutes)

#### Create a Test Supplier

```javascript
import { supplierService } from './services/supplierService';

const testSupplier = await supplierService.createSupplier({
  name: 'Test Supplier Co',
  short_code: 'TEST',
  contact_name: 'John Doe',
  email: 'john@test.com',
  phone: '555-1234',
  payment_terms: 'Net 30'
});

console.log('Supplier created:', testSupplier);
```

#### Link Equipment to Supplier

Update your existing equipment supplier field:

```sql
-- Via SQL Editor
UPDATE project_equipment
SET supplier = 'Test Supplier Co'
WHERE project_id = 'your-project-id'
  AND part_number LIKE 'CAT6%';
```

Or via code:

```javascript
import { supplierService } from './services/supplierService';

await supplierService.linkEquipmentToSupplier(
  [equipmentId1, equipmentId2],
  supplierId
);
```

#### Create a Purchase Order

```javascript
import { purchaseOrderService } from './services/purchaseOrderService';

// Get equipment grouped by supplier
const grouped = await supplierService.getEquipmentGroupedBySupplier(
  projectId,
  'prewire_prep'
);

// Create PO for first supplier
const supplierData = Object.values(grouped)[0];
const equipmentIds = supplierData.equipment.map(e => e.equipment_id);

const po = await purchaseOrderService.createPOFromEquipment(
  projectId,
  supplierData.supplier.id,
  'prewire_prep',
  equipmentIds
);

console.log('PO created:', po.po_number);
// Output: PO-2025-001-TEST-001
```

#### Add Tracking

```javascript
import { trackingService } from './services/trackingService';

await trackingService.addTracking(po.id, {
  tracking_number: '1Z999AA10123456784',
  carrier: 'UPS',
  shipped_date: '2025-11-01',
  auto_tracking_enabled: true
});

console.log('Tracking added!');
```

## Minimal UI Integration

### Add to Existing PM Dashboard

Update `src/components/PMDashboard.js`:

```javascript
import { useState, useEffect } from 'react';
import { purchaseOrderService } from '../services/purchaseOrderService';

function PMDashboard({ projectId }) {
  const [pos, setPOs] = useState([]);

  useEffect(() => {
    loadPOs();
  }, [projectId]);

  const loadPOs = async () => {
    const data = await purchaseOrderService.getProjectPurchaseOrders(projectId);
    setPOs(data);
  };

  return (
    <div>
      {/* Your existing dashboard content */}

      {/* Add this section */}
      <div className="procurement-section">
        <h3>Purchase Orders ({pos.length})</h3>
        {pos.map(po => (
          <div key={po.id} style={{
            border: '1px solid #ccc',
            padding: '10px',
            margin: '10px 0'
          }}>
            <strong>{po.po_number}</strong> - {po.supplier_name}
            <br />
            Status: {po.status} | ${po.total_amount}
            <br />
            Items: {po.items_received}/{po.item_count} received
          </div>
        ))}
      </div>
    </div>
  );
}
```

That's it! You now have:
- ✅ Purchase order tracking
- ✅ Supplier management
- ✅ Auto-generated PO numbers
- ✅ Basic shipment tracking

## Common Workflows

### Workflow 1: Create POs for Prewire Stage

```javascript
// 1. Get equipment that needs to be ordered
const grouped = await supplierService.getEquipmentGroupedBySupplier(
  projectId,
  'prewire_prep'
);

// 2. Create a PO for each supplier
for (const [supplierName, data] of Object.entries(grouped)) {
  if (data.equipment.length === 0) continue;

  const equipmentIds = data.equipment
    .filter(e => e.quantity_to_order > 0)
    .map(e => e.equipment_id);

  if (equipmentIds.length === 0) continue;

  const po = await purchaseOrderService.createPOFromEquipment(
    projectId,
    data.supplier.id,
    'prewire_prep',
    equipmentIds,
    {
      requested_delivery_date: '2025-12-01',
      ship_to_address: projectAddress
    }
  );

  console.log(`Created ${po.po_number} for ${supplierName}`);
}
```

### Workflow 2: Mark Items as Received

```javascript
// When items arrive, mark them received
const po = await purchaseOrderService.getPurchaseOrder(poId);

for (const item of po.items) {
  await purchaseOrderService.receiveLineItem(
    item.id,
    item.quantity_ordered, // Or partial quantity
    currentUserId
  );
}

// This automatically:
// - Updates project_equipment.received_quantity
// - Recalculates milestone percentages
// - Changes PO status to 'received'
```

### Workflow 3: Track Multiple Shipments

```javascript
// Add multiple tracking numbers to one PO
const trackingNumbers = [
  { number: '1Z999', carrier: 'UPS' },
  { number: '9400', carrier: 'USPS' },
  { number: '7749', carrier: 'FEDEX' }
];

for (const tracking of trackingNumbers) {
  await trackingService.addTracking(poId, {
    tracking_number: tracking.number,
    carrier: tracking.carrier,
    auto_tracking_enabled: true
  });
}

// Refresh all tracking
await trackingService.refreshAllActiveTracking(projectId);
```

## Verification Checklist

After setup, verify these work:

- [ ] Suppliers table has sample data
- [ ] Can create new supplier
- [ ] Equipment links to supplier names
- [ ] Can generate PO number
- [ ] PO created with line items
- [ ] Line item totals calculate correctly
- [ ] Can add tracking number
- [ ] Tracking URL generated correctly
- [ ] Receiving items updates equipment quantities
- [ ] Milestone percentages recalculate

## Troubleshooting

### "Function generate_po_number does not exist"
```sql
-- Verify function exists
SELECT routine_name FROM information_schema.routines
WHERE routine_name = 'generate_po_number';

-- If not, re-run the migration SQL
```

### "Table suppliers does not exist"
```sql
-- Check if tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE '%supplier%';

-- If empty, re-run migration
```

### PO Numbers Not Incrementing
```sql
-- Check sequence table
SELECT * FROM po_sequence;

-- Should show current year and sequence count
-- If empty, it will auto-create on first PO
```

### Quantities Not Syncing
```sql
-- Verify trigger exists
SELECT trigger_name FROM information_schema.triggers
WHERE trigger_name = 'trg_sync_equipment_quantities';

-- Test manually
SELECT
  pe.id,
  pe.name,
  pe.ordered_quantity,
  pe.received_quantity,
  coalesce(sum(poi.quantity_ordered), 0) as total_ordered,
  coalesce(sum(poi.quantity_received), 0) as total_received
FROM project_equipment pe
LEFT JOIN purchase_order_items poi ON poi.project_equipment_id = pe.id
WHERE pe.project_id = 'your-project-id'
GROUP BY pe.id, pe.name, pe.ordered_quantity, pe.received_quantity;
```

## Performance Considerations

For large projects with many POs:

1. **Indexing**: All necessary indexes created by migration
2. **Views**: Use `purchase_orders_summary` view instead of joining manually
3. **Batch Operations**: Refresh tracking in batches, not all at once
4. **Caching**: Consider caching PO lists for 5-10 minutes

```javascript
// Example: Batch tracking refresh
const BATCH_SIZE = 10;
const trackings = await getActiveTrackings();

for (let i = 0; i < trackings.length; i += BATCH_SIZE) {
  const batch = trackings.slice(i, i + BATCH_SIZE);
  await Promise.all(
    batch.map(t => trackingService.refreshTracking(t.id))
  );
  // Wait 1 second between batches to avoid rate limits
  await new Promise(resolve => setTimeout(resolve, 1000));
}
```

## Next Steps

1. **Add UI Components**: Use the examples in `PROCUREMENT_UI_GUIDE.md`
2. **Configure Tracking API**: Choose AfterShip or individual carriers
3. **Customize PO Template**: Create printable PO format
4. **Set Up Webhooks**: For automatic tracking updates
5. **Add Notifications**: Email/SMS when items delivered

## Support Resources

- **Setup Guide**: `PROCUREMENT_SYSTEM_SETUP.md` - Full documentation
- **UI Guide**: `PROCUREMENT_UI_GUIDE.md` - React component examples
- **Database Schema**: `supabase/procurement_system.sql` - All tables and functions
- **Services**: `src/services/*Service.js` - API wrappers

---

**Total Setup Time**: ~10 minutes
**Result**: Full procurement system with PO management and tracking!
