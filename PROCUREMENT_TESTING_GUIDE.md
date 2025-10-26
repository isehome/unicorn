# Procurement System - Testing Guide

## What's Been Built ✅

### Phase 1: Core Services (Complete)
1. ✅ Fuzzy vendor matching service
2. ✅ PO generator service with auto-numbering
3. ✅ PDF export service
4. ✅ CSV export service
5. ✅ Email template service

### Phase 2: UI Enhancement (Partially Complete)
6. ✅ Enhanced Order Equipment page with 3 tabs
7. ✅ List View / Vendor View toggle
8. ✅ Vendor grouping with fuzzy match badges
9. ⚠️ PO generation (placeholder - "coming soon" alert)
10. ⚠️ Active POs tab (placeholder)

---

## Testing the New UI

### BEFORE YOU START: Apply Database Migration ⚠️

**CRITICAL**: You must run the SQL migration first or nothing will work!

1. Open Supabase SQL Editor
2. Paste contents of [supabase/procurement_system_fixed.sql](supabase/procurement_system_fixed.sql)
3. Click "Run"
4. Verify tables created: `suppliers`, `purchase_orders`, etc.

---

## How to Test the Enhanced Page

### Step 1: Navigate to Order Equipment

1. Go to PM Dashboard
2. Click on any project
3. Click "Order Equipment" button (at top of project page)

You should now see the **Enhanced Order Equipment Page**

---

### Step 2: Explore the 3 Tabs

#### Tab 1: Prewire Prep
- Shows all equipment marked for prewire phase
- Has two view modes (see Step 3)

#### Tab 2: Trim Prep
- Shows all equipment marked for trim phase
- Has two view modes (see Step 3)

#### Tab 3: Active POs
- Currently shows "Coming Soon" placeholder
- Will show all purchase orders for this project

---

### Step 3: Toggle Between Views

**In Prewire or Trim tabs**, you'll see two buttons:

```
[List View]  [Vendor View]
```

#### LIST VIEW (Original functionality - still works!)
- Shows all equipment in a list
- Can manually mark items as ordered
- Click "Order Full Quantity" on any item
- Click "Order All Pending Items" to order everything
- **This is the same as before** - no changes

#### VENDOR VIEW (NEW!)
- Groups equipment by supplier name
- Shows fuzzy matching badges:
  - 🟢 **95% Match** - Confident match to existing supplier
  - 🟡 **Review Needed** - Possible matches, needs confirmation
  - 🔵 **Will Create New** - No match, will auto-create supplier

---

### Step 4: Test Vendor Grouping

**When you switch to Vendor View:**

1. **Vendor Stats Card** (at top):
   ```
   Total Vendors: 3
   Matched: 2
   Needs Review: 0
   New Vendors: 1
   ```

2. **Vendor Cards**:
   Each vendor shows:
   - Supplier name
   - Match badge (green/yellow/blue)
   - Number of items
   - Total cost
   - "Generate PO" button (currently placeholder)
   - Expand/collapse arrow

3. **Click a vendor to expand**:
   - Shows all equipment for that vendor
   - Part numbers, quantities, costs
   - Nicely formatted list

4. **"Generate All POs" button** (at bottom):
   - Currently shows alert
   - Will create POs for all vendors

---

## What Works vs. What's Coming

### ✅ WORKS NOW:

**List View:**
- View all equipment
- Edit ordered quantities
- Quick order buttons
- Cost tracking
- Progress bars
- All original functionality intact

**Vendor View:**
- Equipment grouped by supplier
- Fuzzy matching integration
- Match confidence badges
- Vendor expansion/collapse
- Stats summary
- Equipment details per vendor

**Tab Navigation:**
- Prewire Prep tab
- Trim Prep tab
- Active POs tab (placeholder)

**View Toggle:**
- Switch between List and Vendor views
- State preserved when switching

---

### ⏳ COMING NEXT:

**PO Generation Modal:**
- Click "Generate PO" on a vendor
- Review PO draft
- Edit details
- Create PO with auto-number
- Mark equipment as ordered

**Export Options:**
- Download PDF
- Download CSV
- Copy email to clipboard
- Upload to SharePoint

**Active POs Tab:**
- List all POs for project
- Filter by status
- Add tracking numbers
- View delivery status
- Receive items

**Bulk PO Generation:**
- Preview all POs
- Confirm before creating
- Create multiple POs at once

---

## Expected Behavior

### When You Import Equipment CSV:

The CSV has equipment with supplier names like:
```csv
name,supplier,quantity,unit_cost
Cat6 Cable,Amazon Business,10,25.00
RJ45 Jacks,Amazon,5,16.00
DM-MD8x8,Crestron Electronics,1,2400.00
TSW-760,Crestron,3,600.00
```

**In Vendor View, you should see:**

```
Amazon Business  ✅ 95% Match
2 items • $330.00
[Generate PO]

Crestron Electronics  ✅ 88% Match
2 items • $4,200.00
[Generate PO]
```

Notice how "Amazon" and "Amazon Business" are matched as the same vendor, and "Crestron" matches "Crestron Electronics"!

---

## Testing Checklist

### Basic Navigation:
- [ ] Can navigate to Order Equipment page
- [ ] Can switch between Prewire/Trim/Active POs tabs
- [ ] Can toggle between List and Vendor views
- [ ] Can expand back button to return to project

### List View (Original):
- [ ] See all equipment listed
- [ ] Can click "Order Full Quantity" button
- [ ] Can edit ordered quantity manually
- [ ] Can click "Order All Pending Items"
- [ ] See cost summaries and progress bar

### Vendor View (New):
- [ ] See vendor stats card at top
- [ ] See vendor cards for each supplier
- [ ] See match badges (green/yellow/blue)
- [ ] Can expand/collapse vendor cards
- [ ] See equipment details when expanded
- [ ] See "Generate PO" buttons (show alert)
- [ ] See "Generate All POs" button (shows alert)

### Error Handling:
- [ ] No console errors when loading page
- [ ] No errors when switching views
- [ ] No errors when switching tabs
- [ ] Graceful handling if no equipment found

---

## Troubleshooting

### Issue: "No vendors found" in Vendor View
**Cause**: Equipment doesn't have supplier field populated
**Fix**: Make sure CSV import includes supplier column

### Issue: All vendors show "Will Create New"
**Cause**: Database migration not applied or no suppliers in database
**Fix**:
1. Apply migration: `supabase/procurement_system_fixed.sql`
2. Verify seed data created (5 sample suppliers)

### Issue: Console errors about services not found
**Cause**: New service imports not recognized
**Fix**: Restart dev server (`npm start`)

### Issue: Page looks broken or unstyled
**Cause**: Tailwind classes not loaded
**Fix**: Restart dev server

### Issue: "Generate PO" does nothing
**Expected**: Currently shows an alert saying "Generate PO coming soon!"
**This is normal** - full PO generation modal coming in next phase

---

## Next Steps After Testing

Once you've verified the page works:

1. **Test vendor matching accuracy**:
   - Try different supplier names
   - Check match confidence scores
   - Verify fuzzy matching works

2. **Provide Feedback**:
   - Does the UI make sense?
   - Is the vendor grouping helpful?
   - Any layout improvements needed?

3. **Ready for Phase 3**:
   - Build PO generation modal
   - Connect to export services
   - Implement Active POs tab
   - Add tracking management

---

## Current File Structure

```
src/
├── components/
│   ├── PMOrderEquipmentPage.js (original - still exists)
│   └── PMOrderEquipmentPageEnhanced.js (NEW - being used)
│
├── services/
│   ├── poGeneratorService.js (NEW)
│   ├── pdfExportService.js (NEW)
│   ├── csvExportService.js (NEW)
│   └── emailTemplateService.js (NEW)
│
└── utils/
    └── fuzzyMatchService.js (NEW)

supabase/
└── procurement_system_fixed.sql (Must run this!)
```

---

## Quick Test Scenarios

### Scenario 1: Simple Order Flow (List View)
1. Go to Order Equipment
2. Select Prewire Prep tab
3. Stay in List View
4. Click "Order Full Quantity" on an item
5. Verify ordered quantity updates
6. Verify cost bar updates

**Expected**: Works exactly like before

### Scenario 2: Vendor Grouping (Vendor View)
1. Go to Order Equipment
2. Select Prewire Prep tab
3. Click "Vendor View"
4. Observe vendor cards appear
5. Check match badges
6. Expand a vendor
7. See equipment details

**Expected**: See grouped vendors with fuzzy matching

### Scenario 3: Tab Switching
1. Start in Prewire Prep (List View)
2. Switch to Trim Prep
3. Switch to Active POs
4. Switch back to Prewire Prep
5. Toggle to Vendor View
6. Switch to Trim Prep (Vendor View)

**Expected**: Smooth transitions, no errors, views preserved per tab

---

## Success Criteria ✅

You'll know it's working when:

1. ✅ All three tabs appear and are clickable
2. ✅ Can toggle between List and Vendor views
3. ✅ Vendor view shows grouped equipment
4. ✅ Match badges appear next to vendor names
5. ✅ Can expand/collapse vendor cards
6. ✅ Stats summary shows correct numbers
7. ✅ No console errors
8. ✅ Original List View functionality still works

---

## Known Limitations (This Phase)

1. **Generate PO button**: Shows alert, doesn't create PO yet
2. **Active POs tab**: Placeholder only
3. **Export buttons**: Not implemented yet
4. **Tracking management**: Not implemented yet
5. **Bulk generation**: Shows alert, doesn't create POs yet

**These are intentional** - they're coming in the next phase!

---

## Ready to Move Forward?

Once testing is complete and you're happy with the UI, we'll build:

**Phase 3A - PO Generation:**
- PO review modal
- Create PO with auto-number
- Mark equipment as ordered
- Integration with existing services

**Phase 3B - Export System:**
- PDF download
- CSV download
- Email copy-to-clipboard
- SharePoint upload integration

**Phase 3C - Active POs:**
- PO list view
- Tracking number management
- Delivery status
- Receive items workflow

---

## Questions?

- Is the vendor grouping helpful?
- Does the fuzzy matching make sense?
- Should we adjust the UI layout?
- Ready to build PO generation modal?

Let's test and iterate! 🚀
