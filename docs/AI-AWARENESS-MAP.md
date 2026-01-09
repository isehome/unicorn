# UNICORN AI Awareness Map - Complete UI Inventory

> **Purpose:** This document maps EVERY page, modal, form field, and interactive element in the Unicorn app for AI voice agent awareness.
>
> **Last Updated:** January 9, 2025 (Comprehensive Implementation Complete)

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [New Capabilities (Jan 2025)](#new-capabilities-jan-2025)
3. [Orphaned Hooks Audit (Phase 1)](#orphaned-hooks-audit)
4. [Routes & AppState Status](#routes--appstate-status)
5. [Modals & Popups Inventory](#modals--popups-inventory)
6. [Form Fields Inventory](#form-fields-inventory)
7. [Priority Implementation Order](#priority-implementation-order)

---

## Executive Summary

| Category | Count | AI-Aware |
|----------|-------|----------|
| **Total Routes** | 51 | **31 (60.8%)** ✅ |
| **Modals/Dialogs** | 9+ | **8 (88.9%)** ✅ |
| **Form Fields** | 100+ | ~80+ (multiple pages) |
| **Orphaned Hook Files** | 0 | DELETED (Jan 2025) |
| **Navigation Targets** | 35+ | Static + Dynamic |
| **Quick Create Types** | 5 | todo, issue, ticket, contact, note |

### Status After Comprehensive Implementation (Jan 9, 2025)

1. **Phase 1 COMPLETE**: 3 orphaned hook files DELETED, stub functions removed
2. **Phase 2 COMPLETE**: 31 routes now have AppState integration (was 15)
3. **Phase 3 COMPLETE**: 8 modals now publish state (was 0)
4. **Phase 4 COMPLETE**: Navigation expanded to 35+ destinations
5. **Phase 5 COMPLETE**: quick_create tool added for todos, issues, tickets, contacts, notes
6. **Phase 6 COMPLETE**: Teaching mode integrated via teach_page, get_page_training, answer_page_question tools

---

## New Capabilities (Jan 2025)

### Expanded Navigation (35+ Targets)

The AI can now navigate to ANY of these destinations by voice:

**Dashboards**: dashboard, pm dashboard, home, tech dashboard
**Wire Drops**: prewire, prewire mode, wire drops, wire drops hub
**Service CRM**: service, tickets, new ticket, weekly planning, schedule, service reports
**Tasks**: todos, my todos, issues, all issues
**People**: people, contacts, contact list
**Vendors/Parts**: vendors, supplier list, parts, global parts, parts catalog
**Admin**: settings, admin, administration, knowledge, knowledge base

**Project Sections** (when in project context):
- shades, windows, shade manager
- equipment, equipment list
- procurement, purchase orders, pos
- receiving, parts receiving
- inventory, project inventory
- floor plan, floorplan
- reports, project reports
- secure data, credentials

### Quick Create Tool

The AI can create items by voice:
- **Todo**: "Create a todo to call the electrician, high priority"
- **Issue**: "Log an issue about the missing bracket" (requires project context)
- **Ticket**: "Create a service ticket for network troubleshooting"
- **Contact**: "Add a contact named John Smith"
- **Note**: "Add a note about the customer's preference"

### Teaching Mode Tools

- **get_page_training**: Retrieves trained context for any page
- **teach_page**: Provides overview, walkthrough, or tips for current page
- **answer_page_question**: Answers questions using trained FAQ and context

---

## Orphaned Hooks Audit

### Status: COMPLETED (Jan 2025)

| File | Action | Date |
|------|--------|------|
| `src/hooks/useKnowledgeTools.js` | DELETED | Jan 2025 |
| `src/hooks/useShadeDetailTools.js` | DELETED | Jan 2025 |
| `src/hooks/useShadeManagerTools.js` | DELETED | Jan 2025 |

### Files Still Active

| File | Status | Used By |
|------|--------|---------|
| `src/hooks/usePrewireTools.js` | ACTIVE | `src/components/PrewireMode.js` (but tools registered via AppState now) |

### Changes Made

1. Deleted 3 orphaned hook files that called stub `registerTools()` function
2. Removed `registerTools: () => {}` and `unregisterTools: () => {}` from AIBrainContext.js
3. PrewireMode.js now uses AppState pattern directly (legacy usePrewireTools kept for reference)

---

## Routes & AppState Status

### Routes WITH AppState Integration (31 routes) ✅

#### Core Pages (Original + Phase 2)

| Route | Component | publishState | registerActions | Added |
|-------|-----------|--------------|-----------------|-------|
| `/` | TechnicianDashboard | ✅ | ✅ | Jan 2025 |
| `/pm-dashboard` | PMDashboard | ✅ | ❌ | Original |
| `/project/:id` | ProjectDetailView | ✅ | ✅ | Jan 2025 |
| `/pm/project/:projectId` | PMProjectView | ✅ | ✅ | Jan 2025 |
| `/pm-project/:projectId` | PMProjectView | ✅ | ✅ | Jan 2025 |
| `/prewire-mode` | PrewireMode | ✅ | ✅ | Jan 2025 |
| `/wire-drops` | WireDropsHub | ✅ | ✅ | Jan 9, 2025 |
| `/wire-drops/:id` | WireDropDetail | ✅ | ✅ | Jan 2025 |
| `/todos` | TodosListPage | ✅ | ✅ | Jan 2025 |
| `/issues` | IssuesListPage | ✅ | ✅ | Jan 2025 |

#### Service Module

| Route | Component | publishState | registerActions | Added |
|-------|-----------|--------------|-----------------|-------|
| `/service` | ServiceDashboard | ✅ | ✅ | Original |
| `/service/tickets` | ServiceTicketList | ✅ | ✅ | Original |
| `/service/tickets/:id` | ServiceTicketDetail | ✅ | ✅ | Original |
| `/service/tickets/new` | NewTicketForm | ✅ | ❌ | Original |
| `/service/weekly-planning` | WeeklyPlanning | ✅ | ✅ | Jan 2025 |
| `/service/reports` | ServiceReports | ✅ | ✅ | Jan 9, 2025 |

#### Shade Management

| Route | Component | publishState | registerActions | Added |
|-------|-----------|--------------|-----------------|-------|
| `/projects/:projectId/shades` | ShadeManager | ✅ | ✅ | Original |
| `/projects/:projectId/shades/:shadeId` | ShadeDetailPage | ✅ | ✅ | Original |

#### Project Sections (All added Jan 9, 2025)

| Route | Component | publishState | registerActions |
|-------|-----------|--------------|-----------------|
| `/projects/:projectId/equipment` | EquipmentListPage | ✅ | ✅ |
| `/projects/:projectId/procurement` | PMProcurementPage | ✅ | ✅ |
| `/projects/:projectId/receiving` | PartsReceivingPage | ✅ | ✅ |
| `/projects/:projectId/inventory` | InventoryPage | ✅ | ✅ |
| `/projects/:projectId/floor-plan` | FloorPlanViewer | ✅ | ✅ |
| `/projects/:projectId/reports` | ProjectReportsPage | ✅ | ✅ |
| `/projects/:projectId/secure-data` | SecureDataPage | ✅ | ✅ |

#### People & Vendors (Added Jan 9, 2025)

| Route | Component | publishState | registerActions |
|-------|-----------|--------------|-----------------|
| `/people` | PeopleManagement | ✅ | ✅ |
| `/contacts/:contactId` | ContactDetailPage | ✅ | ✅ |
| `/vendors` | VendorManagement | ✅ | ✅ |

#### Parts & Admin (Added Jan 9, 2025)

| Route | Component | publishState | registerActions |
|-------|-----------|--------------|-----------------|
| `/parts` | PartsListPage | ✅ | ✅ |
| `/global-parts` | GlobalPartsManager | ✅ | ✅ |
| `/settings` | SettingsPage | ✅ | ✅ |
| `/admin` | AdminPage | ✅ | ✅ |

### Routes WITHOUT AppState (20 remaining - Auth/Public/Debug)

| Route | Component | Reason |
|-------|-----------|--------|
| `/login` | Login | Auth page |
| `/auth/callback` | AuthCallback | Auth flow |
| `/public/*` | Various | Public portals |
| `/shade-portal/:token` | PublicShadePortal | External portal |
| `/lucid-test` | LucidDiagnostic | Debug |
| `/unifi-test` | UnifiTestPage | Debug |
| `/voice-test` | VoiceTestPanel | Debug |
| `/service/ai-test` | ServiceAITest | Debug |
| `/settings/knowledge` | KnowledgeManagementPanel | Admin-only |

---

## Modals & Popups Inventory

### Modals WITH AI State Publishing (8 modals) ✅

All modals now publish their state when open, allowing the AI to:
- Know which modal is open
- See available form fields
- Read current values
- Execute modal-specific actions

#### 1. PO Generation Modal ✅
**File:** `src/components/procurement/POGenerationModal.js`
**AI Status:** Publishes state with form fields and values
**AI Actions:** set_field, create_po, cancel

**Form Fields:**
| Field | Type | Required |
|-------|------|----------|
| orderDate | date | ✅ |
| requestedDeliveryDate | date | |
| taxAmount | number | |
| shippingCost | number | |
| internalNotes | textarea | |
| supplierNotes | textarea | |
| shippingAddressId | select | ✅ |

---

#### 2. PO Details Modal ✅
**File:** `src/components/procurement/PODetailsModal.js`
**AI Status:** Publishes state with edit mode, tracking info
**AI Actions:** toggle_edit_mode, set_field, add_tracking, save_changes, close_modal

**Form Fields (Edit Mode):**
| Field | Type |
|-------|------|
| orderDate | date |
| requestedDeliveryDate | date |
| taxAmount | number |
| shippingCost | number |
| internalNotes | textarea |
| supplierNotes | textarea |

---

#### 3. Supplier Edit Modal ✅
**File:** `src/components/procurement/SupplierEditModal.js`
**AI Status:** Publishes 18 form fields with metadata
**AI Actions:** set_field, save_supplier, cancel, toggle_active, toggle_preferred

**Form Fields:** 18 fields including name, contact info, payment terms, shipping details

---

#### 4. Todo Detail Modal ✅
**File:** `src/components/TodoDetailModal.js`
**AI Status:** Publishes form fields, current tab, stakeholder list
**AI Actions:** set_field, switch_tab, add_comment, add_stakeholder, save_todo, mark_complete, close

**Form Fields:**
| Field | Type |
|-------|------|
| title | text |
| description | textarea |
| due_date | date |
| importance | select |
| do_date | date |
| start_time | time |
| duration_hours | number |

---

#### 5. Shade Measurement Modal ✅
**File:** `src/components/Shades/ShadeMeasurementModal.js`
**AI Status:** Publishes active tab, active field, all measurement values
**AI Actions:** switch_tab, set_field, highlight_field, save_measurements

**Form Fields:** 16 measurement fields (widths, heights, depths, notes)

---

#### 6. Service Time Entry Modal ✅
**File:** `src/components/Service/ServiceTimeEntryModal.js`
**AI Status:** Publishes form fields, technician options
**AI Actions:** set_field, save_entry, cancel

**Form Fields:**
| Field | Type | Required |
|-------|------|----------|
| technician_email | select | ✅ |
| work_date | date | ✅ |
| hours | select | ✅ |
| notes | textarea | |

---

#### 7. Photo Viewer Modal ✅
**File:** `src/components/photos/PhotoViewerModal.jsx`
**AI Status:** Publishes current photo info, available actions
**AI Actions:** replace_photo, delete_photo, close

---

#### 8. Print Label Modal ✅
**File:** `src/components/PrintLabelModal.js`
**AI Status:** Publishes wire drop info, label options
**AI Actions:** print_one, print_two, mark_printed, close

---

### Dropdown/Embedded Components

| Component | Parent | Toggle State |
|-----------|--------|--------------|
| ShippingAddressManager | PO Modals | `showAddressSelector` |
| Stakeholder Dropdown | TodoDetailModal | `showStakeholderDropdown` |
| Headrail Info Modal | ShadeMeasurementModal | `showHeadrailInfo` |
| Tracking Form | PODetailsModal | `showTrackingForm` |

---

## Form Fields Inventory

### Critical Voice-Fillable Forms

#### New Ticket Form
**File:** `src/components/Service/NewTicketForm.js`

| Field | Type | Voice Command Example |
|-------|------|----------------------|
| title | text | "Set title to Network not working" |
| description | textarea | "Description is Customer reports intermittent WiFi" |
| category | select | "Category is network" |
| priority | select | "Priority high" |
| customer (search) | text | "Customer Smith" |

---

#### Service Triage Form
**File:** `src/components/Service/ServiceTriageForm.js`

| Field | Type | Voice Command Example |
|-------|------|----------------------|
| initial_customer_comment | textarea | "Customer says router is blinking red" |
| triage_comments | textarea | "Add comment: Likely firmware issue" |
| estimated_hours | number | "Estimated hours 2" |
| parts_needed | checkbox | "Parts needed yes" |
| proposal_needed | checkbox | "Proposal needed" |

---

#### Shade Measurements (ShadeDetailPage)
**File:** `src/components/Shades/ShadeDetailPage.js`

| Field | Type | Voice Command Example |
|-------|------|----------------------|
| widthTop | text | "Top width 48 and a quarter" |
| widthMiddle | text | "Middle 48" |
| widthBottom | text | "Bottom 47 and seven eighths" |
| height | text | "Height 72" |
| mountDepth | text | "Mount depth 4" |

---

#### AI Settings
**File:** `src/components/UserSettings/AISettings.js`

| Field | Type | Voice Command Example |
|-------|------|----------------------|
| persona | radio | "Switch to teacher mode" |
| voice | buttons | "Use Kore voice" |
| instructions | textarea | "Add instruction: Always confirm measurements" |

---

## Priority Implementation Order

### Phase 1: Delete Orphaned Code (30 min)

```bash
# Delete orphaned hooks
rm src/hooks/useKnowledgeTools.js
rm src/hooks/useShadeDetailTools.js
rm src/hooks/useShadeManagerTools.js

# In AIBrainContext.js, remove lines 1063:
# registerTools: () => { }, unregisterTools: () => { },
```

### Phase 2: Add AppState to High-Priority Pages

**Order of implementation:**

1. **TechnicianDashboard** (`/`) - Most visited page
2. **ProjectDetailView** (`/project/:id`) - Core workflow
3. **PMProjectView** (`/pm/project/:projectId`) - PM workflow
4. **PrewireMode** (`/prewire-mode`) - Daily technician use
5. **WireDropDetail** (`/wire-drops/:id`) - Wire completion
6. **TodosListPage** (`/todos`) - Task tracking
7. **IssuesListPage** (`/issues`) - Issue tracking
8. **WeeklyPlanning** (`/service/weekly-planning`) - Scheduling
9. **EquipmentListPage** (`/projects/:id/equipment`) - Equipment
10. **PartsReceivingPage** (`/projects/:id/receiving`) - Inventory

### Phase 3: Modal State Publishing

Each modal should publish when it opens:
```javascript
useEffect(() => {
  if (isOpen) {
    publishState({
      modal: {
        type: 'po-generation',
        formFields: ['orderDate', 'taxAmount', ...],
        currentValues: formData,
      }
    });
  } else {
    publishState({ modal: null });
  }
}, [isOpen, formData]);
```

### Phase 4: Form Field Discovery

Add `formFields` array to every page's `publishState`:
```javascript
publishState({
  view: 'new-ticket',
  formFields: [
    { name: 'title', type: 'text', required: true, label: 'Ticket Title' },
    { name: 'category', type: 'select', options: ['network', 'av', 'shades', ...] },
    // ...
  ],
  formValues: formData,
});
```

---

## Quick Reference: Voice Commands per Page

| Page | Example Commands |
|------|------------------|
| Dashboard | "Show my projects", "Open Smith residence" |
| Shade Detail | "Top width 48", "Save measurements", "Next shade" |
| Shade List | "Open living room shade", "Go to next pending" |
| Service Tickets | "Create ticket", "Filter by high priority" |
| Ticket Detail | "Check me in", "Change status to completed", "Add note" |
| Weekly Planning | "Schedule for Monday", "Assign to Mike" |
| Equipment | "Import CSV", "Generate PO" |
| Wire Drops | "Mark as complete", "Take photo" |

---

*This document should be updated whenever new pages, modals, or form fields are added.*
