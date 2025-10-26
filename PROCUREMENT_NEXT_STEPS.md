# Procurement System - Next Steps

## Current Status (Completed)
- ✅ Procurement database schema (suppliers, purchase_orders, etc.)
- ✅ Vendor matching with fuzzy logic during CSV import
- ✅ Equipment grouping by vendor in Order Equipment page
- ✅ Wire drop preservation during REPLACE mode imports
- ✅ Labor budget update/insert logic (no duplicates)
- ✅ CSV import REPLACE mode working (deletes all equipment, re-imports)
- ✅ Vendor View showing equipment grouped by supplier
- ✅ RLS policies configured for anon access (temporary)

## Immediate Next Task
**CSV Import Change (Big)** - User requested, details pending

## Feature Roadmap (In Priority Order)

### 1. Create PO Generation Modal
**Status:** ✅ COMPLETED
**Description:** Let PM review and edit PO before creating
**Requirements:**
- ✅ Modal opens when clicking "Generate PO" button
- ✅ Shows PO preview with editable fields:
  - Order date
  - Requested delivery date
  - Tax amount
  - Shipping cost
  - Internal notes
  - Supplier notes
- ✅ Auto-generate PO number (PO-YYYY-NNN-SUP-NNN)
- ✅ Calculate totals (subtotal + tax + shipping)
- ✅ Mark equipment as "ordered" when submitted
- ✅ Create purchase_order and purchase_order_items records

**Files Created/Modified:**
- ✅ `src/components/procurement/POGenerationModal.js` - Created
- ✅ `src/services/poGeneratorService.js` - Already existed with full functionality
- ✅ `src/components/PMOrderEquipmentPageEnhanced.js` - Updated to integrate modal

**Implementation Notes:**
- Modal shows PO number preview before creation
- Equipment list preview with quantities and costs
- Real-time total calculation (subtotal + tax + shipping)
- Validation for required fields
- Success callback reloads equipment list
- Disabled state when supplier not yet created
- Uses existing `poGeneratorService.generatePO()` method
- Updates equipment ordered quantities via `projectEquipmentService.updateProcurementQuantities()`

### 2. Export Options
**Status:** Not started
**Description:** PDF, CSV, Email templates for POs
**Requirements:**
- Download PO as PDF (using pdfExportService.js - already created)
- Download PO as CSV for SharePoint upload
- Copy email to clipboard with PO details
- Upload PDF to SharePoint at `/Projects/{Name}/Procurement/POs/`

**Files to Use:**
- `src/services/pdfExportService.js` (already created, needs testing)
- `src/services/csvExportService.js` (already created, needs testing)
- `src/services/emailTemplateService.js` (already created, needs testing)
- `src/services/sharePointFolderService.js` (already created)

### 3. Build Active POs Tab
**Status:** Not started
**Description:** Show all POs for the project
**Requirements:**
- List view of all POs for current project
- Show PO number, supplier, date, total, status
- Filter by status (draft, submitted, confirmed, received)
- Click to view PO details
- Add tracking numbers to PO
- Mark PO as received

**Files to Create/Modify:**
- `src/components/procurement/ActivePOsTab.js`
- `src/services/purchaseOrderService.js` (enhance existing)
- Update `PMOrderEquipmentPageEnhanced.js` to show this tab

### 4. Add Tracking Number Management
**Status:** Not started
**Description:** Input tracking, auto-fetch delivery ETA
**Requirements:**
- Add tracking number to PO
- Select carrier (UPS, FedEx, USPS, etc.)
- Auto-fetch tracking data from carrier API
- Display delivery ETA
- Update shipment status
- Show current location

**Files to Use/Create:**
- `src/services/trackingService.js` (already created, needs API integration)
- Carrier APIs: UPS, FedEx, USPS tracking APIs
- `src/components/procurement/TrackingNumberModal.js`

**Notes:**
- This is the PRIMARY FOCUS per user requirements
- May need to use third-party tracking aggregator (AfterShip, EasyPost)

### 5. Azure→Supabase Auth Integration (Long-term)
**Status:** Not started
**Description:** Proper authentication instead of anon access
**Requirements:**
- Exchange Azure MSAL token for Supabase JWT
- Create Supabase session after Azure login
- Update RLS policies to require authenticated role
- Remove anon access for production

**Files to Modify:**
- `src/contexts/AuthContext.js`
- `src/lib/supabase.js`
- Supabase RLS policies (remove anon access)

**Options:**
1. Custom JWT generation from Azure token
2. Use Supabase Azure OAuth provider (requires refactoring auth flow)
3. Service role key for background operations

## Known Issues to Address

1. **Authentication:** Currently using anon role (Azure auth not integrated)
2. **equipment_import_batches table:** Getting 400 errors, may need RLS policies
3. **Milestone percentages:** Errors about missing columns (project_room_id, equipment_attached)
4. **Supplier creation during import:** Now working with anon RLS access

## Database Migrations Pending

**Manual apply needed in Supabase:**
- ✅ `supabase/TEMP_ALLOW_ANON_PROJECT_EQUIPMENT.sql` - Applied
- ✅ `supabase/FIX_SUPPLIERS_RLS_FOR_ANON.sql` - Applied
- ⏳ `supabase/APPLY_THIS_FIRST_procurement_complete.sql` - Optional (tables may already exist)
- ⏳ `supabase/CREATE_EQUIPMENT_IMPORT_BATCHES.sql` - May be needed

## Testing Checklist

- [ ] CSV import in REPLACE mode (equipment deleted and re-imported)
- [ ] CSV import in MERGE mode (equipment updated/added)
- [ ] Vendor matching creates new suppliers
- [ ] Vendor matching links to existing suppliers
- [ ] Wire drops preserved during REPLACE import
- [ ] Labor budget updates without duplicates
- [ ] Vendor View groups equipment correctly
- [ ] PO generation creates database records
- [ ] PDF export generates valid PDF
- [ ] CSV export generates valid CSV
- [ ] Email template copies to clipboard
- [ ] Tracking number fetches delivery data

## Session Notes

**Last session ended:**
- Fixed vendor grouping to use `required_for_prewire` instead of `milestone_type`
- Vendor View now working with "Davis Distribution Systems" showing 100% match
- Ready to implement "big CSV import change" requested by user
- All work committed to git (commit 37b28fc)
- Pushed to GitHub and Vercel will auto-deploy

**User feedback:**
- "i think we are getting through this" - positive progress
- Wants to save work before implementing big CSV change
- Wants to keep procurement feature list for reference
