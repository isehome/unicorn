# 🦄 UNICORN SESSION STARTER

> **Claude: Execute these instructions when this file is read.**

## Step 1: Load Core Documentation

Read these files NOW (in order):

1. **`docs/CORE.md`** - Business context, brand colors, patterns, services
2. **Check the task** - Then load the relevant topic doc from the routing table below

## Step 2: Topic Routing (Load ONE based on task)

| If working on... | Also read... |
|------------------|--------------|
| Wire drops, stages, prewire, trim, commission | `docs/WIRE_DROPS.md` |
| Equipment, parts, CSV import, racks | `docs/EQUIPMENT.md` |
| Progress gauges, percentages, milestones | `docs/MILESTONES.md` |
| Purchase orders, procurement, receiving | `docs/PROCUREMENT.md` |
| Photos, SharePoint, thumbnails, upload | `docs/SHAREPOINT.md` |
| External portals, public pages, client views | `docs/EXTERNAL-PORTALS.md` |
| Voice AI, copilot, AI brain, Gemini | `docs/VOICE-AI-REFERENCE.md` |
| Phone agent, Sarah, Retell, calls | `docs/RETELL_AI_AGENT.md` |
| Home Assistant, HA, device monitoring | `docs/WORKSTREAM_2_HOME_ASSISTANT_INTEGRATION.md` |
| Database, schema, tables, RLS | `docs/DATABASE-SCHEMA-MAP.md` |
| Styling, UI, theme, colors | `docs/STYLES.md` |
| UniFi, network, MAC addresses | `docs/UNIFI_INTEGRATION.md` |
| Bugs, errors, debugging | `docs/TROUBLESHOOTING.md` |

## Step 3: Remember These Rules

### 🎨 BRAND COLORS (CRITICAL)
| Purpose | Hex | Tailwind |
|---------|-----|----------|
| Primary | `#8B5CF6` | `violet-500` |
| **Success** | `#94AF32` | ⚠️ **INLINE ONLY** - NEVER `green-*` or `emerald-*` |
| Warning | `#F59E0B` | `amber-500` |
| Danger | `#EF4444` | `red-500` |

### Theme
- Use `zinc-*` NOT `gray-*`
- Always include `dark:` variants

### Patterns
```javascript
// Always use services
import { projectService } from '../services/projectService';

// RLS bypass via RPC
await supabase.rpc('update_global_part', { p_id: id });

// Localhost API
const apiBase = window.location.hostname === 'localhost'
  ? 'https://unicorn-one.vercel.app' : '';
```

### File Locations
| Creating... | Put in... |
|-------------|-----------|
| React component | `src/components/` |
| Service | `src/services/` |
| API endpoint | `api/` |
| SQL migration | `database/migrations/` |
| Documentation | `docs/` |

## Step 4: After Completing Work

**ALWAYS offer to update documentation:**
1. `AGENT.md` - Add changelog entry with business context
2. `docs/CORE.md` - If patterns, colors, or services changed
3. Specific `docs/*.md` - Technical details for that feature

## Step 5: Git Permissions

These commands are pre-approved (no prompts needed):
- `git add`, `commit`, `push`, `pull`, `status`, `diff`
- `git checkout`, `branch`, `fetch`, `merge`, `stash`, `log`
- `npm run`, `npm install`, `npm test`, `npx`

---

## NEVER Do

- ❌ Read AGENT.md for routine dev (300KB - exhausts context)
- ❌ Use `green-*` or `emerald-*` Tailwind classes
- ❌ Use `gray-*` classes (use `zinc-*`)
- ❌ Custom back buttons (use AppHeader)
- ❌ Contexts in external portals
- ❌ Direct Supabase in components (use services)
- ❌ Create duplicate files or .md files outside `docs/`

---

**Session initialized. What would you like to work on?**
