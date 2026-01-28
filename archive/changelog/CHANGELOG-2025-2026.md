# PART 6: CHANGELOG

## 2026-01-22

### Configurable Default Service Hourly Rate (Bug BR-2026-01-12-0001)

Added company-configurable default hourly rate for service tickets, replacing the hardcoded $150/hr value.

**Problem Solved:**
- Service ticket hourly rate was hardcoded to $150/hr throughout the codebase
- No way for companies to set their own default service rate
- Rate showed as $150/hr regardless of company preference

**Solution:**
Added `default_service_hourly_rate` to company settings, allowing admins to configure their default hourly rate. This rate is used when:
1. Creating new service tickets (NewTicketForm, AI Brain)
2. Displaying time tracking costs (ServiceTimeTracker)
3. Individual tickets can still override with a per-ticket rate

**Database Changes:**
```sql
ALTER TABLE company_settings ADD COLUMN default_service_hourly_rate NUMERIC DEFAULT 150;
```

**Files Created:**
| File | Purpose |
|------|---------|
| `database/migrations/20260122_add_default_service_hourly_rate.sql` | Add default hourly rate column |

**Files Modified:**
| File | Changes |
|------|---------|
| `src/services/companySettingsService.js` | Added `default_service_hourly_rate` to create/update methods |
| `src/components/procurement/CompanySettingsManager.js` | Added "Service Settings" section with hourly rate input |
| `src/components/Service/ServiceTimeTracker.js` | Fetch company default rate when ticket has no rate |
| `src/components/Service/NewTicketForm.js` | Set company default rate on new ticket creation |
| `src/contexts/AIBrainContext.js` | Set company default rate when AI creates tickets |

**Rate Priority (highest to lowest):**
1. Ticket-level `hourly_rate` (per-ticket override)
2. Company-level `default_service_hourly_rate` (from company settings)
3. Fallback value of 150 (if company settings unavailable)

**Admin UI Location:**
Admin → Company Settings → Service Settings → Default Hourly Rate

---

## 2026-01-16

### Company SharePoint URL for Global Parts Documentation

Added company-level SharePoint configuration to enable uploading submittals, manuals, and schematics for global parts.

**Problem Solved:**
- Global parts (in `global_parts` table) are not project-specific
- Existing upload methods required a project's `client_folder_url`
- Submittal PDF uploads were failing with "uploadFile is not a function" error

**Solution:**
Added a company-wide SharePoint root URL setting that allows document uploads for global parts with automatic folder organization.

**Folder Structure:**
```
{company_sharepoint_root_url}/
└── Parts/
    └── {Manufacturer}/
        └── {PartNumber}/
            ├── submittals/
            ├── schematics/
            ├── manuals/
            └── technical/
```

**Database Changes:**
```sql
ALTER TABLE company_settings ADD COLUMN company_sharepoint_root_url TEXT;
```

**Files Created:**
| File | Purpose |
|------|---------|
| `database/migrations/20260116_add_company_sharepoint_url.sql` | Add SharePoint URL column |

**Files Modified:**
| File | Changes |
|------|---------|
| `src/services/companySettingsService.js` | Added `company_sharepoint_root_url` to create/update |
| `src/components/procurement/CompanySettingsManager.js` | Added SharePoint Document Storage section with URL input |
| `src/services/sharePointStorageService.js` | Added `getCompanySharePointUrl()` and `uploadGlobalPartDocument()` methods |
| `src/components/PartDetailPage.js` | Fixed to use new `uploadGlobalPartDocument()` method |

**New Method: `uploadGlobalPartDocument()`**
```javascript
// Usage in PartDetailPage.js
const result = await sharePointStorageService.uploadGlobalPartDocument(
  file,                    // PDF file
  'Lutron',                // Manufacturer name
  'QSE-IO',                // Part number
  'submittals'             // Document type: 'submittals', 'schematics', 'manuals', 'technical'
);
```

**Setup Required:**
1. Run the database migration
2. Go to Admin → Company Settings
3. Enter your SharePoint root URL in "SharePoint Document Storage" section
4. Example URL: `https://yourcompany.sharepoint.com/sites/Documents/Parts`

---

### Submittals Report Feature (Major Feature)

Added a new Submittals tab to the Reports section that generates downloadable documentation packages for projects.

**Feature Overview:**
- Collects product submittal PDFs from all parts used in a project
- Deduplicates by global_part_id (one document per part type, regardless of quantity)
- Includes Lucid wiremap as PNG
- Packages everything into a single ZIP file for download

**Database Changes:**
New columns added to `global_parts` table:
| Column | Type | Purpose |
|--------|------|---------|
| `submittal_pdf_url` | TEXT | External URL to manufacturer submittal PDF |
| `submittal_sharepoint_url` | TEXT | SharePoint URL for uploaded submittal PDF |
| `submittal_sharepoint_drive_id` | TEXT | SharePoint drive ID for Graph API access |
| `submittal_sharepoint_item_id` | TEXT | SharePoint item ID for Graph API access |

**Files Created:**
| File | Purpose |
|------|---------|
| `database/migrations/20260116_add_submittal_fields.sql` | Add submittal columns to global_parts |
| `database/migrations/20260116_update_global_part_rpc.sql` | Update RPC function with submittal params |
| `src/services/submittalsReportService.js` | Query parts with submittals, generate manifest |
| `src/services/zipDownloadService.js` | Generate ZIP files using JSZip |
| `api/sharepoint-download.js` | Proxy endpoint for downloading SharePoint files |

**Files Modified:**
| File | Changes |
|------|---------|
| `src/services/partsService.js` | Added submittal fields to create() and update() |
| `src/components/GlobalPartDocumentationEditor.js` | Added submittal document section (URL or upload) |
| `src/components/GlobalPartsManager.js` | Added submittal fields to select query |
| `src/components/PartDetailPage.js` | **Added Submittal Document section** with external URL input and SharePoint upload |
| `src/pages/ProjectReportsPage.js` | Added Progress and Submittals tabs |
| `src/components/PMProjectView.js` | Removed standalone Progress Report button |

**Part Detail Page Submittal Section:**
The Submittal Document field appears in the Part Details page (`/parts/:partId`) after the Technical Manual URLs section:
- External URL input for manufacturer submittal PDF links
- OR divider
- SharePoint upload option for custom submittal PDFs
- Amber FileCheck icon to distinguish from other documentation types
- Upload files are stored in SharePoint under: `submittals/{Manufacturer}/{PartNumber}/`

**Reports Page Tabs (Updated):**
| Tab | Purpose |
|-----|---------|
| Overview | Quick stats and milestone timeline |
| **Progress Report** | HTML report preview with email button (moved from PM View) |
| **Submittals** | Parts list with submittals + ZIP download button |
| Issues | Stakeholder issue groupings |
| Wire Drops | Wire drop progress by floor |
| Equipment | Parts ordering/receiving status |

**ZIP Package Contents:**
```
ProjectName-Submittals.zip
├── Submittals/
│   ├── Manufacturer1-Model1.pdf
│   ├── Manufacturer1-Model2.pdf
│   └── Manufacturer2-Model3.pdf
├── Wiremap.png (from Lucid export)
└── _Contents.txt (manifest listing)
```

**Data Flow:**
```
User clicks "Download ZIP" on Submittals tab
    ↓
zipDownloadService.downloadSubmittalsPackage()
    ↓
1. For each part with submittal:
   - If SharePoint: /api/sharepoint-download → file blob
   - If external URL: /api/image-proxy → file blob
    ↓
2. Export Lucid page 1 as PNG via lucidApi.exportDocumentPage()
    ↓
3. Bundle into JSZip with folder structure
    ↓
4. Generate and save ZIP via FileSaver.js
```

**Dependencies Added:**
- `jszip` - Client-side ZIP file generation
- `file-saver` (already present) - Trigger browser download

---

### Prewire Mode - Show/Hide Completed Toggles

Added two separate toggle buttons to filter wire drops by completion status in Prewire Mode (Technician Dashboard).

**Feature:** Independent toggle buttons to show/hide completed items for:
1. **Label Printed** - Filter drops where labels have already been printed
2. **Photo Taken** - Filter drops where prewire photo has been captured

**UI Components:**

| Button | Default State | Active State | Description |
|--------|---------------|--------------|-------------|
| Label Printed | "All Labels" + Eye | "Unprinted" + EyeOff (violet) | Hides drops with `labels_printed=true` |
| Photo Taken | "All Photos" + Eye | "No Photo" + EyeOff (violet) | Hides drops with prewire stage `completed=true` |

**Behavior:**
- Both toggles are **independent** - can be used separately or combined
- Default: Both show all items (toggles inactive/gray border)
- Active: Violet highlight indicates filtering is enabled (hiding completed items)
- Filters stack with existing floor/room/search filters
- Stats display updated to show both: `X/Y printed` and `X/Y photo`

**Voice AI Integration:**
- Added `toggle_show_photo_taken` action for voice control
- Updated state publishing to include `showPhotoTaken` filter status
- Both toggles accessible via voice commands

**State Variables:**
```javascript
const [showPrinted, setShowPrinted] = useState(true);    // Show/hide printed labels
const [showPhotoTaken, setShowPhotoTaken] = useState(true); // Show/hide photo taken
```

**Filter Logic:**
```javascript
// Hide printed labels when toggle is off
if (!showPrinted) {
  filtered = filtered.filter(drop => !drop.labels_printed);
}

// Hide drops with prewire photo when toggle is off
if (!showPhotoTaken) {
  filtered = filtered.filter(drop => {
    const prewireStage = drop.wire_drop_stages?.find(s => s.stage_type === 'prewire');
    return !prewireStage?.completed;
  });
}
```

**Files Modified:**
- `src/components/PrewireMode.js` - Added state, filter logic, UI toggles, voice AI actions

---

### Phase Milestones - Real-Time Status Display

Fixed the Phase Milestones table to show real-time calculated status instead of only displaying static database values.

**Problem:** The Phase Milestones section showed outdated dates because it only read from `project_milestones` table, while the Project Report Preview calculated percentages in real-time.

**Solution:** Updated the Status column to use the already-calculated `milestonePercentages` state:
- Shows "Completed" (green) when percentage = 100% OR manually marked complete
- Shows "X%" (blue) when percentage is between 1-99%
- Shows "Not set" (gray) when percentage is 0 or null

**Implementation Details:**

Added helper function to extract percentage for each milestone type:
```javascript
const getPercentageForType = (type) => {
  const typeMap = {
    'planning_design': milestonePercentages.planning_design,
    'prewire_prep': milestonePercentages.prewire_prep,
    'prewire': typeof milestonePercentages.prewire === 'number'
      ? milestonePercentages.prewire
      : milestonePercentages.prewire_phase?.percentage || 0,
    // ... other milestone types
  };
  return typeMap[type] ?? null;
};
```

Updated Status column to derive status from calculated percentage:
```javascript
const percentage = getPercentageForType(type);
const isComplete = milestone?.completed_manually || percentage === 100;

if (isComplete) return "Completed";
if (percentage > 0) return `${percentage}%`;
return "Not set";
```

**Files Modified:**
- `src/components/PMProjectView.js` - Added `getPercentageForType()` helper, updated Status column rendering

---

### Milestone Data Consistency - Single Source of Truth (SSOT)

Major refactoring to fix data inconsistencies between PM Project View and Project Report Preview gauges.

**Problems Fixed:**

1. **Fabricated Actual Dates** - Report showed today's date as "actual date" when percentage=100%, even if milestone wasn't explicitly completed by user.

2. **Duplicate Calculation Code** - `api/project-report/generate.js` had 360+ lines duplicating `milestoneService.js`, leading to calculation drift.

3. **No Single Source of Truth** - Two separate calculation systems produced different results.

4. **Stale Cache** - 5-minute localStorage cache with no invalidation triggers.

**Solution Architecture:**

```
PMProjectView.js ─────┬────► api/_milestoneCalculations.js (SSOT)
                      │              │
generate.js ──────────┘              ▼
                           api/milestone-percentages.js (API)
                                     │
                           milestoneCacheService.js (5-min cache + invalidation)
```

**Key Changes:**

1. **Fixed Fabricated Dates Bug** (line 891 in generate.js):
   - Before: `isComplete = dates.completed || (percentage === 100)` - WRONG
   - After: `isManuallyComplete = dates.completed === true` - CORRECT

2. **Created Shared Calculation Module** (`api/_milestoneCalculations.js`):
   - Single source of truth for ALL milestone percentage calculations
   - Exported functions used by both generate.js and milestone-percentages.js API

3. **Removed 360 Lines of Duplicate Code** from generate.js

4. **Added Cache Invalidation Triggers**:
   - `wireDropService.js` - Invalidates cache when stage completed
   - `projectEquipmentService.js` - Invalidates cache when procurement status changes

**New API Endpoint:**
```
GET /api/milestone-percentages?projectId={uuid}

Response: {
  success: true,
  percentages: {
    planning_design: 100,
    prewire_phase: { percentage: 68, orders: {...}, receiving: {...}, stages: {...} },
    trim_phase: { percentage: 25, ... },
    commissioning: 0
  }
}
```

**Files Created:**
- `api/_milestoneCalculations.js` - Shared calculation module (SSOT)
- `api/milestone-percentages.js` - API endpoint

**Files Modified:**
- `api/project-report/generate.js` - Fixed dates bug, imports from shared module
- `src/services/wireDropService.js` - Added cache invalidation on stage update
- `src/services/projectEquipmentService.js` - Added cache invalidation on status change
- `AGENT.md` - Added milestone architecture documentation

---

## 2026-01-14

### Bug Todos Tab Improvements

**Bug ID:** Session work (multiple bugs fixed)

**Changes Made:**

1. **Action Buttons Moved to Collapsed State**
   - Download, Copy, Reanalyze, and Fixed buttons now visible without expanding the bug report
   - Allows faster triage without clicking to expand each item
   - Added `e.stopPropagation()` to prevent row expansion when clicking buttons

2. **Bug Report Document - AGENT.md Update Instruction**
   - Added "Step 5: Update Documentation (REQUIRED)" to generated bug reports
   - Instructs AI tools to update AGENT.md after fixing bugs
   - Ensures changelog entries are created with: date, bug ID, description, fix details, files modified

3. **Fixed Duplicate Bug Report IDs (Race Condition)**
   - Problem: Multiple bugs processed simultaneously all got the same ID (e.g., BR-2026-01-14-0003)
   - Solution: Implemented atomic ID claiming with retry logic in `generateBugId()` function
   - Uses optimistic locking: UPDATE only if `bug_report_id IS NULL`
   - Retries up to 5 times with random delay on collision
   - Falls back to UUID-based suffix if all retries fail

4. **Fixed Safari Confirmation Dialog Issue**
   - Problem: `window.confirm()` was blocked by Safari when called from event handlers with `stopPropagation()`
   - Solution: Replaced with custom React modal for delete confirmation
   - Modal matches dark/light theme and works consistently across browsers

**Files Modified:**
- `src/components/Admin/BugTodosTab.js` - UI changes, custom modal, action button relocation
- `api/cron/process-bugs.js` - Race condition fix in `generateBugId()` function

---

### TodoDetailPage Crash Fix (BR-2026-01-14-0003)

**Bug ID:** BR-2026-01-14-0003

**Problem:** TodoDetailPage crashed with `TypeError: undefined is not an object (evaluating 'M.palette')` when opening a todo item on mobile (iPhone).

**Root Causes Identified:**

1. **Undefined Palette Object** - Components were accessing `palette.textPrimary`, `palette.info`, etc. without defensive checks when the palette object could be undefined during component initialization or when theme context wasn't fully loaded.

2. **Missing Database Columns** - The `project_todos` table was missing the calendar integration columns (`do_by_time`, `planned_hours`, `calendar_event_id`) that were added in migration `2025-12-02_add_todo_calendar_fields.sql`.

3. **Non-existent `updated_at` Column** - Code was trying to set `updated_at` on `project_todos` but this column doesn't exist in the table schema.

**Fixes Applied:**

1. **Defensive Palette Handling** - Added fallback defaults for palette properties in three components:
   ```javascript
   // Pattern applied to all components
   const rawPalette = paletteByMode[mode] || paletteByMode.light || {};
   const palette = {
       success: rawPalette.success || '#94AF32',
       warning: rawPalette.warning || '#F59E0B',
       info: rawPalette.info || '#3B82F6',
       primary: rawPalette.primary || '#8B5CF6',
       textPrimary: rawPalette.textPrimary || (mode === 'dark' ? '#FAFAFA' : '#18181B'),
       textSecondary: rawPalette.textSecondary || (mode === 'dark' ? '#A1A1AA' : '#52525B'),
       ...rawPalette
   };
   ```

2. **Database Migration** - User ran the migration to add missing columns:
   - `do_by_time time` - Start time for calendar events
   - `planned_hours decimal(4,2)` - Duration estimate
   - `calendar_event_id text` - Microsoft Graph event ID

3. **Removed `updated_at` References** - Removed `updated_at: new Date().toISOString()` from update payloads in `handleSave` and `handleToggleComplete` functions.

4. **Time Format Fix** - Format `do_by_time` as `HH:MM:SS` for PostgreSQL time type:
   ```javascript
   const formattedDoByTime = doBy && doByTime ? `${doByTime}:00` : null;
   ```

**Files Modified:**
- `src/components/TodoDetailPage.js` - Defensive palette, removed `updated_at`, time format fix
- `src/components/TodoDetailModal.js` - Defensive palette handling
- `src/components/ui/TimeSelectionGrid.jsx` - Defensive palette handling

**Migration Required:**
If encountering schema cache errors, run:
```sql
-- database/migrations/2025-12-02_add_todo_calendar_fields.sql
ALTER TABLE project_todos ADD COLUMN IF NOT EXISTS planned_hours decimal(4,2);
ALTER TABLE project_todos ADD COLUMN IF NOT EXISTS do_by_time time;
ALTER TABLE project_todos ADD COLUMN IF NOT EXISTS calendar_event_id text;
```

---

### Issue Stakeholder Dropdown Fix (BR-2026-01-15-0001)

**Bug ID:** BR-2026-01-15-0001

**Problem:** When adding stakeholders to an issue, the dropdown was showing ALL contacts in the system instead of only stakeholders assigned to the current project.

**Root Cause:** The `IssueDetail.js` component was using `contactsService.getAll()` to populate the dropdown, which returned every contact in the database. The user expected to see only `availableProjectStakeholders` (people already assigned to this project).

**Fix Applied:**

1. **Changed data source for dropdown:**
   - Before: `filteredContacts` based on `allContacts` (all contacts in system)
   - After: `filteredStakeholders` based on `availableProjectStakeholders` (project stakeholders only)

2. **Simplified the tagging flow:**
   - Before: Two-step process (select contact → select role)
   - After: Single-step (select project stakeholder with their existing role)
   - Project stakeholders already have roles assigned, so no need for role selection

3. **Added exclusion of already-tagged stakeholders:**
   - Dropdown now filters out stakeholders already tagged on the current issue
   - Shows helpful message when all stakeholders are already tagged

4. **Updated UI to show role information:**
   - Each stakeholder in dropdown now shows their role name
   - Internal/external indicator with appropriate colors (violet/olive)

5. **Removed unused code:**
   - Removed `allContacts`, `allRoles`, `selectedContact`, `stakeholderStep` state variables
   - Removed `handleSelectRole` function
   - Removed `contactsService` and `stakeholderRolesService` imports

**Files Modified:**
- `src/components/IssueDetail.js` - Dropdown now filters from project stakeholders, simplified flow

**How to Test:**
1. Navigate to any issue detail page
2. Click "Add stakeholder..." dropdown
3. Verify only project stakeholders appear (not all contacts)
4. Verify each stakeholder shows their role name
5. Select a stakeholder and verify they get tagged correctly

---

## 2025-12-23

### Azure AI Search RAG Integration (Major Update)
- **New Architecture:** Replaced Supabase pgvector with Azure AI Search for knowledge base
- **Benefits:**
  - Automatic indexing from SharePoint (hourly)
  - Semantic search with extractive answers & captions
  - No manual embedding generation required
  - Enterprise-grade scalability

- **New API Endpoint:** `api/azure-ai-search.js`
  - Queries Azure AI Search directly
  - Supports semantic search with simple fallback
  - Filters by manufacturer via path matching
  - Returns extractive answers for voice AI

- **Updated Services:**
  - `src/services/knowledgeService.js` - Now calls `/api/azure-ai-search` instead of Supabase
  - `searchKnowledgeForVoice()` - Formats Azure results for Gemini voice AI

- **Environment Variables (Vercel):**
  - `AZURE_SEARCH_SERVICE_NAME=unicorn-rag`
  - `AZURE_SEARCH_API_KEY=your-key`
  - `AZURE_SEARCH_INDEX_NAME=sharepoint-knowledge-index`

### Notion to SharePoint Export Script
- **New Script:** `~/Downloads/notion-to-sharepoint.js`
- **Features:**
  - Exports Notion Knowledge Base to SharePoint
  - Handles Manufacturer > Category > Content structure
  - Embeds images as base64 data URIs in markdown
  - Scrapes external links to markdown for indexing
  - Downloads and uploads PDFs
  - Supports large files (>4MB) via upload session API
  - Recursively discovers nested pages in column layouts

- **SharePoint Knowledge Library:**
  - URL: `https://isehome.sharepoint.com/sites/Unicorn/Knowledge`
  - 168+ documents indexed
  - Manufacturers: Alleo, Lutron, Sonos, Ubiquiti, Speco, and more

---

## 2025-12-21

### Auto-Link System for Knowledge Base → Parts
- **Database Migration:** `supabase/migrations/20241221_add_auto_link_support.sql`
  - Added `source`, `confidence`, `matched_on`, `knowledge_doc_id` to `global_part_documents`
  - New `job_runs` table for tracking cron job executions
  - Helper function `auto_link_knowledge_to_parts()` for SQL-based linking
  - Helper function `get_recent_job_runs()` for job history

- **Cron Jobs (Vercel):**
  - `api/cron/auto-link-docs.js` - Nightly job (3 AM) to link knowledge docs to global_parts
  - `api/cron/sync-sharepoint-knowledge.js` - Nightly job (2 AM) to sync docs from SharePoint
  - Added cron configuration to `vercel.json`

- **Matching Logic:**
  - Model number match → 95% confidence
  - Part number match → 90% confidence
  - Manufacturer match → 50% confidence
  - Auto-infers document type from title keywords

### Knowledge Upload Fixes
- Changed from public URL to signed URL for Supabase Storage
- Reduced embedding batch size to prevent OpenAI token limit errors
- Added batch token counting with fallback to individual processing
- Filter oversized chunks (>1000 tokens) before embedding

---

## 2025-12-20

### RAG Knowledge Base System (Major Feature)
- **Database Migration:** `supabase/migrations/20241220_add_knowledge_tables.sql`
  - `knowledge_manufacturers` - Multi-manufacturer support (Lutron, Control4, Ubiquiti, etc.)
  - `knowledge_documents` - Document metadata and processing status
  - `knowledge_chunks` - Text chunks with 1536-dim vector embeddings (pgvector)
  - `search_knowledge()` - Vector similarity search function
  - `search_knowledge_text()` - Full-text search fallback function
- **API Endpoints:**
  - `api/knowledge-upload.js` - Handle document uploads
  - `api/knowledge-process.js` - Extract text, chunk, generate OpenAI embeddings
  - `api/knowledge-search.js` - Semantic search with manufacturer filtering
- **Frontend:**
  - `src/services/knowledgeService.js` - Knowledge CRUD operations
  - `src/components/knowledge/KnowledgeManagementPanel.js` - Upload/manage documents UI
  - Added Knowledge Base link to Settings page
  - Added `/knowledge` route to App.js

### Lutron Shade Knowledge Base
- **New File:** `src/data/lutronShadeKnowledge.js`
  - Comprehensive Lutron shade specifications
  - Measurement guidelines and tolerances
  - Fabric types and mount options
  - Used by voice AI for instant Lutron lookups

### Voice AI Improvements
- **New Hook:** `src/hooks/useShadeDetailTools.js`
  - Replaces deprecated `useShadeTools.js`
  - Improved field highlighting with violet glow animation
  - Better M1/M2 tab awareness
  - Tools: `get_shade_context`, `set_measurement`, `navigate_to_field`, `mark_measurement_complete`
- **New Hook:** `src/hooks/useKnowledgeTools.js`
  - `search_manufacturer_docs` - RAG-powered documentation search
  - `get_lutron_shade_info` - Embedded Lutron knowledge lookup
- **VAD Tuning:** Increased `silenceDurationMs` to 500ms to prevent early speech cutoff
- **Page Awareness:** Improved `useAgentContext.js` for better location tracking

### Voice AI Field Highlighting
- ShadeDetailPage now highlights measurement fields with violet glow when AI prompts
- 5-second animation duration for visual feedback
- Critical for hands-free measuring workflow

---

## 2025-12-27 & 2025-12-28

### Service CRM - Weekly Planning Module (Complete)
- **"Air Traffic Control" Interface** for drag-and-drop service ticket scheduling
- **Iframe Embeddable** for Alleo integration

#### Weekly Planning Features
- Week-view calendar with work hours (6 AM - 10 PM)
- **Configurable**: Toggle between Mon-Fri (work week) and Sun-Sat (full week)
- **Horizontal scrolling/infinite weeks** - scroll right to load next weeks
- Drag-and-drop service ticket CARDS onto calendar time slots
- **Card height = estimated service length** (uses ticket's `estimated_hours` field)
- Default 2-hour blocks, 30-min buffer between events
- Toggle views: per-technician OR all overlapping
- **Show ALL Microsoft 365 calendar events as blocked time**
- Colors: AMBER = tentative, GREEN = confirmed
- **Rescheduling**: Drag existing scheduled blocks to move appointments
- **Ticket Detail Modal**: Click scheduled block to see ticket details without leaving planning

#### Calendar Integration (New 2025-12-28)
When scheduling a ticket:
1. Creates M365 calendar event on technician's calendar
2. Event subject: `[TENTATIVE] Service: Customer Name (#ticket_number)`
3. **Customer email added as attendee** (sends calendar invite)
4. Event body includes customer info, address, phone, notes
5. Location set to service address
6. Duration matches ticket's `estimated_hours`

#### Block Sizing Fix (2025-12-28)
- Scheduled blocks now correctly reflect ticket's `estimated_hours` field
- Duration preserved when rescheduling (moving blocks)
- Fallback chain: `scheduled_time_end` → `estimated_duration_minutes` → `ticket.estimated_hours` → default 2 hours

#### Embed URL
```
https://unicorn-one.vercel.app/service/weekly-planning?embed=true
```

#### Iframe Embed Code
```html
<iframe src="https://unicorn-one.vercel.app/service/weekly-planning?embed=true"
        width="1920" height="1080" frameborder="0"
        style="border-radius: 8px;"></iframe>
```

**Dimensions: 16:9 aspect ratio (1920×1080 / 1080p)**

**Note:** Embed mode requires authentication (RLS policies enforced)

#### Files Created/Modified
| File | Purpose |
|------|---------|
| `src/pages/WeeklyPlanning.js` | Main weekly planning page (embed-aware) |
| `src/components/Service/WeekCalendarGrid.jsx` | Week grid with hour rows, draggable blocks |
| `src/components/Service/UnscheduledTicketsPanel.jsx` | Draggable tickets sidebar |
| `src/components/Service/TechnicianFilterBar.jsx` | Controls, week nav, embed modal |
| `src/services/weeklyPlanningService.js` | Schedule management, buffer checking |
| `src/services/microsoftCalendarService.js` | Added `createServiceAppointmentEvent`, `updateServiceAppointmentEvent` |
| `database/migrations/20251228_weekly_planning_confirmation.sql` | DB migration |

#### Database Schema Additions
```sql
-- service_schedules additions:
schedule_status TEXT DEFAULT 'tentative' -- 'tentative' | 'confirmed' | 'cancelled'
calendar_event_id TEXT                   -- M365 event ID for updates
confirmed_at TIMESTAMPTZ
confirmed_by TEXT
confirmation_method TEXT                 -- 'portal' | 'phone' | 'email' | 'sms' | 'internal'
estimated_duration_minutes INTEGER DEFAULT 120

-- New table for customer confirmations:
service_schedule_confirmations (token-based portal access)
```

#### weeklyPlanningService.js Functions
| Function | Purpose |
|----------|---------|
| `getSchedulesForDateRange()` | Fetch schedules with ticket details for date range |
| `getWeekSchedules()` | Convenience wrapper for week data |
| `getUnscheduledTickets()` | Get triaged tickets not yet scheduled |
| `checkBufferConflicts()` | Validate 30-min buffer between appointments |
| `createTentativeSchedule()` | Create new schedule from drag-drop |
| `moveSchedule()` | Reschedule existing appointment |
| `confirmSchedule()` | Mark schedule as confirmed |
| `cancelSchedule()` | Cancel a schedule |
| `updateCalendarEventId()` | Store M365 event ID for later updates |

---
## 2025-12-29

### Service System Enhancements (Complete)

Four major enhancements to the service ticket system:

#### 1. Service Time Tracking
Check-in/check-out functionality for technicians working on service tickets.

**Features:**
- Technicians can check in when starting work on a ticket
- Live timer displays elapsed time
- Check out when done to record duration
- Manual time entry for forgotten check-ins
- Time logs history with edit/delete capability
- Per-ticket hourly rate (default $150/hr)
- Total hours summary per technician

**Files:**
| File | Purpose |
|------|---------|
| `src/services/serviceTimeService.js` | Time log CRUD, check-in/out logic |
| `src/hooks/useServiceTimeTracking.js` | Hook with localStorage fallback |
| `src/components/Service/ServiceTimeTracker.js` | Time tracking UI component |
| `src/components/Service/ServiceTimeEntryModal.js` | Manual time entry modal |
| `database/migrations/20251229_service_time_logs.sql` | Database schema |

**Database Table: `service_time_logs`**
- `ticket_id`, `technician_id`, `technician_email`, `technician_name`
- `check_in`, `check_out` (timestamps)
- `notes` (optional work description)

#### 2. Service Photos in SharePoint
Photo upload/management for service tickets with SharePoint integration.

**Folder Structure:**
```
SharePoint/
└── Service/                     # Top-level service folder
    └── {CustomerName}/          # Customer subfolder
        └── {TicketNumber}/      # Ticket subfolder
            ├── before/          # Pre-work photos
            ├── during/          # Work-in-progress
            ├── after/           # Completed work
            └── documentation/   # Manuals, receipts
```

**Features:**
- Photo categories: Before, During, After, Documentation
- Drag-and-drop upload
- Mobile camera capture
- Thumbnail gallery with lightbox
- Photo captions

**Files:**
| File | Purpose |
|------|---------|
| `src/services/servicePhotoService.js` | Upload/delete/list photos |
| `src/components/Service/ServicePhotosManager.js` | Photo gallery UI |
| `database/migrations/20251229_service_ticket_photos.sql` | Database schema |

**Database Table: `service_ticket_photos`**
- `ticket_id`, `photo_url`, `category`
- `sharepoint_drive_id`, `sharepoint_item_id` (for Graph API)
- `caption`, `uploaded_by`, `uploaded_by_name`

#### 3. Service Reporting
Query and export service data by date range, customer, technician.

**Route:** `/service/reports`

**Features:**
- Date presets (This Month, Last Month, Last 30/90 Days, This Quarter, This Year, Custom)
- Filter by customer, technician
- Summary cards: Total Tickets, Hours, Labor Cost, Parts Cost, Revenue
- Tabbed interface: Overview, Tickets, Technicians, Customers
- Charts: Hours by technician, Revenue by customer
- CSV export

**Files:**
| File | Purpose |
|------|---------|
| `src/services/serviceReportService.js` | Report queries, date presets, CSV export |
| `src/pages/ServiceReports.js` | Full reporting dashboard |
| `database/migrations/20251229_service_reports.sql` | Views and functions |

**Database Views:**
- `service_customer_summary` - Per-customer ticket/hours/cost totals
- `service_technician_summary` - Per-tech hours by month

**Database Functions:**
- `get_service_report()` - Detailed ticket report with filters
- `get_service_summary()` - Summary totals for date range
- `get_service_monthly_overview()` - Daily breakdown for charts
- `get_technician_hours_report()` - Tech hours for date range
- `get_customer_hours_report()` - Customer hours for date range

#### 4. QuickBooks Online Export
Manual export of completed service tickets to QuickBooks for invoicing.

**Features:**
- Export button on resolved/closed tickets
- Creates invoice with labor (hours × rate) + parts line items
- Auto-creates/maps customers in QBO
- Tracks sync status on ticket
- Connect/disconnect QBO from Settings page

**Files:**
| File | Purpose |
|------|---------|
| `src/services/quickbooksService.js` | OAuth flow, invoice creation |
| `api/qbo/auth.js` | OAuth initiation endpoint |
| `api/qbo/callback.js` | OAuth callback handler |
| `api/qbo/create-invoice.js` | Create invoice from ticket |
| `api/qbo/customers.js` | Search/create QBO customers |
| `database/migrations/20251229_quickbooks_integration.sql` | QBO tables |

**Database Tables:**
- `qbo_auth_tokens` - OAuth tokens (encrypted)
- `qbo_customer_mapping` - Maps contacts to QBO customer IDs

**service_tickets additions:**
- `qbo_invoice_id`, `qbo_invoice_number`
- `qbo_synced_at`, `qbo_sync_status`, `qbo_sync_error`

---

### QuickBooks Online Setup Instructions

#### Step 1: Create Intuit Developer Account
1. Go to https://developer.intuit.com/
2. Sign up or log in
3. Click "Create an app"
4. Select "QuickBooks Online and Payments"
5. Name your app (e.g., "Unicorn Service CRM")

#### Step 2: Configure App Settings
In the Intuit Developer Portal:

1. **Keys & credentials** tab:
   - Note your **Client ID** and **Client Secret**

2. **Redirect URIs** section:
   - Add: `https://unicorn-one.vercel.app/api/qbo/callback`
   - For local dev: `http://localhost:3000/api/qbo/callback`

3. **Scopes** section (select these):
   - `com.intuit.quickbooks.accounting` (read/write accounting data)

#### Step 3: Set Environment Variables
Add to your Vercel project (Settings → Environment Variables):

```
QBO_CLIENT_ID=your_client_id_here
QBO_CLIENT_SECRET=your_client_secret_here
QBO_REDIRECT_URI=https://unicorn-one.vercel.app/api/qbo/callback
QBO_ENVIRONMENT=sandbox
```

**Note:** Use `sandbox` for testing, `production` when ready for real invoices.

#### Step 4: Install Dependencies
```bash
npm install intuit-oauth
```

#### Step 5: Connect QuickBooks
1. Go to Settings page in Unicorn
2. Scroll to "QuickBooks Integration" section
3. Click "Connect to QuickBooks"
4. Log in with your QuickBooks Online account
5. Authorize the app
6. You'll be redirected back - connection status shows "Connected"

#### Step 6: Test with Sandbox
1. Create a test service ticket
2. Add time logs (check in/out)
3. Add parts to the ticket
4. Set status to "Resolved" or "Closed"
5. Click "Export to QuickBooks" button
6. Verify invoice created in QBO sandbox

#### Switching to Production
1. In Intuit Developer Portal, submit app for review
2. Once approved, update environment variable:
   ```
   QBO_ENVIRONMENT=production
   ```
3. Reconnect QuickBooks from Settings (need to re-authorize)

#### Troubleshooting

**"QuickBooks not connected" error:**
- Go to Settings and click "Connect to QuickBooks"
- Ensure OAuth tokens haven't expired (auto-refresh should handle this)

**"Customer not found" error:**
- System will auto-create customer in QBO using contact's name/email
- Ensure ticket has a valid contact linked

**Invoice not showing expected amounts:**
- Check that time logs have check_out times (incomplete sessions not included)
- Verify parts have unit_cost values set

**Rate limiting:**
- QBO has API limits; exports are batched automatically
- If hitting limits, wait a few minutes and retry

---

### Service Module Routes (Updated)

| Route | Component | Purpose |
|-------|-----------|---------|
| `/service` | ServiceDashboard | Service dashboard with integrated ticket list, search, filters |
| `/service/tickets/new` | NewTicketForm | Create new ticket |
| `/service/tickets/:id` | ServiceTicketDetail | Ticket detail (photos, time, QBO) |
| `/service/weekly-planning` | WeeklyPlanning | Drag-drop scheduling |
| `/service/reports` | ServiceReports | Reporting dashboard |

---

### Service Database Tables (Updated)

| Table | Purpose |
|-------|---------|
| `service_tickets` | Service ticket records |
| `service_schedules` | Scheduled appointments |
| `service_call_logs` | Call history and notes |
| `service_schedule_confirmations` | Customer confirmation tokens |
| `service_time_logs` | **NEW** - Time tracking entries |
| `service_ticket_photos` | **NEW** - Photo metadata |
| `service_ticket_parts` | Parts used on tickets |
| `qbo_auth_tokens` | **NEW** - QuickBooks OAuth tokens |
| `qbo_customer_mapping` | **NEW** - QBO customer mappings |

---

---

## AI-Enhanced Bug Reporting System

### Overview

The bug reporting system captures user-reported issues and uses **Gemini AI** to analyze them, suggest specific code fixes, and create GitHub PRs for tracking. Bug reports are stored as markdown files in the Git repository.

### Architecture Flow

```
User Reports Bug (BugReporter.js)
        ↓
    /api/bug-report
        ↓
    Saves to Supabase `bug_reports` table (status: pending)
        ↓
    Sends immediate "Bug Received" email
        ↓
    Returns to user immediately
        ↓
    [Background - every 3 minutes]
        ↓
    /api/cron/process-bugs picks up pending bugs
        ↓
    Gemini AI analyzes: screenshot + user description + console errors + code context
        ↓
    Generates markdown report with YAML frontmatter
        ↓
    Creates GitHub branch: bug-report/BR-YYYY-MM-DD-####
        ↓
    Commits .md file + screenshot
        ↓
    Opens Pull Request
        ↓
    Sends enhanced email with AI fix suggestions
        ↓
    Updates DB status to "analyzed"
```

### Key Files

| File | Purpose |
|------|---------|
| `src/components/BugReporter.js` | Frontend bug report modal (screenshot, voice input, console errors) |
| `api/bug-report.js` | Initial submission endpoint - saves to queue, sends email via **system account** (never expires) |
| `api/bugs/analyze.js` | Gemini AI analysis module (multimodal) |
| `api/bugs/github.js` | GitHub API integration (branches, commits, PRs) |
| `api/bugs/list.js` | List bugs with filtering/pagination |
| `api/bugs/[id].js` | Get/Delete/Reanalyze single bug |
| `api/cron/process-bugs.js` | Background processor (cron every 3 min) |
| `src/components/Admin/BugTodosTab.js` | Admin UI for bug management |

### Database Table: `bug_reports`

```sql
CREATE TABLE bug_reports (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ,

  -- Reporter
  reported_by_email TEXT,
  reported_by_name TEXT,

  -- Bug data
  url TEXT NOT NULL,
  user_agent TEXT,
  description TEXT NOT NULL,
  console_errors JSONB,
  screenshot_base64 TEXT,     -- Cleared after GitHub upload to save space

  -- Processing
  status TEXT CHECK (status IN ('pending', 'processing', 'analyzed', 'failed')),
  processed_at TIMESTAMPTZ,
  processing_error TEXT,

  -- AI Results
  bug_report_id TEXT,         -- BR-2026-01-07-0001
  md_file_path TEXT,          -- bug-reports/2026-01/BR-...md
  ai_summary TEXT,
  ai_severity TEXT,
  ai_suggested_files JSONB,
  ai_fix_prompt TEXT,
  ai_confidence DECIMAL(3,2), -- 0-1 confidence score
  ai_token_usage JSONB,       -- { prompt_tokens, completion_tokens, total_tokens }
  ai_filename_slug TEXT,      -- AI-generated short name like "login-button-broken"

  -- GitHub
  pr_url TEXT,
  pr_number INTEGER,
  branch_name TEXT
);
```

### Git Repository Structure

```
/bug-reports/
  2026-01/
    BR-2026-01-07-0001-login-button-broken.md
    BR-2026-01-07-0002-schedule-not-saving.md
  attachments/
    BR-2026-01-07-0001/
      screenshot.jpg
    BR-2026-01-07-0002/
      screenshot.jpg
```

### Markdown Bug Report Format (YAML Frontmatter)

```yaml
---
id: BR-2026-01-07-0001
title: "Login button not responding"
status: new
severity: high
priority: p1
reported_at: 2026-01-07T14:32:05Z
reported_by: John Smith <john@example.com>
app: unicorn
area: auth
environment:
  url: https://unicorn.app/login
  browser: "Chrome 121"
  os: "macOS 14.2"
labels: ["ui", "auth"]
assignee: ""
ai_analysis:
  summary: "Login button onClick handler not bound correctly"
  root_cause: "Missing async/await on auth call"
  fix_prompt: |
    In src/pages/Login.js line 45:
    Change: onClick={handleLogin}
    To: onClick={async () => await handleLogin()}
  suggested_files:
    - "src/pages/Login.js:45"
  confidence: 0.85
---

## Summary
...

## AI Fix Prompt
...
```

### AI Analysis Priority

The AI analyzes bug reports with this priority:

1. **User Description (PRIMARY)** - What the user said is wrong
2. **Console Errors** - Technical errors captured
3. **Screenshot** - Visual context
4. **Source Code** - Relevant files based on URL

The AI is instructed to treat the user's description as the PRIMARY source of truth, not just blindly analyze code/screenshots.

### How AI Gets Code Context

The system maps URL paths to source files using `api/bugs/analyze.js`:

| URL Pattern | Primary File |
|-------------|--------------|
| `/admin` | `src/pages/AdminPage.js` |
| `/service` | `src/components/Service/ServiceDashboard.js` |
| `/service/tickets/:id` | `src/components/Service/ServiceTicketDetail.js` |
| `/projects/:id/shades/:shadeId` | `src/pages/ShadeDetailPage.js` |
| etc. | See PAGE_FILE_MAP in analyze.js |

### Accessing Bug Reports for AI Tools

#### Option 1: Query Database (Current Bugs)

```javascript
// From Supabase
const { data: bugs } = await supabase
  .from('bug_reports')
  .select('*')
  .eq('status', 'analyzed')
  .order('created_at', { ascending: false });
```

#### Option 2: Read from Git Repository (Historical)

Bug reports are committed as markdown files to the repository. You can read them directly:

```bash
# List all bug reports
ls bug-reports/*/BR-*.md

# Read a specific bug report
cat bug-reports/2026-01/BR-2026-01-07-0001-login-button-broken.md

# Search for bugs by keyword
grep -r "auth" bug-reports/

# Get bugs from last 7 days
find bug-reports -name "*.md" -mtime -7
```

#### Option 3: GitHub API

```bash
# List bug report files via GitHub API
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/isehome/unicorn/contents/bug-reports"

# Get a specific bug report content
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/isehome/unicorn/contents/bug-reports/2026-01/BR-2026-01-07-0001.md"
```

#### Option 4: Via Unicorn API Endpoints

```bash
# List bugs with filtering
GET /api/bugs/list?status=analyzed&limit=20

# Get single bug with full details
GET /api/bugs/{uuid}

# Response includes ai_fix_prompt, ai_suggested_files, etc.
```

### Using Bug Reports in AI Prompts

When fixing bugs, you can provide context like:

```
I need to fix this bug:

Bug ID: BR-2026-01-07-0001
User Report: "The login button doesn't work when I click it"
AI Analysis: Login button onClick handler not bound correctly
Suggested Fix: In src/pages/Login.js line 45, add async/await
Affected Files: src/pages/Login.js:45

Please review the suggested fix and implement it.
```

### Admin UI: Bug Todos Tab

Located at **Admin → Bug Todos** (9th tab)

**Features:**
- Stats cards: Pending | Analyzed | Failed | Total
- Filter by status
- Expandable bug cards matching email format:
  - Violet header banner with bug ID
  - Severity & Confidence cards side by side
  - Summary, Suggested Fix, Affected Files
  - PR link, Reporter info, Description, Page URL
  - Console errors (red box)
  - Screenshot (fetched from GitHub if not in DB)
  - Token usage display with estimated cost

**Actions:**
- **Download Report** - Downloads complete `.md` file with dual-perspective AI instructions
- **Open File** - Downloads and opens `.md` file in system default markdown editor
- **View PR** (GitHub icon in header) - Opens GitHub pull request
- **Reanalyze** - Resets to pending for re-processing
- **Mark Fixed** - Deletes from GitHub + database

**Filenames:** Bug reports use AI-generated descriptive slugs for meaningful filenames:
- Example: `BR-2026-01-09-0001-login-button-broken.md` instead of just `BR-2026-01-09-0001.md`
- The AI generates a 2-5 word slug based on the bug description (stored in `ai_filename_slug`)

### Downloadable Bug Report (.md)

The "Download Report" button generates a complete markdown file optimized for external AI assistants (Claude Code, etc.):

```markdown
# Bug Report: BR-2026-01-07-0001

## App Context
This is the **Unicorn** app - a React-based field operations management system.
- **Stack:** React 18, Supabase (PostgreSQL), Vercel serverless functions
- **UI:** Tailwind CSS, Lucide icons, dark/light mode support
- **Key patterns:** Service-based architecture, React hooks, async/await
- **Repo:** https://github.com/isehome/unicorn

## Bug Details
| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **Reporter** | John Smith (john@example.com) |
| **Page URL** | https://unicorn.app/admin |

## Screenshot
> **Important:** Review this screenshot to understand the visual context of the bug.

![Bug Screenshot](https://raw.githubusercontent.com/isehome/unicorn/bug-report/BR-.../screenshot.jpg)

## AI Analysis & Suggested Fix
[Gemini's suggested fix here]

---

## Instructions for AI Assistant

> **Important:** This bug report includes a suggested fix from our internal Gemini AI agent.
> Your task is to provide a **second, independent analysis** to verify or improve upon it.

### Step 1: Independent Analysis
Before reading the suggested fix above, perform your own analysis...

### Step 2: Compare Approaches
Now review the "AI Analysis & Suggested Fix" section above and compare...

### Step 3: Implement the Best Solution
Based on both perspectives, implement the fix that...

### Step 4: Verify
After implementing, briefly explain...
```

**Key features of the downloadable report:**
- **App Context** - Brief primer on the Unicorn stack (~200 tokens)
- **GitHub Screenshot URL** - Uses raw.githubusercontent.com so the image renders in AI tools
- **Dual-Perspective Instructions** - Asks the receiving AI to independently analyze, then compare with Gemini's fix
- This "second opinion" approach increases fix confidence

### Token Usage Tracking

The system tracks Gemini API token usage for cost monitoring:

```javascript
// Captured from Gemini response
{
  prompt_tokens: 2500,
  completion_tokens: 800,
  total_tokens: 3300
}
```

Displayed in UI as: `Tokens: 2,500 prompt + 800 completion = 3,300 total | ~$0.0003 est.`

### Environment Variables Required

```
GEMINI_API_KEY=xxx           # For AI analysis
GITHUB_TOKEN=ghp_xxx         # For creating branches/PRs (needs repo write)
BUG_REPORT_EMAIL=xxx         # Email recipient for bug reports
```

### Cron Job

The bug processor runs every 3 minutes via Vercel cron:

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/process-bugs",
      "schedule": "*/3 * * * *"
    }
  ]
}
```

### Workflow for Fixing Bugs

1. **Bug submitted** → User sees "Bug report submitted! AI analysis will be sent shortly."
2. **AI processes** → Within 3 minutes, creates GitHub PR
3. **Developer reviews** → Opens PR, reads AI analysis
4. **Implement fix** → Make changes based on `ai_fix_prompt`
5. **Mark fixed** → Admin → Bug Todos → Mark Fixed (deletes .md file)

Or merge the PR and delete the branch.

---

## 2026-01-12

### Service Dashboard Consolidation

Merged `ServiceTicketList` into `ServiceDashboard` for a unified service page at `/service`.

**Changes:**
- **ServiceDashboard.js** now includes:
  - Full ticket list (not just "Recent 5")
  - Search input with real-time filtering
  - Filter by status, priority, category
  - URL parameter support for filter persistence
  - Dynamic categories from `skill_categories` table
  - Direct navigation to ticket details

- **Removed:**
  - `ServiceTicketList.js` component (deleted)
  - `/service/tickets` route (merged into `/service`)

- **Updated Files:**
  - `src/App.js` - Removed ServiceTicketList route
  - `src/components/AppHeader.js` - Removed `/service/tickets` title
  - `src/config/pageRegistry.js` - Removed `/service/tickets` entry
  - `src/components/Service/index.js` - Removed ServiceTicketList export
  - `src/contexts/AIBrainContext.js` - Updated navigation aliases
  - `src/components/Service/NewTicketForm.js` - Updated cancel navigation to `/service`
  - `src/components/Service/ServiceTicketDetail.js` - Updated delete navigation to `/service`
  - `src/pages/ServiceReports.js` - Removed custom back button (per AGENT.md guidelines)

### Weekly Planning Dropdown Fix

Fixed TechnicianDropdown not working for unscheduled tickets in the Weekly Planning sidebar.

**Root Cause:** The `TicketCard` component had `overflow-hidden` CSS which clipped the dropdown menu that extends below the card.

**Fix:** Removed `overflow-hidden` from TicketCard and changed `height` to `minHeight` so the dropdown can expand beyond the card boundaries.

**File:** `src/components/Service/UnscheduledTicketsPanel.jsx`

---

## 2026-01-08

### Unified Skills System (Major Feature)

Consolidated skills as the **single source of truth** for both service ticket categories and employee skill development/tracking.

#### Overview

```
skill_categories (master)
├── show_in_service: true/false (filter for service UI)
├── color, label, icon, description
│
├── Service Tickets (filtered by show_in_service=true)
│   ├── NewTicketForm category buttons
│   ├── ServiceDashboard filters (integrated ticket list)
│   └── Technician skill matching (future)
│
└── Employee Development (all categories)
    ├── Admin: Assign skills to employees via SkillsManager
    ├── Profile: Display skills on Settings page (read-only)
    └── Training URLs per skill (clickable links)
```

#### Database Changes

**Migration File:** `database/migrations/20260108_unified_skills.sql`

**Tables:**
| Table | Purpose |
|-------|---------|
| `skill_categories` | Master category list with `show_in_service` flag |
| `skill_classes` | Intermediate grouping (Category → Class → Skill) |
| `global_skills` | Individual skills with `training_urls` JSONB array |
| `employee_skills` | Links employees to skills with proficiency levels |

**New Columns:**
- `skill_categories.show_in_service` BOOLEAN - Hide categories like "Soft Skills" from service ticket UI
- `skill_categories.icon` TEXT - Icon name for service ticket display
- `global_skills.training_urls` JSONB - Array of training resource URLs per skill

**Proficiency Levels:**
- `training` - Currently learning
- `proficient` - Can perform independently
- `expert` - Can train others

**Helper Function:**
```sql
SELECT * FROM get_qualified_technicians('network', 'proficient');
-- Returns technicians qualified for network work at proficient+ level
```

#### Files Modified

| File | Changes |
|------|---------|
| `src/components/Admin/SkillsManager.js` | Added category color picker, show_in_service toggle, training URLs management |
| `src/pages/AdminPage.js` | **Removed** Technology Categories tab entirely (consolidated into SkillsManager) |
| `src/components/Service/NewTicketForm.js` | Now loads categories from `skill_categories` WHERE `show_in_service = true` |
| `src/components/Service/ServiceDashboard.js` | Dynamic categories from `skill_categories` with colors (merged from ServiceTicketList) |
| `src/components/Service/ServiceTicketDetail.js` | Dynamic categories from database |
| `src/components/UserSettings/UserSkillsSection.js` | **NEW** - Displays user's skills on Settings page (read-only) |
| `src/components/SettingsPage.js` | Added UserSkillsSection component |

#### SkillsManager Features

**Category Management:**
- Color picker with preset colors for category branding
- `show_in_service` toggle to hide categories from service ticket UI
- Full CRUD for categories, classes, and skills

**Skill Management:**
- Training URLs field (comma-separated, stored as JSONB array)
- Displayed as clickable external links in employee skill lists
- CSV import with Replace All/Merge/Append modes

**Employee Skills:**
- Assign skills to employees with proficiency level
- Certification tracking with date and certifier
- Notes field for additional context

#### UserSkillsSection Component

**Location:** `src/components/UserSettings/UserSkillsSection.js`

**Features:**
- Read-only display of user's assigned skills
- Skills grouped by category (collapsible)
- Proficiency badges (Training=amber, Proficient=blue, Expert=emerald)
- Training URLs as clickable external links
- Summary badges showing count by proficiency level
- Proficiency level legend at bottom

**Usage:**
```jsx
import UserSkillsSection from '../components/UserSettings/UserSkillsSection';

// In SettingsPage.js, after AISettings section
<UserSkillsSection />
```

#### Service Ticket Integration

**Before:** Service components used hardcoded `DEFAULT_CATEGORIES` array

**After:** Categories loaded dynamically from `skill_categories` table:
```javascript
const { data: categories } = await supabase
  .from('skill_categories')
  .select('*')
  .eq('is_active', true)
  .neq('show_in_service', false)  // Hide Soft Skills etc.
  .order('sort_order');
```

#### Default Categories (Seeded)

| Name | Label | show_in_service | Icon |
|------|-------|-----------------|------|
| network | Network | ✅ | wifi |
| av | Audio/Video | ✅ | tv |
| shades | Shades | ✅ | blinds |
| control | Control Systems | ✅ | settings |
| wiring | Wiring | ✅ | cable |
| installation | Installation | ✅ | build |
| maintenance | Maintenance | ✅ | wrench |
| general | General | ✅ | clipboard |
| soft_skills | Soft Skills | ❌ | users |

#### Running the Migration

**REQUIRED:** Run the SQL migration in Supabase Dashboard → SQL Editor:

1. Open `database/migrations/20260108_unified_skills.sql`
2. Copy entire contents
3. Paste into Supabase SQL Editor
4. Execute

The migration is idempotent (safe to run multiple times) - it uses `CREATE TABLE IF NOT EXISTS` and `DO $$ IF NOT EXISTS $$` patterns.

---

---

## External Portals (Public/Unauthenticated Access)

When building external-facing portals that don't require user authentication (like `PublicIssuePortal`), follow these patterns:

### SharePoint Images & Thumbnails

**Problem**: SharePoint URLs require authentication. External users cannot access them directly.

**Solution**: Route all SharePoint images through server-side proxy endpoints that handle authentication using app-only credentials.

#### Available Endpoints

1. **`/api/sharepoint-thumbnail`** (Preferred for thumbnails)
   - Uses Microsoft Graph API to generate thumbnails
   - Requires: `driveId`, `itemId`, `size` (small/medium/large)
   - More reliable and faster than image-proxy
   - Example: `/api/sharepoint-thumbnail?driveId=xxx&itemId=yyy&size=medium`

2. **`/api/image-proxy`** (Fallback for full images or legacy data)
   - Resolves SharePoint sharing URLs and proxies the actual file
   - Requires: `url` (the SharePoint URL)
   - Works with sharing links (`:i:/g/` format)
   - Example: `/api/image-proxy?url=${encodeURIComponent(sharePointUrl)}`

#### Implementation Pattern

```jsx
// In your component
{photos.map((photo) => {
  // Use Graph API thumbnail if metadata available, otherwise fallback to image proxy
  const thumbnailUrl = photo.sharepointDriveId && photo.sharepointItemId
    ? `/api/sharepoint-thumbnail?driveId=${encodeURIComponent(photo.sharepointDriveId)}&itemId=${encodeURIComponent(photo.sharepointItemId)}&size=medium`
    : `/api/image-proxy?url=${encodeURIComponent(photo.url)}`;

  const fullUrl = `/api/image-proxy?url=${encodeURIComponent(photo.url)}`;

  return (
    <a href={fullUrl} target="_blank">
      <img src={thumbnailUrl} alt={photo.fileName} />
    </a>
  );
})}
```

#### Database Requirements

When fetching photos for external portals, include SharePoint metadata:

```js
// In your API endpoint
const { data } = await supabase
  .from('issue_photos')
  .select('id, url, file_name, sharepoint_drive_id, sharepoint_item_id, ...')
  .eq('issue_id', issueId);

// Include in response payload
base.photos = photos.map((photo) => ({
  id: photo.id,
  url: photo.url,
  fileName: photo.file_name,
  sharepointDriveId: photo.sharepoint_drive_id,  // For thumbnail API
  sharepointItemId: photo.sharepoint_item_id,    // For thumbnail API
  // ...other fields
}));
```

### Token-Based Authentication

External portals use token-based access rather than user sessions:

1. **Portal Token**: Long-lived token in URL identifying the resource
2. **OTP Verification**: 6-digit code sent via email for initial verification
3. **Session Token**: Created after OTP verification, stored in localStorage

See `src/pages/PublicIssuePortal.js` and `api/public-issue.js` for reference implementation.

### Checklist for New External Portals

- [ ] All SharePoint images routed through proxy endpoints
- [ ] SharePoint metadata (driveId, itemId) fetched from database
- [ ] Fallback to image-proxy for legacy data without metadata
- [ ] Token validation on all API endpoints
- [ ] Session management with appropriate expiry
- [ ] CORS headers configured for API endpoints
- [ ] No sensitive data exposed before verification

---

## 2026-01-13

### Weekly Planning UI Improvements

Several fixes to the Weekly Planning calendar and service ticket components.

#### Calendar Block Text Overlap Fix
- **Problem:** Service appointments were appearing twice - as ScheduleBlock (from service_schedules) AND as BlockedTimeBlock (from M365 calendar with `[AWAITING CUSTOMER]` prefix)
- **Solution:** Filter out M365 calendar events that start with service-related prefixes: `[PENDING]`, `[AWAITING CUSTOMER]`, `[TENTATIVE]`, `Service:`
- **File:** `src/pages/WeeklyPlanning.js`

#### Simplified ScheduleBlock Layout
- Redesigned ScheduleBlock with height-based responsive content:
  - Small blocks (<50px): Customer name + commit icon only
  - Medium blocks (50-90px): + time display
  - Large blocks (90px+): + title + full commit button
- Commit icon now shows for ALL draft blocks regardless of size (was hidden for 1-hour blocks)
- **File:** `src/components/Service/WeekCalendarGrid.jsx`

#### Removed Single/All View Toggle
- Removed confusing Single/All buttons from TechnicianFilterBar
- The technician dropdown already handles view selection (All Technicians vs specific tech)
- **File:** `src/components/Service/TechnicianFilterBar.jsx`

#### Technician Change Data Reload
- Fixed issue where changing technicians only loaded partial data
- Now calls `setWeeks([])` immediately when technician changes to force full data reload
- **File:** `src/pages/WeeklyPlanning.js`

### Inline Priority Dropdown in ServiceTicketDetail

- **Before:** Priority could only be changed by entering full "Edit" mode
- **After:** Priority badge is now a clickable dropdown that updates immediately
- Uses custom chevron icon with `appearance: none` for consistent styling
- **File:** `src/components/Service/ServiceTicketDetail.js`

### Fixed Priority Filter Mismatch in UnscheduledTicketsPanel

- **Problem:** Priority filter dropdown used `"normal"` but database uses `"medium"`
- **Solution:** Updated all references from "normal" to "medium":
  - Filter dropdown options
  - `priorityColors` object
  - `priorityOrder` sort mapping
- Added detailed console logging to debug sort operations
- **File:** `src/components/Service/UnscheduledTicketsPanel.jsx`

### Service Ticket Priority Values (Standard)

| Value | Label | Color |
|-------|-------|-------|
| `urgent` | Urgent | Red |
| `high` | High | Orange |
| `medium` | Medium | Blue |
| `low` | Low | Olive/Green |

**Important:** Always use lowercase values (`medium`, not `Normal` or `normal`). The display label can be capitalized but the database value must be lowercase.

### CSV Contact Import - Address Detection & AI Enhancement

Major fixes to prevent addresses from being imported as contact names when importing from QuickBooks or similar sources.

#### Problem
QuickBooks CSV exports have complex field mappings:
- `Customer full name` = Company name (not a person)
- `Full name` = Person's name (often empty)
- `Bill address` / `Ship address` = Multi-line address data

When `Full name` was empty, the system was incorrectly using address data as the contact name, creating entries like "100 S. Main Street" or "Longboat Key FL 34228" as contact names.

#### Solution: Two-Layer Protection

**Layer 1: AI Parsing (Gemini)**
- Updated `api/ai/parse-contacts.js` prompt with explicit address detection rules
- AI now rejects addresses as names and returns empty string
- Falls back to deriving name from email prefix if no valid name found

**Layer 2: Code Validation (Fallback)**
- Added `looksLikeAddress()` function in `src/pages/AdminPage.js`
- Regex patterns detect: street numbers, zip codes, street types (St, Ave, Blvd), state abbreviations
- Addresses are rejected even if AI misses them

#### Address Detection Patterns
```javascript
const looksLikeAddress = (str) => {
  return (
    /^\d+\s/.test(str) ||           // Starts with number "100 Main St"
    /\d{5}/.test(str) ||             // Contains 5-digit zip
    /\b(street|st\.|ave|avenue|drive|dr\.|road|rd\.)\b/i.test(str) ||
    /\b(fl|in|ca|tx|ny|oh)\s+\d{4,5}/i.test(str) ||  // State + zip
    /,\s*(fl|in|ca|tx|usa|united states)\s*$/i.test(str)  // Ends with state
  );
};
```

#### CSV Header Exclusion Rules
Prevents wrong column mappings:
```javascript
const exclusionRules = {
  name: ['address', 'street', 'city', 'state', 'zip', 'postal', 'bill', 'ship'],
  first_name: ['address', 'street', 'city', 'state', 'zip', 'postal', 'bill', 'ship'],
  last_name: ['address', 'street', 'city', 'state', 'zip', 'postal', 'bill', 'ship'],
  company: ['address', 'street', 'city', 'state', 'zip', 'postal'],
};
```

#### Performance Improvements
- **Batch Inserts:** Contacts inserted in chunks of 50 (was one at a time)
- **In-Memory Duplicate Check:** Pre-fetches all existing contacts for fast comparison
- **AI Processing:** Enabled by default to help clean data

#### Files Modified
| File | Changes |
|------|---------|
| `src/pages/AdminPage.js` | Address detection, exclusion rules, batch inserts, in-memory duplicate checking |
| `api/ai/parse-contacts.js` | Updated AI prompt with address detection rules and examples |
| `database/scripts/cleanup_address_as_name_contacts.sql` | SQL script to clean up bad imports |

#### Cleanup SQL (for bad imports)
```sql
-- Preview contacts with address-like names
SELECT id, name, email, phone, created_at
FROM contacts
WHERE
  name ~ '^\d+\s' OR name ~ '\d{5}'
  OR name ~* '\s(st|street|ave|avenue|dr|drive|rd|road|ln|lane|blvd)\b'
  OR name ~* '\s(fl|in|ca|tx|ny|oh|pa|il|ga|nc)\s*$'
ORDER BY created_at DESC;

-- Delete if they look like bad imports
DELETE FROM contacts WHERE created_at > NOW() - INTERVAL '4 hours';
```

### Business Card Scanner - Landscape Mode Fix

Fixed the business card scanner to work properly when phone is rotated to landscape mode.

#### Problem
When rotating phone to landscape for business card scanning:
- Capture button was pushed off-screen
- Bottom navigation bar overlapped the controls
- Camera preview didn't fill the screen properly

#### Solution
- Redesigned to full-screen camera UI with `fixed inset-0`
- Control bar fixed at bottom with proper padding
- Added `pb-24` padding to clear bottom navigation bar
- Large circular capture button always visible

#### File Modified
`src/components/PeopleManagement.js`

---

## 2026-01-13 - UNTESTED PUSH (Antigravity Fixes)

**⚠️ STATUS: UNTESTED - May need rollback**

This push contains 7 fixes from the UNICORN-FIXES-ANTIGRAVITY.md specification. If issues occur, rollback to the commit before this one.

### Task 1: Email System Migration (8 API files)

Migrated all email-sending API endpoints from delegated auth (`_graphMail.js`) to system account (`_systemGraph.js`).

**Changes Made:**
- Import changed from `sendGraphEmail` → `systemSendMail`
- API signature changed from `{to, subject, html}` → `{to, subject, body, bodyType: 'HTML'}`
- Removed `isGraphConfigured()` checks
- Removed delegated token authentication

**Files Modified:**
| File | Status |
|------|--------|
| `api/service-parts-request.js` | ✅ Migrated |
| `api/process-pending-issue-notifications.js` | ✅ Migrated |
| `api/process-pending-shade-notifications.js` | ✅ Migrated |
| `api/cron/process-bugs.js` | ✅ Migrated |

**Rollback:** Revert these files to use `require('./_graphMail')` and `sendGraphEmail({to, subject, html})`.

### Task 2: Project Progress Report Feature

Created new feature to generate and send project progress reports via email.

**Files Created:**
| File | Purpose |
|------|---------|
| `api/project-report/generate.js` | API endpoint - generates HTML report with gauges and issues |
| `src/components/ProjectReportButton.js` | React component with Preview/Send buttons |

**Files Modified:**
| File | Changes |
|------|---------|
| `src/components/PMProjectView.js` | Added import and ProjectReportButton component |

**Rollback:** Delete the two new files and remove the ProjectReportButton from PMProjectView.js.

### Task 3: Wire Drop "Next Incomplete Drop" Button

Added navigation button to jump to next incomplete wire drop after completing prewire stage.

**File Modified:** `src/components/WireDropDetail.js`

**Changes:**
- Added `navigateToNextIncomplete` callback function
- Added "Next Incomplete Drop" button in prewire tab section

**Rollback:** Remove the `navigateToNextIncomplete` function and the button JSX.

### Task 4: Service Photos Query Fix

Fixed broken foreign key join in service photo uploads.

**File Modified:** `src/services/servicePhotoService.js`

**Changes:**
- Changed query from `customer:contacts!service_tickets_customer_id_fkey(full_name)` to direct `customer_name` field
- Added `sanitizeForFolder` helper function
- Updated folder naming to include ticket title: `{ticketNumber}-{ticketTitle}`

**Rollback:** Revert to using the old query pattern (but note: the old query was already broken).

### Task 5: Time Tracking Section Relocation

Moved Time Tracking from a collapsible section to a prominent always-visible position.

**File Modified:** `src/components/Service/ServiceTicketDetail.js`

**Changes:**
- Added new non-collapsible Time Tracking section after description, before Triage
- Removed old collapsible Time Tracking section (was around line 1259-1289)

**Rollback:** Remove the new Time Tracking section and restore the collapsible version.

### Task 6: "My Tickets" Filter Button

Added filter to show only tickets assigned to the current user.

**File Modified:** `src/components/Service/ServiceDashboard.js`

**Changes:**
- Added `useAuth` import
- Added `showMyTickets` state with URL parameter support (`?my=true`)
- Added `assignedTo` filter to query builder
- Added "My Tickets" toggle button between search and filters
- Updated `clearFilters` and `hasActiveFilters` to include `showMyTickets`

**Rollback:** Remove the `showMyTickets` state, the button JSX, and related filter logic.

### Task 7: Service Parts Lookup (Already Implemented)

**No changes made** - This feature was already fully implemented in `ServicePartsManager.js`:
- Search input queries `global_parts` table via `partsService.list({ search })`
- Dropdown shows matching parts
- Auto-fills form when selecting a part
- Links service parts to global parts via `global_part_id`

### Quick Rollback Commands

```bash
# To rollback the entire push:
git revert HEAD

# To see what files changed:
git show --stat HEAD

# To checkout specific files from before:
git checkout HEAD~1 -- path/to/file.js
```

---

## 2026-01-14

### Secure Data Encryption Implementation (Workstream 1)

**Status:** ✅ COMPLETE - Deployed 2026-01-14

Implemented field-level encryption for all sensitive data in `project_secure_data` and `contact_secure_data` tables using **Supabase Vault + pgcrypto**.

**Problem Solved:** Passwords, usernames, URLs, IP addresses, and notes were stored as plaintext in the database. This was a critical security issue.

**Solution:** Server-side encryption using pgcrypto's `pgp_sym_encrypt` with keys stored in Supabase Vault.

#### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Secure Data Encryption Flow                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WRITE (Create/Update):                                         │
│  Browser → HTTPS → Supabase API → RPC Function → encrypt_field()│
│                                        │                         │
│                                        ▼                         │
│                              vault.decrypted_secrets             │
│                              (gets encryption key)               │
│                                        │                         │
│                                        ▼                         │
│                              pgp_sym_encrypt()                   │
│                                        │                         │
│                                        ▼                         │
│                              Base64 encoded blob                 │
│                              stored in *_encrypted column        │
│                                                                  │
│  READ:                                                           │
│  Service → decrypted view → decrypt_field() → plaintext         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Security Model

| Layer | Protection |
|-------|------------|
| **Transit** | HTTPS/TLS encrypts browser ↔ Supabase |
| **At Rest** | pgcrypto encrypts data in database |
| **Key Storage** | Supabase Vault (not accessible via API) |
| **Access Control** | SECURITY DEFINER functions only |

**Who can decrypt:**
- ✅ Unicorn app (via decrypted views)
- ✅ Supabase SQL Editor (dashboard admin)
- ❌ Direct API access (can't access Vault secrets)
- ❌ Database dumps (only see encrypted blobs)
- ❌ Compromised anon key (can't read Vault)

#### Database Schema

**Migration Files:**
- `database/migrations/20260114_encrypt_secure_data_part1_tables.sql` - Tables, extensions, RLS
- `database/migrations/20260114_encrypt_secure_data_part2_encryption.sql` - Encryption implementation
- `database/migrations/20260114_encrypt_secure_data.sql` - Combined (reference only)

**Encrypted Columns (both tables):**
| Column | Type | Purpose |
|--------|------|---------|
| `password_encrypted` | text | Base64-encoded encrypted password |
| `username_encrypted` | text | Base64-encoded encrypted username |
| `url_encrypted` | text | Base64-encoded encrypted URL |
| `ip_address_encrypted` | text | Base64-encoded encrypted IP address |
| `notes_encrypted` | text | Base64-encoded encrypted notes |
| `additional_info_encrypted` | text | Base64-encoded encrypted JSON |

**Vault Secrets:**
| Secret Name | Purpose |
|-------------|---------|
| `project_secure_data_key` | Encryption key for project credentials |
| `contact_secure_data_key` | Encryption key for contact credentials |

**Functions:**
| Function | Purpose |
|----------|---------|
| `encrypt_field(text, text)` | Encrypts plaintext using Vault secret |
| `decrypt_field(text, text)` | Decrypts ciphertext using Vault secret |
| `create_project_secure_data(...)` | RPC for encrypted INSERT |
| `create_contact_secure_data(...)` | RPC for encrypted INSERT |
| `update_project_secure_data(...)` | RPC for encrypted UPDATE |
| `update_contact_secure_data(...)` | RPC for encrypted UPDATE |
| `create_default_secure_entries(uuid)` | Auto-creates Gate/House Code for new contacts |

**Views (auto-decrypt on read):**
| View | Purpose |
|------|---------|
| `project_secure_data_decrypted` | Transparent decryption for project credentials |
| `contact_secure_data_decrypted` | Transparent decryption for contact credentials |

#### Service Layer

**File:** `src/services/equipmentService.js`

**secureDataService:**
```javascript
// READ - Use decrypted views
.from('project_secure_data_decrypted')

// CREATE - Use RPC
supabase.rpc('create_project_secure_data', {
  p_project_id: ...,
  p_name: ...,
  p_password: ...,  // Plaintext - RPC encrypts it
  ...
});

// UPDATE - Use RPC
supabase.rpc('update_project_secure_data', {
  p_id: ...,
  p_password: ...,  // Plaintext - RPC encrypts it
  ...
});
```

**contactSecureDataService:**
- Same pattern with `contact_secure_data_decrypted` view
- Uses `create_contact_secure_data` and `update_contact_secure_data` RPCs

#### Testing Encryption

**Verify raw data is encrypted:**
```sql
SELECT
  name,
  password AS plaintext_col,
  password_encrypted AS encrypted_col,
  CASE WHEN password_encrypted IS NOT NULL THEN 'ENCRYPTED' ELSE 'not encrypted' END as status
FROM project_secure_data
ORDER BY created_at DESC
LIMIT 10;
```

**Expected results:**
- New entries: `plaintext_col = NULL`, `encrypted_col = 'ww0EBwMC...'` (base64 blob)
- Old migrated entries: `plaintext_col = 'actual password'`, `encrypted_col = 'ww0EBwMC...'`

**Verify decryption works:**
```sql
SELECT name, password, username
FROM project_secure_data_decrypted
LIMIT 5;
```

Should show actual plaintext values.

#### Running the Migration

**Step 1:** Run Part 1 (creates tables, extensions, RLS)
```sql
-- Copy contents of: database/migrations/20260114_encrypt_secure_data_part1_tables.sql
-- Execute in Supabase SQL Editor
```

**Step 2:** Run Part 2 (encryption implementation)
```sql
-- Copy contents of: database/migrations/20260114_encrypt_secure_data_part2_encryption.sql
-- Execute in Supabase SQL Editor
```

**Step 3:** Verify
1. Check raw table has encrypted blobs
2. Check decrypted view returns plaintext
3. Test create/update in app UI

#### Plaintext Column Cleanup

**DO NOT RUN until 1 week after successful migration:**

```sql
-- Only run after full verification!
ALTER TABLE project_secure_data
DROP COLUMN IF EXISTS password,
DROP COLUMN IF EXISTS username,
DROP COLUMN IF EXISTS url,
DROP COLUMN IF EXISTS ip_address,
DROP COLUMN IF EXISTS notes,
DROP COLUMN IF EXISTS additional_info;

ALTER TABLE contact_secure_data
DROP COLUMN IF EXISTS password,
DROP COLUMN IF EXISTS username,
DROP COLUMN IF EXISTS url,
DROP COLUMN IF EXISTS ip_address,
DROP COLUMN IF EXISTS notes,
DROP COLUMN IF EXISTS additional_info;
```

#### Rollback Plan

Plaintext columns remain until cleanup. To rollback:

1. **Service layer:** Change `project_secure_data_decrypted` → `project_secure_data` in queries
2. **Remove RPC calls:** Replace with direct INSERT/UPDATE

#### Files Modified

| File | Changes |
|------|---------|
| `database/migrations/20260114_encrypt_secure_data_part1_tables.sql` | **NEW** - Tables and extensions |
| `database/migrations/20260114_encrypt_secure_data_part2_encryption.sql` | **NEW** - Encryption implementation |
| `database/migrations/20260114_encrypt_secure_data.sql` | **NEW** - Combined reference |
| `src/services/equipmentService.js` | Use decrypted views and RPC functions |

---

## 2026-01-18

### Home Assistant UniFi Integration - Infrastructure Devices

**Status:** ✅ COMPLETE - Full infrastructure device visibility working

**Goal:** Display UniFi infrastructure devices (switches, APs, gateways) in Home Assistant via the Unicorn app - not just network clients.

#### Problem Statement

The existing UniFi integration only tracked network clients (devices connected to the network). Steve wanted to also see the actual UniFi infrastructure:
- **Switches** (USW 16 PoE, etc.) - with port details and PoE power data
- **Access Points** (UAP XG, etc.) - with connected station counts
- **Gateways** (Dream Machine Pro/UDMPRO) - with CPU, memory, uptime

#### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    UniFi Integration Data Flow                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Python Script (on Home Assistant):                                       │
│     /config/python_scripts/unifi_client_collector.py                        │
│           │                                                                  │
│           ├── Authenticates to UniFi OS controller (https://192.168.1.1)    │
│           ├── GET /proxy/network/api/s/{site}/stat/sta (clients)            │
│           ├── GET /proxy/network/api/s/{site}/stat/device (infrastructure)  │
│           └── Outputs JSON to stdout                                         │
│                                                                              │
│  2. Shell Command (runs every 60 seconds via automation):                    │
│     shell_command.unifi_fetch_clients                                       │
│           │                                                                  │
│           └── Redirects stdout to /config/unifi_status.json                  │
│                                                                              │
│  3. Command Line Sensor (reads JSON file every 60 seconds):                  │
│     sensor.unifi_connection_status                                          │
│           │                                                                  │
│           └── Exposes attributes: clients[], devices[], counts              │
│                                                                              │
│  4. Unicorn App API:                                                         │
│     GET /api/ha/network-clients?project_id=xxx                              │
│           │                                                                  │
│           └── Fetches sensor state from HA API → Returns to frontend        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Files on Home Assistant

| File | Purpose |
|------|---------|
| `/config/python_scripts/unifi_client_collector.py` | Main collector script |
| `/config/unifi_status.json` | JSON output file (sensor reads this) |
| `/config/configuration.yaml` | Contains shell_command and command_line sensor |

#### Configuration in Home Assistant

**Input Text Helpers (via HA UI):**
- `input_text.unifi_controller_url` = `https://192.168.1.1`
- `input_text.unifi_username` = `Unicorn1`
- `input_text.unifi_password` = `Unicorn1one!`
- `input_text.unifi_site` = `default`

**Shell Command (configuration.yaml):**
```yaml
shell_command:
  unifi_fetch_clients: 'python3 /config/python_scripts/unifi_client_collector.py "{{ states(''input_text.unifi_controller_url'') }}" "{{ states(''input_text.unifi_username'') }}" "{{ states(''input_text.unifi_password'') }}" "{{ states(''input_text.unifi_site'') }}" > /config/unifi_status.json '
```

**Command Line Sensor (configuration.yaml):**
```yaml
command_line:
  - sensor:
      name: "UniFi Connection Status"
      unique_id: unifi_connection_status
      command: "cat /config/unifi_status.json"
      value_template: "{{ value_json.status | default('unknown') }}"
      json_attributes:
        - status
        - message
        - timestamp
        - client_count
        - clients
        - device_count
        - devices
        - switch_count
        - ap_count
        - gateway_count
      scan_interval: 60
```

#### Python Script Output Schema

```json
{
  "status": "connected",
  "message": "Successfully fetched 5 clients and 3 devices",
  "timestamp": "2026-01-18T16:09:03.485296",
  "client_count": 5,
  "clients": [
    {
      "mac": "48:a6:b8:d8:5c:e0",
      "hostname": "SonosZP",
      "ip": "192.168.1.82",
      "is_wired": false,
      "network": "Default",
      "vlan": 1,
      "connection_type": "Wireless",
      "ssid": "Zshop",
      "signal": -45,
      "switch_mac": "N/A",
      "switch_name": "N/A",
      "switch_port": "N/A",
      "uptime": 347202
    }
  ],
  "device_count": 3,
  "devices": [
    {
      "mac": "74:83:c2:f8:01:20",
      "name": "UAP XG",
      "model": "UCXG",
      "type": "uap",
      "category": "access_point",
      "ip": "192.168.1.96",
      "state": 1,
      "adopted": true,
      "uptime": 347262,
      "version": "6.7.35.15586",
      "num_sta": 2,
      "cpu": "2.1",
      "mem": "43.9"
    },
    {
      "mac": "24:5a:4c:ab:6c:fa",
      "name": "USW 16 PoE",
      "model": "USL16P",
      "type": "usw",
      "category": "switch",
      "ip": "192.168.1.235",
      "state": 1,
      "adopted": true,
      "uptime": 347284,
      "version": "7.2.123.16565",
      "ports_total": 18,
      "ports_used": 5,
      "port_table": [
        {
          "port_idx": 1,
          "name": "Port 1",
          "up": true,
          "speed": 1000,
          "poe_enable": true,
          "poe_power": "4.18",
          "is_uplink": false
        }
      ]
    },
    {
      "mac": "74:ac:b9:3b:59:57",
      "name": "Zionsville Shop",
      "model": "UDMPRO",
      "type": "udm",
      "category": "gateway",
      "ip": "104.137.214.72",
      "state": 1,
      "adopted": true,
      "uptime": 347311,
      "version": "4.4.6.27560",
      "ports_total": 11,
      "cpu": "13.6",
      "mem": "36.3"
    }
  ],
  "switch_count": 1,
  "ap_count": 1,
  "gateway_count": 1
}
```

#### Bugs Fixed

**Bug 1: INFO Log Line Breaking JSON Parse**

**Problem:** The JSON file started with an INFO log line instead of `{`, causing parse errors:
```
INFO:__main__:Successfully authenticated with UniFi OS controller
{"status": "connected", ...}
```

**Root Cause:** Shell command used `2>&1` which redirected stderr (containing the INFO log) to the output file along with stdout.

**Fix:** Removed `2>&1` from the shell_command in configuration.yaml:
```yaml
# Before (broken):
unifi_fetch_clients: '... > /config/unifi_status.json 2>&1'

# After (fixed):
unifi_fetch_clients: '... > /config/unifi_status.json '
```

**Bug 2: Authentication Failed**

**Problem:** Sensor showed "Authentication failed" error.

**Root Cause:** Input text helpers had incorrect values (old credentials).

**Fix:** Updated credentials via Home Assistant Helpers UI:
- Username: `Unicorn1`
- Password: `Unicorn1one!`
- URL: `https://192.168.1.1` (must include https:// prefix)

#### Unicorn App Files

| File | Purpose |
|------|---------|
| `api/ha/network-clients.js` | API endpoint to fetch clients from HA sensor |
| `api/ha/sync-clients.js` | API endpoint to sync clients to Supabase |
| `src/components/HomeAssistantSettings.js` | UI component showing network clients |
| `ha-unifi-integration/scripts/unifi_clients.py` | Reference Python script (repo copy) |
| `ha-unifi-integration/configuration_additions.yaml` | Reference HA configuration |

#### API Endpoint: GET /api/ha/network-clients

**Request:**
```
GET /api/ha/network-clients?project_id=32e2fa08-3551-4749-b749-7478aa4781ce
```

**Response:**
```json
{
  "success": true,
  "summary": {
    "total": 5,
    "wired": 2,
    "wireless": 3
  },
  "clients": [
    {
      "mac_address": "78:55:36:00:85:c7",
      "ip_address": "192.168.1.149",
      "hostname": "homeassistant",
      "name": "homeassistant",
      "is_wired": true,
      "is_wireless": false,
      "connection_type": "wired",
      "switch_name": "USW 16 PoE",
      "switch_port": 15,
      "ssid": null,
      "uptime_seconds": 268552,
      "uptime_formatted": "3d 2h",
      "is_connected": true
    }
  ],
  "source": "sensor.unifi_connection_status"
}
```

#### Frontend UI (HomeAssistantSettings.js)

The Network Clients section shows:
- Filter buttons: All / Wired / Wireless
- Client cards with:
  - Device icon (cable for wired, wifi for wireless)
  - Hostname and MAC address
  - IP address
  - For wired: Switch name and port number
  - For wireless: SSID, AP name, signal strength
  - Uptime badge

#### Infrastructure Devices Available

**After this implementation, the sensor exposes:**

1. **UAP XG** (Access Point)
   - Model: UCXG
   - IP: 192.168.1.96
   - Connected stations: 2
   - CPU/Memory usage

2. **USW 16 PoE** (Switch)
   - Model: USL16P
   - IP: 192.168.1.235
   - 18 total ports, 5 in use
   - Full port table with PoE power data

3. **Zionsville Shop** (Dream Machine Pro)
   - Model: UDMPRO
   - WAN IP: 104.137.214.72
   - 11 ports
   - CPU: 13.6%, Memory: 36.3%

#### Testing Commands (via HA SSH)

```bash
# Run Python script manually
python3 /config/python_scripts/unifi_client_collector.py https://192.168.1.1 Unicorn1 'Unicorn1one!' default > /config/unifi_status.json

# Verify JSON is valid
jq '.status, .device_count, (.devices[] | .name)' /config/unifi_status.json

# Check first character (should be '{')
head -1 /config/unifi_status.json | cut -c1-50

# Force sensor update
ha core restart
```

#### Key Learnings

1. **Python logging to stderr:** Use `logging.basicConfig(stream=sys.stderr)` to keep logs separate from JSON output
2. **Shell command redirection:** Don't use `2>&1` if you only want stdout in the output file
3. **UniFi API endpoints:**
   - Clients: `/proxy/network/api/s/{site}/stat/sta`
   - Devices: `/proxy/network/api/s/{site}/stat/device`
4. **URL format:** UniFi controller URL must include `https://` prefix

---

### Equipment Network Linking (Wire Drop Integration)

**Status:** ✅ COMPLETE

Connected the UniFi network client data to project equipment in the Wire Drop detail view.

#### User Flow

1. Technician opens Wire Drop for a device (e.g., Apple TV)
2. In the "Linked Equipment" section, clicks **"Connect Network"** button
3. `HANetworkClientSelector` component loads live network clients from HA
4. Technician selects the matching network client from the list
5. System associates MAC address with the equipment
6. **Auto-populated data:**
   - IP Address
   - MAC Address
   - Hostname
   - Switch Name (for wired)
   - Switch Port (for wired)
   - SSID (for wireless)
   - AP Name (for wireless)
7. Connection is persistent but can be changed/cleared anytime

#### Component: HANetworkClientSelector.jsx

**Location:** `src/components/HANetworkClientSelector.jsx`

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `equipment` | object | Full equipment object (optional, loads from ID if not provided) |
| `equipmentId` | UUID | Equipment ID to link |
| `projectId` | UUID | Project ID (required for HA API call) |
| `onClientLinked` | function | Callback when client is linked/unlinked |
| `palette` | object | Theme palette colors |
| `mode` | string | 'light' or 'dark' |

**Features:**
- Fetches live network clients from `/api/ha/network-clients`
- Filter by connection type (All/Wired/Wireless)
- Search by name, MAC, or IP
- Auto-match by existing MAC address
- Shows full connection details before selection
- Persists to `project_equipment` table

#### Database Fields Updated

**Table:** `project_equipment`

| Field | Type | Description |
|-------|------|-------------|
| `unifi_client_mac` | text | MAC address of connected device |
| `unifi_last_ip` | text | Last known IP address |
| `unifi_last_seen` | timestamptz | When connection was last verified |
| `unifi_data` | jsonb | Full connection details (see below) |
| `ha_client_mac` | text | HA-specific MAC tracking |

**`unifi_data` JSON structure:**
```json
{
  "hostname": "AppleTV-Living-Room",
  "is_wired": true,
  "connection_type": "wired",
  "switch_name": "USW 16 PoE",
  "switch_port": 15,
  "switch_mac": "24:5a:4c:ab:6c:fa",
  "ssid": null,
  "ap_name": null,
  "ap_mac": null,
  "wifi_signal": null,
  "uptime_seconds": 347202,
  "uptime_formatted": "4d 0h",
  "synced_from": "home_assistant",
  "synced_at": "2026-01-18T16:30:00Z"
}
```

#### Wire Drop Display

**In WireDropDetail.js:**

The "Network Connection" section now displays:
- IP Address
- MAC Address
- Hostname (if available)
- **For wired:** Switch name + Port badge
- **For wireless:** SSID + AP name

#### Files Modified

| File | Changes |
|------|---------|
| `src/components/HANetworkClientSelector.jsx` | **NEW** - Main selector component |
| `src/components/WireDropDetail.js` | Added import, replaced UniFiClientSelector, enhanced display |
| `api/ha/network-clients.js` | Fixed field mapping (sw_name → switch_name) |

### Localhost API Fix

**Problem:** Local development (`localhost:3001`) was showing JSON parse errors when trying to load network clients because Vercel serverless functions don't exist locally.

**Error:** `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`

**Solution:** Added localhost detection to use Vercel production URL for API calls in development:

```javascript
// Use Vercel production URL for API calls in development
const apiBase = window.location.hostname === 'localhost'
  ? 'https://unicorn-one.vercel.app'
  : '';
const response = await fetch(`${apiBase}/api/ha/network-clients?project_id=${projectId}`);
```

**Files Updated:**
| File | Change |
|------|--------|
| `src/components/HANetworkClientSelector.jsx` | Added localhost detection for API calls |
| `src/components/HomeAssistantSettings.js` | Added localhost detection for Network Clients section |

---

### Rack Layout Equipment Modal Enhancements

**Goal:** Improve the equipment editing experience in the rack layout page for non-rack-mountable equipment (like amps) and allow moving equipment between rooms.

#### New Features

1. **Needs Shelf Space Option** (Blue section)
   - Checkbox: "This equipment needs a shelf"
   - Shelf space selector: 1U, 2U, 3U, 4U buttons
   - "Save Shelf Requirement" button
   - Perfect for amps, receivers, and other non-rack-mountable devices

2. **Move to Different Room Option** (Amber section)
   - Shows current location (e.g., "Currently: Head End (no room assigned)")
   - Room dropdown selector (loads rooms dynamically from `project_rooms`)
   - "Move Equipment" button
   - Moves equipment from head-end to a specific room

#### Visual Changes

Equipment cards in the DROP ZONE now show:
- **Shelf items:** Blue border, Layers icon, "XU shelf" badge (e.g., "2U shelf")
- **Rack-mountable items:** Standard gray border, Server icon, "XU" badge
- **Unset items:** Yellow dashed border, "?U" badge

#### Database Changes

**New columns in `project_equipment`:**
```sql
ALTER TABLE project_equipment
ADD COLUMN IF NOT EXISTS needs_shelf BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS shelf_u_height INTEGER DEFAULT NULL;
```

**Migration:** `supabase/migrations/20260118_add_shelf_requirement_to_equipment.sql`

#### Files Modified

| File | Change |
|------|--------|
| `src/components/Rack/RackFrontView.jsx` | Enhanced EquipmentEditModal with shelf/room options, updated UnplacedEquipmentCard |
| `src/pages/RackLayoutPage.js` | Added `handleMoveRoom` callback, enhanced `handleEquipmentEdit` for shelf fields |
| `src/services/projectEquipmentService.js` | Added `needs_shelf` and `shelf_u_height` to updateEquipment |

#### User Flow

1. Technician opens Rack Layout page
2. Scrolls to DROP ZONE with unplaced equipment
3. Clicks gear icon on equipment (e.g., Sonos amp)
4. Modal shows options:
   - **Set U-Height:** For rack-mountable equipment
   - **Needs Shelf Space:** Check box, select shelf U needed
   - **Move to Different Room:** Select room from dropdown
   - **Exclude from Rack Layout:** For non-rack items (cables, accessories)
5. Saves and equipment card updates with appropriate badge/icon

---

### Back View Network Client Linking Fix

**Problem:** The "Link to Network" dropdown in the Rack Layout Back View wasn't working - clicking the button opened the dropdown but no network clients were displayed.

**Root Causes:**
1. `RackLayoutPage.js` wasn't fetching or passing `haClients` data to `RackBackView`
2. Equipment card containers had `overflow-hidden` CSS which clipped the dropdown

**Solution:**

#### RackLayoutPage.js Changes

1. Added `haClients` state:
```javascript
const [haClients, setHaClients] = useState([]);
```

2. Added `fetchHAClients()` function that fetches from `/api/ha/network-clients`:
```javascript
const fetchHAClients = useCallback(async () => {
  if (!projectId) return;

  try {
    const apiBase = window.location.hostname === 'localhost'
      ? 'https://unicorn-one.vercel.app'
      : '';
    const response = await fetch(`${apiBase}/api/ha/network-clients?project_id=${projectId}`);
    const result = await response.json();

    if (response.ok && result.clients) {
      const clients = result.clients.map(c => ({
        mac: c.mac_address,
        hostname: c.hostname || c.name,
        ip: c.ip_address,
        is_online: true,
        is_wired: c.is_wired,
        switch_name: c.switch_name,
        switch_port: c.switch_port
      }));
      setHaClients(clients);
    }
  } catch (err) {
    console.error('Failed to fetch HA network clients:', err);
  }
}, [projectId]);
```

3. Added `useEffect` to fetch when switching to Back View:
```javascript
useEffect(() => {
  if (activeView === 'back') {
    fetchHAClients();
  }
}, [activeView, fetchHAClients]);
```

4. Added `handleLinkToHA` callback:
```javascript
const handleLinkToHA = useCallback(async (equipmentId, clientMac) => {
  try {
    await projectEquipmentService.updateEquipment(equipmentId, {
      ha_client_mac: clientMac,
      unifi_client_mac: clientMac
    });
    await loadData();
  } catch (err) {
    console.error('Failed to link equipment to HA client:', err);
  }
}, [loadData]);
```

5. Passed props to RackBackView:
```jsx
<RackBackView
  rack={currentRack}
  equipment={placedEquipment}
  haClients={haClients}
  onLinkToHA={handleLinkToHA}
  onRefresh={handleRefresh}
/>
```

#### RackBackView.jsx Changes

Removed `overflow-hidden` from containers to allow dropdown to display:

```diff
- <div className="border ... overflow-hidden">
+ <div className="border ...">

- <div className="bg-zinc-50 ... overflow-hidden">
+ <div className="bg-zinc-50 ...">
```

#### Files Modified

| File | Change |
|------|--------|
| `src/pages/RackLayoutPage.js` | Added haClients state, fetch function, link handler, passed props |
| `src/components/Rack/RackBackView.jsx` | Removed overflow-hidden from equipment card and main container |

---

### Rack Layout Equipment Display Name Fix

**Problem:** Equipment in the rack layout view was showing the full instance name (e.g., "Network & Structured Wiring - U7-Pro 1") which was too long and got truncated, making it impossible to identify the actual part.

**Solution:** Updated display name logic to show model + instance number (e.g., "U7-Pro 1", "16/2OFC-BK 3").

#### Display Name Priority
1. `equipment.model` + instance number extracted from full name
2. `equipment.global_part.name` if linked
3. Part name extracted from instance name (after " - ")
4. `equipment.part_number` as fallback

#### Files Modified

| File | Change |
|------|--------|
| `src/components/Rack/RackFrontView.jsx` | Added `getEquipmentDisplayName()` helper function |
| `src/components/Rack/RackBackView.jsx` | Updated `getEquipmentName()` with same logic |

---

### Rack Layout Global Part Exclusion

**Goal:** Allow excluding entire part types from rack layout views (e.g., cables, connectors, small accessories that don't belong in a rack).

#### New Features

1. **"Hide This Item"** button - Excludes only the specific equipment instance
2. **"Never Show This Part Type"** button - Excludes ALL equipment with the same part number globally

#### How Global Exclusion Works

When user clicks "Never Show This Part Type":
1. Updates `global_parts.exclude_from_rack = true` if equipment has a linked global part
2. Updates ALL `project_equipment` records with the same `part_number` in the project
3. Falls back to matching by `model` if no part_number exists

#### Filtering Logic

Equipment is excluded from rack layout if:
- `equipment.exclude_from_rack = true` (individual exclusion), OR
- `equipment.global_part.exclude_from_rack = true` (global part exclusion)

#### Database Changes

**New column in `global_parts`:**
```sql
ALTER TABLE global_parts
ADD COLUMN IF NOT EXISTS exclude_from_rack BOOLEAN DEFAULT FALSE;
```

**Migration:** `supabase/migrations/20260119_add_exclude_from_rack_to_global_parts.sql`

#### Files Modified

| File | Change |
|------|--------|
| `src/components/Rack/RackFrontView.jsx` | Added `onExcludeGlobal` prop, two separate exclude buttons in modal |
| `src/pages/RackLayoutPage.js` | Added `handleEquipmentExcludeGlobal` handler, updated filtering logic |
| `src/services/projectEquipmentService.js` | Added `exclude_from_rack` to global_part fetch query |

#### User Flow

1. Open Rack Layout page
2. Click on any equipment in the unplaced list
3. In the modal, choose:
   - **"Hide This Item"** - Just hides this one item
   - **"Never Show This Part Type"** - Hides all items with same part number (e.g., all cables)
4. Page refreshes and excluded items disappear from the list

---

### Power Distribution Tracking for Rack Equipment

**Goal:** Track power distribution devices (UPS, PDU, surge protectors) in racks, including outlets provided, power capacity, and battery backup specs.

#### New Global Part Fields

| Field | Type | Description |
|-------|------|-------------|
| `is_power_device` | BOOLEAN | True if device provides power to other equipment |
| `power_outlets_provided` | INTEGER | Number of outlets the device provides |
| `power_output_watts` | INTEGER | Maximum power output capacity in watts |
| `ups_va_rating` | INTEGER | VA rating for UPS devices |
| `ups_runtime_minutes` | INTEGER | Estimated battery runtime in minutes |

#### Existing Fields Clarified

- `power_watts` - Power the device CONSUMES
- `power_outlets` - Outlets the device REQUIRES (renamed conceptually to "outlets required")

#### Power Summary in Rack View

The rack back view header now shows:
- **Power consumption vs capacity** (e.g., "450W / 1500W")
- **Outlets used vs available** (e.g., "12 / 24 outlets")
- Power devices highlighted with amber styling

#### UI in Equipment Modal

New "Power Settings" section with:
- Checkbox: "This is a power distribution device"
- Power draw (W) input
- Outlets needed selector (1-4)
- "Save Power Settings to Parts Database" button

For power devices, additional fields appear:
- Outlets provided
- Power output (W)
- UPS VA rating
- UPS runtime (minutes)

#### Database Migration

**Migration:** `supabase/migrations/20260119_add_power_distribution_fields.sql`

```sql
ALTER TABLE global_parts
ADD COLUMN IF NOT EXISTS is_power_device BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS power_outlets_provided INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS power_output_watts INTEGER,
ADD COLUMN IF NOT EXISTS ups_va_rating INTEGER,
ADD COLUMN IF NOT EXISTS ups_runtime_minutes INTEGER;
```

#### Files Modified

| File | Change |
|------|--------|
| `src/components/Rack/RackFrontView.jsx` | Added Power Settings section in equipment modal |
| `src/components/Rack/RackBackView.jsx` | Added power totals calculation, power summary in header |
| `src/pages/RackLayoutPage.js` | Added `handleSavePowerSettings` to save to global_parts |
| `src/services/projectEquipmentService.js` | Added power fields to global_part fetch query |

---

### CSV Import Fixes

#### Problem 1: 409 Conflict Error on Re-import

**Issue:** Uploading a CSV after equipment already existed caused a 409 Conflict error due to foreign key constraint on `purchase_order_items`.

**Solution:** Before deleting equipment during CSV import, first delete associated purchase order items.

#### Problem 2: Inventory Not Returned on Delete

**Issue:** When equipment linked to internal inventory was deleted, the inventory quantity wasn't returned.

**Solution:** Added logic to call `increment_global_inventory` RPC to return inventory when deleting equipment that came from internal inventory.

```javascript
// Check if PO item came from internal inventory
if (isInternalInventory && globalPartId && quantity > 0) {
  await supabase.rpc('increment_global_inventory', {
    p_global_part_id: globalPartId,
    p_quantity: quantity
  });
}
```

#### Problem 3: Statement Timeout on Large Imports

**Issue:** Large CSV imports caused statement timeout errors (57014).

**Solution:** Added batching for equipment inserts (100 records at a time).

```javascript
const BATCH_SIZE = 100;
for (let i = 0; i < equipmentRecords.length; i += BATCH_SIZE) {
  const batch = equipmentRecords.slice(i, i + BATCH_SIZE);
  const { data: inserted } = await supabase
    .from('project_equipment')
    .insert(batch)
    .select();
  insertedEquipment.push(...(inserted || []));
}
```

#### Files Modified

| File | Change |
|------|--------|
| `src/services/projectEquipmentService.js` | Added PO item deletion, inventory return, batched inserts |

---

### Max Items Per Shelf

**Goal:** Allow specifying how many devices can display side-by-side on a shelf in the rack layout.

#### Database Change

```sql
ALTER TABLE project_equipment
ADD COLUMN IF NOT EXISTS max_items_per_shelf INTEGER DEFAULT 1;
```

**Migration:** `supabase/migrations/20260119_add_max_items_per_shelf.sql`

#### UI Addition

In the equipment modal's "Shelf Space" section, added a selector for "Items per shelf" (1-4) to specify how many devices can fit side-by-side.

#### Files Modified

| File | Change |
|------|--------|
| `src/components/Rack/RackFrontView.jsx` | Added max_items_per_shelf state and selector in modal |
| `src/services/projectEquipmentService.js` | Added field to updateEquipment |

---

### Shelf Properties Saved to Global Parts (January 19, 2026)

**Goal:** Save shelf properties (`needs_shelf`, `shelf_u_height`, `max_items_per_shelf`) to `global_parts` as equipment preferences/defaults, so all future instances of that part type inherit the shelf settings.

#### Database Change

```sql
ALTER TABLE global_parts
ADD COLUMN IF NOT EXISTS needs_shelf BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS shelf_u_height INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS max_items_per_shelf INTEGER DEFAULT 1;
```

**Migration:** `supabase/migrations/20260119_add_shelf_properties_to_global_parts.sql`

#### Implementation

When user saves shelf settings in the equipment modal:
1. Saves to `project_equipment` for the individual item
2. Also saves to `global_parts` as defaults for future instances of that part type

#### Files Modified

| File | Change |
|------|--------|
| `src/pages/RackLayoutPage.js` | Updated `handleEquipmentEdit` to save shelf settings to global_parts |

---

### Add Shelf Feature (January 19, 2026)

**Goal:** Allow adding shelves to rack layouts via the "+ Shelf" button.

#### Implementation

1. Added shelf modal with height and position selectors
2. Implemented `handleAddShelf` callback in RackLayoutPage
3. Added `ShelfBlock` component to render shelves visually in the rack
4. Added `positionedShelves` useMemo to calculate shelf positions

#### UI Flow

1. Click "+ Shelf" button in rack header
2. Select shelf height (1-4U)
3. Enter starting position (U number from bottom)
4. Click "Add Shelf"
5. Shelf appears in rack view with blue styling

#### Files Modified

| File | Change |
|------|--------|
| `src/components/Rack/RackFrontView.jsx` | Added shelf modal, ShelfBlock component, shelf rendering |
| `src/pages/RackLayoutPage.js` | Implemented `handleAddShelf` callback |

---

### UDM Pro LAN IP Fix (January 19, 2026)

**Goal:** Fix UDM Pro (gateway devices) showing WAN address instead of LAN address in rack layout views.

#### Problem

The UniFi API returns `device.ip` for gateways, which can be the WAN IP depending on firmware. This caused the UDM Pro to display its public WAN IP instead of the local management IP.

#### Solution

Updated the Python UniFi collector script to intelligently detect the LAN IP for gateway devices:

1. Check `network_table` for LAN network with `ip_subnet`
2. Fall back to `config_network.ip` if available
3. Fall back to `connect_request_ip` if it's a private IP address (192.168.x.x, 10.x.x.x, 172.x.x.x)

#### Files Modified

| File | Change |
|------|--------|
| `ha-unifi-integration/scripts/unifi_clients.py` | Updated `format_device()` to prefer LAN IP for gateways |

---

### Draggable Shelves with Grouped Equipment (January 19, 2026)

**Goal:** Make shelves in the rack layout draggable, with all equipment on the shelf moving together as a group.

#### New Features

1. **Draggable shelves** - Grab the shelf header to drag the entire shelf (with contents) to a new position
2. **Equipment grouping** - Equipment placed on a shelf is grouped and displayed side-by-side
3. **Drop equipment on shelves** - Drag equipment from the unplaced list directly onto a shelf
4. **Delete shelves** - X button removes shelf (equipment becomes unplaced)
5. **Visual feedback** - Shelf turns green when dragging equipment over it

#### Shelf Equipment Display

Equipment on shelves is displayed side-by-side based on `max_items_per_shelf`:
- If `max_items_per_shelf = 4`, each item takes 25% width
- If more items than max, shows "+N more" indicator
- Click on shelf equipment to open edit modal

#### Drag & Drop Behavior

| Action | Result |
|--------|--------|
| Drag shelf | Move shelf and all equipment on it to new U position |
| Drag equipment to shelf | Place equipment on shelf (links via `shelf_id`) |
| Drag equipment to rack | Place directly in rack (not on shelf) |
| Delete shelf | Unplace all equipment on it, then delete shelf |

#### Database Model

Equipment on shelves has:
- `shelf_id` - Links to `project_rack_shelves.id`
- `rack_id` - Same as shelf's rack
- `rack_position_u` - Same as shelf's position

When shelf moves, only shelf position updates (equipment stays linked).

#### Files Modified

| File | Change |
|------|--------|
| `src/components/Rack/RackFrontView.jsx` | Added ShelfBlock with drag/drop, ShelfEquipmentItem, equipment grouping |
| `src/pages/RackLayoutPage.js` | Added handleShelfMove, handleShelfDelete, handleEquipmentDropOnShelf |

---

### Shelf Move UI Update Fix (January 19, 2026)

**Problem:** When dragging a shelf to a new position, the database was updated successfully but the UI didn't reflect the change (shelf snapped back to original position).

**Root Cause:** The `loadData` function was fetching fresh rack data from the database but `selectedRack` state still held the OLD stale data. This caused the UI to render with outdated shelf positions.

**Technical Details:**

```javascript
// BEFORE (buggy):
const loadData = useCallback(async () => {
  const racksData = await rackService.getProjectRacks(projectId);
  setRacks(racksData);
  
  // Only set selectedRack if null - stale data!
  if (racksData?.length > 0 && !selectedRack) {
    setSelectedRack(racksData[0]);
  }
}, [projectId, selectedRack]); // selectedRack in deps caused infinite loop

// AFTER (fixed):
const loadData = useCallback(async () => {
  const racksData = await rackService.getProjectRacks(projectId);
  setRacks(racksData);
  
  // Use functional update to get fresh data without dep cycle
  if (racksData?.length > 0) {
    setSelectedRack(prevSelected => {
      if (prevSelected) {
        const updatedRack = racksData.find(r => r.id === prevSelected.id);
        return updatedRack || racksData[0];
      }
      return racksData[0];
    });
  }
}, [projectId]); // No selectedRack dep - avoids infinite loop
```

**Key Insight:** Using `setSelectedRack(prevSelected => ...)` (functional update) allows accessing the previous state value without including it in the dependency array, avoiding the circular dependency that caused infinite re-renders.

#### Files Modified

| File | Change |
|------|--------|
| `src/pages/RackLayoutPage.js` | Fixed `loadData` to sync `selectedRack` with fresh data using functional update |

---

### Global Parts Rack Layout Preferences (January 19, 2026)

**Problem:** Rack layout preferences (needs_shelf, shelf_u_height, max_items_per_shelf, etc.) were not saving to global_parts records.

**Root Causes:**
1. Direct `.update()` calls on `global_parts` table were blocked by RLS
2. Part Detail page (tab 3) had no UI for rack layout fields
3. The `update_global_part` RPC function was missing rack layout parameters

**Solution:**

1. **Added Rack Layout UI to PartDetailPage.js:**
   - Rack-mountable checkbox with U-height selector (1-4U)
   - Needs shelf checkbox with shelf_u_height and max_items_per_shelf options
   - Exclude from rack checkbox

2. **Updated partsService.js:**
   - Added boolean handling for is_rack_mountable, needs_shelf, exclude_from_rack
   - Added rack layout fields to RPC params (p_u_height, p_is_rack_mountable, etc.)

3. **Updated RackLayoutPage.js:**
   - Changed direct `.update()` calls to use `update_global_part` RPC function
   - This bypasses RLS restrictions

4. **SQL Migration:**
   - `20260119_update_global_part_rpc_rack_layout.sql` - Updated RPC function with rack layout parameters

#### Files Modified

| File | Change |
|------|--------|
| `src/components/PartDetailPage.js` | Added Rack Layout UI section |
| `src/services/partsService.js` | Added rack layout fields to RPC params |
| `src/pages/RackLayoutPage.js` | Use RPC instead of direct update for global_parts |
| `supabase/migrations/20260119_update_global_part_rpc_rack_layout.sql` | New migration for RPC |

---

### Auto-Create Shelf for Shelf Equipment (January 19, 2026)

**Goal:** When dragging equipment that needs shelf space (e.g., Sonos Amp) into the rack, automatically create a shelf for it.

**Implementation:**

1. `UnplacedEquipmentCard` drag data now includes:
   - `needsShelf` - boolean from equipment or global_part
   - `shelfUHeight` - shelf height from equipment or global_part
   - `maxItemsPerShelf` - items per shelf from equipment or global_part

2. `handleRackDrop` checks if dropped equipment needs a shelf:
   - If `data.needsShelf && onAddShelf`, create shelf at drop position
   - Then add equipment to the newly created shelf

3. `handleAddShelf` returns the created shelf so drop handler can use its ID

#### Files Modified

| File | Change |
|------|--------|
| `src/components/Rack/RackFrontView.jsx` | Pass shelf data in drag, auto-create shelf on drop |
| `src/pages/RackLayoutPage.js` | Return shelf from handleAddShelf |

---

### Blue Badge for Shelf Equipment (January 19, 2026)

**Goal:** Visually distinguish equipment that needs shelf space from rack-mountable equipment.

**Implementation:**

- Rack-mountable equipment: Amber/yellow badge (existing)
- Shelf equipment: Blue badge with shelf_u_height value
- Equipment without U-height: Dashed border badge with "?U"

#### Visual Styling

```jsx
// Shelf equipment (blue)
className="bg-blue-900/50 text-blue-400 border border-blue-700"

// Rack-mountable (amber)  
className="bg-amber-900/50 text-amber-400 border border-amber-700"
```

#### Files Modified

| File | Change |
|------|--------|
| `src/components/Rack/RackFrontView.jsx` | Blue styling for shelf equipment badges |

---

### Rack Layout UI Overhaul (January 19, 2026)

**Goal:** Improve rack layout UI with cleaner header, Front/Back view tabs, Physical/Functional mode toggle, and transparent shelf styling.

#### Changes Made

1. **Renamed "Network View" to "Back View"**
   - Both tabs now clearly indicate viewing angle: Front View / Back View

2. **Compact Horizontal Stats Bar**
   - Replaced 4 separate info boxes with single horizontal stats bar
   - Shows: Total Equipment | Placed | Unplaced | Rack Size (e.g., "42U")
   - More compact, takes less vertical space

3. **Physical/Functional Layout Toggle**
   - Both Front and Back views support two modes:
     - **Physical:** Shows actual rack grid with equipment at U positions
     - **Functional:** Shows list view sorted by position (Back View) or standard view (Front View)
   - Toggle is positioned at right side of header bar

4. **Transparent Shelf Styling**
   - Changed shelf background from `bg-blue-900/30` to `bg-transparent`
   - Kept blue border: `border-blue-500`
   - Shelf header has subtle tint: `bg-blue-900/30`

5. **RackBackView Physical Mode**
   - Added full physical rack grid support matching RackFrontView
   - Shows equipment blocks at actual U positions
   - Supports shelves with equipment
   - Supports drag-and-drop for equipment and shelves
   - Equipment blocks show network status, IP addresses, power indicators

#### UI Structure

```jsx
// Header row layout
<div className="flex flex-wrap items-center gap-4 mb-4">
  {/* Front/Back View Tabs */}
  <div className="flex gap-1 bg-zinc-200 ...">
    <button>Front</button>
    <button>Back</button>
  </div>

  {/* Compact Stats Bar */}
  <div className="flex items-center gap-3 ...">
    <div>Total: {count}</div>
    <div>Placed: {count}</div>
    <div>Unplaced: {count}</div>
    <div>Size: {size}U</div>
  </div>

  {/* Physical/Functional Toggle */}
  <div className="flex gap-1 ... ml-auto">
    <button>Physical</button>
    <button>Functional</button>
  </div>
</div>
```

#### Files Modified

| File | Change |
|------|--------|
| `src/pages/RackLayoutPage.js` | New header with tabs, compact stats, layout mode toggle, pass layoutMode to views |
| `src/components/Rack/RackFrontView.jsx` | Transparent shelf background, subtle header tint |
| `src/components/Rack/RackBackView.jsx` | Full rewrite to support both physical and functional modes |

#### Props Added to RackBackView

```typescript
// New props for physical layout mode
layoutMode: 'physical' | 'functional'
onEquipmentDrop: (equipmentId, targetU, rackId) => void
onEquipmentMove: (equipmentId, targetU, shelfId) => void
onEquipmentRemove: (equipmentId) => void
onEquipmentEdit: (equipment) => void
onEquipmentDropOnShelf: (equipmentId, shelfId) => void
onAddShelf: (shelfData) => Promise<shelf>
onShelfMove: (shelfId, newPositionU) => void
onShelfDelete: (shelfId) => void
getNetworkInfo: (equipment) => networkInfoObject
```

---

### Power Requirements Section in Part Detail Page

**Goal:** Add a dedicated Power Requirements section to the Part Detail Page for configuring power consumption and outlet requirements for equipment.

#### New UI Section

Added a new "POWER REQUIREMENTS" card section with the following fields:

1. **Power Consumption (Watts)** - Input field for typical power draw
2. **Power Outlets Required** - Dropdown selector (1-42 outlets)
3. **"This is a power distribution device"** - Checkbox to mark UPS/PDU/surge protectors

When the power device checkbox is enabled, additional fields appear:
4. **Surge Protected Outlets** - Dropdown (1-42) with amber styling
5. **Battery Backup Outlets** - Dropdown (1-42) with green styling
6. **Total outlets summary** - Shows "Total: X outlets (Y with battery backup)"

#### Power Outlets Changed to Dropdown

The "Power Outlets Required" field was changed from a button group (1, 2, 3, 4) to a dropdown selector allowing 1-42 outlets in single increments for large power distribution devices.

```jsx
<select value={formState.power_outlets || 1} onChange={...}>
  {Array.from({ length: 42 }, (_, i) => i + 1).map((n) => (
    <option key={n} value={n}>{n} {n === 1 ? 'outlet' : 'outlets'}</option>
  ))}
</select>
```

#### Form State Fields Added

```javascript
// Power fields in formState
power_watts: part?.power_watts || '',
power_outlets: part?.power_outlets || 1,
is_power_device: part?.is_power_device || false,
power_outlets_provided: part?.power_outlets_provided || '',
ups_outlets_provided: part?.ups_outlets_provided || '',
```

#### Files Modified

| File | Change |
|------|--------|
| `src/components/PartDetailPage.js` | Added Power Requirements section with all power fields |

---

### Fix: Power Fields Not Saving to Database

**Problem:** Power fields (watts, outlets, is_power_device, outlets_provided) were not being saved when clicking Save on the Part Detail Page.

**Root Cause:**
1. The `update_global_part` RPC function was missing the power field parameters
2. The `partsService.js` was not passing power fields to the RPC call

**Solution:**

1. Created migration to update RPC function with power parameters:

```sql
-- Added parameters to update_global_part function:
p_power_watts INTEGER DEFAULT NULL,
p_power_outlets INTEGER DEFAULT NULL,
p_is_power_device BOOLEAN DEFAULT NULL,
p_power_outlets_provided INTEGER DEFAULT NULL,
p_ups_outlets_provided INTEGER DEFAULT NULL
```

2. Updated partsService.js to include power fields in RPC params:

```javascript
// Power fields
p_power_watts: payload.power_watts,
p_power_outlets: payload.power_outlets,
p_is_power_device: payload.is_power_device,
p_power_outlets_provided: payload.power_outlets_provided,
p_ups_outlets_provided: payload.ups_outlets_provided,
```

**Migration:** `supabase/migrations/20260120_update_global_part_rpc_power_fields.sql`

#### Files Modified

| File | Change |
|------|--------|
| `src/services/partsService.js` | Added power fields to RPC params |
| `supabase/migrations/20260120_update_global_part_rpc_power_fields.sql` | Updated RPC function with power parameters |

---

### UPS Battery Backup Outlets (Separate from Surge-Only Outlets)

**Goal:** Power distribution devices like UPS units have two types of outlets - battery backup outlets (that provide power during outages) and surge-only outlets (that only provide surge protection). Track these separately.

#### New Database Field

| Field | Type | Description |
|-------|------|-------------|
| `ups_outlets_provided` | INTEGER | Number of UPS battery backup outlets the device provides |

**Migration:** `supabase/migrations/20260120_add_ups_outlets_provided.sql`

```sql
ALTER TABLE global_parts
ADD COLUMN IF NOT EXISTS ups_outlets_provided INTEGER DEFAULT 0;
```

#### Updated RPC Function

**Migration:** `supabase/migrations/20260120_update_global_part_rpc_power_fields.sql`

Added `p_ups_outlets_provided` parameter to the `update_global_part` RPC function.

#### UI Changes - Part Detail Page

The Power Requirements section now shows two dropdown selectors for power distribution devices:

1. **Surge Protected Outlets** (amber) - Power conditioning/surge protection only
2. **Battery Backup Outlets** (green) - UPS battery backup + surge protection

Both dropdowns allow selecting 1-42 outlets in single increments.

A total is shown below: "Total: 8 outlets (4 with battery backup)"

#### UI Changes - Rack Back View (Functional Mode)

Power devices now display both outlet types with distinct colors:
- **Green outlets** with Zap icon - UPS battery backup outlets
- **Amber outlets** - Surge protected only outlets
- **Gray outlet** on far right - Power input the device requires

The header power summary shows outlets as: `X / Y + Z` where:
- X = outlets required by all devices
- Y = UPS battery backup outlets available (green)
- Z = surge-only outlets available (amber)

Example: `5 / 4 + 4 ⚡1` means 5 outlets needed, 4 UPS + 4 surge available, 1 power device

#### Files Modified

| File | Change |
|------|--------|
| `src/components/PartDetailPage.js` | Added `ups_outlets_provided` to form state, added Battery Backup Outlets dropdown |
| `src/services/partsService.js` | Added `p_ups_outlets_provided` to RPC params |
| `src/services/projectEquipmentService.js` | Added `ups_outlets_provided` to global_part fetch query |
| `src/services/rackService.js` | Added `ups_outlets_provided` to all global_part fetch queries |
| `src/components/Rack/RackBackView.jsx` | Updated `renderPowerInfo` and `powerTotals` to handle both outlet types |

---

### Two-Row Layout for Rack Equipment Cards (Functional View)

**Goal:** Improve the rack layout functional view by using a two-row layout for equipment cards - device name/info on top row, power information on bottom row.

#### Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│ U1  ⚡ MB1500 1  [3U]                              [⚙]      │  ← Top row: position, icon, name, height, settings
│        ⚡[🔌][🔌][🔌][🔌] [🔌][🔌][🔌][🔌] [🔌]             │  ← Bottom row: power outlets (green UPS, amber surge, gray input)
└─────────────────────────────────────────────────────────────┘
```

For regular devices:
```
┌─────────────────────────────────────────────────────────────┐
│ U32    UDP-Pro 1  [1U]                            [⚙]      │  ← Top row
│                                                   [🔌]      │  ← Bottom row: power input required
└─────────────────────────────────────────────────────────────┘
```

#### Power Device Outlet Display Order

1. UPS Battery Backup outlets (green with Zap icon)
2. Surge-only outlets (amber)
3. Power input required (gray, on far right to match other devices)

#### Files Modified

| File | Change |
|------|--------|
| `src/components/Rack/RackBackView.jsx` | Changed equipment cards from single-row flex to two-row flex-col layout |

---

### Fix: Unplaced Equipment Not Showing for Head-End Rooms

**Problem:** Equipment added to head-end rooms wasn't appearing in the "Unplaced Equipment" bucket at the bottom of the rack layout page.

**Root Cause:** The filter was checking `eq.install_side === 'head_end'` but equipment in head-end rooms might not have the `install_side` field set directly - instead, the room itself has `is_headend = true`.

**Solution:** Updated the filter to check both conditions:

```javascript
// Before
const unplaced = equipment.filter(eq =>
  eq.rack_position_u == null &&
  eq.rack_id == null &&
  eq.install_side === 'head_end' &&  // Only checked equipment field
  ...
);

// After
const unplaced = equipment.filter(eq =>
  eq.rack_position_u == null &&
  eq.rack_id == null &&
  (eq.install_side === 'head_end' || eq.project_rooms?.is_headend === true) &&  // Check both
  ...
);
```

#### Files Modified

| File | Change |
|------|--------|
| `src/pages/RackLayoutPage.js` | Updated unplaced equipment filter to include room-based head-end detection |
| `src/components/Rack/RackBackView.jsx` | Added unplaced equipment section (was missing from back view) |

---

### Equipment Connection Management System (January 20, 2026)

**Feature:** Drag-and-drop power AND network connection management for rack equipment with animated connection visualization.

#### Overview

The Back View now supports visual connection management via tabbed interface (Power | Network), allowing users to:
- **Power Tab:** Drag power inputs from devices and drop them onto UPS/PDU outlets
- **Network Tab:** Drag network ports from devices and drop them onto switch ports
- See animated connection lines showing flow direction on hover
- Disconnect devices by clicking connected ports
- View connection status at a glance with color-coded icons

#### Sub-Tab Navigation

The Back View has two tabs that toggle between connection types:
- **Power Tab** (amber highlight) - Shows power outlets/inputs and power connections
- **Network Tab** (cyan highlight) - Shows network switch ports and network connections

Each tab has its own KEY legend showing icon states for that connection type.

#### Database Schema

New table: `project_equipment_connections`

```sql
CREATE TABLE project_equipment_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_equipment_id UUID NOT NULL REFERENCES project_equipment(id) ON DELETE CASCADE,
  source_port_number INTEGER NOT NULL,
  source_port_type VARCHAR(20),  -- 'ups', 'surge', 'network', etc.
  target_equipment_id UUID NOT NULL REFERENCES project_equipment(id) ON DELETE CASCADE,
  target_port_number INTEGER DEFAULT 1,
  connection_type VARCHAR(20) NOT NULL,  -- 'power', 'network', 'hdmi', etc.
  cable_label VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_source_port UNIQUE(source_equipment_id, source_port_number, connection_type),
  CONSTRAINT unique_target_port_power UNIQUE(target_equipment_id, target_port_number, connection_type)
);
```

#### Color Coding System (Brand Colors)

**Power Tab Colors:**
| State | Color | Hex | Usage |
|-------|-------|-----|-------|
| UPS Battery Backup | Olive Green | `#94AF32` | Border for UPS outlets, fill when connected |
| Surge/Standard | Blue | `#3B82F6` | Border for surge outlets, fill when connected |
| Unplugged | Gray | `#3f3f46` | Fill for empty outlets/inputs |
| Trouble/Warning | Amber | `#F59E0B` | Reserved for error conditions |
| Accent/Drag | Violet | `#8B5CF6` | Hover states, drag indicators |

**Network Tab Colors:**
| State | Color | Hex | Usage |
|-------|-------|-----|-------|
| Standard Port | Cyan | `#06B6D4` | Border for regular switch ports, fill when connected |
| PoE Port | Violet | `#8B5CF6` | Border for PoE-enabled ports, fill when connected |
| Uplink Port | Emerald | `#10B981` | Border for uplink/SFP ports, fill when connected |
| Disconnected | Gray | `#3f3f46` | Fill for empty/disconnected ports |
| Accent/Drag | Violet | `#8B5CF6` | Hover states, drag indicators |

#### Icon States

**Power Tab - Outlets (on UPS/PDU):**
- Border color = power type (green=UPS, blue=surge)
- Gray fill + gray icon = available/empty
- Colored fill + white icon = connected/occupied

**Power Tab - Inputs (on consuming devices):**
- Gray border always (neutral)
- Gray fill + gray icon = unplugged
- Green fill + white icon = connected to UPS
- Blue fill + white icon = connected to surge

**Network Tab - Switch Ports (on network switches):**
- Border color = port type (cyan=standard, violet=PoE, emerald=uplink)
- Gray fill + gray icon = available/empty
- Colored fill + white icon = connected/occupied

**Network Tab - Device Ports (on consuming devices):**
- Gray border always (neutral)
- Gray fill + gray icon = disconnected
- Cyan fill + white icon = connected to standard port
- Violet fill + white icon = connected to PoE port
- Emerald fill + white icon = connected to uplink port

#### Connection Line Visualization

When hovering over a connected port:
1. Animated dashed line appears showing flow direction
2. **Power connections:** Line routes along right edge of rack
3. **Network connections:** Line routes along left edge of rack
4. Both endpoints highlight with white border and glow
5. Dashes animate to show direction of flow (source → target)

#### User Interactions

| Action | Result |
|--------|--------|
| Drag unplugged input | Can drop on available outlet |
| Drop on outlet | Creates connection, colors update |
| Hover connected input | Shows animated line to source outlet |
| Hover connected outlet | Shows animated line to powered device |
| Click connected input/outlet | Disconnects the connection |

#### Connection Key Legends

**Power Key (shown when Power tab active):**
- UPS Available / UPS Connected
- Surge Available / Surge Connected
- Unplugged
- Trouble (amber - reserved for warnings)

**Network Key (shown when Network tab active):**
- Port Available / Port Connected (standard)
- PoE Available / PoE Connected
- Uplink Available / Uplink Connected
- Disconnected

#### Files Created/Modified

| File | Purpose |
|------|---------|
| `database/migrations/20260120_create_equipment_connections.sql` | Database migration for connections table |
| `src/services/equipmentConnectionService.js` | CRUD operations for connections |
| `src/components/Rack/RackBackView.jsx` | Enhanced with drag-drop, connection lines, power key |
| `src/pages/RackLayoutPage.js` | Added connection state, handlers, passes props to view |

#### Service Functions (equipmentConnectionService.js)

```javascript
// Get all connections for a project
getProjectConnections(projectId)

// Create a new connection
createConnection({ projectId, sourceEquipmentId, sourcePortNumber, sourcePortType, targetEquipmentId, targetPortNumber, connectionType, cableLabel, notes })

// Delete a connection
deleteConnection(connectionId)

// Get power status for all equipment in a rack
getRackPowerStatus(rackId)

// Trace power chain from device back to UPS
getPowerChain(equipmentId)

// Get switch port usage (for network connections)
getSwitchPortUsage(switchEquipmentId)
```

#### Global Part Properties for Connections

**Power-related properties:**
- `is_power_device` - True for UPS/PDU/power strips
- `power_watts` - Power consumption in watts
- `power_outlets` - Number of power inputs required
- `power_outlets_provided` - Surge-only outlets provided
- `ups_outlets_provided` - UPS battery-backed outlets provided
- `power_output_watts` - Total power output capacity

**Network-related properties:**
- `is_network_switch` - True for network switches
- `switch_ports` - Total number of switch ports
- `poe_enabled` - True if switch has PoE capability
- `uplink_ports` - Number of uplink/SFP ports
- `has_network_port` - True if device has a network port (default true)
- `network_ports` - Number of network ports (default 1)

#### Future Enhancements

1. **Power Chain View** - Show full path: Device → Power Strip → Surge → UPS
2. **Quick-Create Power Strip** - Create power strips on the fly during connection
3. **Warning States** - Use amber for overloaded circuits, disconnected chains
4. **VLAN Assignment** - Assign VLANs to network connections
5. **PoE Budget Tracking** - Track PoE power budget on switches

---

## 2026-01-21

### AI Document Library Builder (Parts Enrichment Agent V2)

A comprehensive AI-powered system that automatically builds documentation libraries for global parts using a multi-pass search strategy with document classification and verification.

#### Overview

The Document Library Builder is an AI agent that:
1. **Searches manufacturer websites** for official documentation (Class 3 - Trustworthy)
2. **Searches the broader web** for distributor/reseller docs (Class 2 - Reliable)
3. **Checks community sources** for discussions and reviews (Class 1 - Opinion)
4. **Verifies discovered documents** using a second-pass verification agent
5. **Downloads PDFs** and uploads them to SharePoint for archival
6. **Extracts technical specifications** (rack dimensions, power, network info)

#### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Part Detail Page UI                               │
│                  "Search for Data" Button                            │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  /api/enrich-single-part.js                          │
│           Document Library Builder (Vercel Function)                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  PASS 1: buildDocumentLibrary()                               │   │
│  │  • Model: gemini-2.5-pro-preview-05-06                       │   │
│  │  • Google Search Grounding ENABLED (real-time web search)    │   │
│  │  • Temperature: 0.2 (focused research)                       │   │
│  │                                                               │   │
│  │  Search Strategy (executed in order):                        │   │
│  │  1. Manufacturer website → Class 3 documents                 │   │
│  │  2. Google search → Class 2 documents                        │   │
│  │  3. Community sources → Class 1 documents                    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                │                                     │
│                                ▼                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  PASS 2: verifyDocuments()                                    │   │
│  │  • Verification agent checks each discovered URL             │   │
│  │  • Confirms accessibility and correct product match          │   │
│  │  • Removes bad/broken URLs                                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                │                                     │
│                                ▼                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  PASS 3: downloadAndUploadDocuments()                         │   │
│  │  • Downloads PDF files from verified URLs                    │   │
│  │  • Uploads to SharePoint via /api/graph-upload               │   │
│  │  • Organizes into folder structure                           │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                │                                     │
│                                ▼                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Save to Database via save_parts_enrichment() RPC             │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

#### Document Classification System

Documents are classified into three trust levels:

| Class | Source | Trust Level | Examples |
|-------|--------|-------------|----------|
| **Class 3** | Manufacturer Direct | Trustworthy | Official product pages, support portals, manufacturer CDNs |
| **Class 2** | Distributors/Resellers | Reliable | Authorized distributor spec sheets, reseller product pages |
| **Class 1** | Community | Opinion | Reddit discussions, AVS Forum, YouTube descriptions |

#### Document Routing Logic

Documents are automatically sorted into the correct database fields:

| Document Type | Destination Field | Notes |
|--------------|-------------------|-------|
| Installation Manual | `install_manual_urls[]` | Primary install docs only |
| User Guide | `install_manual_urls[]` | Merged with install manuals |
| Quick Start Guide | `quick_start_url` + `technical_manual_urls[]` | Also added to technical |
| Datasheet / Spec Sheet | `datasheet_url` + `technical_manual_urls[]` | Primary + technical |
| Technical Specs | `technical_manual_urls[]` | All supporting tech docs |
| Submittal / Brochure | `submittal_url` | Sales one-pagers, product pages |
| Product Page | `submittal_url` (fallback) | Used if no submittal found |
| CAD, Firmware, FAQ, etc. | `technical_manual_urls[]` | All other technical docs |

#### SharePoint Folder Structure

Downloaded documents are organized in SharePoint:

```
{company_sharepoint_root_url}/
└── Parts/
    └── {Manufacturer}/
        └── {PartNumber}/
            ├── manuals/           ← Install manuals, user guides, quick starts
            │   ├── {PartNum}-install-manual-1.pdf
            │   ├── {PartNum}-user-guide.pdf
            │   └── {PartNum}-quick-start.pdf
            └── technical/         ← Datasheets, specs, submittals
                ├── {PartNum}-datasheet.pdf
                ├── {PartNum}-tech-doc-1.pdf
                └── {PartNum}-submittal.pdf
```

#### AI Prompt Strategy

The AI is instructed to be a "Document Library Specialist" with these behaviors:

1. **Be Thorough** - "Take your time. Thorough research is more important than speed."
2. **Exhaust Manufacturer First** - Must fully search manufacturer site before web search
3. **Look for Hidden Sections** - Check Downloads tabs, Support sections, expandable areas
4. **Prefer Direct PDFs** - Return `.pdf` links when possible, not web pages
5. **Don't Guess** - "null is better than wrong data"
6. **Report What Was Searched** - Document search attempts in `search_summary`

#### Database Schema (New Columns Added)

```sql
-- Technical manuals array (all supporting documentation)
ALTER TABLE global_parts ADD COLUMN technical_manual_urls text[];
ALTER TABLE global_parts ADD COLUMN technical_manual_sharepoint_urls text[];

-- Document classification (JSONB with full metadata)
ALTER TABLE global_parts ADD COLUMN class3_documents jsonb;
ALTER TABLE global_parts ADD COLUMN class2_documents jsonb;
ALTER TABLE global_parts ADD COLUMN class1_documents jsonb;

-- Search/research metadata
ALTER TABLE global_parts ADD COLUMN manufacturer_website text;
ALTER TABLE global_parts ADD COLUMN product_page_url text;
ALTER TABLE global_parts ADD COLUMN search_summary jsonb;
```

#### Document Classification JSONB Structure

```json
{
  "class3_documents": [
    {
      "type": "install_manual",
      "title": "QSE-IO Installation Guide",
      "url": "https://www.lutron.com/docs/qse-io-install.pdf",
      "source": "lutron.com support portal",
      "notes": "Found in Downloads section"
    },
    {
      "type": "datasheet",
      "title": "QSE-IO Specifications",
      "url": "https://www.lutron.com/specs/qse-io-spec.pdf",
      "source": "lutron.com product page",
      "notes": null
    }
  ]
}
```

#### Search Summary JSONB Structure

```json
{
  "manufacturer_site_searched": true,
  "support_section_found": true,
  "total_documents_found": 7,
  "search_notes": "Found product page at lutron.com/products/qse-io. Support section had 4 PDFs. Also found datasheet on ADI distributor site."
}
```

#### Technical Specifications Extracted

The AI also extracts these specs while searching for documents:

**Rack/Mounting Info:**
- `is_rack_mountable`, `u_height`, `needs_shelf`, `shelf_u_height`, `max_items_per_shelf`
- `width_inches`, `depth_inches`, `height_inches`
- `is_wireless`, `exclude_from_rack`

**Power Info:**
- `power_watts`, `power_outlets`, `is_power_device`, `power_outlets_provided`
- `ups_va_rating`, `ups_battery_outlets`, `ups_surge_only_outlets`

**Network Info:**
- `is_network_switch`, `switch_ports`, `poe_enabled`, `poe_budget_watts`
- `uplink_ports`, `has_network_port`

#### Key Code: Model Configuration with Grounding

```javascript
// Use Gemini 2.5 Pro for thorough research with grounding
const GEMINI_MODEL = 'gemini-2.5-pro-preview-05-06';

// Configure model with Google Search grounding for real-time web research
const model = genAI.getGenerativeModel({
  model: GEMINI_MODEL,
  tools: [{
    googleSearch: {}  // Enables real-time web search
  }]
});
```

#### Key Code: Three-Pass Enrichment Flow

```javascript
// PASS 1: Research the part thoroughly
const enrichmentData = await buildDocumentLibrary(model, part);

// PASS 2: Verify documents (verification agent)
const verifiedData = await verifyDocuments(model, part, enrichmentData.data);
Object.assign(enrichmentData.data, verifiedData);

// PASS 3: Download and upload to SharePoint
const downloadedDocs = await downloadAndUploadDocuments(part, enrichmentData.data);
if (downloadedDocs) {
  Object.assign(enrichmentData.data, downloadedDocs);
}

// Save to database
await getSupabase().rpc('save_parts_enrichment', {...});
```

#### Differences from V1

| Aspect | V1 (gemini-2.0-flash) | V2 (gemini-2.5-pro) |
|--------|----------------------|---------------------|
| Model | gemini-2.0-flash | gemini-2.5-pro-preview-05-06 |
| Grounding | None (relied on training data) | Google Search enabled |
| Search Strategy | Single pass, basic | 3-pass: Manufacturer → Web → Community |
| Document Classification | None | Class 1/2/3 trust levels |
| Verification | None | Second-pass verification agent |
| Document Fields | `install_manual_urls`, `user_guide_urls` | Added `technical_manual_urls` |
| Metadata | Minimal | Full search_summary, classification JSONBs |
| Instructions | Brief, generic | Detailed "Document Library Specialist" role |

#### Files Created/Modified

| File | Purpose |
|------|---------|
| `api/enrich-single-part.js` | **Complete rewrite** - Document Library Builder with 3-pass strategy |
| `database/migrations/20260120_parts_enrichment_v2.sql` | Added technical_manual_urls, class documents, search metadata columns |

#### Usage

1. Navigate to Part Detail page (`/parts/:partId`)
2. Click "Search for Data" button in AI-Powered Data Search section
3. Wait for research to complete (may take 30-60 seconds due to thorough search)
4. Review discovered documents and specifications
5. Documents are automatically uploaded to SharePoint

#### Environment Variables Required

```
REACT_APP_GEMINI_API_KEY=your-gemini-api-key
# or
GEMINI_API_KEY=your-gemini-api-key
```

#### Future Enhancements

1. **Batch Processing** - Queue multiple parts for background enrichment
2. **Re-enrichment Triggers** - Auto-refresh when documents are 6+ months old
3. **Document Preview** - Show PDF previews in UI before downloading
4. **Manual Override** - Allow users to promote/demote document classifications
5. **Confidence Scoring** - Weight confidence by document class found

---

## 2026-01-26

### Manus AI Integration for Parts Enrichment

Replaced Gemini-based URL generation with Manus AI, a browser-based research agent that actually navigates websites and returns **verified, working URLs** for product documentation.

#### Problem Solved

The previous Gemini-based enrichment system had a critical flaw: **URL hallucination**. Both Gemini and Perplexity would construct plausible-looking URLs that returned 404 errors when accessed. For example:
- AI-generated: `https://panamax.com/product/m4315-pro/` → **404 Not Found**
- Actual URL: `https://panamax.com/product/bluebolt-controllable-power-conditioner-8-outlets/`

Manus AI solves this by actually browsing the web like a human researcher, clicking through pages and extracting real URLs from live websites.

#### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Part Detail Page UI                               │
│                  "Search for Data" Button                            │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  /api/enrich-single-part-manus.js                    │
│              Manus-Based Document Finder (Vercel Function)           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Step 1: Create Manus Task                                    │   │
│  │  • POST to https://api.manus.ai/v1/tasks                     │   │
│  │  • taskMode: 'agent', agentProfile: 'quality'                │   │
│  │  • Prompt: Find product page, manuals, datasheets, specs     │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                │                                     │
│                                ▼                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Step 2: Poll for Completion                                  │   │
│  │  • GET /tasks/{taskId} every 10 seconds                      │   │
│  │  • Max wait: 5 minutes                                       │   │
│  │  • Manus browses web, extracts real URLs                     │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                │                                     │
│                                ▼                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Step 3: Parse Results                                        │   │
│  │  • Extract JSON from Manus response                          │   │
│  │  • Map to Unicorn document fields                            │   │
│  │  • All URLs are verified (actually exist)                    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                │                                     │
│                                ▼                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Save to Database via save_parts_enrichment() RPC             │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

#### Key Differences from Gemini Approach

| Aspect | Gemini (Old) | Manus (New) |
|--------|--------------|-------------|
| URL Source | AI-constructed (hallucinated) | Actually browsed & verified |
| Reliability | ~30-50% working URLs | ~95%+ working URLs |
| Speed | ~10-30 seconds | ~1-3 minutes |
| Cost | ~$0.01/part | ~$1.50/part (~150 credits) |
| API Style | Synchronous | Async (poll for completion) |

#### Files Created/Modified

| File | Change |
|------|--------|
| `api/enrich-single-part-manus.js` | **NEW** - Manus-based enrichment endpoint |
| `src/components/GlobalPartDocumentationEditor.js` | Updated to call Manus endpoint |
| `src/components/PartDetailPage.js` | Updated to call Manus endpoint |
| `.env.local` | Added MANUS_API_KEY |
| `.env.example` | Documented MANUS_API_KEY |

#### Environment Variables Required

```
MANUS_API_KEY=your-manus-api-key
```

Add to Vercel: Settings → Environment Variables → Add `MANUS_API_KEY`

#### Usage

Same as before - the UI is unchanged:
1. Navigate to Part Detail page (`/parts/:partId`)
2. Click "Search for Data" button
3. Wait for research to complete (1-3 minutes due to actual web browsing)
4. Review discovered documents - URLs are now verified and working

#### Manus API Reference

- **Base URL:** `https://api.manus.ai/v1`
- **Auth Header:** `API_KEY: {your-key}`
- **Create Task:** `POST /tasks` with `{ prompt, taskMode: 'agent', agentProfile: 'quality' }`
- **Check Status:** `GET /tasks/{taskId}`
- **Task States:** `pending`, `running`, `completed`, `done`, `failed`, `error`

#### Fallback

The original Gemini endpoint (`/api/enrich-single-part.js`) is preserved and can be switched back if needed by reverting the fetch URLs in the UI components.

---

### Network Tab Port Connections & Equipment Edit Modal (January 2026)

#### Problem Summary
1. **Settings button not working in Network/Power tabs** - Clicking the gear icon didn't open the equipment edit modal
2. **Port ordering incorrect** - Ports displayed out of order (e.g., 2, 3... 16, 1 instead of 1, 2, 3... 16)
3. **Connection lines going to wrong locations** - Lines weren't properly connecting switch ports to devices
4. **Equipment not showing on Network tab despite having HA link** - Devices with `ha_client_mac` in Front view weren't appearing in Network tab port connections

#### Root Cause Analysis

**Settings Button Issue:**
- `RackBackView.jsx` called `onEquipmentEdit?.(eq)` expecting it to open a modal
- But `onEquipmentEdit` from `RackLayoutPage.js` is `handleEquipmentEdit(equipmentId, updates)` - a data save function, not a modal opener
- `RackFrontView.jsx` had its own `editingEquipment` state and `EquipmentEditModal` component
- `RackBackView.jsx` was missing this state and modal

**Port Connection Issue:**
- `getPortConnections()` function in `RackBackView.jsx` builds a map of switch ports to connected devices
- Equipment linked via `ha_client_mac` wasn't being found because the lookup logic didn't check `project_equipment.ha_client_mac`
- The function checks multiple data sources but wasn't linking HA clients back to rack equipment

#### Solution Implemented

1. **Extracted `EquipmentEditModal` to shared component:**
   - Created `/src/components/Rack/EquipmentEditModal.jsx`
   - Both `RackFrontView.jsx` and `RackBackView.jsx` now import this shared component

2. **Added `editingEquipment` state to `RackBackView.jsx`:**
   ```javascript
   const [editingEquipment, setEditingEquipment] = useState(null);
   ```

3. **Updated Settings button click handlers:**
   ```javascript
   // Changed from:
   onClick={(e) => { e.stopPropagation(); onEquipmentEdit?.(eq); }}
   // To:
   onClick={(e) => { e.stopPropagation(); setEditingEquipment(eq); }}
   ```

4. **Added modal rendering at end of component:**
   ```jsx
   {editingEquipment && (
     <EquipmentEditModal
       equipment={editingEquipment}
       projectId={projectId}
       networkInfo={getNetworkInfo ? getNetworkInfo(editingEquipment) : null}
       haClients={haClients}
       haDevices={haDevices}
       onClose={() => setEditingEquipment(null)}
       onSave={onEquipmentEdit}
       onRemove={onEquipmentRemove}
       onExclude={onEquipmentExclude}
       onExcludeGlobal={onEquipmentExcludeGlobal}
       onMoveRoom={onMoveRoom}
       onLinkToHA={onLinkToHA}
     />
   )}
   ```

5. **Fixed port ordering:**
   ```javascript
   const sortedPorts = [...haPortTable].sort((a, b) => a.port_idx - b.port_idx);
   ```

#### Key Code: `getPortConnections()` in RackBackView.jsx

This function (around line 1350) builds the map of what's connected to each switch port:

```javascript
const getPortConnections = () => {
  const portMap = new Map();
  
  // SECTION 1: Equipment linked to THIS switch (via networkInfo)
  // Checks equipment.ha_client_mac against switch ports
  
  // SECTION 2: HA clients (from haClients prop)
  // Matches client.switch_name to switch, then links to equipment via MAC:
  const linkedEquipment = client.mac
    ? equipment.find(e => e.ha_client_mac?.toLowerCase() === client.mac.toLowerCase())
    : null;
  
  // SECTION 3: HA devices (from haDevices prop)
  // Similar MAC-based equipment lookup
  
  // SECTION 4: Port table data (raw port status from UniFi)
  // Fills in remaining ports from switch's port_table
  
  return portMap;
};
```

#### Known Issue: Equipment Missing from Network Tab

**Symptom:** A device (e.g., DHI-NVR) shows network link (IP/MAC) on Front tab but doesn't appear in Network tab port connections.

**Likely Causes:**
1. `client.switch_name` doesn't match the switch equipment's name/hostname
2. `client.switch_port` is null or undefined
3. The equipment's `ha_client_mac` doesn't match any HA client's MAC exactly (case sensitivity)

**Debug Steps:**
1. Check browser console for `[getPortConnections]` logs
2. Verify the device's HA client data has `switch_name` and `switch_port` populated
3. Verify `project_equipment.ha_client_mac` matches the HA client's MAC (case-insensitive)

#### Files Modified

| File | Changes |
|------|---------|
| `src/components/Rack/EquipmentEditModal.jsx` | **NEW** - Extracted shared modal component |
| `src/components/Rack/RackFrontView.jsx` | Removed inline modal, imports shared component |
| `src/components/Rack/RackBackView.jsx` | Added editingEquipment state, imports shared modal, updated click handlers |

#### Tab Structure Clarification

The Rack Layout page has **3 tabs** (not a separate "back" view):
- **Front tab** → `RackFrontView.jsx` (physical grid layout)
- **Power tab** → `RackBackView.jsx` with `connectionTab="power"`
- **Network tab** → `RackBackView.jsx` with `connectionTab="network"`

---

