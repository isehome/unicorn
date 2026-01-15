# AGENT.md - Unicorn Project Guidelines

**⚠️ AI ASSISTANT: Read this ENTIRE file before writing any code.**

**📁 FILE MANAGEMENT RULES:**
- **NEVER create duplicate agent files** (no AGENT 2.md, AGENT 3.md, agent-copy.md, etc.)
- **ALWAYS update THIS file** (AGENT.md) directly when documentation changes are needed
- **APPEND new sections** to the appropriate part of this file
- If this file gets too long, discuss with the user before restructuring
- The only documentation files should be: `AGENT.md` (primary) and topic-specific files in `/docs/`

---

# PART 1: WHAT THIS APP IS

## Overview

**Unicorn** is a project management application for low-voltage installations (network cabling, AV systems, wire drops).

**Owner:** Steve / Intelligent Systems
**Tech Level:** Non-programmer (needs copy-paste ready code)
**Stack:** React 18, Supabase, Azure MSAL, Tailwind CSS, Vercel

---

## User Roles

### Technician (Field Worker)
- View assigned projects
- Complete wire drop stages (prewire → trim-out → commissioning)
- Upload stage photos
- Receive parts/equipment
- Log issues with photos

### Project Manager (PM)
- Everything technicians can do, PLUS:
- Create/manage projects
- Import equipment from CSV
- Generate purchase orders
- Manage vendors
- View progress gauges
- Configure integrations (Lucid, UniFi)

---

## Core Features

### 1. Wire Drop Management

Wire drops are cable installation points. Each goes through 3 stages:

| Stage | What Happens | Required |
|-------|--------------|----------|
| **Prewire** | Cable run from head-end to location | Photo |
| **Trim-Out** | Mount device, terminate cable | Photo + Equipment |
| **Commissioning** | Test, connect to network | Photo |

**Flow:**
```
Import from Lucid → Create Wire Drops → Assign Equipment → Complete Stages → Done
```

### 2. Equipment System (3 Tiers)

| Tier | Table | Purpose |
|------|-------|---------|
| Global Parts | `global_parts` | Master catalog (reusable) |
| Project Equipment | `project_equipment` | Instances for a project (from CSV import) |
| Wire Drop Links | `wire_drop_equipment_links` | Which equipment at which drop |

**CSV Import Flow:**
1. PM exports from D-Tools/proposal software
2. Upload CSV (Room, Part, Quantity columns)
3. System creates individual instances
4. Technician assigns to wire drops

### 3. Progress Gauges (Milestones)

| Gauge | What It Measures |
|-------|------------------|
| Planning | Has Lucid URL + Portal URL |
| Prewire Orders | % of prewire parts on submitted POs |
| Prewire Receiving | % of prewire parts received |
| Prewire Stages | % of wire drops with prewire photo |
| Trim Orders | % of trim parts ordered |
| Trim Receiving | % of trim parts received |
| Trim Stages | % of wire drops with trim photo + equipment |
| Commissioning | % of wire drops commissioned |

### 4. Procurement (Purchase Orders)

**Flow:**
```
Equipment imported → Group by supplier → Generate PO → Submit → Add tracking → Receive items
```

**PO Numbering:** `ProjectName-PO-2025-001-AMZN-001` (ProjectPrefix-Year-Sequence-Supplier-PerSupplierSeq)

#### Internal Inventory POs
When equipment can be fulfilled from warehouse stock (not ordered from external suppliers), the system creates an **Internal Inventory PO**:
- Supplier: "Internal Inventory" (auto-created)
- Auto-submitted immediately after creation
- Triggers inventory decrement on submit (not on receive)

**Why decrement on submit (not receive)?**
- **Reservation logic**: Once a PM commits to pulling inventory for a project, those items are "spoken for"
- **Prevents double-allocation**: Other projects can't claim the same inventory
- **Accurate availability**: Shows what's truly available vs. what's reserved
- **Simplicity**: No need to track "reserved but not pulled" state separately

This is the standard "allocate on commit" pattern used in warehouse management systems.

### 5. Photo Storage (SharePoint) - CRITICAL IMPLEMENTATION GUIDE

**⚠️ READ THIS BEFORE TOUCHING ANY PHOTO CODE**

All photos in the app are stored in SharePoint and displayed via the `CachedSharePointImage` component. This system uses Microsoft Graph API thumbnails for fast loading.

#### Directory Structure in SharePoint
```
{SharePoint Photos Root}/
├── wire_drops/
│   └── {RoomName}_{DropName}/
│       ├── PREWIRE_{RoomName}_{DropName}.jpg
│       ├── TRIM_OUT_{RoomName}_{DropName}.jpg
│       └── COMMISSION_{RoomName}_{DropName}.jpg
├── issues/
│   └── {Issue Title}/
│       └── ISSUE_{Title}_{timestamp}.jpg
├── shades/
│   └── {ShadeName}/
│       └── {m1|m2}_{timestamp}.jpg
└── floor_plans/
    └── {Title}/
        └── FLOORPLAN_{Title}_{timestamp}.png
```

#### Key Files
| Purpose | File |
|---------|------|
| Image display component | `src/components/CachedSharePointImage.js` |
| Thumbnail API endpoint | `api/sharepoint-thumbnail.js` |
| Full image proxy | `api/image-proxy.js` |
| Upload service | `src/services/sharePointStorageService.js` |
| Thumbnail cache | `src/lib/thumbnailCache.js` |

#### Database Requirements - CRITICAL

**Every table that stores photos MUST have these columns:**
```sql
photo_url TEXT,                    -- Full SharePoint URL
sharepoint_drive_id TEXT,          -- Graph API drive ID
sharepoint_item_id TEXT            -- Graph API item ID
```

**Tables with photo storage:**
- `wire_drop_stages` - prewire, trim_out, commission photos
- `issue_photos` - issue documentation photos
- `shade_photos` - shade measurement photos
- `lucid_pages` - floor plan images

#### Upload Flow (How to Store Photos)
```
1. User selects file
2. Call sharePointStorageService.uploadXxxPhoto()
3. API uploads to SharePoint via Graph API
4. API returns: { url, driveId, itemId, name, webUrl, size }
5. ⚠️ STORE ALL METADATA IN DATABASE - not just the URL!
```

**Example upload code:**
```javascript
const result = await sharePointStorageService.uploadWireDropPhoto(
  projectId, file, stageName, roomName, dropName
);

// ⚠️ Save ALL metadata - this enables fast thumbnails!
await supabase.from('wire_drop_stages').update({
  photo_url: result.url,
  sharepoint_drive_id: result.driveId,    // REQUIRED!
  sharepoint_item_id: result.itemId       // REQUIRED!
}).eq('id', stageId);
```

#### Display Flow (How to Show Photos)

**Always use `CachedSharePointImage` component:**
```jsx
<CachedSharePointImage
  sharePointUrl={photo.url}
  sharePointDriveId={photo.sharepoint_drive_id}   // Enables fast thumbnails
  sharePointItemId={photo.sharepoint_item_id}     // Enables fast thumbnails
  displayType="thumbnail"                          // or "full"
  size="medium"                                    // small, medium, large
  className="w-full aspect-square rounded-lg"     // ⚠️ USE aspect-square!
  showFullOnClick={false}
  onClick={() => openFullScreen()}
  objectFit="cover"
/>
```

#### Graph API Thumbnail Sizes - IMPORTANT

**Thumbnails are SQUARE crops centered on the image:**
| Size | Dimensions | Use Case |
|------|------------|----------|
| `small` | 96×96px | Lists, compact views |
| `medium` | 176×176px | **Default** - Card thumbnails |
| `large` | 800×800px | Large previews |
| `full` | Original | Full-screen viewing |

**⚠️ UI containers MUST be square to match:**
```jsx
// ✅ CORRECT - Square container matches square thumbnail
className="w-full aspect-square rounded-lg"

// ❌ WRONG - Rectangular container causes awkward cropping
className="w-full h-48 rounded-lg"
```

#### Fallback for Legacy Photos

Photos uploaded before metadata columns existed won't have `driveId`/`itemId`. The component automatically falls back to `image-proxy`:

```
1. Check if sharepoint_drive_id && sharepoint_item_id exist
2. If YES: Use Graph API thumbnail (fast, ~10-20KB)
3. If NO: Use /api/image-proxy with full URL (slower, full file)
```

#### Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Thumbnail shows cropped/zoomed | UI container not square | Use `aspect-square` class |
| No thumbnail, just loading | Missing driveId/itemId in DB | Check upload saves metadata |
| Full screen not working | Missing `size="full"` support | Use `/api/sharepoint-thumbnail?size=full` |
| Old photos not loading | URL encoding issues | `image-proxy.js` handles this |

#### Adding Photos to a New Feature

1. **Add database columns:**
```sql
ALTER TABLE your_table ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE your_table ADD COLUMN IF NOT EXISTS sharepoint_drive_id TEXT;
ALTER TABLE your_table ADD COLUMN IF NOT EXISTS sharepoint_item_id TEXT;
```

2. **Update upload to save all metadata** (see Upload Flow above)

3. **Use CachedSharePointImage with all props** (see Display Flow above)

4. **Use square container** (`aspect-square` class)

#### Reference Documentation
See `archive/implementation-history/COMPREHENSIVE_SHAREPOINT_THUMBNAILS_COMPLETE.md` for the full implementation history.

---

### 6. Shade Management System

Shades are window treatments (blinds/shades) that go through a verification process similar to wire drops.

**Verification Flow:**
```
Import from Lutron CSV → Create Shades → M1 Measurement → M2 Measurement → Design Review → Export
```

**Intelligent Import Logic:**
The system uses a robust 2-stage import process to handle various CSV types (Lutron v1, v2, Webster, etc.):
1. **Header Parsing:**
   - **Static Mapping:** Checks known aliases first (e.g., "System Mount" = "mount_type").
   - **AI Fallback:** If critical headers are missing, sends headers to `api/parse-lutron-headers.js` (Gemini Flash) to determine mapping.
2. **Room Matching:**
   - **Exact Match:** Checks existing project room names.
   - **AI Fuzzy Match:** Uses Gemini (`api/match-rooms.js`) to map "Living Rm" -> "Living Room" or suggest new standard names.

**Measurement Sets (Blind Verification):**
| Set | Purpose | Done By |
|-----|---------|---------|
| **M1** | Initial field measurement | Technician 1 |
| **M2** | Second verification measurement | Technician 2 (different from M1) |

**Measurement Fields per Set:**
- **Width:** 3 fields (Top, Middle, Bottom) - measures at different heights
- **Height:** 1 field (single measurement)
- **Mount Depth:** 1 field
- **Mount Type:** Verified mount style (inside/outside/ceiling)
- **Obstruction Notes:** Text notes about installation concerns
- **Pocket Dimensions:** Width, Height, Depth (optional)

**Photo Storage:**
Photos are stored in `shade_photos` table with full SharePoint metadata for thumbnail generation:
- `shade_id` - Links to project_shades
- `project_id` - For RLS and organization
- `measurement_set` - 'm1' or 'm2'
- `sharepoint_drive_id` - For Graph API thumbnail requests
- `sharepoint_item_id` - For Graph API thumbnail requests
- `photo_url` - Full SharePoint URL

**Key Files:**
| Purpose | File |
|---------|------|
| Shade detail page | `src/components/Shades/ShadeDetailPage.js` |
| Shade list/manager | `src/components/Shades/ShadeManager.js` |
| Photo CRUD service | `src/services/shadePhotoService.js` |
| Shade list/manager | `src/components/Shades/ShadeManager.js` |
| Photo CRUD service | `src/services/shadePhotoService.js` |
| Measurement service | `src/services/projectShadeService.js` |
| Header Parsing API | `api/parse-lutron-headers.js` |
| Room Matching API | `api/match-rooms.js` |
| Photo table migration | `database/migrations/20251211_create_shade_photos.sql` |

### 7. Integrations

| Integration | Purpose |
|-------------|---------|
| **Lucid Charts** | Import floor plans, create wire drops from shapes |
| **UniFi** | Match equipment to network clients by MAC |
| **SharePoint** | Photo storage |
| **Brady Printer** | Print equipment labels |
| **Microsoft 365 Calendar** | Technician calendar sync for service appointments |
| **Retell AI** | Voice-based service intake (inbound calls) |
| **QuickBooks Online** | Invoice creation from service tickets |

#### 7.1 Retell AI Voice Integration

AI-powered phone agent for handling inbound customer service calls.

| Setting | Value |
|---------|-------|
| Agent ID | `agent_569081761d8bbd630c0794095d` |
| LLM ID | `llm_a897cdd41f9c7de05c5528a895b9` |
| Agent Name | Intelligent Systems - Sarah |
| Voice | ElevenLabs Hailey (American, young, professional) |
| Model | GPT-4.1 |

**Custom Tools (webhooks):**
| Tool | Endpoint | Purpose |
|------|----------|---------|
| `identify_customer` | `/api/retell/identify` | Customer lookup by phone - returns name, address, SLA tier, equipment, open tickets, project team, and UniFi network status |
| `search_knowledge` | `/api/service/knowledge` | Search knowledge base for troubleshooting info |
| `create_ticket` | `/api/retell/create-ticket` | Create service ticket from AI call |
| `check_schedule` | `/api/retell/check-schedule` | Check technician availability (Premium SLA only) |

**Webhook Events:** `https://unicorn-one.vercel.app/api/retell/webhook`
- `call_started`: Creates call log entry
- `call_ended`: Updates duration, transcript
- `call_analyzed`: Adds sentiment, summary, issue category

**Database Tables:**
- `customer_sla_tiers`: Standard, Priority, Premium SLA definitions
- `customer_sla_assignments`: Links contacts to SLA tiers
- `retell_call_logs`: Call history, transcripts, sentiment analysis

**Test Interface:** `/service/ai-test` - Browser-based testing via microphone

**Environment Variables:**
- `RETELL_API_KEY`: Get from Retell Dashboard > Settings > API Keys
- `UNIFI_API_KEY`: For real-time network status checks during calls

---

### 8. Service CRM Module

A full-featured service ticket management system for residential A/V and smart home service calls.

#### 8.1 Service Tickets

Service tickets represent customer service requests. Each ticket has:
- **Ticket Number**: Auto-generated sequence (e.g., `SVC-2025-00042`)
- **Customer Info**: Name, phone, email, service address
- **Category**: Networking, Audio/Video, Automation, Shades, etc.
- **Priority**: Urgent, High, Normal, Low
- **Status Flow**: `new` → `triaged` → `scheduled` → `in_progress` → `completed` → `closed`
- **Estimated Hours**: Used for calendar block sizing

**Triage Process:**
1. Ticket created (from call, form, or voice intake)
2. PM/Dispatcher reviews and assigns priority, category, estimated hours
3. Ticket assigned to technician
4. Ticket scheduled via Weekly Planning

#### 8.2 Weekly Planning ("Air Traffic Control")

A drag-and-drop scheduling interface for dispatching service technicians with a **3-step approval workflow**.

**Access:** `/service/weekly-planning` or `/service/weekly-planning?embed=true` (iframe)

**Features:**
| Feature | Description |
|---------|-------------|
| **Week Calendar Grid** | 7-day view with hour rows (6 AM - 10 PM) |
| **Drag-and-Drop** | Drag unscheduled tickets onto calendar slots |
| **Block Sizing** | Block height = `estimated_hours` field from ticket |
| **Draft Mode** | New schedules start as drafts (movable until committed) |
| **Commit & Send** | Click button to lock schedule and send calendar invite |
| **30-min Buffer** | Automatic buffer enforcement between appointments |
| **M365 Calendar Overlay** | Shows blocked time from technician's Outlook calendar |
| **Status Colors** | VIOLET=Draft, AMBER=Awaiting Tech, BLUE=Awaiting Customer, GREEN=Confirmed |
| **Technician Filter** | View one technician or all overlapping |
| **Week Mode Toggle** | Mon-Fri (work week) or Sun-Sat (full week) |
| **Ticket Detail Modal** | Quick view with status controls and schedule actions |
| **Reset to Draft** | Unlock a committed schedule for re-editing |
| **Remove from Schedule** | Delete schedule and return ticket to unscheduled panel |

**Iframe Embedding (for Alleo):**
```html
<iframe src="https://unicorn-one.vercel.app/service/weekly-planning?embed=true"
        width="1920" height="1080" frameborder="0"
        style="border-radius: 8px;"></iframe>
```

#### 8.3 Four-Step Approval Workflow

The scheduling system uses a 4-step workflow to ensure both technician and customer confirm appointments:

```
┌─────────────┐    Drag-Drop    ┌─────────────┐    Commit    ┌─────────────────┐
│ Unscheduled │ ─────────────▶  │    DRAFT    │ ──────────▶  │  AWAITING TECH  │
│   Tickets   │                 │  (Movable)  │   + Send     │  (Tech Invite)  │
└─────────────┘                 └─────────────┘   Invite     └────────┬────────┘
                                       │                              │
                                       │ Reset                 Tech Accepts
                                       ▼                              │
                                ┌─────────────┐                       ▼
                                │  Can Move   │◀──────────┐  ┌────────────────────┐
                                │  or Delete  │           │  │   TECH ACCEPTED    │
                                └─────────────┘           │  │  (Customer Invite  │
                                                          │  │    Not Sent Yet)   │
                                                          │  └─────────┬──────────┘
                                                          │            │
                                                          │  Send Customer Invite
                                                          │  OR Mark Confirmed
                                                          │            │
                                                          │            ▼
                                                          │  ┌────────────────────┐
                                                          │  │ AWAITING CUSTOMER  │
                                                          │  │  (Customer Invite) │
                                                          │  └─────────┬──────────┘
                                                          │            │
                                                   Reset to    Customer Accepts
                                                    Draft     OR Mark Confirmed
                                                          │            │
                                                          │            ▼
                                                          │   ┌─────────────────┐
                                                          └───│    CONFIRMED    │
                                                              │   (All Good!)   │
                                                              └─────────────────┘
```

**Step 1: Draft (Violet)**
- Drag-drop creates schedule in `draft` status
- Block is movable/draggable on calendar
- No calendar invite sent yet
- User can adjust time/date before committing

**Step 2: Awaiting Tech (Amber)**
- User clicks "Commit & Send Invite" button
- Schedule locked (no longer draggable)
- Calendar event created on organizer's calendar
- **Technician receives email invite** (if different from organizer)
- Status transitions to `pending_tech`
- Subject: `[PENDING] Service: Customer Name (#ticket_number)`

**Step 3: Tech Accepted (Blue)**
- When technician accepts calendar invite
- Status transitions to `tech_accepted`
- **Customer invite NOT automatically sent** - gives dispatcher control
- Available actions:
  - **Send Customer Invite** → transitions to `pending_customer`
  - **Mark Customer Confirmed** → skips customer invite, goes directly to `confirmed`

**Step 4: Awaiting Customer (Cyan)**
- After clicking "Send Customer Invite"
- Customer receives calendar invite + email link
- Status transitions to `pending_customer`
- Available actions:
  - Wait for customer to accept calendar invite
  - **Mark Customer Confirmed** → manually confirm without customer response

**Step 5: Confirmed (Green)**
- When customer accepts OR staff manually confirms
- All parties aligned
- Status transitions to `confirmed`

**Schedule Status Values:**
| `schedule_status` | Color | Draggable | Description |
|-------------------|-------|-----------|-------------|
| `draft` | Violet | ✅ Yes | Not yet committed, can be moved |
| `pending_tech` | Amber | ❌ No | Waiting for technician to accept invite |
| `tech_accepted` | Blue | ❌ No | Tech accepted, customer invite pending |
| `pending_customer` | Cyan | ❌ No | Customer invite sent, waiting for response |
| `confirmed` | Green | ❌ No | All parties confirmed |
| `cancelled` | Gray | ❌ No | Appointment cancelled |

**Self-Assignment Behavior:**
When the organizer (logged-in user) assigns themselves as the technician:
- Calendar event is created on their calendar directly
- No email invite is sent (you can't invite yourself)
- Event appears on calendar immediately
- Schedule still transitions to `pending_tech` status

**Schedule Actions (in Ticket Detail Modal):**
| Action | Available When | What It Does |
|--------|----------------|--------------|
| **Send Customer Invite** | `tech_accepted` | Sends invite to customer, transitions to `pending_customer` |
| **Mark Customer Confirmed** | `tech_accepted` or `pending_customer` | Manually confirms without customer response |
| **Reset to Draft** | Any non-draft status | Unlocks schedule for editing, clears calendar event ID |
| **Remove from Schedule** | Any status | Deletes schedule, returns ticket to unscheduled panel |

**Calendar Integration Details:**
When committing a schedule:
1. Creates event via Microsoft Graph API (`/me/events`)
2. Technician added as required attendee (if not self)
3. Event subject: `[PENDING] Service: Customer Name (#ticket_number)`
4. Event body includes: title, address, phone, notes
5. Location set to service address
6. Event marked as tentative (`showAs: 'tentative'`)
7. `calendar_event_id` stored on schedule for future updates

#### 8.4 Customer Confirmation

**Manual Confirmation (Current):**
Staff can manually confirm on behalf of customers using "Mark Customer Confirmed" button:
- Available in WeeklyPlanning ticket detail modal
- Available in ServiceTicketDetail page (schedule section)
- Records who confirmed and when

**Customer Portal Confirmation (Planned):**
Customer-facing portal for self-service appointment confirmation:
1. Schedule created, customer invite sent
2. System sends email + SMS with confirmation link
3. Customer clicks link → `/public/service-confirm/:token`
4. OTP verification (phone or email)
5. Customer sees appointment details
6. Options: Confirm or Request Reschedule
7. On confirm: status → `confirmed`, calendar event updated

#### 8.5 Service Dashboard

**Route:** `/service`

Dashboard showing:
- Active tickets count by status
- Today's scheduled appointments
- Pending confirmations
- Quick stats (open tickets, scheduled this week)
- Navigation to ticket list and weekly planning

#### 8.6 Service Components

| Component | File | Purpose |
|-----------|------|---------|
| ServiceDashboard | `src/components/Service/ServiceDashboard.js` | Main service dashboard with integrated ticket list, search, and filters |
| ServiceTicketDetail | `src/components/Service/ServiceTicketDetail.js` | Full ticket detail page |
| NewTicketForm | `src/components/Service/NewTicketForm.js` | Create new service ticket |
| WeekCalendarGrid | `src/components/Service/WeekCalendarGrid.jsx` | Week view calendar grid |
| ScheduleBlock | (in WeekCalendarGrid) | Draggable schedule block component |
| UnscheduledTicketsPanel | `src/components/Service/UnscheduledTicketsPanel.jsx` | Left sidebar with unscheduled tickets |
| TechnicianFilterBar | `src/components/Service/TechnicianFilterBar.jsx` | Top controls (tech filter, week nav, view mode) |
| WeeklyPlanning | `src/pages/WeeklyPlanning.js` | Main weekly planning page (embed-aware) |

#### 8.7 Service Services

| Service | File | Purpose |
|---------|------|---------|
| serviceTicketService | `src/services/serviceTicketService.js` | Ticket CRUD, status updates |
| serviceScheduleService | `src/services/serviceTicketService.js` | Schedule management |
| technicianService | `src/services/serviceTicketService.js` | Technician list for assignment |
| weeklyPlanningService | `src/services/weeklyPlanningService.js` | Week schedules, buffer checking, drag-drop |
| microsoftCalendarService | `src/services/microsoftCalendarService.js` | Calendar event creation with attendees |

#### 8.8 Service Database Tables

| Table | Purpose |
|-------|---------|
| `service_tickets` | Service ticket records |
| `service_schedules` | Scheduled appointments with technician/date/time |
| `service_call_logs` | Call history and notes |
| `service_schedule_confirmations` | Customer confirmation tokens |

**service_tickets columns:**
- `id`, `ticket_number`, `title`, `description`
- `customer_name`, `customer_phone`, `customer_email`, `service_address`
- `category`, `priority`, `status`
- `estimated_hours` (for calendar block sizing)
- `assigned_to` (technician UUID)
- `created_at`, `created_by`, `updated_at`

**service_schedules columns:**
- `id`, `ticket_id`, `technician_id`, `technician_name`
- `scheduled_date`, `scheduled_time_start`, `scheduled_time_end`
- `status` (scheduled, in_progress, completed, cancelled)
- `schedule_status` (draft, pending_tech, tech_accepted, pending_customer, confirmed, cancelled)
- `calendar_event_id` (M365 event ID for updates)
- `confirmed_at`, `confirmed_by`, `confirmation_method`
- `service_address`, `pre_visit_notes`, `post_visit_notes`
- `customer_invite_sent_at` - When customer calendar invite was sent

#### 8.8.1 Weekly Planning Calendar Grid - Technical Details

The WeekCalendarGrid component (`src/components/Service/WeekCalendarGrid.jsx`) renders scheduled appointments as positioned blocks on a time-based grid.

**Grid Constants:**
```javascript
const HOUR_HEIGHT = 60;      // 60 pixels per hour
const START_HOUR = 6;        // 6 AM
const END_HOUR = 22;         // 10 PM
const MIN_DAY_WIDTH = 120;   // Minimum column width
const TIME_COLUMN_WIDTH = 60; // Left time labels column
```

**Block Height Calculation:**

Each schedule block's height is calculated based on duration. The system checks multiple sources in priority order:

```javascript
// Priority order for determining end time:
// 1. scheduled_time_end (explicit end time from database)
// 2. estimated_duration_minutes (on the schedule record)
// 3. ticket.estimated_hours (from the linked ticket)
// 4. Default: 2 hours

let endHour;
if (schedule.scheduled_time_end) {
  endHour = timeToHour(schedule.scheduled_time_end);
} else if (schedule.estimated_duration_minutes) {
  endHour = startHour + (estimated_duration_minutes / 60);
} else if (ticket.estimated_hours) {
  endHour = startHour + ticket.estimated_hours;
} else {
  endHour = startHour + 2; // Default 2 hours
}

// Calculate pixel position and height
const top = (startHour - START_HOUR) * HOUR_HEIGHT;
const height = (endHour - startHour) * HOUR_HEIGHT;
```

**Example:** A 1-hour appointment starting at 11:00 AM:
- `startHour = 11`
- `endHour = 12` (from scheduled_time_end "12:00:00")
- `top = (11 - 6) * 60 = 300px`
- `height = (12 - 11) * 60 = 60px`

**⚠️ Common Issue: Orphan Schedules with Null End Times**

If a schedule has `scheduled_time_end = null`, the system falls back through the priority chain. If no duration source is found, it defaults to 2 hours. This can cause incorrect block heights.

**Symptoms:**
- Schedule block shows 2-hour height but ticket says "1.0h"
- Console logs show: `time: "11:00:00-null"`, `height: 120`

**Diagnosis:** Check for duplicate/orphan schedules:
```sql
-- Find schedules with null end times
SELECT id, ticket_id, scheduled_date, scheduled_time_start, scheduled_time_end
FROM service_schedules
WHERE scheduled_time_end IS NULL;

-- Find duplicate schedules (same ticket, same date)
SELECT s1.id, s2.id, s1.ticket_id, s1.scheduled_date
FROM service_schedules s1
JOIN service_schedules s2 ON s1.ticket_id = s2.ticket_id
  AND s1.scheduled_date = s2.scheduled_date
  AND s1.id != s2.id;
```

**Fix:** Delete orphan schedules or update with correct end time:
```sql
DELETE FROM service_schedules WHERE id = 'orphan-schedule-uuid';
```

**Status Colors:**

The `scheduleStatusColors` object maps each status to visual styling:

| Status | Background | Border | Label |
|--------|------------|--------|-------|
| `draft` | Violet 15% | `#8B5CF6` | Draft |
| `pending_tech` | Amber 20% | `#F59E0B` | Awaiting Tech |
| `tech_accepted` | Blue 20% | `#3B82F6` | Tech Accepted |
| `pending_customer` | Cyan 20% | `#06B6D4` | Awaiting Customer |
| `confirmed` | Green 20% | `#94AF32` | Confirmed |
| `cancelled` | Gray 20% | `#71717A` | Cancelled |

#### 8.8.2 Technician Avatar Colors

Avatars throughout the app display the user's **chosen color** from their profile settings. This is stored in the `profiles` table (`avatar_color` column) and linked via email.

**Avatar Color Lookup Pattern:**

```javascript
// 1. Get technician IDs from schedules
const technicianIds = schedules.map(s => s.technician_id);

// 2. Get contact emails for those technicians
const { data: contacts } = await supabase
  .from('contacts')
  .select('id, email')
  .in('id', technicianIds);

// 3. Get avatar colors from profiles via email match
const emails = contacts.map(c => c.email.toLowerCase());
const { data: profiles } = await supabase
  .from('profiles')
  .select('email, avatar_color')
  .in('email', emails);

// 4. Build lookup map: contact_id → avatar_color
const emailToColor = profiles.reduce((acc, p) => {
  acc[p.email.toLowerCase()] = p.avatar_color;
  return acc;
}, {});

// 5. Apply to schedules
schedules.forEach(s => {
  const contact = contacts.find(c => c.id === s.technician_id);
  s.technician_avatar_color = emailToColor[contact?.email?.toLowerCase()];
});
```

**Key Files for Avatar Colors:**
- `src/components/TechnicianAvatar.jsx` - Avatar component with color prop
- `src/services/weeklyPlanningService.js` - Fetches avatar colors for schedules
- `database/migrations/20251228_add_avatar_color_to_profiles.sql` - Schema

**Avatar Color Priority:**
1. `schedule.technician_avatar_color` (user's chosen color from profile)
2. `getColorFromName(technicianName)` (hash-based fallback color)

**Setting Avatar Color:**
Users set their avatar color in Settings → Profile. The color is stored as a hex code (e.g., `#F97316` for orange) in `profiles.avatar_color`.

#### 8.8.3 Calendar Response Processing

A cron job (`/api/cron/process-calendar-responses`) polls Microsoft Graph API to check attendee responses and update schedule statuses automatically.

**Processing Flow:**
```
Every 3 minutes:
1. Find schedules in 'pending_tech' or 'pending_customer' status
2. For each, fetch calendar event from Graph API
3. Check attendee response statuses
4. Update service_schedules based on responses:
   - Tech accepts → status → 'tech_accepted'
   - Customer accepts → status → 'confirmed'
   - Anyone declines → status → 'cancelled', ticket → 'unscheduled'
```

**Manual Trigger:**
```bash
curl -X POST https://unicorn-one.vercel.app/api/system-account/check-responses
```

**Key Files:**
- `api/cron/process-calendar-responses.js` - Cron endpoint
- `api/_calendarResponseProcessor.js` - Core processing logic

#### 8.9 Service Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/service` | ServiceDashboard | Service dashboard with integrated ticket list, search, filters |
| `/service/tickets/new` | NewTicketForm | Create new ticket |
| `/service/tickets/:id` | ServiceTicketDetail | Ticket detail/edit |
| `/service/weekly-planning` | WeeklyPlanning | Drag-drop scheduling |

**Note:** As of 2026-01-12, ServiceTicketList was merged into ServiceDashboard. The `/service/tickets` route was removed - all ticket listing functionality is now on `/service`.

#### 8.10 QuickBooks Online Integration

Service tickets can be exported to QuickBooks Online as invoices for billing.

**OAuth Flow:**
1. User clicks "Connect to QuickBooks" in Settings
2. Redirects to QuickBooks authorization (`/api/qbo/auth`)
3. User logs in and authorizes the app
4. Callback stores tokens in `qbo_auth_tokens` table
5. Tokens auto-refresh when expired (access token = 1 hour, refresh token = 100 days rolling)

**Invoice Creation Flow:**
1. Complete a service ticket (add time logs and/or parts)
2. Click "Export to QuickBooks" button
3. System finds or creates QBO customer (maps via `qbo_customer_mapping`)
4. Creates invoice with labor (from time logs) and parts line items
5. Stores `qbo_invoice_id` on ticket for tracking

**Environment Variables Required:**
| Variable | Description |
|----------|-------------|
| `QBO_CLIENT_ID` | From QuickBooks Developer Portal |
| `QBO_CLIENT_SECRET` | From QuickBooks Developer Portal |
| `QBO_REDIRECT_URI` | `https://unicorn-one.vercel.app/api/qbo/callback` |
| `QBO_ENVIRONMENT` | `sandbox` or `production` |

**QuickBooks Developer Portal Setup:**
1. Create app at [developer.intuit.com](https://developer.intuit.com)
2. Get Client ID and Client Secret from Keys & credentials
3. Add Redirect URI: `https://unicorn-one.vercel.app/api/qbo/callback`
4. Use Sandbox keys for testing, Production keys for live

**API Endpoints:**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/qbo/auth` | GET | Initiate OAuth, returns auth URL |
| `/api/qbo/callback` | GET | OAuth callback, stores tokens |
| `/api/qbo/create-invoice` | POST | Create invoice from ticket |
| `/api/qbo/customers` | GET/POST | Search or create QBO customers |

**Database Tables:**
| Table | Purpose |
|-------|---------|
| `qbo_auth_tokens` | OAuth tokens (access, refresh, expiry, realm_id) |
| `qbo_customer_mapping` | Links contacts to QBO customer IDs |

**Service Ticket QBO Fields:**
- `qbo_invoice_id` - QuickBooks invoice ID after export
- `qbo_invoice_number` - Invoice number (e.g., "1042")
- `qbo_synced_at` - When invoice was created
- `qbo_sync_status` - pending, synced, failed
- `qbo_sync_error` - Error message if failed

**Key Files:**
| Purpose | File |
|---------|------|
| OAuth initiation | `api/qbo/auth.js` |
| OAuth callback | `api/qbo/callback.js` |
| Invoice creation | `api/qbo/create-invoice.js` |
| Customer management | `api/qbo/customers.js` |
| Frontend service | `src/services/quickbooksService.js` |

**NPM Dependency:** `intuit-oauth` (official Intuit OAuth library)

---

## Key Database Tables

| Table | Purpose |
|-------|---------|
| `projects` | Project records |
| `wire_drops` | Cable drop locations |
| `wire_drop_stages` | Stage completion tracking |
| `project_shades` | Shade measurements (M1/M2 fields) |
| `shade_photos` | Shade verification photos with SharePoint metadata |
| `project_equipment` | Equipment per project |
| `global_parts` | Master parts catalog |
| `purchase_orders` | PO headers |
| `purchase_order_items` | PO line items |
| `issues` | Problems/issues |
| `contacts` | People |
| `suppliers` | Vendors |
| `project_secure_data` | **ENCRYPTED** - Project credentials (passwords, usernames, etc.) |
| `contact_secure_data` | **ENCRYPTED** - Contact credentials (gate codes, etc.) |
| `service_tickets` | Service ticket records |
| `service_schedules` | Scheduled service appointments |
| `service_call_logs` | Call history and notes |
| `service_schedule_confirmations` | Customer confirmation tokens |
| `qbo_auth_tokens` | QuickBooks OAuth tokens |
| `qbo_customer_mapping` | Contact to QBO customer ID mapping |

### Secure Data Tables (Encrypted)

The `project_secure_data` and `contact_secure_data` tables store sensitive credentials with field-level encryption.

**⚠️ NEVER query these tables directly for sensitive fields!**

| Operation | Correct Approach |
|-----------|------------------|
| **READ** | Use `project_secure_data_decrypted` or `contact_secure_data_decrypted` views |
| **INSERT** | Use `create_project_secure_data()` or `create_contact_secure_data()` RPC |
| **UPDATE** | Use `update_project_secure_data()` or `update_contact_secure_data()` RPC |
| **DELETE** | Direct DELETE is fine (no encryption involved) |

See [Secure Data Encryption Implementation](#secure-data-encryption-implementation-workstream-1) in CHANGELOG for full details.

---

## Key Files to Know

| Purpose | File |
|---------|------|
| Wire drop logic | `src/services/wireDropService.js` |
| Milestone calculations | `src/services/milestoneService.js` |
| Equipment management | `src/services/projectEquipmentService.js` |
| Shade detail page | `src/components/Shades/ShadeDetailPage.js` |
| Shade photos service | `src/services/shadePhotoService.js` |
| Auth context | `src/contexts/AuthContext.js` |
| Theme context | `src/contexts/ThemeContext.js` |
| Style system | `src/styles/styleSystem.js` |
| Main PM view | `src/components/PMProjectViewEnhanced.js` |
| Wire drop detail | `src/components/WireDropDetailEnhanced.js` |
| Date input component | `src/components/ui/DateInput.js` |
| Todo detail modal | `src/components/TodoDetailModal.js` |
| Calendar service | `src/services/microsoftCalendarService.js` |
| Knowledge service | `src/services/knowledgeService.js` |
| Knowledge management UI | `src/components/knowledge/KnowledgeManagementPanel.js` |
| Lutron shade knowledge | `src/data/lutronShadeKnowledge.js` |
| **Service ticket service** | `src/services/serviceTicketService.js` |
| **Weekly planning service** | `src/services/weeklyPlanningService.js` |
| **Service dashboard** | `src/components/Service/ServiceDashboard.js` |
| **Weekly planning page** | `src/pages/WeeklyPlanning.js` |
| **Week calendar grid** | `src/components/Service/WeekCalendarGrid.jsx` |
| **Unscheduled tickets panel** | `src/components/Service/UnscheduledTicketsPanel.jsx` |
| **Technician filter bar** | `src/components/Service/TechnicianFilterBar.jsx` |
| **QuickBooks service** | `src/services/quickbooksService.js` |

#### 8.11 Retell AI Phone System (Sarah)

A 24/7 AI-powered phone assistant named "Sarah" that handles inbound customer service calls, identifies customers, runs network diagnostics, and creates service tickets automatically.

**Important:** This is separate from the in-app Gemini Voice AI Agent. Sarah handles external phone calls via Retell AI platform.

##### Architecture Overview

```
┌─────────────┐     ┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Phone     │────▶│  Retell AI  │────▶│  Sarah (LLM)     │────▶│ Custom Tools│
│   Call      │     │  Platform   │     │  Claude-based    │     │ (Vercel API)│
└─────────────┘     └─────────────┘     └──────────────────┘     └──────┬──────┘
                                                                       │
                          ┌────────────────────────────────────────────┘
                          ▼
        ┌─────────────────────────────────────────────────────────┐
        │                    Backend Services                      │
        ├─────────────────┬─────────────────┬─────────────────────┤
        │    Supabase     │  UniFi Site     │    Retell           │
        │    Database     │  Manager API    │    Webhook          │
        ├─────────────────┼─────────────────┼─────────────────────┤
        │ • Contacts      │ • Gateway status│ • Call transcript   │
        │ • Projects      │ • Device counts │ • AI summary        │
        │ • Tickets       │ • Client counts │ • Call duration     │
        │ • Network cache │ • WAN uptime    │ • Sentiment         │
        └─────────────────┴─────────────────┴─────────────────────┘
```

##### Retell AI Configuration

| Item | Value |
|------|-------|
| Agent ID | `agent_569081761d8bbd630c0794095d` |
| LLM ID | `llm_a897cdd41f9c7de05c5528a895b9` |
| Voice | ElevenLabs "Hailey" (friendly, professional) |
| Model | Claude (via Retell) |
| Webhook URL | `https://unicorn-one.vercel.app/api/retell/webhook` |

##### Call Flow Sequence

```
1. CALL RECEIVED
   │
   ▼
2. Sarah says: "Thank you for calling Intelligent Systems, one moment please."
   │
   ▼
3. TOOL: identify_customer({{caller_phone}})
   │  └─▶ Returns: name, email, projects, UniFi site ID, recent tickets
   │
   ▼
4. Sarah greets by name: "Hi Stacey, how can I help you today?"
   │
   ▼
5. CUSTOMER DESCRIBES ISSUE
   │
   ├─▶ If network/WiFi issue:
   │      │
   │      ▼
   │   TOOL: check_network(unifi_site_id)
   │      │  └─▶ Returns: gateway status, device counts, WAN uptime
   │      │  └─▶ CACHES diagnostics in retell_network_cache table
   │      │
   │      ▼
   │   Sarah reports findings: "I checked your network remotely..."
   │
   ▼
6. Sarah confirms email and scheduling preference
   │
   ▼
7. TOOL: create_ticket(title, description, category, unifi_site_id, ...)
   │  └─▶ Auto-includes cached network diagnostics as triage comments
   │  └─▶ Auto-includes UniFi Site Manager URL as clickable link
   │
   ▼
8. Sarah confirms: "Your ticket number is ST-20260101-1234"
   │
   ▼
9. Sarah asks: "Is there anything else I can help with?"
   │
   ▼
10. TOOL: end_call() - Properly disconnects
    │
    ▼
11. WEBHOOK: call_analyzed event
    └─▶ Stores transcript, AI summary, duration in service_tickets
```

##### Custom Tools (Vercel API Endpoints)

**1. identify_customer**
- **Endpoint:** `POST /api/retell/identify`
- **Purpose:** Look up customer by phone number
- **Database Function:** `find_customer_by_phone()`

**Input:**
```json
{"phone_number": "+13175551234"}
```

**Output:**
```json
{
  "found": true,
  "customer": {
    "name": "Stacey Blansette",
    "email": "stacey@email.com",
    "phone": "3173136608",
    "address": "123 Main St, Carmel IN"
  },
  "projects": [{
    "name": "Blansette Residence",
    "unifi_site_id": "74ACB93B...",
    "team": {"pm": "Steve", "lead_tech": "John"}
  }],
  "sla": {"tier": "Premium", "response_hours": 4},
  "recent_tickets": [...]
}
```

**Matching Logic:**
1. Normalize phone (strip non-digits, remove leading 1)
2. Find contact with matching phone
3. Find projects where `projects.client` matches contact name or company
4. Only matches projects where `client` field is non-empty (prevents false matches)

**2. check_network**
- **Endpoint:** `POST /api/retell/check-network`
- **Purpose:** Real-time UniFi network diagnostics

**Input:**
```json
{"unifi_site_id": "74ACB93B59570000000004ACC6540000000004E1D1DD000000005EB714C1:1557506879"}
```

**Output:**
```json
{
  "checked": true,
  "online": true,
  "healthy": true,
  "message": "The network looks healthy. 5 devices connected, everything online.",
  "triage_summary": "=== NETWORK DIAGNOSTICS ===\nStatus: ONLINE (Healthy)\nGateway: UDMPRO..."
}
```

**Data from UniFi Site Manager API:**
- Gateway status (online/offline, model)
- Device counts (total, offline, pending updates)
- Client counts (WiFi, wired, guest)
- WAN uptime percentage
- External IP address and ISP name
- WiFi retry rate
- Critical alerts

**Caching:** Results stored in `retell_network_cache` table (15-min TTL) for auto-inclusion in tickets.

**3. create_ticket**
- **Endpoint:** `POST /api/retell/create-ticket`
- **Purpose:** Create service ticket with auto-enrichment

**Input:**
```json
{
  "title": "WiFi dropping intermittently",
  "description": "Customer reports WiFi disconnects...",
  "category": "network",
  "priority": "medium",
  "customer_name": "Stacey Blansette",
  "customer_phone": "3173136608",
  "customer_email": "stacey@email.com",
  "preferred_time": "Monday morning",
  "unifi_site_id": "74ACB93B..."
}
```

**Auto-Enrichment (for network issues):**
When `unifi_site_id` is provided, the endpoint automatically:
1. Fetches cached diagnostics from `retell_network_cache`
2. Adds diagnostics as triage comment (author: "Sarah (AI Phone Agent)")
3. Adds UniFi Site Manager URL as clickable triage comment

**Category Mapping:**
| LLM Says | Maps To |
|----------|---------|
| audio, video, tv, speaker | av |
| wifi, internet, router | network |
| keypad, switch, dimmer, lutron | lighting |
| shade, blind | shades |
| control4, crestron, automation | control |
| (anything else) | general |

**Ticket Number Format:** `ST-YYYYMMDD-XXXX` (e.g., ST-20260101-1234)

**4. end_call**
- **Type:** Built-in Retell tool
- **Purpose:** Properly disconnect when conversation complete

##### Webhook Integration

**Endpoint:** `POST /api/retell/webhook`
**Events Processed:** `call_analyzed` only (ignores `call_ended` to prevent duplicates)

**What the webhook captures:**
| Field | Storage Location |
|-------|------------------|
| Full transcript | `service_tickets.call_transcript` |
| AI-generated summary | `service_tickets.call_summary` |
| Call duration | `service_tickets.call_duration_seconds` |
| Call ID | `service_tickets.source_reference` |

**Transcript Format:**
```
Sarah: Thank you for calling Intelligent Systems, one moment please.

Sarah: Hi Stacey, how can I help you today?

Customer: I'm having a problem with my WiFi.

Sarah: I checked your network remotely, and everything looks healthy...
```

##### UI: Call Recording Section

Service tickets with `source = 'phone_ai'` display a collapsible "Call Recording" section:

- **Badge:** Shows call duration (e.g., "1:10")
- **AI Summary:** Condensed version of the call
- **Full Transcript:** Scrollable, monospace, max 384px height
- **Collapsed by default** to keep ticket view clean

##### Database Tables for Retell

**retell_network_cache** - Temporary diagnostics storage
```sql
CREATE TABLE retell_network_cache (
    site_id TEXT PRIMARY KEY,
    diagnostics TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Auto-cleanup trigger removes entries older than 15 minutes
```

**service_tickets** - Additional columns for phone calls
| Column | Type | Purpose |
|--------|------|---------|
| source | text | 'phone_ai' for Retell calls |
| source_reference | text | Retell call_id |
| call_transcript | text | Full conversation |
| call_summary | text | AI-generated summary |
| call_duration_seconds | integer | Call length |

**retell_call_logs** - Full call history
| Column | Purpose |
|--------|---------|
| call_id | Retell's unique ID |
| from_number, to_number | Phone numbers |
| direction | inbound/outbound |
| duration_seconds | Call length |
| transcript | Full conversation |
| call_summary | AI summary |
| user_sentiment | positive/neutral/frustrated/angry |
| call_successful | boolean |

##### LLM Prompt (Current)

```
# Sarah - Intelligent Systems Phone Assistant

## CALL START SEQUENCE (FOLLOW EXACTLY)
1. FIRST say: "Thank you for calling Intelligent Systems, one moment please."
2. THEN call identify_customer with {{caller_phone}}
3. AFTER you get the result, greet them by name: "Hi [name], how can I help you today?"

## HANDLING ISSUES
Listen carefully. Ask ONE clarifying question if needed.
For network/WiFi issues: Call check_network with unifi_site_id. Tell customer what you found.

## CATEGORIES
- network: WiFi, internet, connectivity
- av: TV, speakers, display, audio
- lighting: Keypads, switches, dimmers, buttons
- control: Control4, Crestron, automation
- shades: Motorized blinds
- wiring: Cables, ethernet
- general: Other

Keypads/switches = lighting (not control)

## CREATING TICKET
Confirm email and preferred timing.
Pass unifi_site_id for network issues (auto-includes diagnostics).
Confirm ticket number on success.

## ENDING
Ask if anything else. If no, thank them and use end_call.

## STYLE
Warm, natural, brief. No specific times or pricing.
```

##### Tool Configuration

**speak_during_execution vs speak_after_execution:**
| Setting | Value | Effect |
|---------|-------|--------|
| `speak_during_execution` | `false` | Sarah stays silent while tool runs |
| `speak_after_execution` | `true` | Sarah speaks after receiving result |

Set `speak_during_execution: false` for identify_customer so Sarah waits for results before greeting.

##### Testing

**Web Test Interface:** `https://unicorn-one.vercel.app/service/ai-test`
- Enter phone number for caller ID simulation
- Uses browser microphone
- Shows real-time transcript

**API Testing:**
```bash
# Test customer lookup
curl -X POST 'https://unicorn-one.vercel.app/api/retell/identify' \
  -H 'Content-Type: application/json' \
  -d '{"phone_number": "+13173136608"}'

# Test network diagnostics
curl -X POST 'https://unicorn-one.vercel.app/api/retell/check-network' \
  -H 'Content-Type: application/json' \
  -d '{"unifi_site_id": "74ACB93B..."}'
```

##### Updating Sarah (MCP vs Direct API)

**Use MCP Server (retellai-mcp-server) when:**
- Listing agents, calls, phone numbers
- Getting call details and transcripts
- Quick lookups and queries
- Working interactively in Claude

**Use Direct API when:**
- Updating LLM prompts (complex JSON)
- Configuring tool schemas
- Setting tool execution options
- Batch operations

**Update Prompt:**
```bash
curl -X PATCH 'https://api.retellai.com/update-retell-llm/llm_a897cdd41f9c7de05c5528a895b9' \
  -H 'Authorization: Bearer {RETELL_API_KEY}' \
  -H 'Content-Type: application/json' \
  -d '{"general_prompt": "..."}'
```

**Update Agent Settings:**
```bash
curl -X PATCH 'https://api.retellai.com/update-agent/agent_569081761d8bbd630c0794095d' \
  -H 'Authorization: Bearer {RETELL_API_KEY}' \
  -H 'Content-Type: application/json' \
  -d '{"voice_id": "...", "webhook_url": "..."}'
```

##### Files Reference

| File | Purpose |
|------|---------|
| `api/retell/identify.js` | Customer lookup endpoint |
| `api/retell/create-ticket.js` | Ticket creation with auto-enrichment |
| `api/retell/check-network.js` | UniFi diagnostics + caching |
| `api/retell/webhook.js` | Transcript capture from Retell |
| `src/pages/service/AITestPage.js` | Web-based call testing |
| `src/components/Service/ServiceTicketDetail.js` | Call Recording UI section |
| `src/components/Service/ServiceTriageForm.js` | Triage comments with clickable URLs |

##### Common Issues and Solutions

| Issue | Solution |
|-------|----------|
| Tool not being called | Make tool description clear: "Call FIRST before speaking" |
| LLM not including data in ticket | Use backend caching + auto-include (don't rely on LLM to copy) |
| Greeting sounds awkward | Set `speak_during_execution: false` |
| Wrong category assigned | Add explicit examples in prompt: "Keypads = lighting, NOT control" |
| Database constraint error | Map LLM values to valid constraint values in API |
| Duplicate transcripts | Only process `call_analyzed` event, ignore `call_ended` |
| URLs not clickable | Use `linkifyContent()` helper in triage comment display |

##### Environment Variables

| Variable | Purpose |
|----------|---------|
| `RETELL_API_KEY` | Retell API authentication |
| `UNIFI_API_KEY` | UniFi Site Manager API |
| `SUPABASE_URL` | Database connection |
| `SUPABASE_SERVICE_ROLE_KEY` | Database auth for API routes |

---

# PART 2: HOW TO WORK ON THIS APP

## Project Structure

```
unicorn/
├── src/
│   ├── components/         # React components
│   ├── services/           # Business logic
│   ├── contexts/           # React contexts
│   ├── hooks/              # Custom hooks
│   ├── lib/                # Utilities
│   ├── styles/             # Style system
│   └── config/             # Configuration
├── api/                    # Vercel serverless functions
├── database/
│   ├── migrations/         # SQL migrations
│   └── scripts/            # SQL utilities
├── docs/                   # Documentation (UPDATE AFTER CHANGES)
└── AGENT.md                # This file
```

### File Location Rules

| Creating... | Put in... |
|-------------|-----------|
| React component | `src/components/` |
| Service class | `src/services/` |
| API endpoint | `api/` |
| SQL migration | `database/migrations/` |
| Documentation | `docs/` |

### NEVER
- ❌ Create files in root directory
- ❌ Create .md files outside `docs/`
- ❌ Create .sql files outside `database/`
- ❌ Create duplicate components (V2, New, etc.)

---

## Styling System

### Use ZINC, Not GRAY

```jsx
// ✅ CORRECT
bg-zinc-50 dark:bg-zinc-950
bg-white dark:bg-zinc-900
text-zinc-900 dark:text-zinc-100
text-zinc-600 dark:text-zinc-400
border-zinc-200 dark:border-zinc-700

// ❌ WRONG
bg-gray-50    // Never use gray!
bg-gray-900   // Never use gray!
```

### Dark Mode Required

Every color MUST have a `dark:` variant:

```jsx
// ✅ CORRECT
className="bg-white dark:bg-zinc-900"
className="text-zinc-900 dark:text-zinc-100"

// ❌ WRONG
className="bg-white"              // Missing dark!
className="text-zinc-900"         // Missing dark!
```

### Brand Colors - CRITICAL

**⚠️ DO NOT USE Tailwind's green/emerald classes for success states!**

| Purpose | Color | Usage |
|---------|-------|-------|
| Primary | `#8B5CF6` | `violet-500`, `violet-600` (hover) |
| Success | `#94AF32` | **INLINE STYLES ONLY** - see below |
| Warning | `#F59E0B` | `amber-500` |
| Danger | `#EF4444` | `red-500` |
| Info | `#3B82F6` | `blue-500` |

### ⚠️ SUCCESS/GREEN COLOR - MUST USE BRAND OLIVE GREEN

**NEVER use these Tailwind classes:**
- ❌ `text-green-*` (any shade)
- ❌ `bg-green-*` (any shade)
- ❌ `text-emerald-*` (any shade)
- ❌ `bg-emerald-*` (any shade)
- ❌ `#10B981`, `#22c55e`, `#16a34a` (emerald/green hex codes)

**ALWAYS use brand olive green `#94AF32`:**
```jsx
// ✅ CORRECT - Use inline styles for success/green
style={{ color: '#94AF32' }}
style={{ backgroundColor: 'rgba(148, 175, 50, 0.15)', color: '#94AF32' }}
style={{ accentColor: '#94AF32' }}  // for checkboxes

// ✅ CORRECT - Import from styleSystem
import { brandColors, stakeholderColors } from '../styles/styleSystem';
style={{ color: brandColors.success }}  // '#94AF32'

// ❌ WRONG - Tailwind green/emerald classes
className="text-green-600 bg-green-100"
className="text-emerald-500 bg-emerald-100"
```

**When to use brand olive green (#94AF32):**
- Completed/success status badges
- Received/installed indicators
- Checkmarks for completion
- External stakeholder indicators
- Progress bars at 75-99%
- Any "positive" state that isn't 100% complete

**Reference:** `src/styles/styleSystem.js` contains:
- `brandColors.success` = `#94AF32`
- `stakeholderColors.external.text` = `#94AF32`

---

## UI/UX Principles

### Clean UI - Hide Destructive Actions
**Delete buttons should be hidden from list views.** Place them inside edit/detail modals only.

```jsx
// ✅ CORRECT - Delete button inside edit modal (only visible when editing)
{showModal && (
  <div className="modal">
    <form>
      {/* form fields */}

      <div className="flex justify-between">
        {editingItem && (
          <Button variant="danger" onClick={handleDelete} icon={Trash2}>
            Delete
          </Button>
        )}
        <div className="flex gap-3 ml-auto">
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button variant="primary" type="submit">Save</Button>
        </div>
      </div>
    </form>
  </div>
)}

// ❌ WRONG - Delete button visible in list view
<div className="flex gap-2">
  <button onClick={handleEdit}><Edit /></button>
  <button onClick={handleDelete}><Trash2 /></button>  {/* NO! Hide this */}
</div>
```

### Clickable Avatars for Edit
Instead of separate edit buttons, make the avatar/icon clickable to open edit mode:

```jsx
// ✅ CORRECT - Avatar opens edit modal
<button
  onClick={() => handleEdit(item)}
  className="w-16 h-16 rounded-full transition-transform hover:scale-105 active:scale-95"
>
  <User className="w-8 h-8" />
</button>

// ❌ WRONG - Separate edit button clutters UI
<div className="flex gap-2">
  <div className="w-12 h-12 rounded-full"><User /></div>
  <button onClick={handleEdit}><Edit /></button>
</div>
```

### Inline Links (Not Block)
Clickable links should only span the text width, not the full container:

```jsx
// ✅ CORRECT - Inline link (clickable area = text only)
<div>
  <a href={`mailto:${email}`} className="inline text-violet-600 hover:underline">
    {email}
  </a>
</div>

// ❌ WRONG - Block link (entire row is clickable)
<a href={`mailto:${email}`} className="block text-violet-600">
  {email}
</a>
```

### Client-Side Search Filtering
For lists under ~500 items, filter client-side for instant response:

```jsx
// ✅ CORRECT - Fetch once, filter in memory
const { contacts: allContacts } = useContacts();

const filteredContacts = useMemo(() => {
  const term = searchTerm.toLowerCase();
  return allContacts.filter(c => c.name?.toLowerCase().includes(term));
}, [allContacts, searchTerm]);

// ❌ WRONG - Server query on every keystroke (causes page refresh feel)
const { contacts } = useContacts({ search: searchTerm });
```

---

## Component Patterns

### Card
```jsx
<div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-sm p-4">
```

### Primary Button
```jsx
<button className="px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg font-medium transition-colors">
```

### Secondary Button
```jsx
<button className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-600 rounded-lg transition-colors">
```

### Text Input
```jsx
<input className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500" />
```

### Date Input - Use DateInput Component
**Always use the `DateInput` component for date fields.** It handles:
- Empty state: Grey background with "—" dash placeholder
- Filled state: Normal white/dark background with date value
- Prevents Safari/browser from showing past dates in red
- Consistent styling across light/dark modes

```jsx
import DateInput from './ui/DateInput';

// ✅ CORRECT - Use DateInput component
<DateInput
  value={dueDate}
  onChange={(e) => setDueDate(e.target.value)}
  disabled={saving}
/>

// ❌ WRONG - Raw HTML date input (inconsistent styling, browser quirks)
<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
```

**DateInput Styling Standards:**
- Empty: `bg-zinc-100 dark:bg-zinc-800` with grey dash "—"
- Filled: `bg-white dark:bg-zinc-700` with normal text
- NO orange/red backgrounds for empty or past dates
- Overrides WebKit datetime styling to prevent browser color changes

### Time Input
Time inputs should be wide enough to display the time clearly:

```jsx
// ✅ CORRECT - Wide enough, 16px font for iOS
<input
  type="time"
  value={startTime}
  onChange={(e) => setStartTime(e.target.value)}
  disabled={!dateIsSet}
  className={`w-32 px-3 py-2 border rounded-lg focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 ${
    !dateIsSet
      ? 'border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed'
      : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50'
  }`}
  style={{ fontSize: '16px' }}  // Prevents iOS zoom
/>

// ❌ WRONG - Too narrow, no iOS zoom prevention
<input type="time" className="w-24 px-2 py-2" />
```

### Calendar Scheduling Section (for Todos)
When displaying calendar-related fields (Do Date, Start Time, Duration), group them in a dedicated section:

```jsx
<div className="p-4 rounded-xl border" style={{ borderColor: styles.card.borderColor, backgroundColor: withAlpha(palette.info, 0.05) }}>
  <div className="flex items-center gap-2 mb-3">
    <CalendarPlus size={18} style={{ color: palette.info }} />
    <span className="text-sm font-medium" style={styles.textPrimary}>
      Calendar Scheduling
    </span>
  </div>
  <div className="grid gap-4 grid-cols-3">
    <div>
      <label className="block text-xs font-medium mb-1.5" style={styles.textSecondary}>Do Date</label>
      <DateInput value={doBy} onChange={(e) => setDoBy(e.target.value)} />
    </div>
    <div>
      <label className="block text-xs font-medium mb-1.5" style={styles.textSecondary}>Start Time</label>
      <input type="time" ... />
    </div>
    <div>
      <label className="block text-xs font-medium mb-1.5" style={styles.textSecondary}>Duration (hrs)</label>
      <input type="number" ... />
    </div>
  </div>
</div>
```

### Status Badges
```jsx
// Success - USE INLINE STYLES with brand olive green (#94AF32)
<span
  className="px-2 py-1 rounded-full text-xs font-medium"
  style={{ backgroundColor: 'rgba(148, 175, 50, 0.15)', color: '#94AF32' }}
>
  Completed
</span>

// Warning - Tailwind amber is OK
<span className="px-2 py-1 bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-full text-xs font-medium">

// Error - Tailwind red is OK
<span className="px-2 py-1 bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 rounded-full text-xs font-medium">

// ❌ WRONG - Never use emerald/green Tailwind classes!
<span className="bg-emerald-100 text-emerald-700">  // NO!
<span className="bg-green-100 text-green-700">     // NO!
```

### Collapsible Sections
```jsx
// Layout: [Icon][Title] .............. [Badge][gap][Chevron]
// - Title only, NO descriptions
// - No gray backgrounds - use style={styles.card}
// - Badge (if any) on RIGHT, before chevron
// - ChevronRight rotates 90° when open
<button
  onClick={() => toggleSection('sectionName')}
  className="w-full flex items-center justify-between rounded-2xl border p-4 transition-all duration-200 hover:shadow-md"
  style={styles.card}
>
  <div className="flex items-center gap-3">
    <Icon size={20} style={styles.textPrimary} />
    <span className="font-medium" style={styles.textPrimary}>Title</span>
  </div>
  <div className="flex items-center gap-3">
    {count > 0 && (
      <span className="px-2 py-0.5 text-xs rounded-full" style={styles.badge}>
        {count}
      </span>
    )}
    <ChevronRight
      size={20}
      className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
      style={styles.textSecondary}
    />
  </div>
</button>

{/* Expanded content */}
{isExpanded && (
  <div className="mt-4 rounded-2xl border p-4" style={styles.card}>
    {/* content */}
  </div>
)}
```

### Dropdown / Select
```jsx
<select
  value={selectedValue}
  onChange={(e) => setSelectedValue(e.target.value)}
  className="rounded-lg border px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
  style={{
    backgroundColor: mode === 'dark' ? '#0F172A' : '#FFFFFF',
    borderColor: mode === 'dark' ? '#1F2937' : '#D1D5DB'
  }}
>
  <option value="all">All Items</option>
  <option value="option1">Option 1</option>
</select>
```

### Navigation Link Buttons
```jsx
// Used for Equipment List, Receiving, Secure Data navigation
<button
  onClick={() => navigate(`/projects/${projectId}/equipment`)}
  className="flex items-center justify-between rounded-2xl border p-4 transition-all duration-200 hover:shadow-md group"
  style={styles.card}
>
  <div className="flex items-center gap-3">
    <Package size={20} style={styles.textPrimary} />
    <span className="font-medium" style={styles.textPrimary}>Equipment List</span>
  </div>
  <ChevronRight size={18} className="transition-transform group-hover:translate-x-1" style={styles.textSecondary} />
</button>
```

### Map Links - Use Apple Maps URLs
**Always use Apple Maps URLs for address links.** They open in the user's default maps app on iOS/macOS (usually Apple Maps), while still working on other platforms via browser.

```jsx
// ✅ CORRECT - Apple Maps URL (opens in default maps app on iOS/macOS)
const getMapUrl = (address) => {
  const encoded = encodeURIComponent(address);
  return `https://maps.apple.com/?q=${encoded}`;
};

// ❌ WRONG - Google Maps URL (always opens Google, not user's default)
const getMapUrl = (address) => {
  const encoded = encodeURIComponent(address);
  return `https://maps.google.com/?q=${encoded}`;  // NO!
};
```

### List Item with Clickable Avatar (People/Contacts Pattern)
```jsx
// Avatar is clickable to open edit modal - NO separate edit button in list
// Contact info (email, phone, address) are inline clickable links
<div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
  <div className="flex items-start gap-4">
    <button
      onClick={() => handleEdit(person)}
      className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 transition-transform hover:scale-105 active:scale-95"
      style={{ backgroundColor: `${accentColor}20` }}
    >
      <User className="w-8 h-8" style={{ color: accentColor }} />
    </button>
    <div className="flex-1 min-w-0">
      <h3 className="font-semibold text-zinc-900 dark:text-white">{name}</h3>
      <p className="text-sm" style={{ color: accentColor }}>{role}</p>
      <div className="mt-2 space-y-1">
        {/* Links are INLINE - clickable area is only the text width */}
        <div><a href={`mailto:${email}`} className="inline text-sm text-violet-600 hover:underline">{email}</a></div>
        <div><a href={`tel:${phone}`} className="inline text-sm text-violet-600 hover:underline">{phone}</a></div>
        <div><a href={mapUrl} className="inline text-sm text-violet-600 hover:underline">{address}</a></div>
      </div>
    </div>
  </div>
</div>
```

### Mobile-Responsive List Items
```jsx
// For equipment/parts lists on mobile - name on top, actions below
<div className="px-3 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-xl transition">
  {/* Top row: Chevron + Name */}
  <div className="flex items-center gap-3">
    <button className="flex-shrink-0 text-gray-400">
      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
    </button>
    <div className="flex-1 min-w-0">
      <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{item.name}</p>
    </div>
  </div>

  {/* Bottom row: Status/Actions (indented under name) */}
  <div className="flex items-center gap-4 mt-2 ml-7">
    <label className="inline-flex items-center gap-1.5 text-xs">
      <input type="checkbox" className="h-4 w-4 rounded" />
      <span className="font-medium">Status</span>
    </label>
  </div>
</div>
```

### Page Container
```jsx
// Standard full-width page container
<div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
  <div className="max-w-7xl mx-auto px-4 py-6">
    {/* page content */}
  </div>
</div>
```

### Shade Detail Page Layout
The ShadeDetailPage follows a specific layout order. **Do not reorder these sections:**

```
1. Header (Shade Name + Room)
2. Quoted Specs (from Lutron CSV - read only)
3. Installation & Pockets (mount depth, pocket dimensions)
4. Final Ordered Dimensions (computed from M1/M2)
5. Install Photos (photo gallery with upload)
6. Comments (collapsible section, NOT a tab)
7. Measure 1 / Measure 2 Tabs (at the bottom)
   - Width: 3 fields (Top, Middle, Bottom)
   - Height: 1 field (single measurement)
   - Mount Depth
   - Mark Complete button (toggleable)
```

**Key Requirements:**
- Use full page, NOT a modal (modals have scroll/accessibility issues on mobile)
- All fields auto-save (no save button needed)
- Mark Complete is a toggleable button (can undo completion)
- Photos use `shade_photos` table for proper metadata storage
- Comments section is collapsible (not a tab)

### AppHeader - Page Title & Back Button
The AppHeader component (`src/components/AppHeader.js`) handles the top navigation bar globally.

**DO NOT create custom back buttons or page titles in page components.** The AppHeader:
- Automatically shows a back button for all pages except `/`, `/pm-dashboard`, `/login`
- Displays the page title based on the current route

**When adding a new page:**
1. Add a route mapping in `AppHeader.js` inside the `pageTitle` useMemo:
```jsx
// In AppHeader.js pageTitle useMemo
if (p.startsWith('/your-new-page')) return 'Your Page Title';
```

2. Your page component should NOT include:
   - Custom back buttons (AppHeader handles this)
   - Page title headers (AppHeader displays the title)

3. Your page CAN include:
   - Subtitle/context info (e.g., project name)
   - Status indicators
   - Page-specific controls

```jsx
// ✅ CORRECT - Let AppHeader handle back button and title
const MyPage = () => {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 pb-20">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Optional: context info like project name */}
        <p className="text-zinc-600 dark:text-zinc-400 mb-6">Project: {projectName}</p>
        {/* Page content */}
      </div>
    </div>
  );
};

// ❌ WRONG - Don't duplicate back button or page title
const MyPage = () => {
  return (
    <div>
      <button onClick={() => navigate(-1)}>← Back</button>  {/* NO! */}
      <h1>My Page Title</h1>  {/* NO! AppHeader shows this */}
    </div>
  );
};
```

### Progress Colors
```jsx
const getProgressColor = (pct) => {
  if (pct === 100) return '#8B5CF6'; // violet
  if (pct >= 75) return '#94AF32';   // olive/success
  if (pct >= 50) return '#3B82F6';   // blue
  if (pct >= 25) return '#F59E0B';   // amber
  return '#EF4444';                   // red
};
```

---

## Database Rules

### Timestamp + User Tracking - MANDATORY

**⚠️ CRITICAL: Every timestamp field MUST have a corresponding user field!**

When setting any `*_at` timestamp field, you MUST also capture the authenticated user in a corresponding `*_by` field.

---

#### ⚠️ IMPORTANT: MSAL Auth vs Supabase Auth

**This app uses Microsoft MSAL for authentication, NOT Supabase Auth!**

This means:
- `supabase.auth.getUser()` will ALWAYS return `null`
- You MUST get the user from React's `useAuth()` hook in components
- You MUST pass the user ID explicitly from components to services

```javascript
// ❌ WRONG - This will ALWAYS be null in our app!
const { data: { user } } = await supabase.auth.getUser();
// user is null because we use MSAL, not Supabase Auth

// ✅ CORRECT - Get user from MSAL auth context in component
import { useAuth } from '../contexts/AuthContext';

const MyComponent = () => {
  const { user } = useAuth();  // MSAL user from Microsoft Graph

  // user.id = Microsoft Graph user ID (UUID)
  // user.displayName = "Steve Blansette" (display name from Microsoft)

#### ⚠️ DATABASE RULE: NO Foreign Keys to auth.users!
Since we use Microsoft (MSAL) User IDs, they are **NOT** present in Supabase's `auth.users` table.

- **❌ NEVER** create a foreign key to `auth.users` (e.g. `references auth.users(id)`)
- **✅ ALWAYS** just store the UUID as `uuid` (e.g. `created_by uuid`)
- The app handles the user linking; the database should just store the ID.

  const handleAction = async () => {
    // Pass user explicitly to service functions
    await myService.updateSomething(itemId, user.id);
  };
};
```

---

#### User ID Storage: UUID vs Display Name

**⚠️ CRITICAL: Different tables store user info differently!**

| Table | Field | Stores | Example Value |
|-------|-------|--------|---------------|
| `project_equipment` | `*_by` fields | UUID | `abc123-def456-...` |
| `purchase_orders` | `*_by` fields | UUID | `abc123-def456-...` |
| `purchase_order_items` | `received_by` | UUID | `abc123-def456-...` |
| `wire_drop_stages` | `completed_by` | **DISPLAY NAME** | `"Steve Blansette"` |
| `profiles` | `id` | UUID | `abc123-def456-...` |

**Why does `wire_drop_stages.completed_by` store display name?**
- Historical design decision for simpler UI display
- When checking a wire drop stage checkbox, the display name is stored directly
- This avoids a lookup when displaying "Completed by: Steve Blansette"

**How to detect UUID vs Display Name:**
```javascript
// Check if value looks like a UUID (36 chars with dashes in specific positions)
const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

if (isUUID) {
  // Look up display name from profiles table
  const { data } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', value)
    .single();
  displayName = data?.full_name || data?.email || 'Unknown User';
} else {
  // It's already a display name - use directly
  displayName = value;
}
```

---

#### Fallback User Lookups for Auto-Completed Status

When equipment status is auto-completed by another part of the system (e.g., Installed status derived from wire drop completion), the direct `*_by` field may be null. You MUST implement fallback lookups.

**Example: Equipment Status User Resolution**

```javascript
// In DateDetailModal or similar component showing "Completed by: ___"

const resolveUserForStatus = async (equipmentId, statusType) => {
  // 1. First try the direct field on project_equipment
  const { data: equipment } = await supabase
    .from('project_equipment')
    .select(`${statusType}_by`)
    .eq('id', equipmentId)
    .single();

  if (equipment?.[`${statusType}_by`]) {
    return await lookupUserName(equipment[`${statusType}_by`]);
  }

  // 2. Fallback lookups based on status type
  switch (statusType) {
    case 'ordered':
    case 'received':
      // Look in purchase_order_items -> purchase_orders
      const { data: poItems } = await supabase
        .from('purchase_order_items')
        .select('purchase_order_id')
        .eq('project_equipment_id', equipmentId);

      if (poItems?.length > 0) {
        const { data: po } = await supabase
          .from('purchase_orders')
          .select('submitted_by, created_by')
          .eq('id', poItems[0].purchase_order_id)
          .single();

        const userId = statusType === 'ordered'
          ? (po?.submitted_by || po?.created_by)
          : po?.created_by;

        if (userId) return await lookupUserName(userId);
      }
      break;

    case 'installed':
      // Look in wire_drop_stages via wire_drop_equipment_links
      const { data: links } = await supabase
        .from('wire_drop_equipment_links')
        .select('wire_drop_id')
        .eq('project_equipment_id', equipmentId);

      if (links?.length > 0) {
        const wireDropIds = links.map(l => l.wire_drop_id);
        const { data: stages } = await supabase
          .from('wire_drop_stages')
          .select('completed_by, completed_at')
          .eq('stage_type', 'trim_out')
          .eq('completed', true)
          .in('wire_drop_id', wireDropIds)
          .order('completed_at', { ascending: false })
          .limit(1);

        const completedBy = stages?.[0]?.completed_by;
        if (completedBy) {
          // IMPORTANT: Check if UUID or display name!
          const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(completedBy);
          if (isUUID) {
            return await lookupUserName(completedBy);
          } else {
            // Already a display name - return directly
            return completedBy;
          }
        }
      }
      break;
  }

  return null; // No user found
};
```

---

#### Profile Sync on Login

When users authenticate via MSAL, their profile is synced to Supabase's `profiles` table for audit trail lookups:

```javascript
// In AuthContext.js - loadUserProfile function
// This runs after successful MSAL authentication

const enrichedUser = {
  id: profile.id,           // Microsoft Graph user ID
  email: profile.mail,
  displayName: profile.displayName,
  // ... other fields
};

// Sync to Supabase for later lookups
await supabase
  .from('profiles')
  .upsert({
    id: enrichedUser.id,
    email: enrichedUser.email,
    full_name: enrichedUser.displayName,
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });
```

This ensures that UUID-based user lookups can resolve to display names even for users who haven't logged in recently.

---

#### Standard User Lookup Helper

Use this pattern when looking up user display names:

```javascript
const fetchUserName = async (uid, currentUser) => {
  if (!uid) return { name: null, found: false };

  // 1. If this is the current logged-in user, use their display name directly
  //    (avoids profile table lookup which may not be synced yet)
  if (currentUser?.id === uid && currentUser?.displayName) {
    return { name: currentUser.displayName, found: true };
  }

  // 2. Try to look up from profiles table
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', uid)
    .single();

  if (!error && data) {
    const resolvedName = data.full_name || data.email;
    if (resolvedName) {
      return { name: resolvedName, found: true };
    }
  }

  // 3. Fallback for current user if profile lookup failed
  if (currentUser?.id === uid) {
    return {
      name: currentUser.displayName || currentUser.email || 'Current User',
      found: true
    };
  }

  return { name: null, found: false };
};
```

---

#### Service Function Pattern

When writing service functions that update timestamps:

```javascript
// ✅ CORRECT - Accept userId as parameter
async updateStatus(equipmentId, status, userId) {
  if (!userId) {
    throw new Error('User ID is required for status updates');
  }

  const updates = {
    [`${status}_confirmed`]: true,
    [`${status}_confirmed_at`]: new Date().toISOString(),
    [`${status}_confirmed_by`]: userId  // Passed from component
  };

  return await supabase
    .from('project_equipment')
    .update(updates)
    .eq('id', equipmentId);
}

// ❌ WRONG - Trying to get user in service (will be null!)
async updateStatus(equipmentId, status) {
  const { data: { user } } = await supabase.auth.getUser();
  // user is ALWAYS null because we use MSAL!
}
```

---

**Standard field naming pattern:**
| Action Field | Timestamp Field | User Field |
|--------------|-----------------|------------|
| `completed` | `completed_at` | `completed_by` |
| `submitted` | `submitted_at` | `submitted_by` |
| `approved` | `approved_at` | `approved_by` |
| `received` | `received_at` / `received_date` | `received_by` |
| `delivered_confirmed` | `delivered_confirmed_at` | `delivered_confirmed_by` |
| `installed` | `installed_at` | `installed_by` |
| `cancelled` | `cancelled_at` | `cancelled_by` |
| N/A | `created_at` | `created_by` |
| N/A | `updated_at` | `updated_by` |

**Rules Summary:**
1. NEVER use `supabase.auth.getUser()` - it returns null (we use MSAL)
2. ALWAYS get user from `useAuth()` hook in components
3. ALWAYS pass userId explicitly from components to services
4. NEVER set a timestamp without also setting the corresponding user field
5. When displaying user info, check if value is UUID or display name
6. Implement fallback lookups for auto-completed statuses
7. Profile sync on login enables UUID → display name resolution

### RLS Policies - CRITICAL

We use MSAL (not Supabase Auth). ALL policies MUST include `anon`:

```sql
-- ✅ CORRECT
CREATE POLICY "name" ON public.table
FOR ALL TO anon, authenticated
USING (true);

-- ❌ WRONG (will silently fail!)
CREATE POLICY "name" ON public.table
FOR ALL TO authenticated  -- Missing anon!
USING (true);
```

### Migration Format
```sql
-- File: database/migrations/YYYY-MM-DD_description.sql
ALTER TABLE table ADD COLUMN IF NOT EXISTS col type;
```

---

## Documentation Rules

### MANDATORY: Update Docs After Every Change

| Change Type | Update File |
|-------------|-------------|
| New feature | `docs/PROJECT_OVERVIEW.md` |
| Wire drops | `docs/WIRE_DROPS.md` |
| Equipment | `docs/EQUIPMENT.md` |
| Procurement | `docs/PROCUREMENT.md` |
| Milestones | `docs/MILESTONES.md` |
| Auth/RLS | `docs/AUTHENTICATION.md` |
| Integrations | `docs/INTEGRATIONS.md` |
| Bug fix | `docs/TROUBLESHOOTING.md` |
| Styling | `docs/STYLES.md` |

### Update Format
```markdown
### Feature Name
**Changed:** YYYY-MM-DD
**Files:** `src/components/File.js`
Description of change.
```

---

## Code Standards

### React Component
```jsx
import { useState } from 'react';
import { Icon } from 'lucide-react';

const MyComponent = ({ prop }) => {
  const [state, setState] = useState(null);
  
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg p-4">
      {/* content */}
    </div>
  );
};

export default MyComponent;
```

### Service Class
```javascript
import { supabase } from '../lib/supabase';

class MyService {
  async getData() {
    const { data, error } = await supabase.from('table').select('*');
    if (error) throw error;
    return data;
  }
}

export const myService = new MyService();
```

---

## Environment Variables

```bash
REACT_APP_SUPABASE_URL=
REACT_APP_SUPABASE_ANON_KEY=
REACT_APP_AZURE_CLIENT_ID=
REACT_APP_AZURE_TENANT_ID=
REACT_APP_UNIFI_API_KEY=        # Optional
REACT_APP_LUCID_CLIENT_ID=      # Optional
REACT_APP_LUCID_CLIENT_SECRET=  # Optional

# QuickBooks Online Integration
QBO_CLIENT_ID=                  # From QuickBooks Developer Portal
QBO_CLIENT_SECRET=              # From QuickBooks Developer Portal
QBO_REDIRECT_URI=https://unicorn-one.vercel.app/api/qbo/callback
QBO_ENVIRONMENT=sandbox         # 'sandbox' or 'production'
```

---

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/unifi-proxy` | UniFi API proxy |
| `/api/lucid-proxy` | Lucid API proxy |
| `/api/graph-upload` | SharePoint upload |
| `/api/graph-file` | SharePoint download |
| `/api/sharepoint-thumbnail` | Get thumbnails |
| `/api/public-po` | Public PO view |
| `/api/azure-ai-search` | **PRIMARY** Azure AI Search for knowledge base (semantic search) |
| `/api/knowledge-upload` | (Legacy) Upload documents for RAG knowledge base |
| `/api/knowledge-process` | (Legacy) Process uploaded docs (extract, chunk, embed) |
| `/api/knowledge-search` | (Legacy) Semantic search via Supabase pgvector |
| `/api/qbo/auth` | QuickBooks OAuth initiation |
| `/api/qbo/callback` | QuickBooks OAuth callback |
| `/api/qbo/create-invoice` | Create invoice from service ticket |
| `/api/qbo/customers` | Search/create QuickBooks customers |

---

## Mobile App UX - CRITICAL

**⚠️ This is a MOBILE-FIRST app used by field technicians. It MUST behave like a native app, NOT a web page!**

### Core Principle

The app should feel solid and stable. Pages should NOT:
- Pan, scroll, or zoom unexpectedly
- Jump around when inputs receive focus
- Have double-tap delays
- Feel "web-like" with browser default behaviors

### Input Elements - Prevent iOS Zoom/Scroll

iOS Safari zooms in when the font size of an input is less than 16px. **Always use minimum 16px font size on inputs:**

```jsx
// ✅ CORRECT - Prevents iOS auto-zoom
<input
  type="number"
  inputMode="numeric"
  pattern="[0-9]*"
  className="..."
  style={{ fontSize: '16px' }}  // Critical for iOS!
/>

// ❌ WRONG - Will cause iOS zoom
<input
  type="number"
  className="text-sm"  // 14px - too small, causes zoom!
/>
```

### Viewport Meta Tag (index.html)

The viewport meta tag must include `maximum-scale=1.0` and `user-scalable=no` to prevent iOS Safari from zooming:

```html
<!-- In public/index.html -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
```

**Both are required:**
- 16px font on inputs prevents auto-zoom on focus
- Viewport meta prevents manual pinch-zoom and double-tap zoom

### Touch-Friendly Buttons

All buttons must be touch-friendly with proper event handling:

```jsx
// ✅ CORRECT - Mobile-optimized button
<button
  type="button"
  onTouchEnd={(e) => {
    e.preventDefault();  // Prevents double-firing
    handleAction();
  }}
  onClick={handleAction}
  className="min-h-[44px] min-w-[44px] touch-manipulation active:bg-blue-800 transition-colors"
>
  Action
</button>

// ❌ WRONG - Missing touch handling
<button onClick={handleAction} className="px-2 py-1">
  Too small, no touch handling
</button>
```

**Required Button Attributes:**
- `type="button"` - Prevents accidental form submission
- `onTouchEnd` with `e.preventDefault()` - Handles touch events properly
- `min-h-[44px]` - Apple's minimum touch target (44x44 points)
- `touch-manipulation` - Disables double-tap zoom
- `active:` state - Visual feedback on touch

### Number Inputs for Mobile

When receiving quantities or entering numbers:

```jsx
// ✅ CORRECT - Mobile-optimized number input
<input
  type="number"
  inputMode="numeric"    // Shows number pad on mobile
  pattern="[0-9]*"       // iOS numeric keyboard
  min="0"
  style={{ fontSize: '16px' }}
  className="..."
/>
```

### State Management for Mobile Forms

Mobile keyboards and touch events can cause state issues. Track form values redundantly:

```jsx
// ✅ CORRECT - Redundant state tracking for mobile
const [quantity, setQuantity] = useState(0);
const [pendingQuantity, setPendingQuantity] = useState(null);

const handleChange = (e) => {
  const val = parseInt(e.target.value, 10) || 0;
  setQuantity(val);
  setPendingQuantity(val);  // Backup in case state gets weird
};

const handleSave = () => {
  const valueToSave = pendingQuantity !== null ? pendingQuantity : quantity;
  // Use valueToSave...
};
```

### Prevent Page Scrolling/Bouncing

Add to the app's root CSS or index.html:

```css
/* Prevents overscroll bounce */
html, body {
  overscroll-behavior: none;
}

/* Prevents pull-to-refresh on mobile */
body {
  overscroll-behavior-y: contain;
}
```

### Mobile Testing Checklist

Before any feature is complete, test on a real phone:

- [ ] Tap buttons - do they respond immediately?
- [ ] Tap inputs - does the page zoom/scroll unexpectedly?
- [ ] Enter text - does the keyboard cause layout shifts?
- [ ] Submit forms - does the page jump around?
- [ ] Scroll content - is it smooth, no rubber-banding issues?
- [ ] Use in portrait AND landscape mode

---

## Common Issues

| Problem | Solution |
|---------|----------|
| Auth hangs | Check Azure redirect URIs |
| Photos not loading | Verify SharePoint URL on project |
| RLS errors | Add `anon` to policy |
| Wrong milestone % | Check `required_for_prewire` flags |
| Page zooms on iOS input | Add `style={{ fontSize: '16px' }}` to input AND update viewport meta |
| Buttons unresponsive on mobile | Add `onTouchEnd` handler with `e.preventDefault()` |
| Form resets on mobile | Track state redundantly with pendingValue pattern |
| Shade photos no thumbnails | Ensure `sharepoint_drive_id` and `sharepoint_item_id` are saved |
| Modal scroll issues | Use full page instead of modal for complex forms |
| Mark Complete not working | Must be a clickable button, not a static div |

---

## Checklist Before Finishing

- [ ] Used `zinc` (not `gray`)
- [ ] All colors have `dark:` variants
- [ ] **NO `green-*` or `emerald-*` Tailwind classes** - use `#94AF32` inline styles
- [ ] **All timestamps have corresponding user fields** (`*_at` paired with `*_by`)
- [ ] **User ID comes from `useAuth()` hook, NOT `supabase.auth.getUser()`**
- [ ] **Service functions accept userId as parameter (don't try to get it internally)**
- [ ] **UUID vs Display Name handled correctly** (check `wire_drop_stages.completed_by`)
- [ ] **Date inputs use `DateInput` component** (not raw `<input type="date">`)
- [ ] **Map/address links use Apple Maps** (`maps.apple.com`, not `maps.google.com`)
- [ ] Files in correct locations
- [ ] Database policies include `anon`
- [ ] Updated relevant doc in `docs/`
- [ ] Removed console.log statements (except diagnostic ones during development)

### Mobile UX Checklist (CRITICAL for field technician pages)
- [ ] All inputs have `style={{ fontSize: '16px' }}` to prevent iOS zoom
- [ ] All buttons have `type="button"` and `onTouchEnd` handlers
- [ ] All interactive elements are at least 44x44px (`min-h-[44px]`)
- [ ] Buttons have `touch-manipulation` class to prevent double-tap zoom
- [ ] Form state is tracked redundantly for mobile reliability
- [ ] Tested on actual mobile device - no unexpected scrolling/zooming

---

## How to Help Steve

1. **Provide complete, copy-paste ready code**
2. **Include exact file paths**
3. **Explain in plain terms**
4. **Show documentation updates in same response**
5. **Follow all patterns above exactly**

---

**This file is the single source of truth. Follow it exactly.**

---

# PART 3: AI & VOICE COPILOT ARCHITECTURE

**Last Updated:** 2025-12-20

## Overview

The AI integration in Unicorn follows the **"Copilot" Architecture**.
- **Goal**: A "Field Partner" that assists via voice commands.
- **Rule**: The AI acts as a **Power User**, using "Tools" to navigate, click buttons, and save data. It DOES NOT access the database directly.
- **Safety**: App logic (validations, state) remains the source of truth.
- **Platform**: Gemini Live API via WebSocket (real-time audio streaming).

## Gemini Live API Configuration

**API Endpoint:** `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent`

**CRITICAL: Use v1beta (not v1alpha)** - The v1beta API is the official documented version.

### Naming Convention
The Gemini API uses **camelCase** for all field names:
```javascript
// ✅ CORRECT - camelCase
{
    setup: {
        model: "models/gemini-2.5-flash-native-audio-preview-09-2025",
        generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { ... }
        },
        realtimeInputConfig: { ... },
        systemInstruction: { ... }
    }
}

// ❌ WRONG - snake_case (will cause errors!)
{
    setup: {
        model: "...",
        generation_config: { ... },  // NO!
        realtime_input_config: { ... }  // NO!
    }
}
```

### Available Models
| Model ID | Description | Status |
|----------|-------------|--------|
| `gemini-2.5-flash-native-audio-preview-09-2025` | Latest, best audio quality | **Recommended** |
| `gemini-2.0-flash-live-001` | Stable fallback | Deprecated Dec 2025 |

Users can select their model in Settings > AI Copilot Settings.

### VAD (Voice Activity Detection) Settings
```javascript
realtimeInputConfig: {
    automaticActivityDetection: {
        disabled: false,
        // Use full enum names (not just "LOW" or "HIGH")
        startOfSpeechSensitivity: "START_SENSITIVITY_LOW",   // Less sensitive to background noise
        endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",      // Waits longer before ending turn
        prefixPaddingMs: 100,   // Wait before committing speech start
        silenceDurationMs: 500  // Silence duration before end of speech
    }
}
```

### Tool Declaration Format
```javascript
// Tools declared in setup config
config.setup.tools = [{
    functionDeclarations: [
        {
            name: "tool_name",
            description: "What this tool does",
            parameters: {
                type: "object",
                properties: {
                    param1: { type: "string", description: "..." }
                },
                required: ["param1"]
            }
        }
    ]
}];
```

### Tool Response Format
```javascript
// When Gemini calls a tool, respond with:
{
    toolResponse: {
        functionResponses: [
            {
                id: "call_id_from_gemini",
                name: "tool_name",
                response: { success: true, data: "..." }
            }
        ]
    }
}
```

**Official Documentation:** https://ai.google.dev/api/live

## Architecture: Single Source of Truth (SSOT) - Updated 2025-12-24

The Voice AI system was redesigned from 50+ fragmented tools to a clean **5 meta-tool architecture**:

```
┌─────────────────────────────────────────────────────────────────┐
│                         User's iPhone/iPad                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌──────────────────┐    ┌───────────────┐  │
│  │ Microphone  │───▶│ AIBrainContext   │───▶│ Gemini Live   │  │
│  │ (48kHz)     │    │ 5 Meta-Tools     │    │ WebSocket     │  │
│  └─────────────┘    │ - get_context    │    │ (16kHz PCM)   │  │
│                     │ - execute_action │    └───────┬───────┘  │
│  ┌─────────────┐    │ - search_knowledge│           │          │
│  │ Speaker     │◀───│ - navigate       │◀───────────┘          │
│  │ (48kHz)     │    │ - web_search     │    Audio Response     │
│  └─────────────┘    └────────┬─────────┘                       │
│                              │                                  │
│                     ┌────────▼─────────┐                       │
│                     │ AppStateContext  │                       │
│                     │ Single Source of │                       │
│                     │ Truth (SSOT)     │                       │
│                     └────────┬─────────┘                       │
│                              │                                  │
│         ┌────────────────────┼────────────────────┐            │
│         ▼                    ▼                    ▼            │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────┐       │
│  │ PMDashboard │    │ ShadeDetail  │    │ ShadeManager│       │
│  │ publishState│    │ publishState │    │ publishState│       │
│  │ + actions   │    │ + actions    │    │ + actions   │       │
│  └─────────────┘    └──────────────┘    └─────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### Why SSOT?

**Before (50+ tools):**
- Each page registered its own tools with fragmented context
- AI didn't know what page it was on without calling multiple tools
- Stale closure bugs when tools captured old state
- Complex registration/unregistration lifecycle

**After (5 meta-tools):**
- Single `get_context` tool returns ALL relevant state
- Components publish their state to AppStateContext
- Components register action handlers that AI can invoke
- Clean separation: AI gets context → decides what to do → executes action

## Core Components

### 1. AppStateContext (`src/contexts/AppStateContext.js`)
**The Single Source of Truth** for all AI-relevant application state.

**Purpose:**
- Centralized store that components publish their state to
- AI calls `get_context` once and gets everything it needs
- Components register action handlers that AI can invoke

**API:**
```javascript
const {
    publishState,      // Update context with current view state
    getState,          // Get current state (for AI tools)
    registerActions,   // Register action handlers
    unregisterActions, // Cleanup action handlers
    executeAction,     // Execute a registered action
    getAvailableActions // List what actions are available
} = useAppState();
```

**State Shape:**
```javascript
{
    view: 'shade-detail' | 'shade-list' | 'dashboard' | 'prewire' | etc,
    project: { id, name, address },
    shade: { id, name, roomName },       // When on shade detail
    shades: [{ id, name, hasMeasurements }], // When on shade list
    rooms: ['Living Room', 'Kitchen'],   // When on shade list
    form: { widthTop, widthMiddle, ... } // Current form values
}
```

### 2. AIBrainContext (`src/contexts/AIBrainContext.js`)
The Voice AI agent with 5 meta-tools.

**5 Meta-Tools:**

| Tool | Description |
|------|-------------|
| `get_context` | **CALL FIRST** - Returns current view, project, shade, form data, available actions |
| `execute_action` | Execute registered action: `highlight_field`, `set_measurement`, `open_shade`, etc. |
| `search_knowledge` | Search Azure AI knowledge base for Lutron, Ubiquiti, Control4 docs |
| `navigate` | Go to dashboard, prewire, settings, or project by name |
| `web_search` | Search web for general info not in knowledge base |

**Key States:**
- `idle` - No active session
- `connecting` - Opening WebSocket
- `listening` - Recording user audio
- `speaking` - Playing Gemini's audio response
- `error` - Something went wrong

### 3. Component Integration Pattern

**Each component that needs Voice AI:**
1. Imports `useAppState`
2. Publishes its state via `publishState()` in useEffect
3. Registers action handlers via `registerActions()`
4. Cleans up actions on unmount

**Example (ShadeDetailPage.js):**
```javascript
import { useAppState } from '../../contexts/AppStateContext';

const ShadeDetailPage = () => {
    const { publishState, registerActions, unregisterActions } = useAppState();
    const [formData, setFormData] = useState({...});
    const [activeField, setActiveField] = useState(null);

    // 1. Publish state when it changes
    useEffect(() => {
        publishState({
            view: 'shade-detail',
            project: { id: project.id, name: project.name },
            shade: { id: shade.id, name: shade.name, roomName: shade.room?.name },
            form: formData,
        });
    }, [shade, formData, project, publishState]);

    // 2. Register action handlers
    useEffect(() => {
        const actions = {
            highlight_field: ({ field }) => {
                setActiveField(field);
                setTimeout(() => setActiveField(null), 3000);
                return { success: true };
            },
            set_measurement: ({ field, value }) => {
                setFormData(prev => ({ ...prev, [field]: value }));
                return { success: true };
            },
            save_measurements: async () => {
                await flushPendingSaves();
                return { success: true };
            },
        };
        registerActions(actions);
        return () => unregisterActions(Object.keys(actions));
    }, [formData, registerActions, unregisterActions]);
};
```

### 4. Available Actions by View

**shade-detail:**
| Action | Parameters | Description |
|--------|------------|-------------|
| `highlight_field` | `{ field }` | Highlight measurement field with violet glow |
| `set_measurement` | `{ field, value }` | Set a measurement value |
| `clear_measurement` | `{ field }` | Clear a measurement field |
| `read_back` | - | Read back all current measurements |
| `save_measurements` | - | Flush pending saves to database |

**shade-list:**
| Action | Parameters | Description |
|--------|------------|-------------|
| `open_shade` | `{ shadeId }` or `{ shadeName }` | Navigate to shade detail |
| `go_to_next_pending` | - | Navigate to first shade without measurements |

**dashboard:**
| Action | Parameters | Description |
|--------|------------|-------------|
| `list_projects` | - | Get all projects |
| `open_project` | `{ projectId }` or `{ projectName }` | Navigate to project |

### 5. VoiceCopilotOverlay (`src/components/VoiceCopilotOverlay.js`)
Floating mic button + debug panel.

**Updated for SSOT:**
- Now imports from `AIBrainContext` (not VoiceCopilotContext)
- Uses `startSession()` / `endSession()` pattern
- Debug panel shows status, audio levels, transcript

## User Settings (`src/components/UserSettings/AISettings.js`)

**Sections (all collapsible):**
- **Persona Config**: "Field Partner" (brief) vs "Teacher" (detailed)
- **Voice Selection**: Puck, Charon, Kore, Fenrir, Aoede
- **Model Selection**: Gemini 2.5 Flash (recommended)
- **VAD Settings**: Voice Activity Detection sensitivity
- **Custom Instructions**: User-defined context for AI
- **Audio Diagnostics**: Test speaker and microphone

## System Instructions (AI Prompt)

The AI receives system instructions defining behavior. Key sections:

**Context-First Workflow:**
```
# UNICORN Field Assistant

## Capabilities
1. App Navigation - projects, shades, prewire, settings
2. Shade Measuring - guide through window measurements
3. Knowledge Base - Lutron, Ubiquiti, Control4, Sonos docs
4. Web Search - general information
5. Execute Actions - interact with current view

## Rules
- ALWAYS call get_context FIRST
- Use execute_action for app interactions
- Use search_knowledge for product questions
- Use web_search for general info
```

**Measurement Workflow:**
```
## Measurement Order
1. Top Width -> 2. Middle Width -> 3. Bottom Width -> 4. Height -> 5. Mount Depth

For each: highlight_field first, ask for value, set_measurement, confirm, next field.
```

## Adding Voice AI to a New Component

### Step 1: Add AppState Integration
```javascript
import { useAppState } from '../contexts/AppStateContext';

const MyNewComponent = () => {
    const { publishState, registerActions, unregisterActions } = useAppState();

    // Publish state
    useEffect(() => {
        publishState({
            view: 'my-view',
            // ... relevant data for AI
        });
    }, [/* dependencies */, publishState]);

    // Register actions
    useEffect(() => {
        const actions = {
            my_action: ({ param }) => {
                // Do something
                return { success: true };
            }
        };
        registerActions(actions);
        return () => unregisterActions(Object.keys(actions));
    }, [registerActions, unregisterActions]);
};
```

### Step 2: Update AIBrainContext (if needed)
If you need AI to understand the new view, update `buildContextString()` and `getContextHint()` in AIBrainContext.js.

## Debugging

### Debug Panel
The VoiceCopilotOverlay includes a debug panel (tap bug icon) showing:
- Connection status
- WebSocket state
- Audio level meter
- Chunks sent/received
- Last transcript

### Common Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| WebSocket 1007 error | Wrong VAD enum values | Use `START_SENSITIVITY_LOW` / `END_SENSITIVITY_HIGH` |
| No audio output | AudioContext suspended | Ensure user taps to start (iOS requirement) |
| Audio level 0% | Mic permission denied | Check browser permissions |
| Actions not working | Not registered | Check component registers actions in useEffect |
| AI says "no context" | publishState not called | Ensure component publishes state |
| Stale state in actions | Closure captured old state | Use refs or include deps in action registration |

## Key Files

| File | Purpose |
|------|---------|
| `src/contexts/AIBrainContext.js` | **NEW** Voice AI agent with 5 meta-tools |
| `src/contexts/AppStateContext.js` | **NEW** Single Source of Truth for AI state |
| `src/components/VoiceCopilotOverlay.js` | Floating mic button + debug panel |
| `src/components/Shades/ShadeDetailPage.js` | Shade measuring with AppState integration |
| `src/components/Shades/ShadeManager.js` | Shade list with AppState integration |
| `src/components/PMDashboard.js` | Dashboard with AppState integration |
| `src/components/UserSettings/AISettings.js` | Voice/persona/model settings |

### Deprecated Files (Old Architecture)
These files are no longer used but may still exist:
- `src/contexts/VoiceCopilotContext.js` - Replaced by AIBrainContext
- `src/hooks/useAgentContext.js` - Replaced by AppStateContext
- `src/hooks/useShadeDetailTools.js` - Actions now in ShadeDetailPage
- `src/hooks/useShadeManagerTools.js` - Actions now in ShadeManager
- `src/hooks/useKnowledgeTools.js` - Now integrated in AIBrainContext

## Environment Variables

```bash
REACT_APP_GEMINI_API_KEY=your_gemini_api_key_here
```

## iOS Safari Notes

1. **User Gesture Required**: AudioContext must be created/resumed from a user tap
2. **48kHz Sample Rate**: iOS ignores sampleRate options, always uses 48kHz
3. **Blob WebSocket Messages**: Safari may send WS messages as Blob instead of text
4. **16px Font on Inputs**: Prevents iOS zoom when tapping inputs

---

# PART 4: EXTERNAL PORTALS (PUBLIC ACCESS)

## Overview

External portals allow stakeholders (designers, clients) to access project information without logging into the main app. They use:
- **Token-based authentication** with SHA-256 hashing
- **OTP verification** via email
- **Session tokens** stored in browser localStorage

## Portal Types

| Portal | Route | API | Purpose |
|--------|-------|-----|---------|
| Issue Portal | `/public/issues/:token` | `/api/public-issue` | View/comment on issues |
| Shade Portal | `/shade-portal/:token` | `/api/public-shade` | Review shade measurements |

## Key Architecture

### Token Flow
1. Internal user generates link → token created + hashed → stored in DB
2. External user visits URL with token
3. API hashes incoming token → compares to DB hash
4. If match, show OTP verification
5. After OTP verified, create session token → stored in localStorage

### Files
| Component | File |
|-----------|------|
| Issue Portal UI | `src/pages/PublicIssuePortal.js` |
| Shade Portal UI | `src/pages/PublicShadePortal.js` |
| Issue API | `api/public-issue.js` |
| Shade API | `api/public-shade.js` |
| Shade Link Service | `src/services/shadePublicAccessService.js` |

### Database Tables
- `issue_public_access_links` - Issue portal tokens
- `shade_public_access_links` - Shade portal tokens

## Standalone Portal Pattern

**External portals must be STANDALONE** - they cannot use internal contexts like `ThemeContext` because:
1. External users are not authenticated
2. Portals may be embedded or opened separately
3. Must work without any app state

```jsx
// ✅ CORRECT - Inline styles, no context dependencies
const PublicShadePortal = () => {
  const styles = {
    container: { minHeight: '100vh', backgroundColor: '#f9fafb' },
    card: { backgroundColor: '#ffffff', borderRadius: '12px', padding: '24px' }
  };

  return <div style={styles.container}>...</div>;
};

// ❌ WRONG - Depends on ThemeContext (will crash for external users)
const PublicShadePortal = () => {
  const { mode } = useTheme();  // External users don't have this!
  return <div className={mode === 'dark' ? 'bg-zinc-900' : 'bg-white'}>...</div>;
};
```

## External Links in Portals

### Lutron Fabric Search Links
**Use `/search/results` endpoint** - it auto-executes the search:

```jsx
// ✅ CORRECT - Auto-executes search
href={`https://www.lutronfabrics.com/us/en/search/results?q=${encodeURIComponent(fabricCode)}`}

// ❌ WRONG - Just shows search page, doesn't execute
href={`https://www.lutronfabrics.com/us/en/search?q=${encodeURIComponent(fabricCode)}`}
```

### Link Click Handlers
Always add `onClick={(e) => e.stopPropagation()}` to prevent parent handlers from blocking:

```jsx
<a
  href={fabricUrl}
  target="_blank"
  rel="noopener noreferrer"
  onClick={(e) => e.stopPropagation()}  // Critical!
>
  {fabricCode}
</a>
```

## Service Role vs RLS

External portal APIs use Supabase **service role key** to bypass RLS. However:
- Some tables may have restrictive RLS that blocks even service role
- Handle missing data gracefully (don't block the portal)

```javascript
// ✅ CORRECT - Handle RLS blocking gracefully
const project = await fetchProject(link.project_id);
if (!project) {
  console.log('[PublicShade] Project not found (RLS?)', link.project_id);
  // Continue without project data - don't block the portal
}

// ❌ WRONG - Blocking on missing project
if (!project) {
  return { status: 'invalid', reason: 'project_not_found' };
}
```

## Comments System (Reusable Pattern)

Both Issue and Shade portals use the same comment pattern:
- Comments stored in `{type}_comments` table
- `is_internal` flag for internal-only comments (not shown to external users)
- Collapsible by default on external portal
- External users can add comments (marked as external)

### Comment Table Schema
```sql
CREATE TABLE shade_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shade_id UUID REFERENCES project_shades(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id),
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,
  created_by UUID,
  created_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Troubleshooting External Portals

| Issue | Cause | Fix |
|-------|-------|-----|
| "Link not found" | Token hash mismatch | Check hashing algorithm matches (SHA-256) |
| Project shows null | RLS blocking service role | Add policy: `CREATE POLICY service_role_select ON projects FOR SELECT TO service_role USING (true);` |
| Fabric link doesn't search | Using `/search` not `/search/results` | Change URL to `/search/results?q=` |
| Link doesn't open | Missing stopPropagation | Add `onClick={(e) => e.stopPropagation()}` |
| Orphaned links | Project deleted | Run cleanup: `DELETE FROM shade_public_access_links WHERE project_id NOT IN (SELECT id FROM projects);`

---

# PART 5: TODO / KNOWN ISSUES

## Supabase Security Linter Issues (Logged 2025-12-10)

**Status:** Deferred - needs careful review to avoid breaking production

### Issue 1: SECURITY DEFINER Views (13 views)

These views bypass RLS by running with creator's permissions. May be intentional for MSAL auth pattern.

**Affected views:**
- `issue_stakeholder_tags_detailed`
- `issues_with_stats`
- `project_equipment_global_parts`
- `wire_drops_with_network_info`
- `project_milestone_status`
- `purchase_orders_summary`
- `project_equipment_with_rooms`
- `equipment_for_po`
- `searchable_contacts`
- `project_contacts_view`
- `time_logs_active`
- `time_logs_summary`
- `project_stakeholders_detailed`

**Action needed:** Review each view to determine if SECURITY DEFINER is intentional. If not, recreate with `security_invoker = true`.

### Issue 2: RLS Disabled on Public Tables (7 tables)

These tables have NO Row Level Security - anyone with the anon key can read/write all data.

**Affected tables:**
- `shipping_addresses`
- `app_preferences`
- `project_contacts`
- `issue_project_contacts`
- `project_assignments`
- `stakeholder_slots`
- `issue_assignments`

**Action needed:** Enable RLS and add policies following the MSAL pattern (include `anon, authenticated` roles).

**Fix template:**
```sql
-- Enable RLS
ALTER TABLE public.{table_name} ENABLE ROW LEVEL SECURITY;

-- Add permissive policy (MSAL pattern)
CREATE POLICY "Allow all for anon and authenticated"
ON public.{table_name}
FOR ALL TO anon, authenticated
USING (true)
WITH CHECK (true);
```

### Future Issues

Add new Supabase linter issues or technical debt items here as they arise.

---

## RAG Knowledge Base System (Updated 2025-12-23)

**Status:** Production - Azure AI Search + SharePoint Integration

### Overview

The knowledge base system now uses **Azure AI Search** with **SharePoint** as the document store. This replaced the earlier Supabase pgvector approach for better scalability and enterprise integration.

**Key Features:**
- Documents stored in SharePoint Knowledge Library (indexed automatically)
- Azure AI Search provides semantic search with answers & captions
- Notion Knowledge Base exports directly to SharePoint
- Voice AI (`search_manufacturer_docs` tool) queries Azure AI Search
- No manual embedding generation - Azure handles it automatically

### Architecture (Current)

```
┌─────────────────────────────────────────────────────────────────┐
│                   Azure AI Search RAG Flow                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SOURCE: Notion Knowledge Base                                  │
│        │                                                         │
│        ▼                                                         │
│  ┌─────────────────┐                                            │
│  │ notion-to-      │  Exports: MD files, PDFs, scraped links   │
│  │ sharepoint.js   │  Structure: /Manufacturer/content.md       │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────────────────────────────┐                    │
│  │ SharePoint: sites/Unicorn/Knowledge     │                    │
│  │ ├── Alleo/                              │                    │
│  │ ├── Lutron/                             │                    │
│  │ ├── Sonos/                              │                    │
│  │ ├── Ubiquiti/                           │                    │
│  │ └── ... (other manufacturers)           │                    │
│  └────────┬────────────────────────────────┘                    │
│           │ Azure Indexer (hourly)                              │
│           ▼                                                      │
│  ┌─────────────────────────────────────────┐                    │
│  │ Azure AI Search: sharepoint-knowledge-index                  │
│  │ - Semantic search                        │                    │
│  │ - Extractive answers & captions         │                    │
│  │ - 168+ documents indexed                │                    │
│  └────────┬────────────────────────────────┘                    │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐    ┌──────────────────┐                    │
│  │ /api/azure-ai-  │───▶│ Voice AI Tool:   │                    │
│  │ search.js       │    │ search_          │                    │
│  │                 │◀───│ manufacturer_docs│                    │
│  └─────────────────┘    └──────────────────┘                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Files

| Purpose | File |
|---------|------|
| **Azure AI Search API** | `api/azure-ai-search.js` |
| **Frontend Service** | `src/services/knowledgeService.js` |
| **Voice AI Tools** | `src/hooks/useKnowledgeTools.js` |
| **Lutron Knowledge Data** | `src/data/lutronShadeKnowledge.js` |
| **Management UI** | `src/components/knowledge/KnowledgeManagementPanel.js` |
| **Notion Export Script** | `~/Downloads/notion-to-sharepoint.js` (local utility) |

### Environment Variables (Azure AI Search)

```bash
# Required for Azure AI Search
AZURE_SEARCH_SERVICE_NAME=unicorn-rag
AZURE_SEARCH_API_KEY=your-azure-search-api-key
AZURE_SEARCH_INDEX_NAME=sharepoint-knowledge-index

# For SharePoint uploads (Microsoft Graph)
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
```

### Azure AI Search Configuration

| Setting | Value |
|---------|-------|
| Service Name | `unicorn-rag` |
| Index Name | `sharepoint-knowledge-index` |
| Data Source | SharePoint Knowledge Library |
| Indexer Schedule | Hourly |
| Search Type | Semantic (with simple fallback) |
| API Version | `2024-07-01` |

### Voice AI Integration

The `search_manufacturer_docs` tool in `useKnowledgeTools.js` connects voice AI to Azure AI Search:

```javascript
// Voice AI Tool Flow
User: "How do I install a Lutron roller shade?"
     ↓
Gemini calls: search_manufacturer_docs({ query: "install lutron roller shade" })
     ↓
useKnowledgeTools.js → searchKnowledgeForVoice()
     ↓
knowledgeService.js → POST /api/azure-ai-search
     ↓
Azure AI Search (semantic query with manufacturer filter)
     ↓
Returns: Formatted documentation → Gemini speaks answer
```

### Notion to SharePoint Export

The knowledge base content is managed in **Notion** and exported to **SharePoint** for Azure AI Search indexing.

**Script Location:** `~/Downloads/notion-to-sharepoint.js`

#### Notion Structure
```
Knowledge Base (Notion)
├── Manufacturer 1 (e.g., Lutron)
│   ├── Category Page (with external links)
│   └── Content Page (MD with images)
├── Manufacturer 2 (e.g., Sonos)
│   ├── Setup Guide (MD with images)
│   └── External Links (scraped to MD)
└── ...
```

#### Export Features
- **MD Files**: Copied directly with embedded base64 images
- **PDFs**: Downloaded and uploaded as-is
- **External Links**: Scraped to markdown files for indexing
- **Images**: Embedded as base64 data URIs (not separate files)
- **Nested Pages**: Recursively discovers pages in column layouts

#### Running the Export

```bash
# Export specific manufacturers (TEST_ONLY array)
cd ~/Downloads
node notion-to-sharepoint.js

# Export all manufacturers (set TEST_ONLY = null)
# Edit notion-to-sharepoint.js: const TEST_ONLY = null;
node notion-to-sharepoint.js
```

#### Script Configuration

```javascript
// In notion-to-sharepoint.js

// Test mode: only export these manufacturers
const TEST_ONLY = ['Sonos'];  // Set to null for full export

// Root page ID (Knowledge Base in Notion)
const KNOWLEDGE_BASE_PAGE_ID = 'your-notion-page-id';

// SharePoint target
const SITE_NAME = 'Unicorn';
const LIBRARY_NAME = 'Knowledge';
```

### SharePoint Knowledge Library

**URL:** `https://isehome.sharepoint.com/sites/Unicorn/Knowledge`

**Current Indexed Manufacturers:**
- Alleo (network requirements, browser support, system requirements)
- Lutron (shade documentation, Roller 64, Roller 100)
- Sonos (Arc setup, general guides)
- Ubiquiti (network setup)
- Speco (camera specs, NVR manuals)
- And 40+ more documents

### Search Flow (Azure AI Search)

```
┌─────────────────────────────────────────────────────────────────┐
│                   Azure AI Search Flow                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User/Voice AI calls searchKnowledge(query, manufacturer)    │
│        │                                                         │
│        ▼                                                         │
│  2. /api/azure-ai-search                                         │
│        │                                                         │
│        ├──▶ Try semantic search first                           │
│        │    - queryType: "semantic"                             │
│        │    - semanticConfiguration: "default"                  │
│        │    - answers: "extractive|count-3"                     │
│        │    - captions: "extractive|highlight-true"            │
│        │                                                         │
│        ├──▶ Filter by manufacturer path (if specified)         │
│        │    - filter: "metadata_spo_path eq '/sites/...'"       │
│        │                                                         │
│        └──▶ Fallback to simple search if semantic fails        │
│                                                                  │
│  3. Return results with content, answers, captions              │
│                                                                  │
│  4. For voice: Format via searchKnowledgeForVoice()             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| "No results found" | Index not updated | Wait for hourly indexer or trigger manually in Azure Portal |
| Search returns wrong manufacturer | Missing filter | Pass manufacturer name to filter by path |
| Export fails silently | Large file (>4MB) | Script handles via upload session API |
| Images not showing in SharePoint | Base64 too large | SharePoint can display base64 in MD preview |
| Notion page not found | Nested in column layout | Script recursively searches container blocks |
| "NOTION_API_KEY not found" | Missing env var | Add to project .env file |

### Legacy System (Deprecated)

The previous pgvector-based system (Supabase) is still in the codebase but no longer used:
- `api/knowledge-upload.js` - Old upload endpoint
- `api/knowledge-process.js` - Old processing endpoint
- `api/knowledge-search.js` - Old search endpoint
- `knowledge_manufacturers`, `knowledge_documents`, `knowledge_chunks` tables

These may be removed in a future cleanup.

---

## Auto-Link System (Added 2025-12-21)

**Status:** Implemented - requires migration

### Overview

Automatically links knowledge base documents to `global_parts` based on manufacturer, model, and part number matching. Runs as a nightly cron job.

### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    Nightly Auto-Link Job                         │
│                    Runs at 3 AM daily                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Fetch all knowledge_documents (status = 'ready')            │
│        │                                                         │
│        ▼                                                         │
│  2. For each document, extract:                                  │
│     - Manufacturer from metadata                                 │
│     - Model/part numbers from title/filename                    │
│        │                                                         │
│        ▼                                                         │
│  3. Match against global_parts:                                  │
│     - model match → 95% confidence                              │
│     - part_number match → 90% confidence                        │
│     - manufacturer match → 50% confidence                       │
│        │                                                         │
│        ▼                                                         │
│  4. Create global_part_documents links:                         │
│     - source = 'auto-linked'                                    │
│     - confidence = match score                                   │
│     - matched_on = field that matched                           │
│        │                                                         │
│        ▼                                                         │
│  5. Log results to job_runs table                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Cron Jobs (vercel.json)

| Job | Schedule | Purpose |
|-----|----------|---------|
| `/api/cron/sync-sharepoint-knowledge` | 2 AM daily | Sync docs from SharePoint to knowledge_documents |
| `/api/cron/auto-link-docs` | 3 AM daily | Link knowledge docs to global_parts |

### Database Changes

**New columns on `global_part_documents`:**

| Column | Type | Purpose |
|--------|------|---------|
| `source` | TEXT | 'manual', 'auto-linked', or 'ai-suggested' |
| `confidence` | FLOAT | Match confidence (0.0-1.0) |
| `matched_on` | TEXT | Field that matched ('model', 'part_number', 'manufacturer') |
| `knowledge_doc_id` | UUID | FK to knowledge_documents |

**New table `job_runs`:**

| Column | Type | Purpose |
|--------|------|---------|
| `job_name` | TEXT | Name of the cron job |
| `started_at` | TIMESTAMPTZ | When job started |
| `completed_at` | TIMESTAMPTZ | When job finished |
| `status` | TEXT | 'running', 'completed', 'failed' |
| `stats` | JSONB | Job statistics (docs processed, links created) |
| `error_message` | TEXT | Error details if failed |

### Key Files

| Purpose | File |
|---------|------|
| Auto-link cron job | `api/cron/auto-link-docs.js` |
| SharePoint sync cron | `api/cron/sync-sharepoint-knowledge.js` |
| Database migration | `supabase/migrations/20241221_add_auto_link_support.sql` |

### Environment Variables for SharePoint Integration

```bash
# Required for SharePoint sync (optional - can use manual uploads)
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
SHAREPOINT_SITE_ID=your-site-id
SHAREPOINT_KNOWLEDGE_FOLDER=Unicorn/knowledge

# Required for Vercel cron authentication
CRON_SECRET=your-secret-for-cron-auth
```

### Manual Trigger

You can trigger the jobs manually for testing:

```bash
# Auto-link job
curl -X POST https://unicorn-one.vercel.app/api/cron/auto-link-docs

# SharePoint sync job
curl -X POST https://unicorn-one.vercel.app/api/cron/sync-sharepoint-knowledge
```

### Viewing Job History

Query the `job_runs` table or use the helper function:

```sql
SELECT * FROM get_recent_job_runs('auto-link-docs', 10);
```

---

## User Capability Levels (TODO)

**Status:** Planned - needs implementation

### Overview

The application needs a proper user capabilities/roles system to control access to features based on user role. Currently using ad-hoc checks (like `isPMView` prop).

### Proposed Roles

| Role | Description | Capabilities |
|------|-------------|--------------|
| **PM (Project Manager)** | Full project oversight | View all M1/M2 data unblinded, manage stakeholders, approve changes, full edit access |
| **Technician** | Field worker | Enter M1/M2 measurements (blinded from other tech's data), upload photos, add comments |
| **Designer** | External stakeholder | Review shades via public portal, approve/reject designs, select fabrics |
| **Admin** | System administrator | All PM capabilities + system settings, user management |
| **Viewer** | Read-only access | View project info, reports (no editing) |

### Implementation Considerations

1. **Database Schema**
   - Add `user_roles` table with role definitions
   - Add `project_user_roles` junction table for per-project role assignments
   - Consider global roles vs per-project roles

2. **Auth Context Enhancement**
   - Extend `useAuth` hook to include user capabilities
   - Add `hasCapability(capability)` helper function
   - Cache capabilities to avoid repeated lookups

3. **Component Updates**
   - Replace `isPMView` with capability checks
   - Add capability guards to sensitive components
   - Update navigation/menus based on capabilities

4. **Shade Measurement Blinding**
   - Currently: `isPMView` prop controls blinding
   - Future: Check `canViewAllMeasurements` capability

5. **Migration Path**
   - Default existing users to appropriate roles based on current behavior
   - Add admin UI for role management

### Related Files
- `src/contexts/AuthContext.js` - Auth state management
- `src/components/Shades/ShadeDetailPage.js` - Full page shade measurement (replaced ShadeMeasurementModal)
- `src/components/Shades/ShadeManager.js` - Navigates to ShadeDetailPage
- `src/components/PMProjectView.js` - Embeds ShadeManager with PM capabilities

---

# PART 6: CHANGELOG

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
