# Procurement System - Setup Instructions

## ✅ What's Been Built

The procurement system now includes **automatic vendor matching** during CSV import!

When you import equipment CSV files, the system will:
1. Extract supplier names from the CSV
2. Use fuzzy matching to find existing suppliers in the database
3. Auto-create new suppliers if no match is found
4. Link equipment to suppliers automatically

---

## 🚀 Setup Steps (Do These In Order)

### Step 1: Apply Database Migrations ⚠️ REQUIRED

You need to run **TWO** SQL migrations in Supabase:

#### Migration 1: Procurement Tables
**File:** `supabase/procurement_system_fixed.sql`

**What it does:**
- Creates `suppliers` table
- Creates `purchase_orders` table
- Creates `purchase_order_items` table
- Creates `shipment_tracking` table
- Creates `supplier_contacts` table
- Creates `po_sequence` table
- Creates auto-numbering function
- Seeds 5 sample suppliers (Amazon, Crestron, Control4, ADI, Home Depot)

**How to apply:**
1. Open Supabase SQL Editor
2. Copy the entire contents of `supabase/procurement_system_fixed.sql`
3. Paste and click "Run"
4. Verify: Check that `suppliers` table exists with 5 rows

#### Migration 2: Add supplier_id to Equipment
**File:** `supabase/add_supplier_id_to_equipment.sql`

**What it does:**
- Adds `supplier_id` column to `project_equipment` table
- Creates index for fast lookups
- Links equipment to suppliers

**How to apply:**
1. Open Supabase SQL Editor
2. Copy the entire contents of `supabase/add_supplier_id_to_equipment.sql`
3. Paste and click "Run"
4. Verify: Check that `project_equipment` table has `supplier_id` column

---

### Step 2: Re-Import Your Equipment CSV

After applying the migrations, you need to re-import your equipment CSV to trigger the automatic vendor matching:

1. Go to your project
2. Go to Inventory Management (bottom of project page)
3. Click "Import CSV" or "Replace" button
4. Select your equipment CSV file
5. Import the file

**Watch the browser console for vendor matching logs:**
```
[Vendor Matching] Processing 3 unique vendors from CSV...
[Vendor Matching] ✓ Matched "Amazon Business" to "Amazon Business" (95% confidence)
[Vendor Matching] ✓ Matched "Crestron" to "Crestron Electronics" (88% confidence)
[Vendor Matching] ➕ Creating new vendor: "New Vendor Inc"
[Vendor Matching] ✓ Created vendor "New Vendor Inc" with short code: NVI
[Vendor Matching] Complete: Processed 3/3 vendors
[Vendor Linking] Linking 45 equipment items to vendors...
[Vendor Linking] ✓ Linked 45 items to vendors
```

---

### Step 3: Test Vendor View

1. Navigate to Order Equipment page
2. Select "Prewire Prep" tab
3. Click "Vendor View" toggle
4. You should now see:
   - Equipment grouped by vendor
   - Match badges (green for matched, blue for new)
   - Vendor stats summary
   - Expandable vendor cards

**Expected Result:**
```
┌─────────────────────────────────────┐
│ Vendor Stats                        │
│ Total Vendors: 3                    │
│ Matched: 2                          │
│ New Vendors: 1                      │
├─────────────────────────────────────┤
│ Amazon Business  ✅ 95% Match      │
│ 15 items • $1,234.56                │
│ [Generate PO]                       │
├─────────────────────────────────────┤
│ Crestron Electronics  ✅ 88% Match │
│ 8 items • $5,678.90                 │
│ [Generate PO]                       │
├─────────────────────────────────────┤
│ New Vendor Inc  🔵 Will Create New │
│ 3 items • $456.00                   │
│ [Create Vendor & Generate PO]       │
└─────────────────────────────────────┘
```

---

## How the Vendor Matching Works

### During CSV Import:

1. **Extract Suppliers:**
   - System reads the "Supplier" column from your CSV
   - Collects all unique supplier names

2. **Fuzzy Matching:**
   - For each supplier name, searches existing `suppliers` table
   - Uses fuse.js algorithm with 70% confidence threshold
   - Matches variations like:
     - "Amazon" → "Amazon Business" ✅
     - "Crestron" → "Crestron Electronics" ✅
     - "C4" → "Control4" ✅

3. **Auto-Create:**
   - If no match found (confidence < 70%), creates new supplier
   - Generates short code (e.g., "New Vendor Inc" → "NVI")
   - Stores in `suppliers` table

4. **Link Equipment:**
   - Updates `project_equipment.supplier_id` with matched/created supplier ID
   - Equipment is now linked to suppliers table

### Viewing Grouped Equipment:

When you switch to "Vendor View":
- Service queries equipment with JOIN to suppliers table
- Groups by `supplier_id`
- Shows supplier details from `suppliers` table
- Display match status and confidence

---

## Troubleshooting

### Issue: "Failed to group equipment by vendor"

**Cause:** Database migrations not applied

**Fix:**
1. Apply `procurement_system_fixed.sql`
2. Apply `add_supplier_id_to_equipment.sql`
3. Re-import CSV

### Issue: All vendors show "Unassigned"

**Cause:** Equipment not linked to suppliers yet

**Fix:**
1. Verify migrations applied (check `supplier_id` column exists)
2. Re-import equipment CSV
3. Check console logs for matching results

### Issue: "Table suppliers does not exist"

**Cause:** Procurement migration not applied

**Fix:**
1. Apply `supabase/procurement_system_fixed.sql`
2. Verify `suppliers` table created with 5 seed rows

### Issue: Vendor matching not working

**Cause:** Old equipment data imported before vendor matching was added

**Fix:**
1. Delete existing equipment from project
2. Re-import CSV (will trigger vendor matching)
3. OR manually run vendor matching on existing data (contact for script)

---

## Verifying Setup

### Check 1: Suppliers Table Exists
```sql
SELECT count(*) FROM suppliers;
-- Should return: 5 (seed suppliers)
```

### Check 2: Equipment Has supplier_id
```sql
SELECT id, name, supplier, supplier_id
FROM project_equipment
WHERE supplier IS NOT NULL
LIMIT 5;
-- Should show supplier_id populated
```

### Check 3: Vendor Matching Logs
Open browser console during CSV import, should see:
- `[Vendor Matching]` messages
- `[Vendor Linking]` messages
- Success counts

---

## What's Next

After setup is complete, you can:

1. **View by Vendor:**
   - Go to Order Equipment → Vendor View
   - See equipment grouped by supplier
   - View match confidence badges

2. **Generate POs** (coming soon):
   - Click "Generate PO" on a vendor
   - Auto-number: PO-2025-001-AMZ-001
   - Export PDF, CSV, Email

3. **Track Deliveries** (coming soon):
   - Add tracking numbers
   - Monitor shipment status
   - Get ETAs

---

## Migration Files Summary

| File | Purpose | Status |
|------|---------|--------|
| `procurement_system_fixed.sql` | Creates procurement tables & functions | ⚠️ Must apply |
| `add_supplier_id_to_equipment.sql` | Adds supplier linking to equipment | ⚠️ Must apply |
| `add_global_parts.sql` | Global parts catalog (already applied?) | ℹ️ Check if exists |

---

## Support

If vendor matching isn't working:
1. Check browser console for error messages
2. Verify both migrations applied
3. Re-import CSV to trigger matching
4. Check `supplier_id` column is populated

**The system is now ready to automatically match and link vendors during import!** 🎉
