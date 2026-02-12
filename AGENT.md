# AGENT.md - Unicorn Project Guidelines

> **This is the SINGLE SOURCE OF TRUTH for the Unicorn application.**
> For AI agents, voice copilots, and any system that needs to understand this app completely.

---

## 📖 TABLE OF CONTENTS (Quick Navigation)

| Section | Lines | What's There |
|---------|-------|--------------|
| **PART 1: What This App Is** | 50-1500 | Business overview, features, workflows |
| → App Overview & User Roles | 50-100 | What Unicorn does, who uses it |
| → Wire Drops | 100-400 | 3-stage workflow, completion logic |
| → Equipment System | 400-700 | 3-tier architecture, CSV import |
| → Milestones/Progress | 700-1000 | 8 gauges, SSOT calculation |
| → Procurement | 1000-1300 | PO workflow, receiving |
| → Shades | 1300-1500 | Shade measuring, ordering |
| **PART 2: How To Work On This App** | 1533-2700 | Dev patterns, styling, code standards |
| → Brand Colors | 1604-1700 | **CRITICAL** - `#94AF32` olive green rule |
| → Styling System | 1700-1900 | Theme, zinc not gray, dark mode |
| → Mobile UX | 1900-2000 | iOS zoom prevention, touch targets |
| → Database Rules | 2000-2400 | MSAL auth, RLS, timestamps |
| → Code Standards | 2400-2700 | Service layer, React patterns |
| **PART 3: AI & Voice Copilot** | 2722-3100 | Gemini, AppStateContext, 5 meta-tools |
| **PART 4: External Portals** | 3139-3280 | Public pages, standalone pattern |
| **PART 5: TODO / Known Issues** | 3283-3700 | Current bugs, planned work |
| **PART 6: Changelog** | 4138+ | All changes (ADD NEW ENTRIES HERE) |

---

## 📁 FILE MANAGEMENT RULES

- **NEVER create duplicate agent files** (no AGENT 2.md, AGENT 3.md, etc.)
- **ALWAYS update THIS file** directly when documentation changes are needed
- **APPEND new sections** to the appropriate part of this file
- Topic-specific deep-dives live in `/docs/` but THIS file is the master reference
- **After ANY code change, update the CHANGELOG section (PART 6)**

---

## 🎨 BRAND COLORS - QUICK REFERENCE

| Purpose | Hex | Usage |
|---------|-----|-------|
| Primary | `#8B5CF6` | `violet-500` Tailwind class |
| **Success** | `#94AF32` | **INLINE ONLY** - `style={{ color: '#94AF32' }}` |
| Warning | `#F59E0B` | `amber-500` Tailwind class |
| Danger | `#EF4444` | `red-500` Tailwind class |

**NEVER use `green-*`, `emerald-*`, or `gray-*` Tailwind classes!**
**ALWAYS use `zinc-*` (not gray) with `dark:` variants.**

See PART 2, lines 1604-1700 for complete styling guide.

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

#### Milestone Architecture (Single Source of Truth)

**CRITICAL:** All milestone percentages are calculated from a SINGLE source: `api/_milestoneCalculations.js`

```
┌─────────────────────────────────────────────────────────────────┐
│                    MILESTONE DATA FLOW (SSOT)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PMProjectView.js             api/project-report/generate.js    │
│       │                                    │                     │
│       └──────────────┬─────────────────────┘                     │
│                      │                                           │
│                      ▼                                           │
│            api/_milestoneCalculations.js                         │
│            (SINGLE SOURCE OF TRUTH)                              │
│                      │                                           │
│                      ▼                                           │
│            api/milestone-percentages.js (API endpoint)           │
│                      │                                           │
│                      ▼                                           │
│            milestoneCacheService.js (5-min localStorage cache)   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key Files:**
| File | Purpose |
|------|---------|
| `api/_milestoneCalculations.js` | **SSOT** - All calculation logic lives here |
| `api/milestone-percentages.js` | API endpoint for fetching percentages |
| `src/services/milestoneService.js` | Frontend service (calls API) |
| `src/services/milestoneCacheService.js` | 5-minute localStorage cache |

#### Percentage vs Completion vs Actual Date

**These are THREE separate concepts - DO NOT conflate them:**

| Concept | Meaning | Set By | Example |
|---------|---------|--------|---------|
| `percentage === 100` | Calculated work is done | Automatic calculation | All wire drops have prewire photos |
| `completed_manually === true` | User acknowledged completion | Manual toggle in Phase Milestones table | PM clicked "Completed" dropdown |
| `actual_date` | Timestamp of manual completion | Set when `completed_manually` toggled ON | "2026-01-15" stored in DB |

**Example Scenario:**
1. Team uploads all prewire photos → Prewire Stages gauge shows 100%
2. BUT `completed_manually` is still `false` and `actual_date` is `null`
3. PM reviews work, clicks "Completed" in Phase Milestones table
4. NOW `completed_manually = true` and `actual_date = today`

**Report Preview Status Logic:**
```javascript
// CORRECT: Only show "Completed" if EXPLICITLY marked complete
const isManuallyComplete = dates.completed_manually === true;

// WRONG (old buggy code): This fabricates completion dates!
const isComplete = dates.completed || (percentage === 100);  // DON'T DO THIS
```

#### Phase Rollup Formula

Phase percentages use a weighted rollup:

```
Prewire Phase = (Prewire Orders × 25%) + (Prewire Receiving × 25%) + (Prewire Stages × 50%)
Trim Phase    = (Trim Orders × 25%)    + (Trim Receiving × 25%)    + (Trim Stages × 50%)
```

Stages are weighted 50% because actual installation work is more significant than procurement.

#### Cache Invalidation

The milestone cache is automatically invalidated when:
- Wire drop stage completed (prewire/trim/commission photo uploaded)
- Equipment procurement status changed (ordered/received)
- Bulk receive executed for a phase

**Manual invalidation (for debugging):**
```javascript
import { milestoneCacheService } from '../services/milestoneCacheService';
milestoneCacheService.invalidate(projectId);  // Single project
milestoneCacheService.clearAll();              // All projects
```

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
| **Home Assistant** | Smart home device monitoring, network diagnostics via Nabu Casa |

#### 7.1 Home Assistant Integration

Remote access to customer Home Assistant instances for device monitoring, network diagnostics, and future automation control.

##### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Home Assistant Integration                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Unicorn App (Browser/Vercel)                                   │
│        │                                                         │
│        ▼                                                         │
│  /api/ha/status.js ──────────────────┐                          │
│  /api/ha/entities.js                  │                          │
│  /api/ha/command.js                   │                          │
│        │                              │                          │
│        ▼                              ▼                          │
│  Supabase DB                    Nabu Casa Cloud                 │
│  (encrypted credentials)        (remote access)                 │
│  project_home_assistant              │                          │
│        │                              │                          │
│        └────── decrypt ───────────────┤                          │
│                                       ▼                          │
│                              Customer's Home Assistant          │
│                              (local network)                    │
│                                       │                          │
│                              ┌────────┴────────┐                │
│                              │ UniFi Integration│                │
│                              │ (device_tracker) │                │
│                              └─────────────────┘                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

##### Database Schema

**Table: `project_home_assistant`**
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `project_id` | UUID | FK to projects |
| `ha_url_encrypted` | TEXT | Nabu Casa URL (encrypted) |
| `access_token_encrypted` | TEXT | Long-lived access token (encrypted) |
| `instance_name` | TEXT | Friendly name (e.g., "Smith Residence HA") |
| `nabu_casa_enabled` | BOOLEAN | Using Nabu Casa for remote access |
| `last_connected_at` | TIMESTAMPTZ | Last successful connection |
| `last_error` | TEXT | Last error message |
| `device_count` | INTEGER | Number of entities |

**View: `project_home_assistant_decrypted`** - Auto-decrypts credentials using Vault

**RPC Functions:**
- `create_project_home_assistant()` - Insert with encryption
- `update_project_home_assistant()` - Update with encryption

##### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ha/status` | GET | Test connection, get version/entity count |
| `/api/ha/entities` | GET | Fetch all entities with states |
| `/api/ha/command` | POST | Execute service call (turn_on, toggle, etc.) |

##### Key Files

| File | Purpose |
|------|---------|
| `api/ha/status.js` | Connection test endpoint |
| `api/ha/entities.js` | Entity list endpoint |
| `api/ha/command.js` | Command execution endpoint |
| `src/services/homeAssistantService.js` | Frontend service layer |
| `src/pages/HomeAssistantPage.js` | HA dashboard/test page |
| `src/components/HomeAssistantSettings.js` | Config UI in project settings |
| `database/migrations/20260115_home_assistant_integration.sql` | DB schema |

##### Setup Requirements

1. **Customer needs Nabu Casa subscription** - Required for remote access from Vercel
2. **Long-lived access token** - Created in HA → Profile → Security
3. **Nabu Casa Remote UI enabled** - Settings → Home Assistant Cloud → Remote Control ON

##### Connection Flow

```
1. PM enters Nabu Casa URL + Token in HomeAssistantSettings
2. Credentials encrypted via Supabase Vault RPC
3. "Test Connection" calls /api/ha/status
4. API decrypts credentials from project_home_assistant_decrypted view
5. API fetches https://{nabu_casa_url}/api/ with Bearer token
6. Returns HA version, entity count, connection status
```

##### Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `fetch failed` | Nabu Casa disconnected | Open account.nabucasa.com → Click "Connect" |
| `401 Unauthorized` | Bad/expired token | Create new Long-Lived Access Token in HA |
| `Connection timeout` | HA not responding | Check HA is running, internet connected |

##### Future Features (Planned)

1. **UniFi device tracking via HA** - Get IP, switch port, WiFi/wired status for network clients
2. **Entity dashboard** - View/control lights, switches, covers from Unicorn
3. **Proactive monitoring** - Alert when critical devices go offline
4. **Sarah integration** - Voice AI can check device status during calls

#### 7.2 Retell AI Voice Integration

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

#### 8.12 AI Email Agent (unicorn@isehome.com)

An AI-powered email agent that reads the `unicorn@isehome.com` inbox, classifies emails using Gemini 3 Flash, and takes automated actions (create service tickets, reply, forward for review).

##### Architecture Overview

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────┐     ┌──────────────┐
│ Cron (5 min) │────▶│ Microsoft Graph   │────▶│ Gemini 3 AI   │────▶│ Action:      │
│ process-emails│     │ Fetch Unread Mail │     │ Classification │     │ • Ticket     │
└──────────────┘     └──────────────────┘     └───────────────┘     │ • Reply      │
                                                                      │ • Forward    │
                                                                      │ • Ignore     │
                                                                      └──────────────┘
```

##### Key Files

| File | Purpose |
|------|---------|
| `api/cron/process-emails.js` | Cron trigger, runs every 5 minutes via vercel.json |
| `api/email/process-incoming.js` | Main processing pipeline: fetch → classify → act |
| `api/_emailAI.js` | Gemini AI classification, customer lookup, reply generation |
| `api/_systemGraphEmail.js` | Microsoft Graph email operations (read, reply, forward, mark read) |
| `api/_systemGraph.js` | App token acquisition (client credentials flow), system account config |
| `api/email/processed.js` | GET endpoint for fetching processed emails with pagination |
| `api/email/stats.js` | GET endpoint for email agent stats |
| `api/email/config.js` | GET/POST endpoint for config management |
| `src/pages/EmailAgentPage.js` | Admin UI - inbox, outbox, settings views |
| `src/components/Admin/EmailAgentSettings.js` | Settings/config component |
| `src/services/emailAgentService.js` | Frontend service layer |

##### Processing Flow

1. Cron calls `/api/email/process-incoming` every 5 minutes
2. Fetches unread emails from `unicorn@isehome.com` via Microsoft Graph API
3. For each email:
   - Check ignore list (noreply, mailer-daemon)
   - **Customer lookup** in `contacts` table (NOT `global_contacts`)
   - Internal domain check — known clients from internal domains ARE processed
   - AI classification via Gemini 3 Flash (support, sales, vendor, billing, scheduling, spam, internal, unknown)
   - **Enriched AI analysis** returns: intent, topics, entities, department, routing reasoning, priority reasoning
   - Action based on classification + confidence:
     - **High confidence support** → Auto-create service ticket + auto-reply
     - **Low confidence** (below `require_review_threshold`) → Forward to `email_agent_forward_email` for human review
     - **`requires_human_review` flag** (e.g., sender name mismatch with CRM) → Still creates ticket, but skips auto-reply
     - **Spam/internal** → Ignore
4. Records everything in `processed_emails` table (including enriched AI metadata)
5. Marks original email as read in Graph

##### Ticket Creation Details

When creating a service ticket from an email:
- `status`: Must be `'open'` (NOT `'new'` — violates CHECK constraint)
- `source_reference`: Email ID from Microsoft Graph
- `initial_customer_comment`: Full email body content
- `ai_triage_notes`: Formatted summary with classification, confidence, urgency, and action items
- `priority`: Mapped from AI urgency (critical→urgent, high→high, medium→medium, low→low)
- `category`: From AI's `ticket_category` field

**CRITICAL**: The `service_tickets` table has a CHECK constraint on `status`. Valid values: `open`, `triaged`, `scheduled`, `in_progress`, `waiting_parts`, `waiting_customer`, `work_complete_needs_invoice`, `problem`, `closed`

##### Ticket Creation Gating Logic

```javascript
const lowConfidence = analysis.confidence < config.reviewThreshold;
const needsReview = lowConfidence || analysis.requires_human_review;

// Ticket creation: only blocked by LOW CONFIDENCE (not human review flag)
if (analysis.should_create_ticket && config.autoCreateTickets && !lowConfidence) {
  // Creates ticket even if requires_human_review is true
}

// Auto-reply: blocked by EITHER low confidence or human review
if (config.autoReply && !needsReview) {
  // Only replies when fully confident AND no review needed
}
```

##### AI Classification Schema

The AI returns enriched metadata for each email (stored in `processed_emails`):

| Field | Type | Description |
|-------|------|-------------|
| `classification` | text | support, sales, vendor, billing, scheduling, spam, internal, unknown |
| `confidence` | float | 0.0–1.0 confidence score |
| `urgency` | text | critical, high, medium, low |
| `intent` | text | request_service, complaint, follow_up, schedule, escalation, information, vendor_quote, etc. |
| `topics` | text[] | Tags: wifi, network, home_theater, camera, audio, security, lighting, shades, etc. |
| `department` | text | service, sales, project_management, admin, billing |
| `suggested_assignee_role` | text | service_tech, project_manager, sales_rep, office_admin, owner |
| `routing_reasoning` | text | Why AI chose this classification and department |
| `priority_reasoning` | text | Why AI chose this urgency level |
| `entities` | jsonb | `{systems_mentioned, locations_mentioned, people_mentioned, dates_mentioned, project_references}` |

##### Human Feedback Loop

To evaluate and improve AI accuracy over time, `processed_emails` includes:

| Column | Type | Purpose |
|--------|------|---------|
| `human_accuracy_rating` | integer (1-5) | How accurate was the AI classification? |
| `human_correct_classification` | text | What should the classification have been? |
| `human_feedback` | text | Free-form notes on AI performance |
| `human_rated_by` | uuid | Who provided the rating |
| `human_rated_at` | timestamptz | When the rating was given |

**Future**: This data feeds into an ops manager routing capability where the AI reviews emails and forwards instructions to employees based on learned patterns.

##### Database Tables

| Table | Purpose |
|-------|---------|
| `processed_emails` | Log of all processed emails with AI classification, enriched metadata, action taken, confidence, human feedback |
| `app_configuration` | Email agent config (keys prefixed `email_agent_*`) |

##### Config Keys (app_configuration)

| Key | Purpose | Default |
|-----|---------|---------|
| `email_agent_enabled` | Master on/off | `true` |
| `email_agent_auto_create_tickets` | Auto-create service tickets | `true` |
| `email_agent_auto_reply` | Auto-reply to customers | `true` |
| `email_agent_forward_email` | Where to forward uncertain emails | `stephe@isehome.com` |
| `email_agent_internal_domains` | Domains treated as internal | `isehome.com,intelligentsystems.com` |
| `email_agent_ignore_domains` | Domains to always ignore | `noreply.com,mailer-daemon` |
| `email_agent_require_review_threshold` | Confidence below this forwards for review | `0.7` |
| `system_account_email` | Mailbox to read from | `unicorn@isehome.com` |

##### Admin UI Access

- Navigate to **Admin → Email Agent** button (navigates to `/admin/email-agent`)
- Page shows: stats dashboard, inbox tab, outbox tab, settings tab
- **Process Now** button triggers immediate email processing

---

### Azure Entra ID / App Registration ("unicorn app")

The app uses a single Azure AD App Registration ("unicorn app") for all Microsoft integrations. Authentication uses **client credentials flow** (Application permissions) for server-side operations and **MSAL interactive flow** (Delegated permissions) for user login.

#### Microsoft Graph API Permissions (as of 2026-02-09)

**Application Permissions (server-side, no user login required):**

| Permission | Description |
|-----------|-------------|
| `Calendars.ReadWrite` | Read and write calendars in all mailboxes |
| `Files.ReadWrite.All` | Read and write files in all site collections |
| `Group.Read.All` | Read all groups |
| `Mail.ReadWrite` | Read and write mail in all mailboxes |
| `Mail.Send` | Send mail as any user |
| `OrgSettings-Todo.Read.All` | Read organization-wide Microsoft To Do settings |
| `OrgSettings-Todo.ReadWrite` | Read and write organization-wide Microsoft To Do settings |
| `Sites.ReadWrite.All` | Read and write items in all site collections |
| `Tasks.ReadWrite.All` | Read and write all users' tasks and tasklists |
| `User.Read.All` | Read all users' full profiles |

**Delegated Permissions (user-interactive, MSAL login flow):**

| Permission | Description |
|-----------|-------------|
| `Calendars.Read` | Read user calendars |
| `Calendars.ReadWrite` | Have full access to user calendars |
| `Calendars.ReadWrite.Shared` | Read and write user and shared calendars |
| `Contacts.Read` | Read user contacts |
| `email` | View users' email address |
| `Files.ReadWrite.All` | Have full access to all files user can access |
| `Mail.ReadWrite` | Read and write access to user mail |
| `Mail.ReadWrite.Shared` | Read and write user and shared mail |
| `Mail.Send` | Send mail as a user |
| `Mail.Send.Shared` | Send mail on behalf of others |
| `offline_access` | Maintain access to data you have given it access to |
| `openid` | Sign users in |
| `profile` | View users' basic profile |
| `Tasks.ReadWrite.Shared` | Read and write user and shared tasks |
| `User.Read` | Sign in and read user profile |
| `User.Read.All` | Read all users' full profiles |

**SharePoint Permissions:**

| Permission | Type | Description |
|-----------|------|-------------|
| `AllSites.FullControl` | Delegated | Have full control of all site collections |
| `Sites.Read.All` | Application | Read items in all site collections |
| `Sites.ReadWrite.All` | Application | Read and write items in all site collections |

All permissions have admin consent granted for Intelligent Systems, LLC.

#### Environment Variables (Azure)

| Variable | Purpose |
|----------|---------|
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_CLIENT_ID` | App registration client ID |
| `AZURE_CLIENT_SECRET` | App registration client secret |

#### Token Acquisition

- **Server-side (API routes):** Client credentials flow via `_systemGraph.js` → `getAppToken()`
- **Client-side (React app):** MSAL interactive flow via `AuthContext.js`
- Token cache: App tokens cached in memory for ~1 hour with 5-minute buffer refresh

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
| `project_home_assistant` | **ENCRYPTED** - Home Assistant credentials per project |
| `global_skills` | Master skill definitions |
| `skill_categories` | Skill category groupings |
| `employee_skills` | Technician skill certifications |
| `manager_relationships` | Org structure (who reports to whom) |
| `review_cycles` | Quarterly review periods |
| `skill_self_evaluations` | Employee self-ratings |
| `skill_manager_reviews` | Manager ratings for employees |
| `development_goals` | 5 focus skills per employee per quarter |
| `review_sessions` | Overall review meeting tracking |

**Org Structure RPC Function:**
```sql
-- Get all reports (direct and indirect) for a manager
SELECT * FROM get_all_reports(manager_uuid, include_inactive_boolean);
-- Returns: employee_id, full_name, email, role, hierarchy_level, hierarchy_path
```

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
| **Prewire mode (technician)** | `src/components/PrewireMode.js` |
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
| **Home Assistant service** | `src/services/homeAssistantService.js` |
| **Home Assistant settings** | `src/components/HomeAssistantSettings.js` |
| **Home Assistant page** | `src/pages/HomeAssistantPage.js` |
| **HA status API** | `api/ha/status.js` |
| **HA entities API** | `api/ha/entities.js` |
| **HA command API** | `api/ha/command.js` |
| **Submittals report service** | `src/services/submittalsReportService.js` |
| **ZIP download service** | `src/services/zipDownloadService.js` |
| **Project reports page** | `src/pages/ProjectReportsPage.js` |
| **SharePoint download API** | `api/sharepoint-download.js` |
| **Career development service** | `src/services/careerDevelopmentService.js` |
| **Career development page** | `src/pages/CareerDevelopmentPage.js` |
| **Team reviews page** | `src/pages/TeamReviewsPage.js` |
| **Review cycles manager** | `src/components/Admin/ReviewCyclesManager.js` |
| **People manager (admin)** | `src/components/Admin/PeopleManager.js` |

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

## Security Architecture & Audit Procedures

### Overview

Supabase project: `dpteljnierdubqsqxfye` (unicorn-app)

**Auth model:** Microsoft MSAL (Azure AD) → Token Exchange → Supabase JWT
- Frontend authenticates via MSAL (Azure AD OAuth)
- `/api/auth/supabase-token` validates the MSAL token against Microsoft Graph, then mints a Supabase-compatible JWT with the Azure OID as `sub`
- `AuthContext.js` calls the exchange on login, redirect, and token refresh (non-blocking)
- Once exchanged, `auth.uid()` resolves to the user's Azure OID inside RLS policies

**Key files:**
- `api/auth/supabase-token.js` — Token exchange endpoint (HS256 signing, no external deps)
- `src/lib/supabase.js` — `setSupabaseSessionFromMSAL()` helper
- `src/contexts/AuthContext.js` — Calls token exchange in 3 places

### Current Security State (as of 2026-02-11)

| Metric | Status |
|--------|--------|
| Security Advisor errors | **0** (was 35) |
| Security Advisor warnings | 418 |
| RLS enabled | All public tables ✅ |
| RLS policies | `USING (true)` placeholder — open access for `anon, authenticated` |
| Views | All SECURITY INVOKER ✅ (was SECURITY DEFINER) |
| JWT signing | Legacy HS256 (migrated to new key management, not yet rotated to ES256) |
| `decrypt_field()` | SECURITY DEFINER (intentional — accesses `vault.decrypted_secrets`) |

### Warning Breakdown (418 total)

| Warning | Count | Notes |
|---------|-------|-------|
| `rls_policy_always_true` | 268 | Intentional placeholder — all policies use `USING (true)`. Tighten after token exchange is verified in production. |
| `function_search_path_mutable` | 145 | Functions without explicit `search_path`. Low priority — add `SET search_path = public` to functions when editing them. |
| `extension_in_public` | 1 | Extension installed in public schema. Supabase default. |
| `materialized_view_in_api` | 1 | Materialized view exposed via API. Review if sensitive. |
| `auth_otp_long_expiry` | 1 | OTP expiry is long. Not relevant (we use MSAL, not Supabase Auth OTP). |
| `auth_leaked_password_protection` | 1 | Leaked password detection disabled. Not relevant (we use MSAL). |
| `vulnerable_postgres_version` | 1 | Supabase manages PG version. Check dashboard for available upgrades. |

### Rules for New Tables

When creating a new table, ALWAYS:
1. Enable RLS: `ALTER TABLE public.new_table ENABLE ROW LEVEL SECURITY;`
2. Add a placeholder policy:
```sql
CREATE POLICY "authenticated_full_access" ON public.new_table
FOR ALL TO anon, authenticated
USING (true) WITH CHECK (true);
```
3. Run `get_advisors` via Supabase MCP to confirm no new errors

### Rules for New Views

When creating a new view, ALWAYS:
1. Use SECURITY INVOKER (the PostgreSQL default in PG15+, but be explicit):
```sql
CREATE VIEW public.my_view
WITH (security_invoker = on)
AS SELECT ...;
```
2. NEVER use `SECURITY DEFINER` on views unless the view itself needs elevated privileges (rare — if a function it calls is already SECURITY DEFINER, the view doesn't need to be)

### Rules for New Functions

- Functions that access `vault.decrypted_secrets` or other privileged objects: use `SECURITY DEFINER`
- All other functions: use `SECURITY INVOKER` (default)
- Always add `SET search_path = public` to avoid `function_search_path_mutable` warnings:
```sql
CREATE OR REPLACE FUNCTION public.my_function()
RETURNS void LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$ ... $$;
```

### JWT Signing Keys

| Key | Type | Status |
|-----|------|--------|
| Current | Legacy HS256 | Active — used by `api/auth/supabase-token.js` |
| Standby | ECC P-256 | Inactive — ready for future rotation |

**Before rotating keys:**
1. Update `api/auth/supabase-token.js` to sign with ES256 using the new private key (or use JWKS)
2. Deploy and verify the token exchange works with the new signing method
3. Only then click "Rotate keys" in Supabase dashboard (Settings → API → JWT Signing Keys)
4. After rotation, the old HS256 key becomes invalid — there is no rollback

### Security Audit Schedule

**Run the Supabase Security Advisor regularly.** Use these commands:

```
# Via Supabase MCP
get_advisors(project_id: "dpteljnierdubqsqxfye", type: "security")
get_advisors(project_id: "dpteljnierdubqsqxfye", type: "performance")
```

**When to audit:**
- After any migration that creates tables, views, or functions
- After any RLS policy changes
- At least once per week during active development
- Before any production deployment with schema changes

**Audit process:**
1. Run both security and performance advisors
2. Parse results — count errors vs warnings
3. **Errors = must fix immediately** (no exceptions)
4. **Warnings = track and fix opportunistically** (update this section's warning table)
5. Document any new warnings that are intentional (like `rls_policy_always_true`)
6. Update the "Current Security State" table above with new counts

**Target:** 0 errors at all times. Warnings should trend downward over time.

### Future Security Roadmap

1. **Tighten RLS policies** — Replace `USING (true)` with `auth.uid()` checks once token exchange is deployed and verified in production. Start with sensitive tables (`project_secure_data`, `contact_secure_data`, `profiles`).
2. **Rotate JWT keys to ES256** — Update token exchange to asymmetric signing, then rotate in Supabase dashboard.
3. **Fix `function_search_path_mutable`** — Add `SET search_path = public` to functions as they are edited. Don't bulk-fix (risk of breaking something).
4. **Review `decrypt_field` access** — Currently callable by `anon` and `authenticated`. Consider restricting to `authenticated` only after token exchange is live.
5. **Add per-table policies** — Different tables may need different access levels (e.g., `profiles` read-only for non-owners, `bug_reports` writable by all authenticated).

### Applied Security Migrations

| Migration | Date | What |
|-----------|------|------|
| `20260211_enable_rls_unprotected_tables.sql` | 2026-02-11 | Enabled RLS on 14 tables, added placeholder policies |
| `20260211_convert_security_definer_views_to_invoker.sql` | 2026-02-11 | Converted 21 views from SECURITY DEFINER to INVOKER |

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
# Frontend (exposed to browser — REACT_APP_ prefix)
REACT_APP_SUPABASE_URL=
REACT_APP_SUPABASE_ANON_KEY=
REACT_APP_AZURE_CLIENT_ID=
REACT_APP_AZURE_TENANT_ID=
REACT_APP_UNIFI_API_KEY=        # Optional
REACT_APP_LUCID_CLIENT_ID=      # Optional
REACT_APP_LUCID_CLIENT_SECRET=  # Optional

# Server-side only (Vercel serverless functions — NOT exposed to browser)
SUPABASE_URL=                   # Same as REACT_APP_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=      # Full admin access — API routes only
SUPABASE_JWT_SECRET=            # HS256 signing key for token exchange (api/auth/supabase-token.js)

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

**Last Updated:** 2026-02-04

## Overview

The AI integration in Unicorn follows the **"Copilot" Architecture**.
- **Goal**: A "Field Partner" that assists via voice commands.
- **Rule**: The AI acts as a **Power User**, using "Tools" to navigate, click buttons, and save data. It DOES NOT access the database directly.
- **Safety**: App logic (validations, state) remains the source of truth.
- **Platform**: Provider-agnostic - supports Gemini, OpenAI, and future providers.

## NEW: Provider-Agnostic Architecture (2026-02-04)

### Design Principles

1. **Configuration-Driven Switching**: Change providers via config, not code
2. **Automatic Fallback**: If primary fails, try backup providers
3. **Unified Tool Definitions**: Define tools once, use with any provider
4. **Future-Proof**: When Gemini 4 launches, add it to config

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                    VoiceAgentOrchestrator                        │
│  - Provider selection & fallback                                 │
│  - Audio I/O management                                          │
│  - Tool execution                                                │
│  - Metrics tracking                                              │
└────────────────────────────┬─────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │     VoiceProvider           │
              │  (Abstract Interface)       │
              └──────────────┬──────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼───────┐   ┌───────▼───────┐   ┌───────▼───────┐
│ GeminiAdapter │   │ OpenAIAdapter │   │ FutureAdapter │
│ - Gemini 3    │   │ - gpt-realtime│   │ - Gemini 4    │
│ - Gemini 2.5  │   │ - gpt-4o      │   │ - Claude RT   │
└───────────────┘   └───────────────┘   └───────────────┘
```

### Module Structure

```
src/voice-ai/
├── index.js                    # Main exports
├── VoiceAgentOrchestrator.js   # Main orchestrator
├── config/
│   └── voiceConfig.js          # Provider & model config
├── providers/
│   ├── VoiceProvider.js        # Abstract interface
│   ├── GeminiAdapter.js        # Gemini implementation
│   └── OpenAIAdapter.js        # OpenAI implementation
└── tools/
    └── ToolRegistry.js         # Unified tool definitions
```

### Switching Providers

```javascript
// In voiceConfig.js - just change these values:
export const DEFAULT_CONFIG = {
  provider: 'gemini',           // or 'openai'
  model: 'gemini-3-flash',      // or 'gpt-realtime'
  fallbackChain: [
    'gemini-2.5-flash-native',  // Fallback 1
    'gpt-realtime',             // Fallback 2
  ],
};
```

### Adding a New Provider (e.g., Gemini 4)

1. Add model definition to `voiceConfig.js`:
```javascript
'gemini-4-flash': {
  provider: PROVIDERS.GEMINI,
  id: 'gemini-4-flash',
  name: 'Gemini 4 Flash',
  // ... capabilities, audio settings, etc.
}
```

2. Update adapter if API changes (usually not needed for same provider)

3. Set as default:
```javascript
model: 'gemini-4-flash'
```

### Local Testing

Voice AI can be tested locally! The WebSocket connects directly from browser to provider APIs.

```bash
# 1. Set up environment
cp .env.example .env.local
# Add: REACT_APP_GEMINI_API_KEY=your-key

# 2. Run dev server
npm start

# 3. Go to Admin > AI Agent tab > Start Test
```

**What requires Vercel (server-side):**
- Azure AI Search (knowledge base)
- Database operations

### Available Models (2026)

| Key | Provider | Status | Latency | Recommended |
|-----|----------|--------|---------|-------------|
| `gemini-3-flash` | Google | Preview | ~250ms | ⭐ Yes |
| `gemini-2.5-flash-native` | Google | Stable | ~320ms | Current default |
| `gpt-realtime` | OpenAI | Stable | ~232ms | For lowest latency |
| `gemini-2.0-flash-live` | Google | ⚠️ Deprecated | ~400ms | Retiring Mar 2026 |

---

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

## Brand Color Violations (RESOLVED 2026-01-30) ✅

**Status:** COMPLETE - All ~200 violations fixed

**What was fixed:** All Tailwind `green-*` and `emerald-*` classes replaced with inline styles using brand olive `#94AF32`.

**50+ files fixed across all modules:**
- Admin, Procurement, HR, Settings, Service, Equipment, Pages, Modules

**Intentionally preserved (NOT violations):**
- `VoiceCopilotOverlay.js` - Debug panel terminal aesthetic
- `UnifiTestPage.js` - Debug console styling
- `RackBackView.jsx`, `RackFrontView.jsx` - Network online/offline status (green=online, red=offline)
- `PowerConnectionsView.jsx` - UPS battery backup indicators

**Fix pattern (for future reference):**
```jsx
// Text color
style={{ color: '#94AF32' }}

// Background (light)
style={{ backgroundColor: 'rgba(148, 175, 50, 0.1)' }}

// Border
style={{ borderColor: 'rgba(148, 175, 50, 0.3)' }}
```

**Verification script:**
```bash
# Should return only intentional exceptions (debug panels, network status, UPS)
grep -rn "text-green-\|bg-green-\|text-emerald-\|bg-emerald-\|border-green-" src --include="*.js" --include="*.jsx" | grep -v "VoiceCopilotOverlay\|UnifiTestPage\|RackBackView\|RackFrontView\|PowerConnectionsView\|UnifiDebug\|styleSystem"
```

---

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

## 2026-02-12

### Email Agent — Ticket Priority Fix + Auto-Reply Confidence Slider
**What:** Fixed ticket creation failing due to invalid priority value; added confidence slider for auto-reply gating.
**Why:** `mapUrgencyToPriority('medium')` returned `'normal'` which violates `service_tickets` CHECK constraint (allowed: low, medium, high, urgent). Also needed user-configurable auto-reply threshold.
**Details:**
- Fixed `mapUrgencyToPriority`: `medium → medium` (was `normal`), default `medium` (was `normal`)
- Added error persistence: ticket creation errors saved to `processed_emails.error_message` and `action_details`
- New `email_agent_auto_reply_threshold` config value (default 0.98)
- Auto-reply now gated by `meetsReplyThreshold` check (separate from `reviewThreshold` for ticket creation)
- Config loader (`_emailAI.js`) loads `autoReplyThreshold` alongside existing settings
**Files:** `api/email/process-incoming.js`, `api/_emailAI.js`, `api/email/config.js`

### Email Agent Settings — Simplify UI + Fix Slider
**What:** Removed duplicate elements from Email Agent settings page; fixed confidence slider visibility.
**Why:** Stats, header, and Process Now button were duplicated between the parent page and settings component. Auto-reply confidence slider wasn't appearing when toggle was on.
**Details:**
- Removed duplicate stats grid (parent `EmailAgentPage.js` already shows 5 stat cards above tabs)
- Removed duplicate header + Process Now button (parent has both)
- Removed redundant "Recent Processed Emails" section (Inbox tab already shows this)
- Fixed slider conditional with robust `autoReplyOn` helper (handles undefined, string 'true'/'false')
- Slider visually nested under Auto Reply toggle with violet left border
- Switched all `blue-500` to `violet-500` for brand consistency
- Extracted reusable `ToggleRow` component
- Reduced from 494 → 337 lines
**Files:** `src/components/Admin/EmailAgentSettings.js`

## 2026-02-11

### Supabase Security — MSAL→Supabase Token Exchange + RLS Enforcement
**What:** Added token exchange endpoint and enabled RLS on all unprotected tables.
**Why:** Supabase Security Advisor flagged 35 errors — 14 tables had no RLS. With MSAL as auth provider, auth.uid() was always null, making RLS unusable. Token exchange bridges the gap so RLS policies can actually enforce access.
**Details:**
- New `/api/auth/supabase-token` endpoint: validates MSAL token via Graph API, mints Supabase JWT with Azure OID as `sub`
- AuthContext calls exchange on login, redirect, and token refresh (non-blocking)
- `supabase.js` exports `setSupabaseSessionFromMSAL()` helper
- Migration enables RLS on 12 unprotected tables + fixes 2 tables with orphaned policies + adds policy to `role_types`
- Security Advisor errors reduced from 35 → 21 (remaining 21 are security_definer views)
**Env:** `SUPABASE_JWT_SECRET` added to Vercel (all environments) ✅
**Files:** `api/auth/supabase-token.js`, `src/contexts/AuthContext.js`, `src/lib/supabase.js`, `database/migrations/20260211_enable_rls_unprotected_tables.sql`

### Supabase JWT Signing Keys Migration
**What:** Migrated project from legacy JWT secret to new JWT signing keys system.
**Why:** Supabase prompted migration to their updated key management infrastructure. Required for long-term compatibility and eventual upgrade to asymmetric (ES256) signing.
**Details:**
- Imported existing HS256 secret into new JWT signing keys system via Supabase dashboard
- Added `SUPABASE_JWT_SECRET` to Vercel environment variables (all environments)
- Did NOT rotate to asymmetric keys — rotation would switch to ECC P-256 and break the HS256 token exchange endpoint
- Verified app loads and authenticates correctly post-migration
**Current key state:** CURRENT = Legacy HS256, STANDBY = ECC P-256 (not active)
**Future:** When ready to rotate, update `api/auth/supabase-token.js` to use ES256/JWKS signing before clicking "Rotate keys" in Supabase dashboard
**Files:** No code changes — dashboard + Vercel config only

### Security Definer Views → Security Invoker (21 views)
**What:** Converted all 21 SECURITY DEFINER views to SECURITY INVOKER using `ALTER VIEW ... SET (security_invoker = on)`.
**Why:** Supabase Security Advisor flagged all 21 as ERROR — SECURITY DEFINER views bypass RLS, running queries as the view creator instead of the querying user.
**Details:**
- 18 plain views (joins/aggregates only) — converted directly, no risk
- 3 decrypted views (`project_secure_data_decrypted`, `contact_secure_data_decrypted`, `project_home_assistant_decrypted`) — safe because they call `decrypt_field()` which is itself SECURITY DEFINER, preserving vault access through the function
- PG17's `ALTER VIEW SET (security_invoker)` — no drop/recreate needed
- All 21 views verified returning data post-migration
- **Security Advisor errors: 35 → 0** (all errors resolved across both migrations)
**Files:** `database/migrations/20260211_convert_security_definer_views_to_invoker.sql`

### Email Agent — Ticket Creation Bug Fixes
**What:** Fixed 4 cascading bugs preventing the email agent from auto-creating service tickets
**Why:** Support emails (e.g., WiFi issues) were classified correctly (confidence 1.0, urgency high) but action_taken stayed "pending_review" — no ticket was created.

**Bug 1 — `requires_human_review` blocking ticket creation:**
- AI flagged `requires_human_review: true` when sender name didn't match CRM record
- Code gated ticket creation on `!needsReview` which included this flag
- Fix: Separated `lowConfidence` from `needsReview` — tickets only blocked by low confidence

**Bug 2 — `actionTaken` never updated:**
- `actionTaken` was only set to `'ticket_created'` inside the reply block, not the ticket block
- If no reply sent (because of review flag), action stayed `pending_review`
- Fix: Set `actionTaken = 'ticket_created'` immediately after successful ticket insert

**Bug 3 — `createServiceTicket` used invalid columns:**
- Function used `metadata` (jsonb) and `created_by_email` which don't exist on `service_tickets`
- Insert failed silently in try/catch
- Fix: Replaced with `source_reference`, `initial_customer_comment`, `ai_triage_notes`

**Bug 4 — `status: 'new'` violates CHECK constraint:**
- `service_tickets` table has CHECK constraint; `'new'` is not a valid value
- Fix: Changed to `status: 'open'`

**Files:** `api/email/process-incoming.js`

### Email Agent — Enriched AI Metadata
**What:** Added rich AI analysis fields for future ops manager routing and human feedback loop
**Why:** Enables evaluating AI accuracy over time and prepares for routing emails to specific employees

**New AI fields:** intent, topics, entities, department, suggested_assignee_role, routing_reasoning, priority_reasoning
**New human feedback fields:** human_accuracy_rating, human_correct_classification, human_feedback, human_rated_by, human_rated_at

**Files:** `api/_emailAI.js`, `api/email/process-incoming.js`
**Migration:** `add_email_agent_feedback_and_routing_metadata` (applied to Supabase)

### Destructive Commit Recovery (7c4d067)
**What:** Restored 47 files (10 deleted, 37 reverted) destroyed by a concurrent Claude session
**Why:** Session doing stakeholder query fix used stale git plumbing, silently dropping all files it didn't know about

**Root cause:** `git read-tree` + selective `update-index --add` without loading the full tree first = everything not explicitly added gets deleted. Git plumbing gives zero warnings.

**Restored files include:** `api/_aiConfig.js`, `shared/aiConfig.js`, `api/cron/close-fixed-bugs.js`, `scripts/generate-routes-map.js`, `shared/routesMap.json`, `scripts/gh-cli.js`, 3 database migrations, all api/bugs/* enhancements, AGENT.md docs, CLAUDE.md rules, notification services, auth context changes, and more.

**Files:** 47 files across the entire codebase

### Git Safety Guard
**What:** Added `scripts/git-safe-commit.sh` wrapper that validates commits before creation
**Why:** Prevents repeat of 7c4d067 incident where concurrent session wiped 47 files

- Aborts if >3 files would be deleted
- Aborts if >500 net LOC would be deleted
- Override with `--force` for intentional deletions
- Added mandatory rules to CLAUDE.md

**Files:** `scripts/git-safe-commit.sh`, `CLAUDE.md`

### Git Session Branching Workflow
**What:** Each Claude session now works on its own branch instead of pushing to main
**Why:** Prevents concurrent sessions from overwriting each other's work; enables safe multitasking

**How it works:**
1. Session starts: `source scripts/git-branch-session.sh "task-description"`
2. Creates branch: `claude/YYYY-MM-DD-task-description`
3. Handles index.lock automatically (copies .git to /tmp, removes locks)
4. Uses plumbing (symbolic-ref + read-tree) — no git checkout needed
5. Session commits and pushes to its own branch
6. Steve (or merge session) runs `scripts/git-merge-branches.sh --all` to combine

**Merge script features:** `--list` shows all branches, `--dry-run` previews, deletion safety checks, conflict detection (aborts without auto-resolving), auto-creates local tracking branches from remotes.

**Files:** `scripts/git-branch-session.sh`, `scripts/git-merge-branches.sh`, `CLAUDE.md`

---

## 2026-02-07

### Bug Fixes (Automated)

**What:** Fixed bugs #29 and #20

**Bug #29 — Contact secure data audit log save failure:**
- Root cause: `logAccess()` method referenced non-existent table `contact_secure_data_audit_log` — the actual table is `secure_data_audit_log`
- Also removed non-existent `contact_id` column from the insert payload
- Fixed `getAuditLogs()` to query by `secure_data_id` via the `contact_secure_data` table instead of the missing `contact_id` column

**Bug #20 — Skill names not visible on phones in portrait mode:**
- Root cause: Desktop table layout (with fixed-width columns w-44) was shown at `md` breakpoint (768px), causing skill names to overflow and become invisible on narrow phone screens
- Fix: Changed breakpoint from `md` to `lg` (1024px) so the mobile card layout (which properly shows skill names) is used on phones and tablets

**Files:** `src/services/equipmentService.js`, `src/components/CareerDevelopment/SkillReviewPanel.js`
**AI Note:** Automated fix via overnight-bug-fix skill

---

## 2026-02-05

### Service Ticket - Clickable Address for Maps

**What:** Made customer and service addresses clickable in service ticket detail to open in Apple Maps.

**Why:** Technicians need to quickly navigate to the service location. Clicking the address now opens Apple Maps (works on iOS, opens web on other platforms).

**Files Modified:**
- `src/components/Service/ServiceTicketDetail.js` - Made addresses clickable links

**UI Change:**
- Both mobile and desktop customer info sections now show addresses as clickable links
- Address text is underlined with an external link icon
- Clicking opens Apple Maps with the address as the destination
- Works for both `customer_address` and `service_address` fields

**AI Note:** Uses `maps.apple.com` URL which opens Apple Maps on iOS or the web version on other platforms. Google Maps users on Android will be prompted to open in their maps app from the browser.

---

### Contact Detail Page - Visible Edit Button

**What:** Added a visible "Edit" button to the contact detail page's contact info card.

**Why:** The edit functionality was already implemented but only triggered by clicking the avatar icon, which wasn't discoverable. Users needed a clear way to enter edit mode to modify contact details or delete the contact.

**Files Modified:**
- `src/components/ContactDetailPage.js` - Added visible Edit button in the contact info card header

**UI Change:**
- Contact info card now shows an "Edit" button (with pencil icon) in the top-right corner
- Clicking Edit opens the existing edit modal which includes all contact fields and a Delete button
- Avatar is no longer a clickable button (reduced confusion)

**AI Note:** The ContactDetailPage already had full edit/delete functionality via `handleEditContact` and `handleDeleteContact` handlers. This change just improves discoverability by adding a visible button.

---

### Dynamic Route Discovery & Unified AI Configuration

**What:** Created a self-maintaining bug analysis system with dynamic route discovery and centralized AI model configuration. Bug reports now automatically map to correct source files without hardcoded routes, and all AI services use a unified config.

**Why:**
1. The bug analyzer was suggesting wrong files (e.g., `/my-hr` route wasn't in the hardcoded `PAGE_FILE_MAP`)
2. AI model configurations were fragmented across 11+ API files with 5 different patterns
3. Bug report instructions at the bottom of files were being ignored by AI assistants

**Architecture:**
```
unicorn/
├── shared/
│   ├── aiConfig.js          # Unified AI model config (NEW)
│   └── routesMap.json       # Generated at build time (NEW)
├── scripts/
│   └── generate-routes-map.js  # Parses App.js for routes (NEW)
├── api/
│   ├── _aiConfig.js         # Backend wrapper (NEW)
│   └── bugs/
│       └── analyze.js       # Uses dynamic routes (UPDATED)
└── src/components/Admin/
    └── BugTodosTab.js       # Injected instruction template (UPDATED)
```

**New Files:**
- `shared/aiConfig.js` - Unified AI model definitions and service configurations
- `scripts/generate-routes-map.js` - Parses App.js to extract route→component mappings
- `api/_aiConfig.js` - Backend wrapper providing `getModelForService()`, `getGenAI()`

**Key Changes:**
1. **Route Discovery:** `npm run generate-routes` parses App.js, extracts 57+ routes, outputs `routesMap.json`
2. **Unified AI Config:** All services use `AI_SERVICES` config (BUG_ANALYZER, PART_ENRICHER, etc.)
3. **Bug Report Template:** Uses "injected instruction" format - proven more effective in testing:
   - STOP instructions at TOP of document
   - Forces independent analysis BEFORE viewing AI suggestions
   - Checkpoint to verify analysis before proceeding

**Files Modified:**
- `api/bugs/analyze.js` - Uses `getModelForService('BUG_ANALYZER')` + dynamic routes
- `src/components/Admin/BugTodosTab.js` - New `generateCompleteBugReport()` with injected instructions
- `package.json` - Added `generate-routes`, `prebuild`, `prestart` scripts

**Build Scripts Added:**
```json
{
  "generate-routes": "node scripts/generate-routes-map.js",
  "prebuild": "npm run generate-routes && npm run sync-docs",
  "prestart": "npm run generate-routes"
}
```

**AI Note:** Bug reports now use "dual-perspective verification" - the AI assistant must complete independent analysis before comparing with Gemini's suggestion. Testing showed this significantly improves fix accuracy. The injected instruction format (directives at TOP) is more effective than passive instructions at bottom.

---

## 2026-02-05

### Fix: Skill names hidden on mobile in Self-Evaluation (BR-2026-01-30-0001)

**What:** Skill names were not visible in the Self-Evaluation section when viewing on mobile devices in portrait mode. Users could see rating icons but couldn't identify which skill they were rating.

**Why:** The SkillReviewPanel.js component used a fixed-width table layout (432px of fixed columns) that didn't fit on mobile screens (~375px). The skill name column with `flex-1 min-w-0` would shrink to zero width.

**Root Cause:** Unlike SkillComparisonView.js which had separate mobile/desktop layouts, SkillReviewPanel.js only had the desktop table layout with no responsive breakpoints.

**Fix:** Added a mobile-first responsive layout using `md:hidden` / `hidden md:block` pattern:
- Mobile (<768px): Stacked card layout with skill name prominent, ratings in 2-column grid below
- Desktop (>=768px): Original table layout preserved

**Files Modified:**
- `src/components/CareerDevelopment/SkillReviewPanel.js` - Added mobile layout (lines 524-632)

**AI Note:** The mobile layout follows the same pattern as SkillComparisonView.js. Both self-evaluation and manager review modes now work on mobile. Development Focus checkbox for managers appears as a full-width button on mobile for better touch targets.

---

## 2026-02-04

### Dynamic AI Context System (Self-Aware Agent)

**What:** Replaced hardcoded AI system prompt with dynamic context loading. The AI agent now builds its awareness from the database and config files, not hardcoded strings.

**Why:** As the app evolves, the AI needs to automatically know about new features, pages, and data types without code changes. The goal is an agent "as useful as handing the app to a person."

**Architecture:**

| Component | Before | After |
|-----------|--------|-------|
| App description | Hardcoded in AIBrainContext | Loaded from `ai_app_context` table |
| Data model | Hardcoded list | Dynamic from `aiContextService.getKnownSchema()` |
| Page count | Not shown | Injected from `PAGE_REGISTRY` |
| Trained pages | Not shown | Counted from `page_ai_context` table |
| Query types | Hardcoded | Defined in service, shown in prompt |

**New Files:**
- `src/services/aiContextService.js` - Builds dynamic context from DB + config
- `database/migrations/2026-02-04_ai_app_context.sql` - Editable app knowledge table

**Database Table: ai_app_context**
```sql
-- Editable business knowledge for the AI
INSERT INTO ai_app_context (category, key, value) VALUES
('company', 'name', 'ISE'),
('company', 'services', 'Shades, automation, networking...'),
('workflow', 'stages', 'Prewire → Trim-out → Commissioning → Service'),
('terminology', 'shades', 'Also called: blinds, window treatments...');
```

**How to Update AI Knowledge:**
1. Edit rows in `ai_app_context` table via Supabase dashboard
2. AI will use new values on next session (cached 5 minutes)
3. No code deployment needed!

**Files Modified:**
- `src/contexts/AIBrainContext.js` - Uses aiContextService for dynamic prompt
- Added `dynamicContextRef` and context loading on mount

---

### AI Agent Database Query Capability (query_data tool)

**What:** Added a new `query_data` tool that gives the Voice AI agent full database awareness. The agent can now answer questions like "Does Bill Thomas have any Apple TVs?" by querying contacts, projects, and equipment.

**Why:** Previously, the AI agent could only see the current view state (what's on screen). Now it can query the entire Unicorn database to answer questions about clients, their projects, and deployed equipment.

**New Tool: query_data**
Query types supported:
- `contact` - Search contacts by name, email, or company
- `project` - Search projects by name or get projects for a contact
- `equipment` - Search equipment by name, manufacturer, or model
- `contact_equipment` - **KEY**: Get ALL equipment for a client across all their projects
- `shades` - Search window treatments
- `tickets` - Search service tickets

**Example Usage:**
```
User: "Does Bill Thomas have any Apple TVs?"
AI: query_data(contact_equipment, "Bill Thomas", {equipmentSearch: "Apple TV"})
→ Returns: contact info, all projects, all matching equipment with project names
```

**System Prompt Updates:**
- Added "What is UNICORN?" section explaining the business
- Added "Data You Can Query" section listing queryable entities
- Added tool priority guidance (query_data FIRST for client/equipment questions)

**Files:**
- `src/contexts/AIBrainContext.js` - Added queryData function, tool declaration, and handler

**Database:** No changes (reads existing tables: contacts, projects, equipment, shades, service_tickets)

**AI Note:** The agent now has 6 meta-tools: get_context, execute_action, search_knowledge, **query_data**, navigate, quick_create (plus training tools). Tool priority: query_data for client data, search_knowledge for product docs, get_context for current view.

---

### Gemini 3 Flash Default + AI Settings Consolidation

**What:** Upgraded the AI Agent to use Gemini 3 Flash as the default model and removed the AI Copilot settings from the user Settings page (now consolidated in Admin > AI Agent).

**Why:** Gemini 3 Flash offers 40-60% faster latency and better reasoning. Consolidating AI settings in Admin provides a single location for all AI configuration, testing, and monitoring.

**Changes:**
1. **Default Model**: Changed from `gemini-2.5-flash-native-audio-preview-12-2025` → `gemini-3-flash-preview`
2. **Removed Deprecated Model**: Removed `gemini-2.0-flash-live-001` from selection (retiring March 2026)
3. **Fallback Chain**: Now Gemini-only: `gemini-3-flash → gemini-2.5-flash-native` (no OpenAI)
4. **Settings Page**: Removed AI Copilot section (redirects to Admin > AI Agent)

**Files:**
- `src/contexts/AIBrainContext.js` - Updated DEFAULT_MODEL to gemini-3-flash-preview
- `src/components/Admin/AIAgentTab.js` - Cleaned up model list, marked Gemini 3 as default
- `src/voice-ai/config/voiceConfig.js` - Updated default config and fallback chain
- `src/components/SettingsPage.js` - Removed AISettings import and section

**Database:** No changes

**AI Note:** Unicorn uses Gemini exclusively - no OpenAI models. The provider-agnostic architecture in `src/voice-ai/` supports OpenAI for future flexibility but is not used. Azure AI Search (SharePoint RAG) remains connected via the `search_knowledge` tool.

---

### Fix AI Enrichment Status Display Bug in Parts List Views

**What:** Fixed bug where parts were showing the purple "AI Enriched" dot even when no actual enrichment data was found.

**Why:** The enrichment status check only verified `ai_enrichment_status === 'completed'`, but didn't check if actual data was populated. Manus AI sets the status to "completed" when the research task finishes, even if no useful documentation was found. This caused parts to appear enriched when they had no real data.

**Fix:** Updated the `hasAIDocs` check to require BOTH a completed status AND actual enrichment data (either `ai_enrichment_data`, `install_manual_urls`, `technical_manual_urls`, or `user_guide_urls`).

**Files:**
- `src/components/GlobalPartsManager.js` (line 505)
- `src/components/PartsListPage.js` (line 608)

**Database:** No changes

**AI Note:** The detail page (`PartDetailPage.js`) still shows the status as "Completed" which is correct - it indicates the research ran, even if no docs were found. The fix only affects list views where the purple dot was misleading.

---

### AI Agent Control Center - Unified Voice AI Management

**What:** Created new consolidated AI Agent page in admin section that combines voice control interface, AI copilot settings, and brain training into one unified control center.

**Why:** Provide administrators with a single location to test, configure, and monitor the Voice AI system. Previously, AI settings were scattered across User Settings (copilot settings) and Admin (training). The new page enables real-time voice testing with metrics, model selection (including new Gemini 3 Flash info), and full control over VAD parameters.

**Features:**
- **Voice Control Interface**: Real-time test sessions with live metrics (latency, connection time, audio chunks, turns)
- **Model Selection**: Dropdown with Gemini 3 Flash (preview, recommended), Gemini 2.5 Flash (stable), and deprecated 2.0 warning
- **VAD Configuration**: Start/End sensitivity, silence duration, prefix padding with quick presets (Snappy, Balanced, Patient, Interview)
- **Reconnect Button**: Apply settings changes without leaving the page
- **AI Copilot Settings**: Persona selection, voice preference, custom instructions, conversation transcript (collapsible)
- **AI Brain Training**: Page training status, progress tracking, publish controls (collapsible)
- **Model Information**: Gemini 3 highlights and comparison

**Files:**
- `src/components/Admin/AIAgentTab.js` (NEW - 1100+ lines)
- `src/pages/AdminPage.js` (Updated imports and tab references)

**Database:** No changes

**AI Note:** The Voice AI now uses `gemini-2.5-flash-native-audio-preview-12-2025` as default. Gemini 3 Flash is available as preview with 40-60% faster latency. The old `gemini-2.0-flash-live-001` is deprecated and retiring March 3, 2026. Migration recommended. VAD only supports HIGH and LOW sensitivity (no MEDIUM - causes WebSocket errors).

---

## 2026-02-02

### Service Weekly Planning: Fix Unschedule Ticket Bug

**What:** Added missing `getById()` method to `serviceScheduleService` to fix the "cannot move tickets off schedule" error.

**Why:** Users could not drag service tickets from the weekly planning calendar back to the unscheduled panel. The error `ge.AD.getById is not a function` appeared in the console because `serviceScheduleService.getById()` was being called but didn't exist.

**Root Cause:** The `handleUnschedule` function in `WeeklyPlanning.js` (line 1129) calls `serviceScheduleService.getById(scheduleId)` to fetch the schedule before deletion (needed to get calendar_event_id for cancellation emails). However, this method was never implemented in `serviceScheduleService`.

**Fix Applied:**
- Added `getById(id)` method to `serviceScheduleService` in `serviceTicketService.js`
- Method fetches a single schedule by ID with related ticket data
- Follows same pattern as `getByDateRange()` query structure

**Files:** `src/services/serviceTicketService.js`

**AI Note:** The service layer pattern requires all CRUD operations to be in services. When calling `serviceXxxService.getById()`, ensure the method exists - this was a missing method that went unnoticed until runtime.

---

## 2026-01-30

### HR System: Quick Notes & Team Development Fixes

**What:** Fixed Quick Notes save functionality and Team Development notes display in the HR system. Also enhanced Quick Notes to allow managers to write notes about ANY employee, not just direct reports.

**Why:**
1. Quick Notes were failing with 401 Unauthorized due to RLS policies checking `auth.uid()` which is always NULL with MSAL authentication.
2. Managers need to document observations about any employee, not just their direct reports (e.g., cross-team collaboration, observed behaviors).

**Root Cause:** Supabase RLS policies use `auth.uid()` which only works with Supabase Auth. Since Unicorn uses MSAL (Microsoft authentication), `auth.uid()` always returns NULL, causing all INSERT operations to be denied.

**Fixes Applied:**
1. Disabled RLS on `employee_notes` table (app handles auth via MSAL)
2. Fixed `EmployeeNotesList` props in `TeamDevelopmentSection` - was passing wrong props (`notes`, `employeeName`) instead of expected props (`employeeId`, `reviewCycleId`)
3. Removed redundant manual notes loading in `TeamDevelopmentSection` (component handles its own data fetching)
4. Added "Other Employees" expandable section in Quick Notes for managers
5. Added search functionality to find employees by name or email
6. Added `getAllEmployees()` function to hrService

**Files:**
- `database/migrations/2026-01-30_disable_employee_notes_rls.sql` - Disables RLS for MSAL compatibility
- `src/pages/MyHRPage.js` - Fixed EmployeeNotesList props, added allEmployees state, passes userRole to QuickNoteButton
- `src/components/HR/QuickNoteButton.js` - Added "Other Employees" section with search for managers
- `src/services/hrService.js` - Added `getAllEmployees()` function, `.maybeSingle()` fix for PTO balance checks
- `src/services/careerDevelopmentService.js` - Changed `.single()` to `.maybeSingle()` for queries that may return no rows (fixes 406 errors)

**Database:** No new tables. RLS disabled on `employee_notes` table.

**AI Note:** For MSAL-authenticated apps, RLS policies using `auth.uid()` will always fail. Either disable RLS or use service role key. The app handles authorization at the application layer instead. Quick Notes now supports writing about any employee for users with manager/director/admin/owner roles.

---

### 🎨 MAJOR: Brand Color Compliance Overhaul (Complete)

**What:** Fixed ALL ~200 green/emerald Tailwind color violations across the codebase, replacing them with the brand olive color `#94AF32` using inline styles.

**Why:** Enforcing brand consistency - success/positive colors must use olive `#94AF32`, not Tailwind `green-*` or `emerald-*` classes.

**Scope:** 50+ files modified across all modules:
- Admin components (AdminPage.js, BugTodosTab.js, AITrainingTab.js, SkillsManager.js, etc.)
- Procurement (ProcurementDashboard.js, SupplierManager.js, POLineItemsEditor.js, etc.)
- HR components (TimeOffSection.js, HRPreferencesManager.js, TeamPTOAllocations.js, etc.)
- Settings (SettingsPage.js, AISettings.js, UserSkillsSection.js)
- Service (NewTicketForm.js, TechnicianFilterBar.jsx, ServicePhotosManager.js)
- Equipment (ProjectEquipmentManager.js, PartDetailPage.js, GlobalPartsManager.js)
- Pages (AdminPage.js, ServiceReports.js, WeeklyPlanning.js, MyHRPage.js, etc.)
- Modules (wire-drops, issues, wire-drop-commissioning)

**Intentionally Preserved (NOT violations):**
- `VoiceCopilotOverlay.js` - Debug panel terminal aesthetic (green-on-black)
- `UnifiTestPage.js` - Debug console styling
- `RackBackView.jsx` - Network online/offline status indicators
- `RackFrontView.jsx` - Network status dots (green=online, red=offline)
- `PowerConnectionsView.jsx` - UPS battery backup indicators

**Pattern Applied:**
```jsx
// Text color
style={{ color: '#94AF32' }}

// Background (light)
style={{ backgroundColor: 'rgba(148, 175, 50, 0.1)' }}

// Solid background (buttons)
style={{ backgroundColor: '#94AF32' }}

// Border
style={{ borderColor: 'rgba(148, 175, 50, 0.3)' }}
```

**AI Note:** The codebase is now brand-compliant. ALWAYS use inline styles with `#94AF32` for success states. The only exceptions are: (1) terminal/debug aesthetics, (2) network online/offline status, (3) UPS power indicators.

---

### Documentation Architecture Overhaul
**What:** Restructured documentation to make AGENT.md the single source of truth
**Why:** Prevent doc fragmentation and ensure AI agents always have complete context
**Files:** `AGENT.md`, `.claude/skills/unicorn/SKILL.md`
**Changes:**
- Added comprehensive Table of Contents with line number references to AGENT.md
- Updated unicorn skill to be a "loader" that guides selective AGENT.md reading
- Archived redundant docs (QUICKSTART.md, CORE.md, CLAUDE.md, START-SESSION.md)
- AGENT.md is now THE source - no more duplicate docs to maintain
**AI Note:** When working on Unicorn, invoke `/unicorn` skill which provides line-number guide for reading AGENT.md sections efficiently without loading all 300KB

---

## 2026-01-29

### Admin Panel Consolidation - People & Organization

Consolidated three separate admin tabs (Users, Employee Skills, Org Structure) into a single unified "People" tab with sub-tabs for cleaner navigation.

**What Changed:**
- **Removed tabs:** Users, Employee Skills, Org Structure (3 tabs)
- **Added tab:** People (1 tab with 3 sub-tabs)
- Admin tabs reduced from 11 to 9

**New Component:**
| File | Purpose |
|------|---------|
| `src/components/Admin/PeopleManager.js` | Unified people/org management with sub-tabs |

**PeopleManager Sub-tabs:**
| Sub-tab | Features |
|---------|----------|
| **Directory** | User list with role assignment, manager assignment (Reports to:), activate/deactivate, search/filter |
| **Org Chart** | Visual tree view of organizational hierarchy with expand/collapse |
| **Team Skills** | Manager view of employee skill proficiencies with "Manage Skills" modal |

**UI Changes:**
- Skill badges removed from Directory view (skills managed in Team Skills sub-tab)
- Manager assignment inline with save/cancel for pending changes
- Search by name, email, or role
- Show inactive toggle
- Stats cards: Active Users, Top Level, Reports, Skill Assignments

**Admin Tab Order (Current):**
1. People (new unified tab)
2. Skills
3. Review Cycles
4. Features
5. Integrations
6. Import
7. Company
8. AI Training
9. Bug Todos

---

## 2026-01-28

### Career Development & Quarterly Skills Review System (Major Feature)

Added a comprehensive career development feature enabling self-evaluations, manager reviews, development goals, and quarterly review cycles.

**Feature Overview:**
- **Self-Evaluation** - Employees rate themselves on all skills in the system
- **Manager Reviews** - Quarterly skill assessments by direct managers
- **Comparison View** - Side-by-side self vs manager ratings with discrepancy highlighting
- **Development Goals** - 5 focus skills per quarter agreed between employee and manager
- **Review Cycles** - Admin-managed quarterly periods with due dates
- **Training Links** - Direct access to training resources per skill
- **Audit Trail** - Full history of all rating changes

**Database Tables Created:**
| Table | Purpose |
|-------|---------|
| `manager_relationships` | Org structure (who reports to whom) |
| `review_cycles` | Quarterly review periods |
| `skill_self_evaluations` | Employee self-ratings per skill |
| `skill_manager_reviews` | Manager ratings per employee skill |
| `development_goals` | 5 focus skills per employee per quarter |
| `review_sessions` | Overall review meeting tracking |
| `skill_review_history` | Audit trail of all changes |

**UI Pages Created:**
| Route | Component | Purpose |
|-------|-----------|---------|
| `/career` | `CareerDevelopmentPage.js` | Employee self-evaluation & goals |
| `/team-reviews` | `TeamReviewsPage.js` | Manager review dashboard |
| Admin → Review Cycles | `ReviewCyclesManager.js` | Cycle CRUD & status management |

**Components Created:**
| File | Purpose |
|------|---------|
| `src/components/CareerDevelopment/SkillRatingPicker.js` | Reusable rating picker (none/training/proficient/expert) |
| `src/components/CareerDevelopment/SelfEvaluationForm.js` | Employee self-evaluation form |
| `src/components/CareerDevelopment/DevelopmentGoalsSection.js` | Manage 5 development goals |
| `src/components/CareerDevelopment/SkillComparisonView.js` | Side-by-side self vs manager |
| `src/components/Admin/ReviewCyclesManager.js` | Admin cycle management |

**Service Layer:**
| File | Purpose |
|------|---------|
| `src/services/careerDevelopmentService.js` | Full CRUD for reviews, goals, cycles |

**Files Modified:**
| File | Changes |
|------|---------|
| `src/App.js` | Added routes for `/career` and `/team-reviews` |
| `src/components/AppHeader.js` | Added page titles |
| `src/components/SettingsPage.js` | Added Career Development link |
| `src/pages/AdminPage.js` | Added Review Cycles tab |

**User Flow - Employee:**
1. Navigate to Settings → Career Development
2. View current review cycle and due dates
3. Rate yourself on all skills by category
4. Add notes for context
5. Submit self-evaluation
6. View development goals set by manager

**User Flow - Manager:**
1. Navigate to Team Reviews
2. See list of direct reports with status badges
3. Select employee → view comparison
4. Add manager ratings and notes
5. Set/confirm 5 development goals
6. Submit review → updates official `employee_skills`

**Design Decisions:**
- Employees can self-rate ALL skills (allows highlighting skills not yet assigned)
- Rating levels include 'none' for unrated skills
- 5 max development goals per quarter (enforced by DB constraint)
- Manager finalization copies ratings to `employee_skills` table
- Full audit trail via `skill_review_history` table

**AI Note:** Career development pages accessible via `/career` (employees) and `/team-reviews` (managers). Review cycles managed in Admin panel. Skills are grouped by category (skill_categories table) with training URLs available per skill.

---

### Parts AI Lookup Manager Page

Added a new dedicated page for managing AI-powered parts documentation lookup at `/parts/ai-lookup`.

**What:**
- New `PartsAILookupPage` component for selecting and running batch AI lookups
- Table view of all parts needing AI enrichment (null, pending, or error status)
- Multi-select checkboxes for batch processing
- Real-time progress tracking with polling
- Credit estimation and budget warning (100 credits/part, 4000/month)
- Automatic prewire item filtering (wires, cables, brackets, etc.)

**Why:**
- Users needed a dedicated interface to manage which parts get AI documentation lookup
- The existing AI badge on parts list was confusing - it showed for parts needing review, not parts with successful lookups
- Batch selection allows better control over credit usage

**UI Changes:**
- AI badge on parts list now only shows for `completed` status (purple badge)
- Separate blue "Review" badge for parts needing human review of AI results
- New "AI Lookup" button in Parts Catalog action bar
- New route at `/parts/ai-lookup`

**Files Created:**
| File | Purpose |
|------|---------|
| `src/components/PartsAILookupPage.js` | New AI lookup manager page |

**Files Modified:**
| File | Changes |
|------|---------|
| `src/App.js` | Added lazy import and route for `/parts/ai-lookup` |
| `src/components/PartsListPage.js` | Added AI Lookup button, fixed AI badge logic |
| `src/components/AppHeader.js` | Added page title for AI Lookup page |

**AI Note:** The AI badge (purple, Bot icon) now indicates a part has COMPLETED AI documentation lookup. Parts with `needs_review` status show a blue "Review" badge instead. Users can access `/parts/ai-lookup` to batch-select parts for Manus AI research.

---

### Voice AI Latency Optimization

Optimized Gemini Live API configuration for faster voice response times. User reported laggy/slow responses - applied multiple optimizations to reduce total latency by ~500-1000ms per interaction.

**Problem Solved:**
- Voice AI felt slow and unresponsive
- Long delay between user stopping speech and AI responding
- Audio capture had unnecessary buffering latency

**Solution:**
Applied four latency optimizations:

| Setting | Before | After |
|---------|--------|-------|
| Audio buffer | 4096 samples (~85ms) | 2048 samples (~42ms) |
| Silence detection | 1000-1500ms | 500-750ms |
| Prefix padding | 300ms | 200ms |
| Thinking mode | Enabled | Disabled (`thinkingBudget: 0`) |

**Files Modified:**
| File | Changes |
|------|---------|
| `src/contexts/AIBrainContext.js` | Reduced buffer size, silence duration, prefix padding; disabled thinking mode |
| `docs/VOICE-AI-REFERENCE.md` | Added "Speed Optimizations" section documenting changes |

**AI Note:** Voice copilot is now optimized for speed over deliberation. May occasionally cut off user slightly early or provide quicker (less deliberate) responses. This is intentional for field technician UX where speed matters more than perfect turn-taking.

---

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

### 🚨 HOW TO LIST AND FIX BUGS (READ THIS FIRST)

**Bug reports are GitHub Pull Requests**, NOT git commits or GitHub Issues.

#### List Open Bugs
```bash
gh pr list --repo isehome/unicorn --state open --search "[Bug]"
```

#### Read a Bug Report
```bash
# Get PR details and branch name
gh pr view <PR_NUMBER> --json title,body,headRefName

# Fetch the full markdown report from the branch
gh api "repos/isehome/unicorn/contents/bug-reports/<YEAR-MONTH>/<BUG_ID>.md" \
  -H "Accept: application/vnd.github.raw" \
  -F ref=<BRANCH_NAME>
```

#### Fix a Bug Workflow (AI Agent — Automated)
1. **List bugs:** `gh pr list --state open --search "[Bug]"`
2. **Read the bug report:** Fetch the markdown file from the PR branch
3. **Follow the embedded instructions** in the bug report (they are prompts for you)
4. **Implement the fix** on the main branch
5. **Commit and push** the fix to main (one commit per bug preferred)
6. **Mark pending_review in Supabase** (via Supabase MCP — NOT the Vercel API):
   ```sql
   UPDATE bug_reports SET status = 'pending_review',
     fix_summary = 'Description of what was fixed and how'
   WHERE bug_report_id = 'BR-YYYY-MM-DD-NNNN';
   ```
7. **Update AGENT.md changelog** (REQUIRED)
8. Steve reviews and approves through the Unicorn UI

#### Fix a Bug Workflow (Manual — Admin UI)
1. Admin opens **Bug Todos** tab
2. Reviews the bug details (AI analysis, screenshot, suggested fix)
3. Implements the fix manually
4. Clicks **"Mark Fixed"** button → closes GitHub PR, deletes branch, marks as `fixed`

#### Example: Automated Fix for Bug #24
```bash
# 1. See what bugs exist
gh pr list --state open --search "[Bug]"

# 2. Read bug #24's full report
gh pr view 24 --json headRefName  # Get branch name
gh api "repos/isehome/unicorn/contents/bug-reports/..." \
  -H "Accept: application/vnd.github.raw" -F ref=bug-report/...

# 3. Follow instructions in the report, implement fix
# 4. Commit and push fix to main
# 5. Mark as pending_review in Supabase (via MCP execute_sql)
```

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
        ↓
    [Bug Fix Phase - AI Agent or Developer]
        ↓
    AI agent reads bug report → implements fix on main branch
        ↓
    Updates Supabase directly: status → 'pending_review' + fix_summary
        ↓
    Admin sees green fix summary box in Bug Todos UI
        ↓
    Admin clicks green box → reviews fix details in modal
        ↓
    Admin clicks "Approve Fix" → closes PR, deletes branch, status → 'fixed'
```

### Key Files

| File | Purpose |
|------|---------|
| `src/components/BugReporter.js` | Frontend bug report modal (screenshot, voice input, console errors) |
| `api/bug-report.js` | Initial submission endpoint - saves to queue, sends email via **system account** (never expires) |
| `api/bugs/analyze.js` | Gemini AI analysis module (multimodal) |
| `api/bugs/github.js` | GitHub API integration (branches, commits, PRs) |
| `api/bugs/list.js` | List bugs with filtering/pagination (includes fix_summary, fixed_at) |
| `api/bugs/[id].js` | Get/Reanalyze single bug; DELETE marks as 'fixed' (soft delete) |
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
  status TEXT CHECK (status IN ('pending', 'processing', 'analyzed', 'pending_review', 'fixed', 'failed')),
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
  branch_name TEXT,

  -- Fix tracking (added 2026-02-07)
  fixed_at TIMESTAMPTZ,            -- When the bug was marked fixed
  auto_closed BOOLEAN DEFAULT false, -- Whether closed by automation vs manual
  fix_detection_log JSONB DEFAULT '[]', -- Audit trail of fix events
  fix_summary TEXT                  -- AI-written summary of how the bug was fixed
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
- Stats cards: Pending | Analyzed | Review | Failed | Total
- Filter tabs by status (including "Review" for `pending_review`)
- Expandable bug cards matching email format:
  - Violet header banner with bug ID
  - Severity & Confidence cards side by side
  - Summary, Suggested Fix, Affected Files
  - PR link, Reporter info, Description, Page URL
  - Console errors (red box)
  - Screenshot (fetched from GitHub if not in DB)
  - Token usage display with estimated cost
- **Green fix summary box** (brand color `#94AF32`) — shown inline on `pending_review` bugs
  - Displays a one-line summary of how the AI fixed the bug
  - Clickable → opens **Fix Details Modal**

**Fix Details Modal (pending_review bugs):**
- Original bug description
- Fix summary with olive (`#94AF32`) left border accent
- List of affected files from the AI analysis
- **Close** button (dismiss modal)
- **Approve Fix** button (olive `#94AF32` background) → calls DELETE endpoint which:
  - Closes the GitHub PR with a "Fixed" comment
  - Deletes the bug report branch
  - Marks the bug as `status = 'fixed'` in Supabase (soft delete, not hard delete)

**Other Actions:**
- **Download Report** - Downloads complete `.md` file with dual-perspective AI instructions
- **Open File** - Downloads and opens `.md` file in system default markdown editor
- **View PR** (GitHub icon in header) - Opens GitHub pull request
- **Reanalyze** - Resets to pending for re-processing
- **Mark Fixed** - Soft-deletes: closes PR, deletes branch, sets status to `fixed`

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

#### Full Lifecycle (Automated AI Fix)
1. **Bug submitted** → User sees "Bug report submitted! AI analysis will be sent shortly."
2. **AI processes** → Within 3 minutes, Gemini analyzes and creates GitHub PR (status: `analyzed`)
3. **AI agent fixes** → Reads bug report, implements fix, pushes to main
4. **AI marks pending_review** → Updates Supabase via MCP with `status = 'pending_review'` + `fix_summary`
5. **Admin reviews** → Sees green fix summary box in Bug Todos UI, clicks for details modal
6. **Admin approves** → Clicks "Approve Fix" → PR closed, branch deleted, status → `fixed`

#### Manual Fix (Developer)
1. **Bug submitted** → same as above
2. **AI processes** → same as above
3. **Developer reviews** → Opens PR or reads in Bug Todos UI
4. **Implement fix** → Make changes based on `ai_fix_prompt`
5. **Mark fixed** → Click "Mark Fixed" in Bug Todos (closes PR, soft-deletes bug)

#### Bug Status Lifecycle
```
pending → processing → analyzed → pending_review → fixed
                          ↓                           ↑
                        failed          (manual fix path)
```

| Status | Meaning | Set By |
|--------|---------|--------|
| `pending` | Submitted, waiting for AI | Bug Reporter |
| `processing` | AI is analyzing | Cron job |
| `analyzed` | AI created PR with fix suggestions | Cron job |
| `pending_review` | Fix implemented, awaiting human approval | AI agent (via Supabase MCP) |
| `fixed` | Approved and closed | Admin UI ("Approve Fix" or "Mark Fixed") |
| `failed` | AI analysis failed | Cron job |

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

## 2026-01-30

### Manus AI Knowledge Base Builder - Complete System Documentation

Major overhaul of the Parts AI documentation system to properly capture manufacturer URLs and build a comprehensive knowledge base for field technicians.

#### System Overview

The Parts AI Lookup system uses **Manus AI** (a browser-based research agent) to find and capture verified manufacturer documentation URLs. The system has three key flows:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PARTS AI LOOKUP FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. USER INTERFACE (/parts/ai-lookup)                                        │
│     └─> Select parts → Click "Run AI Lookup"                                │
│                                                                              │
│  2. BATCH ENDPOINT (/api/enrich-parts-batch-manus.js)                       │
│     └─> Creates Manus task with comprehensive prompt                        │
│     └─> Registers webhook for async completion                              │
│                                                                              │
│  3. MANUS AI RESEARCH (external)                                            │
│     └─> Browses manufacturer website                                        │
│     └─> Finds product page, support page, PDF downloads                     │
│     └─> Creates JSON results file + markdown backup files                   │
│     └─> Calls webhook when complete                                         │
│                                                                              │
│  4. WEBHOOK HANDLER (/api/manus-webhook.js)                                 │
│     └─> Parses JSON attachment for manufacturer URLs                        │
│     └─> Downloads PDFs to Supabase storage                                  │
│     └─> Uploads to SharePoint                                               │
│     └─> Saves both manufacturer (green) and SharePoint (purple) URLs        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### The Manus Prompt (Critical for Quality Results)

The prompt in `/api/enrich-parts-batch-manus.js` is structured in **3 phases** to guide Manus through comprehensive research:

**PHASE 1: Manufacturer Source Discovery**
- Navigate to manufacturer's official website
- Find the OFFICIAL product page URL (critical - this becomes `product_page_url`)
- Locate support/downloads pages
- Find actual PDF download URLs (not just that they exist)
- Check FCC database and verified third-party sources if needed

**PHASE 2: Create Backup Documentation Files**
- `{part_number}-installation-guide.md` - with source URL at top
- `{part_number}-specifications.md` - with source URL at top
- `{part_number}-quick-reference.md` - with source URL at top

**PHASE 3: JSON Results File**
Manus creates a structured JSON file with:
```json
{
  "manufacturer_website": "https://www.apple.com",
  "product_page_url": "https://www.apple.com/shop/buy-tv/apple-tv-4k/128gb",
  "support_page_url": "https://support.apple.com/apple-tv-4k",
  "documents": [
    {
      "type": "user_guide",
      "title": "Apple TV 4K User Guide",
      "url": "https://support.apple.com/guide/tv/welcome/tvos",
      "format": "web",
      "found": true
    },
    {
      "type": "install_guide",
      "title": "Setup Guide PDF",
      "url": "https://cdsassets.apple.com/..../setup.pdf",
      "format": "pdf",
      "found": true
    }
  ],
  "specifications": { ... }
}
```

#### Document URL Types (Green vs Purple Dots)

The UI shows two types of documentation links with color-coded indicators:

| Color | Meaning | Source | Example |
|-------|---------|--------|---------|
| 🟢 Green | Manufacturer Source | Original URLs from manufacturer website | `https://apple.com/support/...` |
| 🟣 Purple | AI Compiled (SharePoint) | PDFs/markdown uploaded to company SharePoint | `https://isehome.sharepoint.com/...` |

**Database Fields:**
- `manufacturer_website` - Company website (green)
- `product_page_url` - Direct product page (green)
- `install_manual_urls[]` - Original manufacturer install guide URLs (green)
- `technical_manual_urls[]` - Original manufacturer tech doc URLs (green)
- `install_manual_sharepoint_url` - SharePoint copy of install guide (purple)
- `user_guide_sharepoint_url` - SharePoint copy of user guide (purple)
- `technical_manual_sharepoint_urls[]` - SharePoint copies of tech docs (purple)
- `parts_folder_sharepoint_url` - Link to SharePoint folder with all docs

#### Webhook Processing Flow

When Manus completes, it calls `/api/manus-webhook.js` which:

1. **Parses JSON Attachment** (CRITICAL FIX 2026-01-30)
   - Looks for `.json` file in attachments
   - Fetches and parses to extract `manufacturer_website`, `product_page_url`, `documents[]`
   - This is where the green dot URLs come from!

2. **Categorizes Document URLs by Type**
   - `user_guide` / `user_manual` / `install` → `install_manual_urls`
   - `tech_specs` / `datasheet` / `product_info` → `technical_manual_urls`

3. **Two-Stage Document Processing**
   - Stage 1: Download PDFs from manufacturer to Supabase storage
   - Stage 2: Upload from Supabase to SharePoint
   - Returns SharePoint URLs separately (doesn't overwrite manufacturer URLs)

4. **Saves via RPC**
   - Calls `save_parts_enrichment()` with all URLs preserved

#### Key Files

| File | Purpose |
|------|---------|
| `/api/enrich-parts-batch-manus.js` | Creates Manus tasks with the prompt |
| `/api/manus-webhook.js` | Processes completed tasks, extracts URLs, sanitizes data types |
| `/api/replay-manus-enrichment.js` | Re-process stored results without re-running Manus |
| `/src/components/PartsAILookupPage.js` | UI for batch part selection |
| `/src/components/PartDetailPage.js` | Shows documentation with green/purple dots |
| `database/migrations/20260127_add_parts_folder_url.sql` | RPC function for saving |

#### Common Issues & Fixes

**Issue: Manufacturer URLs not showing (only SharePoint markdown files)**
- **Cause:** JSON attachment wasn't being fetched/parsed
- **Fix:** Added code to download and parse `.json` attachment from Manus
- **Commit:** `e3ea80a` (2026-01-30)

**Issue: Document type not recognized (user_guide vs user_manual)**
- **Cause:** Type matching was too narrow
- **Fix:** Added `user_guide`, `install`, `product_info` to type matching
- **Commit:** `af07e23` (2026-01-30)

**Issue: Parts stuck in "processing" status**
- **Cause:** Manus task failed or timed out without calling webhook
- **Fix:** Created `/api/admin/clear-stale-statuses.js` endpoint to reset stuck parts
- **Usage:** POST to endpoint to clear parts stuck >1 hour

**Issue: Enrichment data not saving - Type mismatch on numeric fields (CRITICAL FIX 2026-01-30)**
- **Cause:** Manus returns descriptive strings for numeric fields (e.g., `u_height: "2U for two Amps, 3U for four Amps"`) which fail PostgreSQL integer parsing
- **Error:** `invalid input syntax for type integer: "2U for two Amps, 3U for four Amps"`
- **Fix:** Added safe parsing helper functions to `/api/manus-webhook.js`:
  ```javascript
  function safeParseInt(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isInteger(value) ? value : null;
    if (typeof value !== 'string') return null;
    const match = value.match(/^(\d+)/);  // Extract leading digits
    return match ? parseInt(match[1], 10) : null;
  }
  ```
- **Fields sanitized:**
  - Integer: `u_height`, `power_watts`, `num_channels`
  - Float: `width_inches`, `height_inches`, `depth_inches`, `weight_lbs`, `msrp`, `confidence`
  - Boolean: `poe_powered`, `rack_mountable`

#### Replay Manus Enrichment Endpoint

**Purpose:** Re-process stored Manus task results without re-running Manus (saves credits).

**Endpoint:** `POST /api/replay-manus-enrichment`

**Request Body:**
```json
{ "partId": "uuid-of-part" }
// OR
{ "taskId": "manus-task-id" }
```

**Use Cases:**
- Fixing data that failed to save due to type mismatches
- Re-applying improved parsing logic to existing data
- Recovering enrichment data after webhook errors

**How It Works:**
1. Finds the most recent completed Manus task for the part
2. Retrieves stored result from `manus_tasks.result`
3. Applies `sanitizeEnrichmentData()` to fix type issues
4. Saves via `save_parts_enrichment()` RPC
5. Marks task as replayed with `_replayed_at` timestamp

**Important Limitation:** Only works if the full enrichment data was stored in `manus_tasks.result`. Some older tasks may only have `notes` stored, requiring manual data entry or re-running Manus.

**File:** `/api/replay-manus-enrichment.js`

#### Brand Colors

- **Manufacturer Source (Green):** `#94AF32`
- **SharePoint/AI Compiled (Purple):** `#8B5CF6`

#### Environment Variables

```
MANUS_API_KEY=your-manus-api-key
```

Add to Vercel: Settings → Environment Variables

---

## 2026-02-04

### AI Enrichment Icon Bug Fix - Only Show When Actual Docs Exist

Fixed a bug where parts were showing the AI enrichment indicator (purple dot) even when the Manus enrichment process completed but didn't return actual documentation URLs.

#### Problem

The `hasAIDocs` boolean was only checking if `ai_enrichment_status === 'completed'`, but Manus can complete successfully while:
1. Running out of API credits mid-research
2. Finding no documentation for the product
3. Returning only notes without actual URLs

In these cases, `ai_enrichment_data` may contain just notes like `{"notes":"An int..."}` but the actual URL arrays (`install_manual_urls`, `technical_manual_urls`, `user_guide_urls`) remain empty.

#### Example: OP-2ESH-POE

Database state showing the issue:
- `ai_enrichment_status`: `completed` ✓
- `ai_enrichment_data`: `{"notes":"An int..."}` (just notes, no docs!)
- `install_manual_urls`: `[]` (empty)
- `technical_manual_urls`: `[]` (empty)
- `user_guide_urls`: `NULL`
- `needs_review`: `true`

The part was showing as "AI enriched" with the purple dot, but had no actual documentation.

#### Fix

Changed `hasAIDocs` logic to only return true if status is completed AND actual documentation URLs exist:

**Before (incorrect):**
```javascript
const hasAIDocs = part.ai_enrichment_status === 'completed';
```

**After (correct):**
```javascript
// Only show AI enriched if status is completed AND there are actual documentation URLs
// Note: ai_enrichment_data can contain just notes without useful docs, so we check for actual URLs
const hasAIDocs = part.ai_enrichment_status === 'completed' && (
  part.install_manual_urls?.length > 0 ||
  part.technical_manual_urls?.length > 0 ||
  part.user_guide_urls?.length > 0
);
```

#### Files Modified

| File | Changes |
|------|---------|
| `src/components/PartsListPage.js` | Updated `hasAIDocs` logic (lines 606-615) to check for actual URL arrays |
| `src/components/GlobalPartsManager.js` | Updated `hasAIDocs` logic (lines 503-512) to check for actual URL arrays |

#### Icon Reference

The parts list shows multiple indicators:
- **Left side purple dot**: AI enrichment complete with actual docs (`hasAIDocs = true`)
- **Left side amber dot**: Needs review (`needs_review = true`)
- **Right side CheckCircle (amber)**: Action button to "Mark as reviewed"
- **Right side FileText**: Action button to "Edit documentation"

---

## 2026-02-04 - Service Ticket Status Overhaul & QuickBooks Invoice Button

### Status System Redesign

**Major Changes:**
1. **Removed `resolved` status** - replaced with `work_complete_needs_invoice`
2. **Added `problem` status** - for escalation when tickets are stuck
3. **Dropdown shows ALL statuses** - no longer restricted to "valid next steps"

#### Final Status List

| Status | Purpose | Styling |
|--------|---------|---------|
| `open` | New ticket, not yet reviewed | Yellow |
| `triaged` | Reviewed, estimated hours set | Orange |
| `scheduled` | Visit scheduled | Blue |
| `in_progress` | Work in progress | Purple |
| `waiting_parts` | Blocked waiting for parts | Amber |
| `waiting_customer` | Waiting for customer response | Amber |
| `work_complete_needs_invoice` | Work done, needs QuickBooks invoice | **Green** (brand success) |
| `problem` | Escalation needed, ticket stuck | Red |
| `closed` | Ticket closed | Gray |

#### UX Changes

- Status dropdown now shows ALL statuses (user can pick any status freely)
- Removed workflow restrictions that limited status transitions
- Added QuickBooks "Send to Invoice" button on tickets with `work_complete_needs_invoice` status

### QuickBooks Invoice Integration

Added "Send to QuickBooks" button that appears when ticket status is `work_complete_needs_invoice`:

- Shows connection status
- Creates invoice in QuickBooks from ticket time logs and parts
- Displays invoice number and link after successful creation
- Shows error messages if creation fails

#### Files Modified

| File | Changes |
|------|---------|
| `database/migrations/20260204_add_service_ticket_statuses.sql` | Migration removes 'resolved', adds new statuses, updates existing tickets |
| `src/components/Service/ServiceTicketDetail.js` | ALL_STATUSES array, removed workflow restrictions, added QBO invoice button |
| `src/components/Service/ServiceDashboard.js` | Updated STATUSES array and getStatusStyles() |
| `src/components/Service/ServiceTicketList.js` | Updated getStatusStyles() |
| `docs/QUICKBOOKS_INTEGRATION.md` | Comprehensive QBO integration documentation |

#### Database Migration

Run this migration in Supabase:

```sql
-- Updates existing 'resolved' tickets to 'work_complete_needs_invoice'
-- Removes 'resolved' from valid statuses
-- See: database/migrations/20260204_add_service_ticket_statuses.sql
```

### QuickBooks Integration Documentation

Created comprehensive documentation for the QuickBooks Online integration:

- **File:** `docs/QUICKBOOKS_INTEGRATION.md`
- Testing workflow with sandbox
- Production cutover checklist
- Troubleshooting guide
- API endpoint reference
- Database schema documentation

#### Key Testing Steps

1. Verify QBO connection in Admin → Integrations
2. Create test ticket with time logs
3. Move to `work_complete_needs_invoice` status
4. Create invoice via QBO integration
5. Verify in QuickBooks sandbox

#### Production Cutover

1. Update Vercel env vars: `QBO_ENVIRONMENT=production`
2. Update QBO credentials to production values
3. Disconnect sandbox, connect production
4. Test with minimal invoice, then go live

**AI Note:** The new `work_complete_needs_invoice` status is the trigger point for QuickBooks invoice creation. When a ticket reaches this status, the "Create QuickBooks Invoice" action becomes available.

---


## 2026-02-04 - Labor Types Management & QBO Invoice Field Mapping

### Labor Types System

Added a comprehensive labor types management system for tracking different service labor categories (Installation, Programming, Service, etc.) with individual hourly rates.

#### Database Schema

**New Table: `labor_types`**
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | TEXT | Machine name (unique) |
| `label` | TEXT | Display name |
| `description` | TEXT | Optional description |
| `hourly_rate` | NUMERIC | Rate per hour (default $150) |
| `qbo_item_name` | TEXT | QuickBooks item name for mapping |
| `is_default` | BOOLEAN | Whether this is the default type |
| `is_active` | BOOLEAN | Soft delete flag |
| `sort_order` | INTEGER | Display order |

**Default Labor Types:**
- Service ($150/hr) - Default
- Installation ($150/hr)
- Programming ($175/hr)
- Troubleshooting ($150/hr)
- Consultation ($200/hr)
- Training ($125/hr)

**New Table: `qbo_item_mapping`**
For linking local entities (labor types, parts categories) to QuickBooks Products/Services items.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `entity_type` | TEXT | 'labor_type', 'parts_category', etc. |
| `entity_id` | TEXT | Local entity ID or name |
| `qbo_item_id` | TEXT | QuickBooks Item ID |
| `qbo_item_name` | TEXT | QuickBooks Item name |

**Modified Table: `service_time_logs`**
Added `labor_type_id` column (nullable FK to labor_types) to associate time entries with specific labor types.

#### Admin UI

Added Labor Types tab in Company Settings (Admin → Company Settings → Labor Types):

- View all labor types with rates
- Add new labor types
- Edit existing labor types (name, label, rate, QBO mapping)
- Set default labor type
- Soft delete/restore labor types
- Reorder via sort_order

**Files:**
- `src/components/Admin/LaborTypesManager.js` - Admin component
- `src/services/laborTypeService.js` - CRUD operations
- `src/pages/CompanySettingsPage.js` - Added Labor Types tab

### QuickBooks Invoice Field Mapping Improvements

Enhanced the QBO invoice creation to include more detailed information:

#### Labor Line Items

**Before:** Generic "Service Visit" description
```
Service Visit - Thu, Feb 4, 2026 - John Smith (2hrs)
```

**After:** Labor type-specific with rate from labor_types table
```
Installation - Thu, Feb 4, 2026 - John Smith (2hrs)
```

- Uses labor type's `hourly_rate` if assigned, falls back to ticket rate
- Uses labor type's `label` in description (e.g., "Installation", "Programming")

#### Parts Line Items

**Before:** Just part name
```
UDP-Pro
```

**After:** Manufacturer + Part Name + Part Number
```
Ubiquiti UDP-Pro (UDP-Pro-US)
```

Format: `{manufacturer} {name} ({part_number})`

#### Files Modified

| File | Changes |
|------|---------|
| `database/migrations/20260204_labor_types.sql` | New labor_types and qbo_item_mapping tables |
| `src/services/laborTypeService.js` | New service for labor type CRUD |
| `src/components/Admin/LaborTypesManager.js` | New admin component |
| `src/pages/CompanySettingsPage.js` | Added Labor Types tab |
| `api/qbo/create-invoice.js` | Enhanced field mapping for labor types and parts |

#### Migration

Run in Supabase SQL Editor:
```sql
-- See: database/migrations/20260204_labor_types.sql
```

### Pending Work

- Update ServiceTimeTracker with labor type dropdown
- Update ServiceTimeEntryModal with labor type field
- Create QBO Items sync endpoint for mapping

### 2026-02-11 - Stakeholder Notification Fixes & Detail Modal

**What:** Fixed notification emails to send FROM the logged-in user (not the system account) with CC to system email, preventing spam flagging. Fixed portal links for external stakeholders — Notify All now force-regenerates tokens so every external recipient gets a fresh portal URL + OTP code. Created `issue_notification_log` table to track all notification sends. Built StakeholderDetailModal in project stakeholders section — clicking a stakeholder opens a detail view with contact info, edit/delete (delete only visible in edit mode), and a collapsible engagement history showing: notifications sent, comments made, and portal access timestamps.

**Why:** System account emails were getting flagged as spam; emails should come from the human user. External stakeholders weren't getting portal links (tokens are hashed, can't be recovered from existing links). No visibility into whether stakeholders received emails — now tracked in notification log and visible in stakeholder detail modal.

**Files:**
- `api/send-issue-notification.js` - Sends from user via `/me/sendMail` when `sendAsUser: true`, falls back to system account
- `src/components/IssueDetail.js` - `generateExternalPortalLinks` now accepts `forceRegenerate` option, used by Notify All
- `src/services/issueNotificationService.js` - Added `logNotificationSend()`, imports supabase, logs each send to `issue_notification_log`
- `src/components/StakeholderDetailModal.js` - **NEW** - Detail modal with contact info, edit/delete, collapsible engagement history
- `src/components/ProjectDetailView.js` - Integrated StakeholderDetailModal, simplified StakeholderCard (click opens modal)
- **Migration:** `create_issue_notification_log` - New table with indexes for issue/stakeholder/project queries

### 2026-02-11 - Notify Stakeholders & MSAL Auth Fix (BR-2026-02-09-0001)

**What:** Added "Notify All" button to the Issues Stakeholders section that sends a branded email to all tagged stakeholders (internal + external) with issue summary, status, priority, and portal links. Fixed MSAL `hash_empty_error` by enhancing pre-emptive clearing of stale interaction state on page load. Added portal access tracking (`last_accessed_at`, `access_count`) for stakeholder engagement reporting.

**Why:** Stakeholders need proactive notification when attention is needed on an issue, and the team needs visibility into whether stakeholders actually opened their portal links. The MSAL error was a recurring console warning on Safari redirects.

**Files:**
- `src/components/IssueDetail.js` - Added "Notify All" button + success/error feedback banner
- `src/services/issueNotificationService.js` - Added `notifyAllStakeholders()` function
- `src/contexts/AuthContext.js` - Enhanced MSAL stale state clearing (localStorage + sessionStorage)
- `api/public-issue.js` - Added portal access tracking on exchange
- **Migration:** `add_stakeholder_notify_tracking_to_issues` - Added `last_stakeholder_notify_at/by` to `issues`, `last_accessed_at/access_count` to `issue_public_access_links`

### 2026-02-09 - Gemini 3 Flash Migration (All AI Services)

**What:** Migrated all AI-powered services from Gemini 2.5 Flash to Gemini 3 Flash Preview as the default model. Updated the centralized `shared/aiConfig.js` config and all hardcoded model references in API routes.

**Why:** Gemini 3 Flash provides 40-60% faster latency and improved reasoning. Standardizing on a single model version across all services for consistency and performance.

**Files:**
- `shared/aiConfig.js` - `gemini-flash` now points to `gemini-3-flash-preview`, old 2.5 moved to legacy
- `api/_emailAI.js` - Email classification and reply generation → Gemini 3
- `api/match-rooms.js` - Room matching for Lucid imports → Gemini 3
- `api/parse-lutron-headers.js` - Lutron shade header parsing → Gemini 3
- `api/extract-training.js` - Training data extraction → Gemini 3
- `api/parse-measurement.js` - Voice measurement parsing → Gemini 3
- `api/ai/scan-business-card.js` - Business card OCR → Gemini 3
- `api/ai/parse-contacts.js` - Contact parsing → Gemini 3

**AI Note:** ALL text/vision AI services now use `gemini-3-flash-preview`. Voice AI (real-time audio) still uses `gemini-2.5-flash-native-audio-preview-12-2025` for native audio — Gemini 3 native audio model not yet available. The `shared/aiConfig.js` is the single source of truth for model assignments.

### 2026-02-07 - Bug Fix Review Workflow (Pending Review UI)

**What:** Added a human-in-the-loop review system for AI-fixed bugs. When the AI agent fixes a bug, it marks it as `pending_review` in Supabase with a fix summary. The admin sees a green summary box in the Bug Todos UI, clicks it for a details modal, and approves the fix.

**Why:** Steve needs hands-free bug fixing but with human verification before closing. The AI fixes bugs autonomously, but a human reviews and approves each fix before the PR is closed.

**New Status Lifecycle:**
`pending → processing → analyzed → pending_review → fixed`

**Database Changes:**
- Added columns: `fixed_at`, `auto_closed`, `fix_detection_log`, `fix_summary`
- Updated status constraint to include `pending_review` and `fixed`
- Added index on `pending_review` status for performance
- Migration: `database/migrations/20260207_add_bug_auto_close_fields.sql`

**UI Changes (BugTodosTab.js):**
- New "Review" filter tab for `pending_review` bugs
- Green fix summary box (brand `#94AF32`) inline on pending_review bug rows
- Click green box → Fix Details Modal showing original bug, fix summary, affected files
- "Approve Fix" button in modal calls existing DELETE endpoint
- `pending_review` counted in stats cards

**API Changes:**
- `api/bugs/list.js` — now returns `fix_summary` and `fixed_at` fields, counts `pending_review` in stats
- `api/bugs/[id].js` — DELETE now soft-deletes (sets `status = 'fixed'` instead of removing the row)
- `api/bugs/github.js` — added `getCommitsForFile()` helper (available for future use)

**Files:**
- `src/components/Admin/BugTodosTab.js` — pending_review status, green fix summary box, fix details modal
- `api/bugs/list.js` — fix_summary/fixed_at in SELECT, pending_review stats
- `api/bugs/[id].js` — soft delete (status→fixed) instead of hard delete
- `api/bugs/github.js` — getCommitsForFile() function
- `database/migrations/20260207_add_bug_auto_close_fields.sql` — new columns + index
- `vercel.json` — removed abandoned close-fixed-bugs cron entry

**Removed/Abandoned:**
- `api/cron/close-fixed-bugs.js` — file still exists but NOT in vercel.json crons. Was the original file-watching auto-close approach; replaced by the Supabase-direct + UI review approach.

### 2026-02-06 - Bug Fixes (Automated)
**What:** Fixed bugs #12, #18, #21, #22, #26, #27, #28
**Why:** Overnight automated bug fix run
**Files:**
- `api/service/tickets.js` - Improved error handling with structured responses
- `src/components/Service/ServiceTicketDetail.js` - Fixed status display labels, removed invalid service_address from edit payload
- `src/components/Service/ServiceDashboard.js` - Updated resolved→work_complete_needs_invoice status references
- `src/components/Service/ServiceTicketList.js` - Updated STATUSES array with new status values (work_complete_needs_invoice, problem)
- `src/services/serviceTicketService.js` - Fixed resolved→work_complete_needs_invoice in updateStatus, added payload cleanup in update()
- `src/components/CareerDevelopment/SkillReviewPanel.js` - Allow Development Focus edits after manager review submission
- `src/components/EquipmentListPage.js` - Fixed [object Object] error display
- `src/services/projectEquipmentService.js` - Improved error message extraction in fetchProjectEquipment
- `src/services/milestoneService.js` - Fixed error logging for prewire receiving percentage
- `database/migrations/20260206_fix_skill_unique_constraint.sql` - Changed UNIQUE(name, category) to UNIQUE(name, category, class_id)
- `database/migrations/20260206_fix_feature_flags_rls.sql` - Changed RLS policies from TO authenticated to TO anon, authenticated
**AI Note:** Automated fix via overnight-bug-fix skill
