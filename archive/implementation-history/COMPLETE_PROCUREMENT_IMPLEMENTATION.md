# Complete Procurement Implementation - Final Spec

## Executive Summary

Building a fully integrated procurement system that:
1. Groups equipment by **Milestone** (Prewire/Trim) → then by **Vendor**
2. Generates professional POs with auto-numbers
3. Exports to PDF and CSV (SharePoint)
4. Tracks shipping costs from CSV line items
5. Sends date-based ordering reminders
6. Email-ready (architecture supports future direct sending)

---

## 🎯 Core Requirements (Confirmed)

### 1. Email Integration
- ✅ Build email template system NOW
- ✅ Architecture supports direct sending later
- ✅ Start with "Copy Email" button
- 🔮 Future: Add API integration (Resend, SendGrid, MS Graph)

### 2. PDF Template
- ✅ Generic PO template
- ✅ Add "Intelligent Systems" logo placeholder
- 🔮 Future: Upload company logo via settings

### 3. Tax & Shipping
- ✅ Optional fields on PO
- ✅ Calculate shipping from CSV line items (if shipping is a product line)
- ✅ Track against actual costs

### 4. SharePoint Structure
```
/Projects/{ProjectName}/Procurement/POs/
  ├── PO-2025-001-AMZ-001.csv
  ├── PO-2025-002-CRS-001.csv
  └── PO-2025-003-C4-001.csv
```

### 5. Grouping Hierarchy ⭐ KEY
```
Order Equipment Page:
├─ Level 1: Milestone Stage
│  ├─ [Prewire Prep] tab
│  └─ [Trim Prep] tab
│
└─ Level 2: Vendor Grouping
   ├─ Amazon Business (5 items, $1,234)
   ├─ Crestron (12 items, $5,678)
   └─ Control4 (8 items, $2,345)
```

### 6. Date-Based Notifications ⭐ NEW
- Track milestone dates (prewire date, trim date)
- Auto-generate reminders:
  - "Prewire in 3 weeks → Order equipment NOW"
  - "PO submitted 2 weeks ago → Check status"
  - "Expected delivery tomorrow → Prepare receiving"

---

## 💡 Additional Smart Features

Based on your workflow, here are valuable additions:

### 1. **Delivery Deadline Calculator**
```javascript
// Auto-calculate: Prewire Date - 2 weeks = Order Deadline
if (prewireDate) {
  orderDeadline = prewireDate - 14 days;
  notify if (today > orderDeadline && !ordered);
}
```

### 2. **Bulk PO Generation**
```
"Generate All Prewire POs" button
→ Creates one PO per vendor
→ All in one click
→ Saves hours of work
```

### 3. **PO Status Dashboard**
```
Quick Stats:
├─ 3 POs pending submission
├─ 5 POs awaiting delivery
├─ 2 POs overdue
└─ $12,345 total ordered
```

### 4. **Vendor Performance Tracking**
```
Track over time:
├─ On-time delivery rate
├─ Average delivery time
├─ Cost accuracy (quoted vs actual)
└─ Issue count
```

### 5. **Smart Reordering**
```
"Reorder from last project" feature
→ Copy equipment list from previous project
→ Auto-populate quantities
→ Saves setup time
```

### 6. **Receiving Checklist**
```
When shipment arrives:
☐ Verify quantities
☐ Check for damage
☐ Match to PO
☐ Mark as received
☐ Photo documentation
```

### 7. **Budget Alerts**
```
Track against project budget:
⚠️ Prewire: $5,000 / $6,000 (83%)
✅ Trim: $3,000 / $8,000 (37%)
```

### 8. **Missing Items Report**
```
Before milestone starts:
"5 items not yet ordered for Prewire (starts in 10 days)"
→ Shows specific items
→ Highlights critical path
```

---

## 📋 Complete Workflow Design

### Phase 1: Setup & Planning

**Step 1: Import Equipment CSV**
```csv
Room,Part Number,Description,Supplier,Quantity,Unit Cost,Type
Living Room,CAT6-1000,Cat6 Cable,Amazon Business,10,25.00,part
Living Room,SHIP-FEDEX,Shipping,Amazon Business,1,45.00,shipping
Bedroom,CTRL-CP3,Control Processor,Crestron,1,1200.00,part
```

**System Actions:**
- ✅ Create equipment records
- ✅ Link to suppliers (match name or create)
- ✅ Tag by milestone (required_for_prewire)
- ✅ Calculate totals including shipping

**Step 2: Set Milestone Dates**
```javascript
Project Settings:
├─ Prewire Date: 2025-12-01
├─ Trim Date: 2026-01-15
└─ System Auto-Calculates:
   ├─ Prewire Order Deadline: 2025-11-17 (2 weeks before)
   └─ Trim Order Deadline: 2026-01-01
```

### Phase 2: Ordering Workflow

**Navigate to: Order Equipment**

```
┌─────────────────────────────────────────────────────┐
│ Order Equipment - Project XYZ                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│ [Prewire Prep] [Trim Prep]  ← Level 1: Milestone  │
│                                                     │
│ ⚠️ Prewire starts in 15 days - Order by Nov 17!   │
│                                                     │
│ Group by Vendor:              ← Level 2: Vendor    │
│                                                     │
│ ┌─ Amazon Business ────────────────────┐          │
│ │ 10 items • $1,479.00 (incl shipping) │          │
│ │ [Review Items] [Generate PO]         │          │
│ └──────────────────────────────────────┘          │
│                                                     │
│ ┌─ Crestron ────────────────────────────┐         │
│ │ 12 items • $15,680.00                 │         │
│ │ [Review Items] [Generate PO]          │         │
│ └──────────────────────────────────────┘          │
│                                                     │
│ ┌─ Control4 ────────────────────────────┐         │
│ │ 8 items • $3,245.00                   │         │
│ │ [Review Items] [Generate PO]          │         │
│ └──────────────────────────────────────┘          │
│                                                     │
│ [Generate All POs] ← Bulk action                  │
└─────────────────────────────────────────────────────┘
```

**Step 3: Review Items (Click "Review Items")**
```
Amazon Business - Prewire Equipment
─────────────────────────────────────
Line  Part #        Description      Qty  Unit    Total
1     CAT6-1000     Cat6 Cable       10   $25.00  $250.00
2     RJ45-100      RJ45 Jacks       50   $2.00   $100.00
3     MOUNT-TV      TV Mount         5    $45.00  $225.00
4     SHIP-FEDEX    Shipping         1    $45.00  $45.00
                                            ─────────────
                                    Subtotal: $620.00
                                    Tax (optional): $__.__
                                    Shipping: $45.00
                                    ─────────────────────
                                    TOTAL: $665.00

Expected Delivery: Nov 24, 2025 (7 days before prewire)

☐ Include tax (enter %): [___]
☐ Adjust shipping cost: [$45.00]
☐ Add internal notes: [________________]
☐ Add supplier notes: [Please expedite...]

[Cancel] [Generate PO]
```

**Step 4: Generate PO**

System Actions:
1. ✅ Generate PO number: `PO-2025-001-AMZ-001`
2. ✅ Create database records:
   - `purchase_orders` (header)
   - `purchase_order_items` (line items)
3. ✅ Update equipment:
   - `ordered_quantity` = `planned_quantity`
   - `ordered_confirmed` = true
   - `ordered_confirmed_at` = now
4. ✅ Generate exports:
   - PDF file (for email)
   - CSV file (for SharePoint)
5. ✅ Update milestone %:
   - Prewire Prep: 50% (ordered) + 0% (received) = 50%
6. ✅ Upload to SharePoint:
   - `/Projects/Project XYZ/Procurement/POs/PO-2025-001-AMZ-001.csv`

**Step 5: Export Options Screen**
```
┌─────────────────────────────────────────────────────┐
│ PO Generated Successfully!                          │
│ PO-2025-001-AMZ-001                                │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ✅ 10 items marked as ordered                      │
│ ✅ CSV uploaded to SharePoint                      │
│ ✅ Milestone updated: Prewire Prep 50%             │
│                                                     │
│ Next Steps:                                        │
│                                                     │
│ [📄 Download PDF]  ← Opens PDF in new tab         │
│ [📧 Copy Email]    ← Copies template to clipboard  │
│ [📁 Open SharePoint] ← Opens procurement folder    │
│ [🔍 View PO Details] ← See full PO                │
│                                                     │
│ Email Template Copied:                             │
│ ┌───────────────────────────────────────┐         │
│ │ To: support@amazon.com                 │         │
│ │ Subject: Purchase Order PO-2025-001... │         │
│ │ Body: [Ready to paste]                 │         │
│ │ Attachment: PO-2025-001-AMZ-001.pdf   │         │
│ └───────────────────────────────────────┘         │
│                                                     │
│ [Done] [Send Another Email]                        │
└─────────────────────────────────────────────────────┘
```

### Phase 3: Tracking & Receiving

**PO Status Dashboard**
```
┌─────────────────────────────────────────────────────┐
│ Purchase Orders - Project XYZ                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Active POs: 3 • Total Value: $19,424               │
│                                                     │
│ ┌─ PO-2025-001-AMZ-001 ────────────────┐          │
│ │ Amazon Business • $665.00             │          │
│ │ Status: Submitted (Nov 10)            │          │
│ │ Expected: Nov 24                      │          │
│ │ ⏰ 14 days remaining                  │          │
│ │ [Add Tracking] [Mark Received]        │          │
│ └──────────────────────────────────────┘          │
│                                                     │
│ ┌─ PO-2025-002-CRS-001 ────────────────┐          │
│ │ Crestron • $15,680.00                 │          │
│ │ Status: In Transit                    │          │
│ │ Tracking: 1Z999AA10123456784          │          │
│ │ 🚚 Arrives tomorrow                   │          │
│ │ [View Tracking] [Prepare Receiving]   │          │
│ └──────────────────────────────────────┘          │
│                                                     │
│ ┌─ PO-2025-003-C4-001 ──────────────────┐         │
│ │ Control4 • $3,245.00                  │         │
│ │ Status: Overdue (2 days)              │         │
│ │ ⚠️ Contact vendor                     │         │
│ │ [Call Vendor] [Update Status]         │         │
│ └──────────────────────────────────────┘          │
└─────────────────────────────────────────────────────┘
```

**Receiving Workflow**
```
When "Mark Received" clicked:
1. Show checklist modal
2. Verify quantities
3. Upload photos (optional)
4. Confirm receipt
5. Update:
   - received_quantity = ordered_quantity
   - Milestone %: Prewire Prep = 100%
   - PO status = "received"
```

### Phase 4: Notifications & Reminders

**Automated Alerts:**

```javascript
// Order Deadline Alerts
if (daysUntilPrewire <= 21 && !allPrewireOrdered) {
  notify("⚠️ Prewire in 3 weeks! Order remaining equipment");
}

// PO Follow-up
if (poAge >= 14 && status === 'submitted') {
  notify("📦 PO submitted 2 weeks ago - Check with vendor");
}

// Delivery Reminder
if (expectedDelivery === tomorrow) {
  notify("📅 Delivery expected tomorrow - Prepare receiving area");
}

// Overdue Alert
if (today > expectedDelivery && status !== 'received') {
  notify("⚠️ PO overdue! Contact vendor immediately");
}

// Missing Items Warning
if (daysUntilPrewire <= 10 && hasUnorderedItems) {
  notify("🚨 URGENT: 5 items still not ordered for prewire");
}
```

**Notification Dashboard Widget:**
```
┌─────────────────────────────────────┐
│ Procurement Alerts (3)              │
├─────────────────────────────────────┤
│ ⚠️ Order deadline in 5 days         │
│    Prewire equipment (3 items)      │
│    [Review] [Dismiss]               │
│                                     │
│ 📦 Shipment arriving tomorrow       │
│    PO-2025-002-CRS-001              │
│    [View Details]                   │
│                                     │
│ ⏰ Follow up with Amazon            │
│    PO submitted 15 days ago         │
│    [Call] [Email] [Dismiss]         │
└─────────────────────────────────────┘
```

---

## 🗂️ File Structure

```
src/
├── services/
│   ├── poGeneratorService.js      ← Create POs, auto-numbering
│   ├── pdfExportService.js        ← PDF generation
│   ├── csvExportService.js        ← CSV generation
│   ├── emailTemplateService.js    ← Email templates
│   ├── notificationService.js     ← Date-based alerts
│   └── sharePointStorageService.js ← (Enhance existing)
│
├── components/
│   ├── procurement/
│   │   ├── OrderEquipmentEnhanced.js    ← Main ordering page
│   │   ├── VendorGrouping.js            ← Vendor cards
│   │   ├── POReviewModal.js             ← Review before creating
│   │   ├── POExportModal.js             ← Export options
│   │   ├── PODashboard.js               ← Track all POs
│   │   ├── ReceivingWorkflow.js         ← Mark received
│   │   └── NotificationPanel.js         ← Alert widget
│   │
│   └── PMOrderEquipmentPage.js    ← (Enhance this file)
│
└── utils/
    ├── poTemplates.js              ← PDF/Email templates
    ├── dateCalculations.js         ← Deadline calculations
    └── shippingCalculator.js       ← Extract shipping from line items
```

---

## 📄 PDF Template Design

```
═══════════════════════════════════════════════════════
              INTELLIGENT SYSTEMS
           [Logo Placeholder - Add Later]
═══════════════════════════════════════════════════════

                 PURCHASE ORDER
                PO-2025-001-AMZ-001

Order Date: November 10, 2025
Project: Luxury Home Automation - 123 Main St

───────────────────────────────────────────────────────
VENDOR                          SHIP TO
───────────────────────────────────────────────────────
Amazon Business                 Project Site
Support Team                    123 Main Street
support@amazon.com              Beverly Hills, CA 90210
1-888-281-3847
                                Contact: John Doe
                                Phone: 555-1234

───────────────────────────────────────────────────────
REQUESTED DELIVERY: November 24, 2025
PAYMENT TERMS: Net 30
───────────────────────────────────────────────────────

LINE ITEMS
───────────────────────────────────────────────────────
Line  Part Number    Description        Qty  Unit    Total
───────────────────────────────────────────────────────
1     CAT6-1000      Cat6 Cable 1000ft  10   $25.00  $250.00
2     RJ45-100       RJ45 Jacks         50   $2.00   $100.00
3     MOUNT-TV-55    TV Mount 55"       5    $45.00  $225.00
4     SHIP-FEDEX     Shipping - FedEx   1    $45.00  $45.00
───────────────────────────────────────────────────────

                                        Subtotal: $620.00
                                        Tax:      $0.00
                                        Shipping: $45.00
                                        ──────────────────
                                        TOTAL:    $665.00

───────────────────────────────────────────────────────
NOTES
───────────────────────────────────────────────────────
Please deliver 1 week before install date (Nov 24).
Call 555-1234 when shipment is ready.

───────────────────────────────────────────────────────
TERMS & CONDITIONS
───────────────────────────────────────────────────────
1. Please confirm receipt of this PO
2. Notify immediately if any items unavailable
3. Include packing slip with shipment
4. Invoice to match PO exactly

───────────────────────────────────────────────────────

Authorized By: [PM Name]
Date: November 10, 2025

Thank you for your business!

═══════════════════════════════════════════════════════
        Intelligent Systems • www.example.com
═══════════════════════════════════════════════════════
```

---

## 📧 Email Template

```javascript
const emailTemplate = {
  to: supplier.email,
  cc: pm.email,
  subject: `Purchase Order ${poNumber} - ${projectName}`,
  body: `
Dear ${supplier.contact_name || 'Procurement Team'},

Please find attached Purchase Order ${poNumber} for ${projectName}.

ORDER SUMMARY:
- PO Number: ${poNumber}
- Order Date: ${orderDate}
- Total Amount: ${formatCurrency(total)}
- Requested Delivery: ${deliveryDate}

ITEMS:
${items.map(item => `- ${item.quantity}x ${item.description}`).join('\n')}

DELIVERY INSTRUCTIONS:
${deliveryInstructions}

Please confirm receipt of this order and provide:
1. Order confirmation
2. Estimated ship date
3. Tracking number when available

Contact ${pm.name} at ${pm.phone} with any questions.

Thank you,
${pm.name}
Intelligent Systems
${pm.email}
${pm.phone}

---
This is an automated message from our project management system.
Attachment: ${poNumber}.pdf
  `
};
```

---

## 🔔 Notification Rules

```javascript
const notificationRules = [
  {
    name: "Order Deadline Warning - 3 weeks",
    trigger: "milestone_date - 21 days",
    condition: "has_unordered_items",
    message: "Prewire in 3 weeks! Time to order equipment",
    actions: ["email_pm", "show_alert", "add_to_dashboard"]
  },
  {
    name: "Order Deadline Warning - 2 weeks",
    trigger: "milestone_date - 14 days",
    condition: "has_unordered_items",
    message: "⚠️ URGENT: Prewire in 2 weeks - Order NOW",
    severity: "high",
    actions: ["email_pm", "sms_pm", "dashboard_urgent"]
  },
  {
    name: "Order Deadline Passed",
    trigger: "milestone_date - 14 days",
    condition: "has_unordered_items AND today > deadline",
    message: "🚨 CRITICAL: Order deadline passed!",
    severity: "critical",
    actions: ["email_pm", "email_manager", "dashboard_critical"]
  },
  {
    name: "PO Follow-up",
    trigger: "po_created + 14 days",
    condition: "status IN ('submitted', 'confirmed')",
    message: "PO submitted 2 weeks ago - Check status",
    actions: ["dashboard_reminder"]
  },
  {
    name: "Delivery Tomorrow",
    trigger: "expected_delivery - 1 day",
    condition: "status = 'in_transit'",
    message: "Delivery expected tomorrow - Prepare site",
    actions: ["email_pm", "dashboard_info"]
  },
  {
    name: "Delivery Overdue",
    trigger: "expected_delivery + 1 day",
    condition: "status != 'received'",
    message: "⚠️ Shipment overdue - Contact vendor",
    severity: "high",
    actions: ["email_pm", "dashboard_urgent"]
  },
  {
    name: "Milestone Risk",
    trigger: "milestone_date - 7 days",
    condition: "has_unreceived_items",
    message: "🚨 Milestone at risk - Equipment not received",
    severity: "critical",
    actions: ["email_pm", "email_manager", "escalate"]
  }
];
```

---

## 💾 Database Schema Enhancements

### Additional Fields Needed

**purchase_orders table:**
```sql
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS
  milestone_type text CHECK (milestone_type IN ('prewire_prep', 'trim_prep'));

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS
  delivery_instructions text;

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS
  shipping_cost_calculated numeric DEFAULT 0;
  -- Auto-sum from shipping line items
```

**Notifications table (NEW):**
```sql
CREATE TABLE procurement_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  po_id uuid REFERENCES purchase_orders(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  message text NOT NULL,
  severity text CHECK (severity IN ('info', 'warning', 'high', 'critical')),
  is_read boolean DEFAULT false,
  dismissed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
```

---

## 🚀 Implementation Priority

### Phase 1: Core PO Generation (Week 1)
1. ✅ Apply database migration
2. ✅ Install dependencies
3. ✅ Build PO Generator Service
4. ✅ Build PDF Export Service
5. ✅ Build CSV Export Service
6. ✅ Enhance Order Equipment page with vendor grouping

### Phase 2: Integration (Week 2)
7. ✅ SharePoint upload integration
8. ✅ Email template system
9. ✅ Mark-as-ordered workflow
10. ✅ Milestone percentage updates

### Phase 3: Tracking (Week 3)
11. ✅ PO Dashboard
12. ✅ Receiving workflow
13. ✅ Status tracking
14. ✅ Shipping calculator

### Phase 4: Automation (Week 4)
15. ✅ Notification system
16. ✅ Date-based alerts
17. ✅ Dashboard widgets
18. ✅ Reporting

---

## ✨ Extra Features to Consider

### 1. **Barcode Scanning for Receiving**
- Generate barcode on PO
- Scan when items arrive
- Auto-mark as received

### 2. **Equipment Reservation System**
- Reserve items from warehouse inventory
- Track "promised" vs "available"
- Prevent double-booking

### 3. **Vendor Portal (Future)**
- Vendors can see their POs
- Update status directly
- Upload invoices

### 4. **Cost Analysis Reports**
- Actual vs. budgeted
- Vendor price comparison
- Shipping cost optimization

### 5. **RMA/Return Workflow**
- Track defective items
- Generate RMA numbers
- Follow return process

---

Ready to build! Should I start with Phase 1 (Core PO Generation)?
