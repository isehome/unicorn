# UNICORN - Claude Cowork Development Guide

> **Read this file at the start of EVERY Cowork session.**

---

## ⚠️ FIRST: CREATE YOUR TODO LIST

**Before starting ANY work, create a todo list that includes documentation updates:**

```
Example todos for "Add a new equipment filter":
1. [ ] Understand current equipment filtering (read docs if needed)
2. [ ] Implement the filter feature
3. [ ] Test the feature
4. [ ] Update AGENT.md changelog (MANDATORY)
5. [ ] Update docs/EQUIPMENT.md if needed
```

**The "Update AGENT.md changelog" todo is MANDATORY for every task.** This ensures the AI brain stays current.

---

## HOW TO ACCESS UNICORN DOCUMENTATION

| Need | Action |
|------|--------|
| **Dev patterns, colors, rules** | Use this file (already loaded) |
| **Deep dive on a feature** | Read `docs/[TOPIC].md` (see routing table below) |
| **Detailed business logic not in topic doc** | Read specific section of `AGENT.md` (see below) |

### Reading AGENT.md Selectively

AGENT.md is 300KB - **never read the whole file**. Instead, read only the section you need:

| Topic | AGENT.md Lines | What You'll Find |
|-------|----------------|------------------|
| Wire Drops, Stages, Prewire | 1-500 | Complete wire drop business logic |
| Equipment, Parts, CSV Import | 500-900 | Equipment system, 3-tier architecture |
| Milestones, Progress | 900-1200 | All 8 milestone calculations |
| Procurement, POs | 1200-1500 | PO workflow, receiving, vendors |
| Shades, Measurements | (in PART 1) | Shade measuring workflow |
| Styling, UI Patterns | 1510-2000 | Component patterns, mobile UX |
| Database Rules, Auth | 2000-2400 | MSAL auth, RLS, timestamp rules |
| Voice AI, Copilot | 2700-3100 | Gemini integration, 5 meta-tools |
| External Portals | 3118-3260 | Public portal architecture |

**Example:** "I need to understand how milestone calculations work in detail"
→ Read AGENT.md lines 900-1200

---

## WHAT IS UNICORN?

**Field Operations Management** for residential smart home installations (low-voltage).

**Core Workflow:** Project → Wire Drops → Equipment → Milestones → Service CRM

**Users:**
- **Project Managers (PMs)** - Office dashboard, procurement, scheduling
- **Field Technicians** - Mobile-first wire drops, equipment tracking, photos
- **External Stakeholders** - Designers/clients via public portals

**Tech Stack:** React 18 + Supabase (PostgreSQL/RLS) + Vercel + Azure MSAL + Tailwind

---

## BRAND COLORS - CRITICAL

| Purpose | Hex | Tailwind Usage |
|---------|-----|----------------|
| Primary | `#8B5CF6` | `violet-500` |
| **Success** | `#94AF32` | **INLINE ONLY** `style={{ color: '#94AF32' }}` |
| Warning | `#F59E0B` | `amber-500` |
| Danger | `#EF4444` | `red-500` |

**NEVER USE:** `green-*`, `emerald-*`, or `gray-*` Tailwind classes

**ALWAYS USE:** `zinc-*` (not `gray-*`) + `dark:` variants on everything

```jsx
// SUCCESS COLOR
// CORRECT
<span style={{ color: '#94AF32' }}>Completed</span>

// WRONG - will show wrong color!
<span className="text-green-500">Completed</span>
```

---

## PROJECT STRUCTURE

```
unicorn/
├── src/
│   ├── components/     # React components (organized by feature)
│   ├── services/       # Data layer (ALWAYS use these, not direct Supabase)
│   ├── contexts/       # Auth, Theme, AppState, AIBrain
│   ├── hooks/          # Custom hooks
│   ├── lib/            # Supabase client, utilities
│   ├── pages/          # Route pages
│   └── styles/         # styleSystem.js (source of truth for colors)
├── api/                # Vercel serverless functions
├── database/
│   └── migrations/     # SQL migration files
├── docs/               # Topic-specific documentation
└── public/             # Static assets
```

---

## CORE PATTERNS

### 1. Service Layer (ALWAYS USE)

```javascript
// CORRECT - Use service
import { projectService } from '../services/projectService';
const projects = await projectService.getProjects();

// WRONG - Direct Supabase in component
const { data } = await supabase.from('projects').select('*');
```

**Key Services:**
| Service | Purpose |
|---------|---------|
| `projectService.js` | Projects, basic CRUD |
| `wireDropService.js` | Wire drops, stages, completion |
| `equipmentService.js` | Equipment, inventory, CSV import |
| `procurementService.js` | POs, receiving, vendors |
| `milestoneService.js` | Progress calculations |
| `sharepointService.js` | Photo upload/display |

### 2. MSAL Auth (NOT Supabase Auth!)

```javascript
// WRONG - Always returns null!
const { data: { user } } = await supabase.auth.getUser();

// CORRECT - Get user from MSAL context
import { useAuth } from '../contexts/AuthContext';
const { user } = useAuth();  // user.id, user.displayName
```

**Rules:**
- `supabase.auth.getUser()` = ALWAYS null (we use MSAL)
- Get user from `useAuth()` hook in components
- Pass `userId` explicitly to service functions
- NEVER create foreign keys to `auth.users` table

### 3. RLS Policies - Include `anon`

```sql
-- CORRECT (we use MSAL, not Supabase Auth)
CREATE POLICY "name" ON public.table
FOR ALL TO anon, authenticated
USING (true);

-- WRONG (silently fails!)
CREATE POLICY "name" ON public.table
FOR ALL TO authenticated
USING (true);
```

### 4. RLS Bypass via RPC

When RLS blocks operations, use existing RPC functions:

```javascript
// Standard update (may hit RLS)
await supabase.from('global_parts').update({ name }).eq('id', id);

// RLS bypass via RPC
await supabase.rpc('update_global_part', { p_id: id, p_name: name });
```

### 5. Localhost API Calls

```javascript
// Required for local dev (CORS)
const apiBase = window.location.hostname === 'localhost'
  ? 'https://unicorn-one.vercel.app'
  : '';

fetch(`${apiBase}/api/endpoint`);
```

### 6. Timestamp + User Tracking

**Every `*_at` field MUST have a corresponding `*_by` field:**

```javascript
// CORRECT
const updates = {
  completed_at: new Date().toISOString(),
  completed_by: userId  // Passed from component!
};

// WRONG
const updates = {
  completed_at: new Date().toISOString()
  // Missing completed_by!
};
```

### 7. Photo Display (SharePoint)

```jsx
import CachedSharePointImage from '../components/CachedSharePointImage';

// Required columns: photo_url, sharepoint_drive_id, sharepoint_item_id
<CachedSharePointImage
  photoUrl={item.photo_url}
  driveId={item.sharepoint_drive_id}
  itemId={item.sharepoint_item_id}
  alt="Equipment photo"
/>
```

### 8. AppHeader - No Custom Back Buttons

```jsx
// CORRECT - Let AppHeader handle navigation
const MyPage = () => (
  <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 pb-20">
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Optional context info */}
      <p className="text-zinc-600 dark:text-zinc-400">{projectName}</p>
      {/* Page content */}
    </div>
  </div>
);

// WRONG - Don't create custom back buttons!
<button onClick={() => navigate(-1)}>← Back</button>
```

**When adding a new page:** Add route mapping in `AppHeader.js` `pageTitle` useMemo.

---

## FEATURE DOMAINS

### Wire Drops
**Flow:** Prewire → Rough-In → Trim-Out → Commissioning

**Key Tables:** `wire_drops`, `wire_drop_stages`, `wire_drop_equipment_links`

**Completion Logic:** Each stage has `completed`, `completed_at`, `completed_by`

**Topic Doc:** `docs/WIRE_DROPS.md`

### Equipment
**Categories:** Project-specific vs Global Parts (shared library)

**Key Tables:** `project_equipment`, `global_parts`, `wire_drop_equipment_links`

**Status Flow:** Ordered → Received → Installed

**CSV Import:** Use equipment modal, maps columns to DB fields

**Topic Doc:** `docs/EQUIPMENT.md`

### Milestones & Progress
**Single Source of Truth:** `api/_milestoneCalculations.js`

**Calculation:** Server-side only, 5-min localStorage cache

**Key Flags:** `required_for_prewire`, `required_for_trim_out`

**Topic Doc:** `docs/MILESTONES.md`

### Procurement
**Flow:** Draft PO → Submitted → Received

**Key Tables:** `purchase_orders`, `purchase_order_items`, `vendors`

**Status Fields:** `submitted_at/by`, `received_at/by`

**Topic Doc:** `docs/PROCUREMENT.md`

### Photos (SharePoint)
**Storage:** SharePoint via Microsoft Graph API

**Thumbnails:** Uses `sharepoint_drive_id` + `sharepoint_item_id`

**Key Tables:** `shade_photos` (metadata), actual files in SharePoint

**Topic Doc:** `docs/SHAREPOINT.md`

### Service CRM
**Purpose:** Post-installation support tickets

**Key Tables:** `service_tickets`, `service_visits`

**Integration:** QuickBooks invoicing via OAuth

### Voice AI (Copilot)
**Architecture:** 5 meta-tools via AppStateContext (Single Source of Truth)

**Platform:** Gemini Live API (WebSocket, 16kHz PCM audio)

**Topic Doc:** `docs/VOICE-AI-REFERENCE.md`

### Phone Agent (Sarah)
**Platform:** Retell AI

**Purpose:** Automated phone scheduling, callback handling

**Topic Doc:** `docs/RETELL_AI_AGENT.md`

---

## MOBILE UX - CRITICAL

**This is MOBILE-FIRST for field technicians!**

### Prevent iOS Zoom

```jsx
// ALL inputs need 16px font
<input
  type="number"
  inputMode="numeric"
  pattern="[0-9]*"
  style={{ fontSize: '16px' }}  // CRITICAL!
/>
```

### Touch-Friendly Buttons

```jsx
<button
  type="button"  // Prevents form submission
  onTouchEnd={(e) => {
    e.preventDefault();  // Prevents double-firing
    handleAction();
  }}
  onClick={handleAction}
  className="min-h-[44px] min-w-[44px] touch-manipulation active:bg-blue-800"
>
  Action
</button>
```

**Required:**
- `type="button"` on all non-submit buttons
- `min-h-[44px]` (Apple's 44pt touch target)
- `touch-manipulation` class
- `onTouchEnd` with `e.preventDefault()`

---

## DATABASE PATTERNS

### Migration Format

```sql
-- File: database/migrations/YYYY-MM-DD_description.sql
ALTER TABLE table ADD COLUMN IF NOT EXISTS col type;
```

### User ID Storage

| Table | `*_by` fields store |
|-------|---------------------|
| Most tables | UUID (`abc123-def456-...`) |
| `wire_drop_stages.completed_by` | Display name (`"Steve Blansette"`) |

**Detection:**
```javascript
const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
```

### Key Tables Reference

| Table | Purpose |
|-------|---------|
| `projects` | Master project records |
| `wire_drops` | Individual wire drop locations |
| `wire_drop_stages` | Stage completion (prewire/trim/commission) |
| `project_equipment` | Equipment assigned to projects |
| `global_parts` | Shared equipment library |
| `purchase_orders` | PO headers |
| `purchase_order_items` | PO line items |
| `profiles` | User info (synced from MSAL on login) |

---

## API ENDPOINTS

| Endpoint | Purpose |
|----------|---------|
| `/api/graph-upload` | SharePoint photo upload |
| `/api/graph-file` | SharePoint file download |
| `/api/sharepoint-thumbnail` | Get SharePoint thumbnails |
| `/api/azure-ai-search` | Knowledge base semantic search |
| `/api/public-po` | Public PO view (external) |
| `/api/public-issue` | Public issue portal |
| `/api/qbo/*` | QuickBooks integration |

---

## EXTERNAL PORTALS

**Must be STANDALONE** - no internal contexts!

```jsx
// CORRECT - Inline styles, no context
const PublicPortal = () => {
  const styles = { container: { backgroundColor: '#f9fafb' } };
  return <div style={styles.container}>...</div>;
};

// WRONG - Will crash for external users!
const PublicPortal = () => {
  const { mode } = useTheme();  // External users don't have this!
};
```

---

## CHECKLIST BEFORE FINISHING

- [ ] Used `zinc-*` (not `gray-*`)
- [ ] All colors have `dark:` variants
- [ ] **NO `green-*` or `emerald-*`** - used `#94AF32` inline
- [ ] All `*_at` timestamps have `*_by` user fields
- [ ] User from `useAuth()`, not `supabase.auth.getUser()`
- [ ] Service functions accept `userId` parameter
- [ ] Inputs have `style={{ fontSize: '16px' }}`
- [ ] Buttons have `type="button"` and `min-h-[44px]`
- [ ] Files in correct locations
- [ ] RLS policies include `anon`
- [ ] **DOCUMENTATION UPDATED** (see below)

---

## MANDATORY: UPDATE DOCUMENTATION AFTER EVERY CHANGE

**This is NOT optional. You MUST have "Update AGENT.md changelog" in your todo list.**

### Why This Is Critical

AGENT.md is the **AI brain** for:
- Voice copilot (Sarah/Gemini) understanding the app
- Future AI agents that work with Unicorn
- New Claude Cowork sessions understanding business context

**Undocumented features don't exist to AI.** If it's not in AGENT.md, the voice copilot won't know about it, and the next Claude session won't know either.

### Step 1: Update AGENT.md Changelog (ALWAYS)

Add entry to **PART 6 (Changelog)** at the TOP of the changelog section.

**To find the changelog:** Read AGENT.md starting around line 3200, look for "# PART 6" or "## Changelog"

**Entry format:**
```markdown
### YYYY-MM-DD - [Feature/Fix Name]
**What:** Brief description of what was added/changed
**Why:** Business context - why this matters for the app/users
**Files:** `src/path/to/file.js`, `api/endpoint.js`
**Database:** Any new tables/columns (if applicable)
**AI Note:** What the voice copilot or AI agents need to know about this
```

### Step 2: Update Topic Doc (if applicable)

| Change Type | Update File |
|-------------|-------------|
| Wire drops | `docs/WIRE_DROPS.md` |
| Equipment | `docs/EQUIPMENT.md` |
| Milestones | `docs/MILESTONES.md` |
| Procurement | `docs/PROCUREMENT.md` |
| Photos/SharePoint | `docs/SHAREPOINT.md` |
| Auth/RLS | `docs/AUTHENTICATION.md` |
| Voice AI | `docs/VOICE-AI-REFERENCE.md` |
| Styling/UI | `docs/STYLES.md` |
| New integration | `docs/INTEGRATIONS.md` |
| Bug fix | `docs/TROUBLESHOOTING.md` |

### Step 3: Update QUICKSTART.md (if pattern changed)

If you changed a core pattern, color, service, or added a new "NEVER DO" rule, update this file.

---

## NEVER DO

- Read ALL of AGENT.md (300KB exhausts context - read sections selectively per the table above)
- Use `green-*` or `emerald-*` Tailwind classes
- Use `gray-*` classes (use `zinc-*`)
- Custom back buttons (use AppHeader)
- Contexts in external portals
- Direct Supabase in components (use services)
- `supabase.auth.getUser()` (always null, use MSAL)

---

## TOPIC DOCS (Read as needed)

| Topic | File |
|-------|------|
| Wire Drops | `docs/WIRE_DROPS.md` |
| Equipment | `docs/EQUIPMENT.md` |
| Milestones | `docs/MILESTONES.md` |
| Procurement | `docs/PROCUREMENT.md` |
| SharePoint/Photos | `docs/SHAREPOINT.md` |
| External Portals | `docs/EXTERNAL-PORTALS.md` |
| Voice AI | `docs/VOICE-AI-REFERENCE.md` |
| Phone Agent | `docs/RETELL_AI_AGENT.md` |
| Database Schema | `docs/DATABASE-SCHEMA-MAP.md` |
| Styling Details | `docs/STYLES.md` |
| Home Assistant | `docs/WORKSTREAM_2_HOME_ASSISTANT_INTEGRATION.md` |
| UniFi | `docs/UNIFI_INTEGRATION.md` |
| Troubleshooting | `docs/TROUBLESHOOTING.md` |

---

## AFTER COMPLETING WORK - MANDATORY

**DO NOT mark the "Update AGENT.md changelog" todo as complete until it's actually done.**

### Your Final Todo Item

Every task should end with updating documentation. Before saying "done":

1. ✅ Read the changelog section of AGENT.md (around line 3200+)
2. ✅ Add your changelog entry at the TOP
3. ✅ Update any relevant `docs/*.md` file
4. ✅ Mark your documentation todo as complete

### Changelog Entry Template:

```markdown
### YYYY-MM-DD - [Feature Name]
**What:** [Brief description]
**Why:** [Business value/user impact]
**Files:** `src/...`, `api/...`
**Database:** [New tables/columns if any]
**AI Note:** [What voice copilot needs to know]
```

---

## SESSION START CHECKLIST

When you read this file, immediately:

1. ✅ Understand the task
2. ✅ Create todo list WITH "Update AGENT.md changelog" as final item
3. ✅ Read relevant `docs/*.md` if needed
4. ✅ Read specific AGENT.md section if topic doc is insufficient
5. ✅ Begin work

**Ready to help. What would you like to work on?**
