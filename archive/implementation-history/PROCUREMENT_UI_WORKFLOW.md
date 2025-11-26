# Procurement System - UI Workflow & Organization

## Current State Analysis

### What You Have Now:

**On PM Dashboard:**
- ✅ ProcurementDashboard widget (top of page) - Overview of all suppliers/POs

**On Project Page (PMProjectViewEnhanced):**
- ✅ "Order Equipment" button → Goes to `/projects/{id}/order-equipment`
- ✅ "Inventory Management" section (at bottom) - Shows all equipment

**PMOrderEquipmentPage (Current):**
- Shows Prewire/Trim tabs
- Lists equipment with quantities
- Can manually mark items as "ordered"
- **PROBLEM**: Doesn't group by vendor, doesn't create POs, doesn't export

---

## Proposed UI Workflow (Integrated & Clean)

### 🎯 RECOMMENDED APPROACH: Single Unified Location

All procurement happens in **ONE PLACE** per project:

### **Enhanced Order Equipment Page** (Our procurement hub)

```
Project Page
  └─ "Order Equipment" button
       └─ Enhanced PMOrderEquipmentPage
            ├─ Step 1: Select Milestone (Prewire / Trim)
            ├─ Step 2: View by Vendor (Grouped)
            ├─ Step 3: Generate POs
            ├─ Step 4: Export & Email
            └─ Step 5: Track Deliveries
```

---

## Detailed Workflow (PM's Perspective)

### **Phase 1: Equipment Import** (Already exists)
- PM imports CSV with equipment + supplier names
- Equipment stored in `project_equipment` table
- Each item has `supplier` field (text)

### **Phase 2: Order Equipment** (Enhanced Page)

#### Location: `/projects/{projectId}/order-equipment`

**Tab 1: Prewire Prep**
**Tab 2: Trim Prep**

#### View Mode Toggle:
```
[List View]  [Vendor View]  ← Toggle between views
```

---

### **LIST VIEW** (Current functionality - keep this)
Shows all equipment for the milestone, can mark as ordered manually:

```
┌─────────────────────────────────────────────────────┐
│ Prewire Equipment (45 items)                        │
├─────────────────────────────────────────────────────┤
│                                                      │
│ Cat6 Cable - 1000ft                                 │
│ Part #: CAT6-1000 | $250.00                        │
│ Planned: 10 | Ordered: 0 | Received: 0             │
│ [Order Full Quantity (10)]                          │
│                                                      │
│ RJ45 Jacks - Box of 100                            │
│ Part #: RJ45-100 | $80.00                          │
│ Planned: 5 | Ordered: 5 | Received: 0   ✓ Ordered  │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**Purpose**: Quick view of all items, manual ordering

---

### **VENDOR VIEW** (NEW - This is where the magic happens)
Groups equipment by supplier, shows vendor cards, creates POs:

```
┌─────────────────────────────────────────────────────┐
│ Prewire Equipment - By Vendor                       │
├─────────────────────────────────────────────────────┤
│                                                      │
│ ┌─ Amazon Business ───────────────────────┐ ✅ 95% │
│ │ 15 items • $1,234.56 total              │  Match │
│ │ Status: 5 ordered, 10 pending           │        │
│ │                                         │        │
│ │ • Cat6 Cable (10) - $250.00            │        │
│ │ • RJ45 Jacks (5) - $80.00  ✓ Ordered  │        │
│ │ • Cable Ties (20) - $25.00             │        │
│ │ ... +12 more items                     │        │
│ │                                         │        │
│ │ [Generate PO]  [View All Items]        │        │
│ └─────────────────────────────────────────┘        │
│                                                      │
│ ┌─ Crestron Electronics ──────────────────┐ ✅ 88% │
│ │ 8 items • $5,678.90 total               │  Match │
│ │ Status: All pending                     │        │
│ │                                         │        │
│ │ • DM-MD8x8 Switcher (1) - $2,400       │        │
│ │ • TSW-760 Touchpanel (3) - $1,800      │        │
│ │ ... +6 more items                      │        │
│ │                                         │        │
│ │ [Generate PO]  [View All Items]        │        │
│ └─────────────────────────────────────────┘        │
│                                                      │
│ ┌─ New Vendor Inc ────────────────────────┐ ⚠️     │
│ │ 3 items • $456.00 total                 │ CREATE │
│ │ Status: Not matched - needs creation    │        │
│ │                                         │        │
│ │ • Widget A (5) - $100.00               │        │
│ │ • Widget B (2) - $156.00               │        │
│ │ ... +1 more item                       │        │
│ │                                         │        │
│ │ [Create Vendor & Generate PO]          │        │
│ └─────────────────────────────────────────┘        │
│                                                      │
│ ┌────────────────────────────────────────┐         │
│ │ [Generate All POs]  (3 vendors)        │         │
│ └────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────┘
```

**Purpose**: Group by vendor, fuzzy match, generate POs

---

### **Generate PO Flow** (NEW)

#### When PM clicks "Generate PO" on a vendor:

**Step 1: Review PO Draft**
```
┌─────────────────────────────────────────────────────┐
│ Purchase Order Draft - Amazon Business              │
├─────────────────────────────────────────────────────┤
│                                                      │
│ PO Number: PO-2025-001-AMZ-001  (Auto-generated)   │
│ Order Date: November 10, 2025                       │
│ Delivery Needed By: November 24, 2025 (14 days)    │
│                                                      │
│ ┌─ Line Items ────────────────────────────┐        │
│ │ 1. Cat6 Cable (10) @ $25.00 = $250.00  │        │
│ │ 2. RJ45 Jacks (5) @ $16.00 = $80.00    │        │
│ │ 3. Cable Ties (20) @ $1.25 = $25.00    │        │
│ │ ... +12 more items                     │        │
│ └────────────────────────────────────────┘        │
│                                                      │
│ Subtotal:              $1,209.56                    │
│ Shipping:                 $25.00                    │
│ Tax:                   [_______] (optional)         │
│ TOTAL:                $1,234.56                     │
│                                                      │
│ Internal Notes: [                            ]      │
│ Vendor Notes:   [                            ]      │
│                                                      │
│ [Cancel]  [Save Draft]  [Create & Export] ─────────►│
└─────────────────────────────────────────────────────┘
```

**Step 2: PO Created - Export Options**
```
┌─────────────────────────────────────────────────────┐
│ ✓ Purchase Order Created!                           │
│   PO-2025-001-AMZ-001                              │
├─────────────────────────────────────────────────────┤
│                                                      │
│ Equipment marked as ordered ✓                       │
│ 15 items updated in project equipment               │
│                                                      │
│ ┌─ Export Options ────────────────────────┐        │
│ │                                          │        │
│ │ [📄 Download PDF]                        │        │
│ │ Download PO for emailing to vendor       │        │
│ │                                          │        │
│ │ [📊 Download CSV]                        │        │
│ │ Export for SharePoint upload             │        │
│ │                                          │        │
│ │ [📧 Copy Email to Clipboard]             │        │
│ │ Professional email ready to paste        │        │
│ │                                          │        │
│ │ [📤 Upload to SharePoint]                │        │
│ │ Save to: /Projects/{Name}/Procurement/POs│        │
│ │                                          │        │
│ └──────────────────────────────────────────┘        │
│                                                      │
│ [View PO Details]  [Create Another PO]              │
└─────────────────────────────────────────────────────┘
```

---

### **Bulk Generate Flow** (NEW)

When PM clicks "Generate All POs":

```
┌─────────────────────────────────────────────────────┐
│ Bulk PO Generation - Prewire Prep                   │
├─────────────────────────────────────────────────────┤
│                                                      │
│ Review POs to be created:                           │
│                                                      │
│ ✓ Amazon Business - 15 items - $1,234.56           │
│   PO-2025-001-AMZ-001                              │
│                                                      │
│ ✓ Crestron Electronics - 8 items - $5,678.90       │
│   PO-2025-001-CRS-001                              │
│                                                      │
│ ⚠️ New Vendor Inc - 3 items - $456.00               │
│   Will create new vendor first                      │
│   PO-2025-001-NVI-001                              │
│                                                      │
│ ─────────────────────────────────────────────────   │
│ Total: 3 POs • 26 items • $7,369.46                │
│                                                      │
│ Warnings:                                           │
│ ⚠️ "New Vendor Inc" will be auto-created            │
│                                                      │
│ [Cancel]              [Create All POs] ────────────►│
└─────────────────────────────────────────────────────┘
```

---

### **After POs Created - Tracking View** (NEW)

Add a **third tab** to Order Equipment page:

```
[Prewire Prep]  [Trim Prep]  [Active POs] ← New tab
```

**Active POs Tab:**
```
┌─────────────────────────────────────────────────────┐
│ Active Purchase Orders                              │
├─────────────────────────────────────────────────────┤
│                                                      │
│ ┌─ PO-2025-001-AMZ-001 ─────────────────┐          │
│ │ Amazon Business • Prewire Prep         │  Draft   │
│ │ 15 items • $1,234.56                  │          │
│ │ Created: Nov 10                        │          │
│ │                                        │          │
│ │ [Submit to Vendor]  [Download PDF]     │          │
│ └────────────────────────────────────────┘          │
│                                                      │
│ ┌─ PO-2025-002-CRS-001 ─────────────────┐          │
│ │ Crestron Electronics • Prewire Prep    │ Submitted│
│ │ 8 items • $5,678.90                   │          │
│ │ Submitted: Nov 8 • Delivery: Nov 22    │          │
│ │                                        │          │
│ │ Tracking: [Add Tracking Number]        │          │
│ │                                        │          │
│ │ [View Details]  [Add Tracking]         │          │
│ └────────────────────────────────────────┘          │
│                                                      │
│ ┌─ PO-2025-003-HDP-001 ─────────────────┐          │
│ │ Home Depot Pro • Trim Prep             │ In Transit│
│ │ 12 items • $890.00                    │          │
│ │ Tracking: 1Z999AA10123456784 (UPS)    │          │
│ │                                        │          │
│ │ 📍 Atlanta, GA                         │          │
│ │ ✓ Estimated delivery: Tomorrow         │          │
│ │                                        │          │
│ │ [View Tracking]  [View Details]        │          │
│ └────────────────────────────────────────┘          │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## Where Does "Inventory Management" Fit?

**Keep it separate** - it has a different purpose:

### **Inventory Management** (Bottom of project page)
- **Purpose**: View/edit ALL equipment (not procurement-focused)
- Shows quantities, costs, part numbers
- Editing equipment details
- Import/export CSV
- **READ-ONLY for procurement status** (ordered/received shown but not editable here)

### **Order Equipment** (Enhanced page)
- **Purpose**: PROCUREMENT workflow only
- Group by vendor
- Generate POs
- Export documents
- Track deliveries
- **UPDATES** ordered/received quantities when POs are created/received

**They're complementary:**
- Inventory Management = Equipment database/catalog
- Order Equipment = Procurement workflow/PO management

---

## Summary: Everything in ONE Enhanced Page

### **Enhanced PMOrderEquipmentPage Structure:**

```
Order Equipment Page (/projects/{id}/order-equipment)
│
├─ Tab: Prewire Prep
│  ├─ Toggle: [List View] [Vendor View]
│  ├─ List View: All items (current functionality)
│  └─ Vendor View: Grouped by vendor (NEW)
│     ├─ Vendor cards with fuzzy match badges
│     ├─ Generate PO per vendor
│     └─ Bulk generate all POs
│
├─ Tab: Trim Prep
│  ├─ Toggle: [List View] [Vendor View]
│  └─ (Same as Prewire)
│
└─ Tab: Active POs (NEW)
   ├─ List all POs for this project
   ├─ Filter by status (Draft/Submitted/Received)
   ├─ Add tracking numbers
   ├─ View/download PO documents
   └─ Track delivery status
```

### **Procurement Dashboard** (PM Dashboard top)
- **Keep this** - Shows overview of ALL projects
- Links to individual project Order Equipment pages
- Summary stats only
- Not for creating POs (that happens in projects)

---

## Benefits of This Approach

✅ **Single location** - PM goes to ONE page for all procurement
✅ **Clear workflow** - Select milestone → View by vendor → Generate PO → Track
✅ **No confusion** - Inventory Management stays separate for equipment database
✅ **Progressive enhancement** - Add features to existing page, not new sections
✅ **Contextual** - All PO actions happen in project context
✅ **Familiar** - PM already uses this page, just enhanced

---

## What We Keep vs. What We Change

### ✅ KEEP (Don't touch):
- Inventory Management section (bottom of project page)
- PM Dashboard Procurement widget (overview only)
- List view in Order Equipment (current functionality)
- Manual "Order" button functionality

### 🔧 ENHANCE (Add to existing):
- PMOrderEquipmentPage:
  - Add "Vendor View" toggle
  - Add vendor grouping display
  - Add PO generation workflow
  - Add "Active POs" tab
  - Add export/email functionality
  - Add tracking management

### ❌ DON'T CREATE:
- Separate "Procurement" section
- Separate "PO Management" page
- Duplicate views of equipment
- Multiple places to create POs

---

## Next Steps

Ready to enhance PMOrderEquipmentPage with:

1. **View Toggle** - List / Vendor views
2. **Vendor Grouping** - Using fuzzyMatchService
3. **PO Generation UI** - Draft → Create → Export flow
4. **Active POs Tab** - Track all POs for project
5. **Export Modals** - PDF, CSV, Email, SharePoint
6. **Tracking Management** - Add tracking numbers, view status

**All in one cohesive, enhanced page!**

Does this workflow make sense? Should we proceed with enhancing the Order Equipment page this way?
