# Complete Procurement Integration Plan

## Current State Analysis

### ✅ What Exists:
1. **CSV Import** - Equipment with supplier column
2. **Order Equipment Page** (`PMOrderEquipmentPage.js`)
   - Shows prewire/trim equipment
   - Can mark quantities as ordered
   - Shows cost totals
3. **Inventory Management** - Bottom of project page
4. **Supplier field** in `project_equipment` table

### ❌ What's Missing:
1. No vendor grouping in Order Equipment page
2. No PO generation with auto-numbers
3. No PDF export
4. No CSV export to SharePoint
5. No proper "ordered" status tied to PO
6. No email integration

---

## Complete Integration Solution

### Phase 1: Enhance Order Equipment Page

**Add Vendor Grouping Tab:**
```
Order Equipment Page:
├─ [Prewire] [Trim] tabs (existing)
└─ NEW: [Group by Vendor] view
   ├─ Amazon Business (5 items, $1,234)
   ├─ Crestron (12 items, $5,678)
   └─ Control4 (8 items, $2,345)
```

### Phase 2: PO Generation Workflow

**When PM clicks "Create PO" for a vendor:**

1. **Generate PO Number** → `PO-2025-001-AMZ-001`
2. **Create database record** in `purchase_orders` table
3. **Link equipment** in `purchase_order_items` table
4. **Update quantities** → `ordered_quantity` = `planned_quantity`
5. **Generate outputs:**
   - PDF for email to vendor
   - CSV for SharePoint procurement folder
6. **Mark status** → Equipment marked as "ordered"

### Phase 3: Export Formats

#### PDF Format (for vendor):
```
════════════════════════════════════════
         PURCHASE ORDER
        PO-2025-001-AMZ-001
════════════════════════════════════════

To: Amazon Business            Date: 11/10/2025
    Support Team                Ship To: Project Site
    support@amazon.com          123 Main St...

Order Date: 11/10/2025
Requested Delivery: 11/24/2025

ITEMS:
─────────────────────────────────────────
Line  Part #      Description    Qty  Unit    Total
1     CAT6-1000   Cat6 Cable     10   $25.00  $250.00
2     RJ45-100    RJ45 Jacks     50   $2.00   $100.00
...

Subtotal:           $350.00
Tax (8%):           $28.00
Shipping:           $25.00
─────────────────────────────────────────
TOTAL:              $403.00

Notes: Please deliver 2 weeks before install
Payment Terms: Net 30
```

#### CSV Format (for SharePoint):
```csv
PO Number,Supplier,Order Date,Line,Part Number,Description,Qty,Unit Cost,Total,Status
PO-2025-001-AMZ-001,Amazon Business,2025-11-10,1,CAT6-1000,Cat6 Cable,10,25.00,250.00,Ordered
PO-2025-001-AMZ-001,Amazon Business,2025-11-10,2,RJ45-100,RJ45 Jacks,50,2.00,100.00,Ordered
```

### Phase 4: SharePoint Integration

**Auto-upload to:**
`/Projects/{ProjectName}/Procurement/POs/PO-2025-001-AMZ-001.csv`

Using existing SharePoint service.

### Phase 5: Email Integration (Optional)

**Two options:**

**Option A: Copy to Clipboard**
- Generate PDF link
- Copy email template
- PM pastes into Outlook/Gmail

**Option B: Direct Email (via API)**
```javascript
// Using Resend, SendGrid, or similar
await emailService.send({
  to: supplier.email,
  subject: `Purchase Order ${po.po_number}`,
  attachments: [pdfBuffer],
  body: emailTemplate
});
```

---

## Implementation Files

### 1. Enhanced Order Equipment Page
**File:** `src/components/PMOrderEquipmentEnhanced.js`

Features:
- Vendor grouping view
- Create PO per vendor
- Export buttons (PDF, CSV)
- Email preparation

### 2. PO Generator Service
**File:** `src/services/poGeneratorService.js`

Functions:
- `generatePO(projectId, supplierId, equipmentIds)`
- `exportToPDF(poId)`
- `exportToCSV(poId)`
- `uploadToSharePoint(poId, csvData)`

### 3. PDF Export Service
**File:** `src/services/pdfExportService.js`

Using: `jsPDF` or `pdfmake`

Functions:
- `generatePOPDF(poData)`
- `downloadPDF(pdfBlob, filename)`

### 4. Email Template Service
**File:** `src/services/emailTemplateService.js`

Functions:
- `generatePOEmail(poData)`
- `copyToClipboard(emailContent)`
- `sendEmail(poData)` (optional)

---

## Database Changes Required

### Tables (Already Created):
- ✅ `suppliers`
- ✅ `purchase_orders`
- ✅ `purchase_order_items`
- ✅ `shipment_tracking`

### Need to Apply:
```bash
supabase/procurement_system_fixed.sql
```

---

## User Workflow

### Before (Current):
1. Import CSV with equipment
2. Go to "Order Equipment"
3. Manually mark as ordered
4. ❌ No PO generated
5. ❌ No vendor tracking
6. ❌ Manual email to vendor

### After (Integrated):
1. Import CSV with equipment
2. Go to "Order Equipment"
3. Click "Group by Vendor" tab
4. Select vendor (e.g., Amazon Business)
5. Review items (5 items, $1,234)
6. Click **"Generate PO"**
   - ✅ PO number created: `PO-2025-001-AMZ-001`
   - ✅ Equipment marked as ordered
   - ✅ Milestone percentages update
7. **Export Options:**
   - Click "Download PDF" → Opens/downloads PO
   - Click "Copy Email" → Email template copied
   - Click "Upload to SharePoint" → CSV saved
8. **Send to Vendor:**
   - Paste email in Outlook/Gmail
   - Attach PDF
   - Send
9. **Track Order:**
   - Add tracking number when received
   - System updates delivery status

---

## Technical Stack

### Frontend:
- **PDF Generation:** `jspdf` + `jspdf-autotable`
- **CSV Export:** Built-in `Blob` + `URL.createObjectURL`
- **SharePoint Upload:** Existing service
- **Email:** `mailto:` link or API integration

### Backend:
- **Supabase:** Database (already set up)
- **Storage:** SharePoint (already integrated)
- **Optional:** Email API (Resend, SendGrid, or Microsoft Graph API)

---

## Next Steps to Implement

### Step 1: Apply Database Migration ⚠️
```bash
# Run in Supabase SQL Editor:
supabase/procurement_system_fixed.sql
```

### Step 2: Install Dependencies
```bash
npm install jspdf jspdf-autotable
```

### Step 3: Create New Files
1. `src/services/poGeneratorService.js`
2. `src/services/pdfExportService.js`
3. `src/components/PMOrderEquipmentEnhanced.js`

### Step 4: Update Routes
Add vendor grouping to Order Equipment page

### Step 5: Test Workflow
1. Import equipment CSV
2. Generate PO for one vendor
3. Verify PDF, CSV, SharePoint upload
4. Test email flow

---

## Estimated Time to Complete

- **Database Migration:** 5 minutes
- **PO Generator Service:** 2 hours
- **PDF Export Service:** 2 hours
- **Enhanced UI:** 3 hours
- **SharePoint Integration:** 1 hour
- **Testing:** 2 hours

**Total:** ~10 hours of development

---

## Benefits

### For Project Manager:
- ✅ One-click PO generation
- ✅ Professional PDF for vendors
- ✅ Auto-tracking in SharePoint
- ✅ Milestone auto-updates
- ✅ Clear vendor organization

### For Business:
- ✅ Audit trail of all orders
- ✅ Cost tracking per vendor
- ✅ Centralized procurement docs
- ✅ Delivery tracking
- ✅ Milestone accuracy

### For Vendors:
- ✅ Professional PO format
- ✅ Clear line items
- ✅ Contact information
- ✅ Payment terms

---

## Questions to Confirm

1. **Email:** Start with "copy to clipboard" or integrate email API?
2. **SharePoint:** Use existing folder structure or create new?
3. **PDF Template:** Need company logo/branding on PO?
4. **Tax:** Auto-calculate tax or manual entry?
5. **Shipping:** Include shipping cost in PO?
6. **Approvals:** Need approval workflow before generating PO?

---

Ready to implement! Let me know which parts you want to prioritize.
