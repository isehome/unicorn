# Implementation Decisions - CONFIRMED

## Your Answers:

### 1. Milestone Dates
**Decision:** Use existing milestone dates from `project_milestones` table
- ✅ `prewire` milestone → `target_date` and `actual_date`
- ✅ `trim` milestone → `target_date` and `actual_date`
- ✅ Calculate order deadlines: milestone.target_date - 14 days

### 2. Notifications
**Decision:** A - Dashboard widget only (to start)
- ✅ Widget on project page
- ✅ Shows ordering deadlines, PO status, delivery alerts
- 🔮 Future: Email/SMS when needed

### 3. Shipping Line Items
**Decision:** Extract shipping cost from CSV, but focus on TRACKING
- ✅ Single shipping line item in CSV
- ✅ Extract cost (not critical)
- ⭐ **PRIMARY FOCUS:** Tracking numbers for delivery ETA
- ✅ Link to carrier tracking page
- ✅ PM and team can check delivery status

**Priority:** Tracking > Cost calculation

### 4. Tax Calculation
**Decision:** Add field but don't worry about auto-calculation
- ✅ Tax field in PO (optional)
- ✅ PM can manually enter if needed
- ✅ Not required, not auto-calculated
- 🔮 Future: Can add if needed

### 5. PO Number Generation
**Decision:** A - Auto-generate on "Create PO" click
- ✅ Status = 'draft' until submitted
- ✅ PO is editable while draft
- ✅ Lock when status → 'submitted'
- ✅ Can delete draft POs

### 6. Vendor Matching
**Decision:** Fuzzy matching + Auto-add + Editable
- ✅ Use fuzzy logic to match CSV supplier names
- ✅ Auto-create new vendor if no match found
- ✅ Vendor added to database with basic info
- ✅ PM can edit vendor details later (add email, phone, contacts)
- ✅ Manual override if fuzzy match is wrong

**Example Flow:**
```
CSV: "Amazon"
→ Fuzzy match: "Amazon Business" (95% match)
→ Auto-link

CSV: "New Vendor Inc"
→ No match found
→ Auto-create vendor record
→ PM notified to add details
```

### 7. Bulk PO Generation
**Decision:** B - Show preview with confirmation
- ✅ "Generate All Prewire POs" button
- ✅ Shows preview:
  - Number of POs (one per vendor)
  - Total cost per vendor
  - Total items per vendor
- ✅ Confirm before creating
- ✅ Creates all POs with status = 'draft'

**Preview Screen:**
```
┌─────────────────────────────────────────┐
│ Generate All Prewire POs                │
├─────────────────────────────────────────┤
│ This will create 3 purchase orders:     │
│                                         │
│ ✓ Amazon Business                       │
│   10 items • $1,479.00                  │
│                                         │
│ ✓ Crestron Electronics                  │
│   12 items • $15,680.00                 │
│                                         │
│ ✓ Control4                              │
│   8 items • $3,245.00                   │
│                                         │
│ Total: 30 items • $20,404.00            │
│                                         │
│ [Cancel] [Create All POs]               │
└─────────────────────────────────────────┘
```

### 8. Logo Placement
**Decision:** B - Top left with company info
- ✅ Logo in top-left corner
- ✅ Company info to the right
- ✅ Professional letterhead style

**PDF Header Layout:**
```
┌────────────────────────────────────────┐
│ [LOGO]    INTELLIGENT SYSTEMS          │
│           123 Business Ave             │
│           City, State 12345            │
│           (555) 123-4567               │
└────────────────────────────────────────┘
```

---

## Implementation Summary

### Database Changes:
```sql
-- Already in migration:
✓ suppliers table
✓ purchase_orders table
✓ purchase_order_items table
✓ shipment_tracking table

-- No additional fields needed!
-- Using existing milestone dates
```

### Services to Create:
1. ✅ **poGeneratorService.js** - PO creation with fuzzy vendor matching
2. ✅ **pdfExportService.js** - PDF with logo top-left
3. ✅ **csvExportService.js** - CSV for SharePoint
4. ✅ **fuzzyMatchService.js** - Vendor name matching
5. ✅ **trackingService.js** - Already created, enhance for UI
6. ✅ **notificationService.js** - Dashboard widget

### UI Components:
1. ✅ **OrderEquipmentEnhanced.js** - Milestone → Vendor grouping
2. ✅ **VendorGroupCard.js** - Show items per vendor
3. ✅ **BulkPOPreview.js** - Confirmation modal
4. ✅ **POExportModal.js** - Download PDF, copy email
5. ✅ **TrackingManager.js** - Add/view tracking numbers
6. ✅ **NotificationWidget.js** - Order deadline alerts

### Features Priority:
1. ⭐ **HIGH:** Tracking numbers & delivery links
2. ⭐ **HIGH:** Milestone-based grouping
3. ⭐ **HIGH:** Fuzzy vendor matching
4. ⭐ **HIGH:** Bulk PO generation with preview
5. 🔸 **MEDIUM:** Shipping cost extraction
6. 🔸 **MEDIUM:** Dashboard notifications
7. 🔹 **LOW:** Tax calculations

---

## Next Steps:

### Phase 1: Core Setup (Today)
1. Apply database migration
2. Install dependencies (`jspdf`, `jspdf-autotable`, `fuse.js`)
3. Create fuzzy matching service
4. Create PO generator service

### Phase 2: PO Generation (Tomorrow)
5. Build PDF export with logo
6. Build CSV export
7. SharePoint integration
8. Email templates

### Phase 3: UI Integration (Day 3)
9. Enhance Order Equipment page
10. Add vendor grouping
11. Bulk generation with preview
12. Export modals

### Phase 4: Tracking & Alerts (Day 4)
13. Tracking number management
14. Dashboard notifications
15. Order deadline calculations

---

## Starting Now! 🚀

I'll begin with:
1. Database migration first
2. Install dependencies
3. Build fuzzy vendor matching
4. Create PO generator service

You'll see files being created in real-time!
