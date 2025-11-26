# 🚀 START HERE - Procurement Integration

## Quick Decision Checklist

Before I start building, please confirm these decisions:

### ✅ Confirmed Requirements:
1. **Email:** Copy-to-clipboard (ready for API later) ✓
2. **PDF:** Generic template (add logo later) ✓
3. **Tax/Shipping:** Optional fields, calculate shipping from CSV ✓
4. **SharePoint:** `/Projects/{Name}/Procurement/POs/` ✓
5. **Grouping:** Milestone → Vendor (two levels) ✓
6. **Notifications:** Date-based ordering reminders ✓

### 🤔 Need Your Input:

**1. Project Milestone Dates**
Where do we store/get these dates?
- [ ] A. Use existing project fields (start_date/end_date)?
- [ ] B. Add new fields (prewire_date, trim_date)?
- [ ] C. Use milestone table dates?

**Current project table has:**
- `start_date`
- `end_date`

**Recommended:** Add `prewire_date` and `trim_date` fields

---

**2. Notification Preferences**
How should PMs see alerts?
- [ ] A. Dashboard widget only
- [ ] B. Dashboard + browser notifications
- [ ] C. Dashboard + email digest (daily)
- [ ] D. All of the above

**Recommended:** Start with A (dashboard widget), add others later

---

**3. Shipping Line Items**
In your CSV, shipping is a line item like:
```csv
Room,Part,Description,Supplier,Qty,Cost,Type
Living,SHIP-FEDEX,Shipping,Amazon,1,45.00,shipping
```

Should we:
- [ ] A. Auto-detect (Type = 'shipping' or 'labor')
- [ ] B. Sum all and add to PO shipping field
- [ ] C. Keep as regular line item

**Recommended:** A - Auto-detect and sum shipping items separately

---

**4. Tax Calculation**
- [ ] A. Manual entry per PO (PM enters tax %)
- [ ] B. Project-level tax rate (set once)
- [ ] C. Supplier-level tax rate (varies by vendor)
- [ ] D. No auto-calculation (manual only)

**Recommended:** B - Project-level tax rate (most common)

---

**5. When to Generate PO Number?**
- [ ] A. When PM clicks "Generate PO" (draft until submitted)
- [ ] B. Only when PO is submitted to vendor
- [ ] C. Auto-generate on "Review" (can be deleted)

**Recommended:** A - Generate on click, status = 'draft'

---

**6. Vendor Matching**
CSV has supplier names like "Amazon Business", "Crestron"

How to handle variations?
- [ ] A. Exact match to supplier.name
- [ ] B. Fuzzy match (similar names)
- [ ] C. Manual mapping UI (first time only)
- [ ] D. Auto-create if not found

**Recommended:** C - Show mapping UI, then auto-match

Example:
```
CSV Supplier         Match to Database
"Amazon"        →    [Select] ▼ Amazon Business
"Crestron"      →    [Select] ▼ Crestron Electronics
"Home Depot"    →    [Select] ▼ Home Depot Pro
                     [+Add New Supplier]
```

---

**7. Bulk PO Generation**
"Generate All Prewire POs" button - should it:
- [ ] A. Auto-generate all POs (one per vendor)
- [ ] B. Show preview/confirmation first
- [ ] C. Create drafts, PM reviews each

**Recommended:** B - Show preview with totals, confirm before creating

---

**8. Logo Placement**
Where should "Intelligent Systems" logo go in future?
- [ ] A. Top center of PO
- [ ] B. Top left with company info right
- [ ] C. Header across full width

**Recommended:** B - Professional letterhead style

---

## 📊 What I Need From You

### Quick Answers:
1. **Milestone dates:** New fields or use existing?
2. **Notifications:** Dashboard only to start?
3. **Shipping:** Auto-detect and separate?
4. **Tax:** Project-level rate?
5. **PO Numbers:** Generate on "Create PO" click?
6. **Vendor Matching:** Mapping UI first time?
7. **Bulk Generate:** Show preview first?

### Can Start Building:
Once you answer above, I can immediately build:
- ✅ Database updates (add fields)
- ✅ PO Generator Service
- ✅ PDF Export Service
- ✅ Enhanced Order Equipment page
- ✅ Vendor grouping UI
- ✅ Email templates
- ✅ SharePoint integration

---

## 📝 Quick Start Commands

### 1. Apply Database Migration
```bash
# In Supabase SQL Editor, run:
supabase/procurement_system_fixed.sql
```

### 2. Install Dependencies
```bash
npm install jspdf jspdf-autotable file-saver
```

### 3. Add Project Date Fields (if needed)
```sql
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS prewire_date date,
ADD COLUMN IF NOT EXISTS trim_date date,
ADD COLUMN IF NOT EXISTS project_tax_rate numeric DEFAULT 0;
```

---

## 🎯 Simple Answers Format

Just reply with:
```
1. B (add prewire_date, trim_date)
2. A (dashboard widget only)
3. A (auto-detect shipping)
4. B (project-level tax rate)
5. A (generate on click)
6. C (mapping UI)
7. B (preview first)
```

Or tell me to use all "Recommended" options and I'll proceed!

---

## 📋 Additional Thoughts/Features?

Anything else you want to add or change from the plan in:
- [COMPLETE_PROCUREMENT_IMPLEMENTATION.md](COMPLETE_PROCUREMENT_IMPLEMENTATION.md)

I'm ready to start coding as soon as you give the go-ahead! 🚀
