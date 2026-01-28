# UNICORN CORE REFERENCE

> **SINGLE SOURCE OF TRUTH** for brand, patterns, business context, and architecture.
> Claude Code should read this + topic-specific docs. AGENT.md is for AI agent onboarding only.

---

## Business Overview

**Unicorn** is a field operations management platform for smart home/low-voltage installation companies.

**Company:** Intelligent Systems (Steve, Owner - non-programmer, needs copy-paste code)
**Users:** Project Managers, Technicians, Office Staff, Clients (external portals)

### Core Workflow
```
Lead → Project → Prewire → Trim-Out → Commissioning → Service/Support
         ↓          ↓          ↓            ↓              ↓
      Planning   Wire Drops  Equipment   Milestones    Service CRM
      Lucid      CSV Import  Receiving   Progress      Tickets
```

### User Roles

| Role | Can Do |
|------|--------|
| **Technician** | View projects, complete stages, upload photos, receive parts |
| **Project Manager** | + Create projects, import CSV, generate POs, manage vendors, integrations |
| **Admin** | + Company settings, user management |

---

## Key Terminology

| Term | Definition |
|------|------------|
| **Wire Drop** | Single cable run from head-end to endpoint (TV, speaker, etc.) |
| **Prewire** | Rough-in phase - running cables before drywall |
| **Trim-Out** | Finish phase - installing devices after drywall |
| **Commissioning** | Final testing and client handoff |
| **Head-End** | Central equipment location (rack room, closet) |
| **Global Part** | Master catalog item (template) |
| **Project Equipment** | Instance of global part assigned to a project |
| **PO** | Purchase Order |

---

## 🎨 BRAND COLORS (CRITICAL - MEMORIZE)

| Purpose | Hex | RGB | Tailwind | Usage |
|---------|-----|-----|----------|-------|
| **Primary** | `#8B5CF6` | 139,92,246 | `violet-500` | Buttons, active states, links |
| **Primary Hover** | `#7C3AED` | 124,58,237 | `violet-600` | Hover states |
| **Primary Light** | `#A78BFA` | 167,139,250 | `violet-400` | Backgrounds, subtle |
| **Success** | `#94AF32` | 148,175,50 | **NONE** | ⚠️ OLIVE GREEN - INLINE ONLY |
| **Warning** | `#F59E0B` | 245,158,11 | `amber-500` | Warnings |
| **Danger** | `#EF4444` | 239,68,68 | `red-500` | Errors, destructive |
| **Info** | `#3B82F6` | 59,130,246 | `blue-500` | Informational |
| **Secondary** | `#ACB3D1` | 172,179,209 | - | Muted text |

### ⚠️ SUCCESS COLOR RULE (NEVER BREAK)

```jsx
// ✅ CORRECT
style={{ color: '#94AF32' }}
style={{ backgroundColor: 'rgba(148, 175, 50, 0.15)', color: '#94AF32' }}
import { brandColors } from '../styles/styleSystem';
style={{ color: brandColors.success }}

// ❌ NEVER USE
className="text-green-500"    // Wrong!
className="text-emerald-500"  // Wrong!
className="bg-green-100"      // Wrong!
```

### Theme: ZINC (Not Gray)

```jsx
// ✅ CORRECT
bg-zinc-50 dark:bg-zinc-950
bg-white dark:bg-zinc-900
text-zinc-900 dark:text-zinc-100
border-zinc-200 dark:border-zinc-700

// ❌ WRONG
bg-gray-50   // Never!
text-gray-900 // Never!
```

### Progress Colors

| Range | Color | Hex |
|-------|-------|-----|
| 0-25% | Red | `#EF4444` |
| 25-50% | Amber | `#F59E0B` |
| 50-75% | Blue | `#3B82F6` |
| 75-99% | Olive | `#94AF32` |
| 100% | Violet | `#8B5CF6` |

### Stakeholder Colors

| Type | Text | Background |
|------|------|------------|
| Internal (employees) | `#8B5CF6` | `rgba(139, 92, 246, 0.15)` |
| External (clients) | `#94AF32` | `rgba(148, 175, 50, 0.15)` |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Tailwind CSS |
| Backend | Vercel Serverless Functions |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Azure MSAL (Microsoft SSO) |
| Storage | SharePoint (photos), Supabase (data) |
| AI | Gemini Pro, Azure OpenAI, Retell AI |
| Network | UniFi Site Manager API |

---

## Feature Overview (Quick Reference)

### Wire Drops
3-stage cable installation tracking with photos.
- **Stages:** Prewire → Trim-Out → Commissioning
- **Each stage requires:** Photo upload
- **Trim-Out also requires:** Equipment assignment
- **Details:** `docs/WIRE_DROPS.md`

### Equipment System (3 Tiers)
| Tier | Table | Purpose |
|------|-------|---------|
| Global Parts | `global_parts` | Master catalog |
| Project Equipment | `project_equipment` | Instances per project |
| Wire Drop Links | `wire_drop_equipment_links` | Equipment at each drop |

**CSV Import Flow:** Export from D-Tools → Upload → Creates instances → Assign to drops
**Details:** `docs/EQUIPMENT.md`

### Milestones (Progress Gauges)
8 gauges measuring project completion.
- **Source of Truth:** `api/_milestoneCalculations.js`
- **Cache:** 5-minute localStorage via `milestoneCacheService.js`
- **Details:** `docs/MILESTONES.md`

### Procurement
PO lifecycle from grouping to receiving.
- **PO Format:** `ProjectName-PO-2025-001-AMZN-001`
- **Internal Inventory:** Auto-submitted, decrements on submit
- **Details:** `docs/PROCUREMENT.md`

### Photos (SharePoint)
All photos stored in SharePoint with Graph API thumbnails.
- **Component:** `CachedSharePointImage`
- **Required columns:** `photo_url`, `sharepoint_drive_id`, `sharepoint_item_id`
- **Details:** `docs/SHAREPOINT.md`

### Service CRM
Support ticket management with time tracking.
- **Voice intake:** Retell AI (Sarah)
- **Calendar:** M365 integration
- **Details:** `docs/SERVICE.md` (or in AGENT.md)

### Integrations
| Integration | Purpose | Doc |
|-------------|---------|-----|
| Lucid Charts | Floor plans, wire drop import | `docs/INTEGRATIONS.md` |
| UniFi | Network client matching | `docs/UNIFI_INTEGRATION.md` |
| SharePoint | Photo storage | `docs/SHAREPOINT.md` |
| Retell AI | Voice phone agent | `docs/RETELL_AI_AGENT.md` |
| Home Assistant | Device monitoring | `docs/WORKSTREAM_2_HOME_ASSISTANT_INTEGRATION.md` |

---

## Key Services & Tables

| Module | Service File | Primary Table |
|--------|-------------|---------------|
| Projects | `projectService.js` | `projects` |
| Wire Drops | `wireDropService.js` | `wire_drops` |
| Equipment | `projectEquipmentService.js` | `project_equipment` |
| Parts Catalog | `partsService.js` | `global_parts` |
| Milestones | `milestoneCacheService.js` | (calculated) |
| Procurement | `purchaseOrderService.js` | `purchase_orders` |
| Photos | `sharePointStorageService.js` | SharePoint |
| Service CRM | `serviceService.js` | `service_tickets` |
| Contacts | `contactService.js` | `contacts` |
| Companies | `companyService.js` | `companies` |
| Shades | `projectShadeService.js` | `project_shades` |
| Home Assistant | `homeAssistantService.js` | `project_home_assistant` |

---

## Key Files

| Purpose | Path |
|---------|------|
| Style System | `src/styles/styleSystem.js` |
| Theme Context | `src/contexts/ThemeContext.js` |
| Auth Context | `src/contexts/AuthContext.js` |
| AI Brain | `src/contexts/AIBrainContext.js` |
| App State | `src/contexts/AppStateContext.js` |
| Supabase Client | `src/lib/supabase.js` |
| Milestone Calc | `api/_milestoneCalculations.js` |

---

## Core Patterns

### Always Use Services
```javascript
import { projectService } from '../services/projectService';
const projects = await projectService.getAll();
// Never supabase.from() directly in components
```

### RLS Bypass via RPC
```javascript
// When RLS blocks an operation
await supabase.rpc('update_global_part', { p_id: id, p_name: name });
```

### Defensive Theme Palette
```javascript
const rawPalette = paletteByMode[mode] || paletteByMode.light || {};
const palette = {
  primary: rawPalette.primary || '#8B5CF6',
  textPrimary: rawPalette.textPrimary || (mode === 'dark' ? '#FAFAFA' : '#18181B'),
  ...rawPalette
};
```

### External Portals (No Context)
```jsx
// Public portals must be standalone - no useTheme, no useAuth
const PublicPortal = () => {
  const styles = { container: { minHeight: '100vh', backgroundColor: '#f9fafb' } };
  return <div style={styles.container}>...</div>;
};
```
**Details:** `docs/EXTERNAL-PORTALS.md`

### Localhost API Calls
```javascript
const apiBase = window.location.hostname === 'localhost'
  ? 'https://unicorn-one.vercel.app'
  : '';
```

### Photo Display (SharePoint)
```jsx
<CachedSharePointImage
  sharePointUrl={photo.url}
  sharePointDriveId={photo.sharepoint_drive_id}
  sharePointItemId={photo.sharepoint_item_id}
  displayType="thumbnail"
  size="medium"
  className="w-full aspect-square rounded-lg"  // ⚠️ USE aspect-square!
/>
```

---

## AI Action Registry

Actions available to AI copilots (Voice, Chat, Brain):

| Action | Description |
|--------|-------------|
| `navigate` | Go to page |
| `search_projects` | Find projects |
| `get_project_status` | Project summary |
| `update_wire_drop` | Change drop status |
| `create_service_ticket` | New support ticket |
| `get_schedule` | View calendar |

**Full AI architecture:** `docs/VOICE-AI-REFERENCE.md`

---

## File Location Rules

| Creating... | Put in... |
|-------------|-----------|
| React component | `src/components/` |
| Service | `src/services/` |
| API endpoint | `api/` |
| SQL migration | `database/migrations/` |
| Documentation | `docs/` |

---

## Environment Variables

```bash
# Supabase
REACT_APP_SUPABASE_URL=
REACT_APP_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Azure/Microsoft
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=

# AI Services
REACT_APP_GEMINI_API_KEY=
RETELL_API_KEY=

# UniFi
UNIFI_API_KEY=
```

---

## NEVER Do

- ❌ Use Tailwind `green-*` or `emerald-*` (use `#94AF32` inline)
- ❌ Use `gray-*` classes (use `zinc-*`)
- ❌ Add custom back buttons (use AppHeader)
- ❌ Create duplicate files ("V2", "New", "Copy")
- ❌ Skip defensive palette handling
- ❌ Use contexts in external portals
- ❌ Create .md outside `docs/`
- ❌ Create .sql outside `database/`
- ❌ Direct Supabase in components (use services)

---

## Documentation Index

**For deeper details, read these docs as needed:**

| Topic | File | When to Read |
|-------|------|--------------|
| Wire Drops | `docs/WIRE_DROPS.md` | Working on stages, photos |
| Equipment | `docs/EQUIPMENT.md` | CSV import, parts catalog |
| Milestones | `docs/MILESTONES.md` | Progress gauges |
| Procurement | `docs/PROCUREMENT.md` | PO workflows |
| SharePoint Photos | `docs/SHAREPOINT.md` | Photo upload/display |
| Database Schema | `docs/DATABASE-SCHEMA-MAP.md` | Schema questions |
| Styling Details | `docs/STYLES.md` | Deep UI work |
| External Portals | `docs/EXTERNAL-PORTALS.md` | Public-facing pages |
| Voice AI | `docs/VOICE-AI-REFERENCE.md` | AI copilot features |
| Retell Phone | `docs/RETELL_AI_AGENT.md` | Sarah phone agent |
| Home Assistant | `docs/WORKSTREAM_2_HOME_ASSISTANT_INTEGRATION.md` | HA integration |
| UniFi | `docs/UNIFI_INTEGRATION.md` | Network client matching |
| Troubleshooting | `docs/TROUBLESHOOTING.md` | Common issues |

**For comprehensive AI agent onboarding:** `AGENT.md`

---

*Last Updated: January 28, 2026*
