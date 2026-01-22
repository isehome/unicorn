# UNICORN App - Claude Context

## Overview
Unicorn is a field operations management app for smart home installation companies. React 18 frontend, Supabase (PostgreSQL) backend, Vercel serverless functions.

## 🎯 AI-First Architecture Vision

**THIS IS THE CORE DESIGN PRINCIPLE FOR THE ENTIRE APPLICATION.**

The ultimate goal of Unicorn is to have an onboard AI agent with **complete contextual awareness** of:
- **The UI** - What views are active, what the user is looking at, available actions
- **The Database** - All project data, equipment, schedules, service tickets, and relationships
- **The Code** - How components work, what services do, available operations

**Everything in this app will eventually be controlled to some degree by the AI agent.** This means:

1. **Every component must be AI-aware**: Use `publishState()` to expose current view state and data to the AI
2. **Every action must be AI-controllable**: Use `registerActions()` to expose operations the AI can invoke
3. **State must be structured for AI understanding**: When publishing state, include semantic context (what view, what data, what's possible)
4. **New features = AI features**: When building anything new, ask "How will the AI understand and control this?"

### Design Implications
- Components aren't just for human users—they're interfaces the AI operates through
- Database queries should return data in AI-digestible formats
- Error states and validation should be AI-interpretable
- Navigation and workflows should be AI-invokable

### Current AI Infrastructure
- `AIBrainContext.js` - The AI agent brain with meta-tools
- `AppStateContext.js` - Central state bus where components publish state and register actions
- `VoiceCopilotOverlay.js` - Voice interface (current primary AI interaction method)
- Azure AI Search - RAG knowledge base for documentation and context
- Gemini - Voice processing and intelligent analysis

**When in doubt about any architectural decision, optimize for AI controllability and awareness.**

## Tech Stack
- **Frontend:** React 18, Tailwind CSS, Lucide icons, dark/light mode via ThemeContext
- **Backend:** Supabase (PostgreSQL + RLS), Vercel serverless API routes
- **Auth:** Microsoft MSAL (Azure AD) with service role bypass for public portals
- **Storage:** SharePoint via Microsoft Graph API, Supabase Storage as fallback
- **AI:** Gemini (voice AI, bug analysis), Azure AI Search (RAG knowledge base)

## Core Architecture Patterns

### Service-Based Architecture
All data access goes through services in `src/services/`:
```javascript
// Pattern: service layer abstracts Supabase
import { projectService } from '../services/projectService';
const projects = await projectService.getAll();
```

### RLS + RPC Pattern
Tables have Row Level Security. Use RPC functions to bypass when needed:
```javascript
// Direct update blocked by RLS:
await supabase.from('global_parts').update({...}).eq('id', id); // ❌

// Use RPC instead:
await supabase.rpc('update_global_part', { p_id: id, p_name: name }); // ✅
```

### Theme Context
```javascript
import { useTheme } from '../contexts/ThemeContext';
const { mode, palette } = useTheme(); // mode: 'light' | 'dark'
```

### Defensive Palette Pattern
Always provide fallbacks for palette access:
```javascript
const rawPalette = paletteByMode[mode] || paletteByMode.light || {};
const palette = {
  primary: rawPalette.primary || '#8B5CF6',
  textPrimary: rawPalette.textPrimary || (mode === 'dark' ? '#FAFAFA' : '#18181B'),
  ...rawPalette
};
```

## Key Modules

### Projects & Equipment
- `project_equipment` - Equipment instances assigned to projects
- `global_parts` - Master parts catalog (linked via `global_part_id`)
- Equipment has `rack_position_u`, `shelf_id`, `room_id` for placement

### Wire Drops & Prewire
- `wire_drops` - Cable runs with source/destination
- `wire_drop_stages` - Stage tracking (prewire, trim, commission)
- Use `wireDropService` for all wire drop operations

### Shades (Lutron)
- `project_shades` - Shade instances with measurements
- M1/M2 measurement workflow (two technicians, blinded)
- `ShadeDetailPage.js` - Full-page shade measuring

### Service CRM
- `service_tickets` - Service requests
- `service_schedules` - Calendar scheduling
- `service_time_logs` - Check-in/out time tracking
- Weekly Planning at `/service/weekly-planning`

### Rack Layout
- `project_racks` - Rack definitions (42U, etc.)
- `project_rack_shelves` - Shelves within racks
- Equipment placement via `rack_id`, `rack_position_u`, `shelf_id`
- Front/Back views with Physical/Functional modes

## External Portals (Unauthenticated)

Public portals MUST be standalone - no context dependencies:
```jsx
// ✅ CORRECT - Inline styles, no context
const PublicPortal = () => {
  const styles = { container: { minHeight: '100vh', backgroundColor: '#f9fafb' } };
  return <div style={styles.container}>...</div>;
};

// ❌ WRONG - Will crash for external users
const PublicPortal = () => {
  const { mode } = useTheme(); // External users don't have this!
};
```

SharePoint images in portals must use proxy endpoints:
```javascript
// Use thumbnail API if metadata available
const url = photo.sharepointDriveId
  ? `/api/sharepoint-thumbnail?driveId=${photo.sharepointDriveId}&itemId=${photo.sharepointItemId}&size=medium`
  : `/api/image-proxy?url=${encodeURIComponent(photo.url)}`;
```

### Company Brand Colors (Customer-Facing)

**Two separate branding systems exist:**
- **Unicorn Brand** - Internal app (`styleSystem.js`) - for employees/admins
- **Company Brand** - Configurable in Admin settings - for customer-facing portals/emails

External portals must fetch and use company brand colors:
```javascript
// API: Fetch from company_settings table
const brandColors = {
  primary: company.brand_color_primary || '#8B5CF6',
  secondary: company.brand_color_secondary || '#94AF32',
  tertiary: company.brand_color_tertiary || '#3B82F6'
};

// Frontend: Extract with defaults
const brandColors = company?.brandColors || {};
const brandPrimary = brandColors.primary || '#8B5CF6';
const brandSecondary = brandColors.secondary || '#94AF32';

// Use in inline styles
<div style={{ color: brandSecondary }}>Success!</div>
```

See `AGENT.md` → "Company Brand Colors" for full implementation guide.

## Voice AI System

### Architecture
- `AIBrainContext.js` - Voice AI agent with meta-tools
- `AppStateContext.js` - Single source of truth for AI state
- `VoiceCopilotOverlay.js` - Floating mic button

### Adding Voice AI to Components
```javascript
import { useAppState } from '../contexts/AppStateContext';

const MyComponent = () => {
  const { publishState, registerActions, unregisterActions } = useAppState();

  // Publish state for AI
  useEffect(() => {
    publishState({ view: 'my-view', data: {...} });
  }, [deps, publishState]);

  // Register actions
  useEffect(() => {
    const actions = {
      my_action: ({ param }) => { /* do something */ return { success: true }; }
    };
    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [registerActions, unregisterActions]);
};
```

## API Patterns

### Serverless Functions (Vercel)
Location: `api/` directory
```javascript
// api/example.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  // ... handle request
}
```

### Email via System Account
```javascript
import { systemSendMail } from './_systemGraph';
await systemSendMail({
  to: 'recipient@example.com',
  subject: 'Subject',
  body: '<p>HTML content</p>',
  bodyType: 'HTML'
});
```

### Localhost API Calls
For local dev, API calls need production URL:
```javascript
const apiBase = window.location.hostname === 'localhost'
  ? 'https://unicorn-one.vercel.app'
  : '';
const response = await fetch(`${apiBase}/api/endpoint`);
```

## Database Conventions

### Common Fields
- `id` - UUID primary key
- `created_at`, `updated_at` - Timestamps
- `project_id` - FK to projects table
- `is_active` - Soft delete flag

### Encrypted Fields
Sensitive data uses Supabase Vault encryption:
- Read from `*_decrypted` views
- Write via RPC functions (e.g., `create_project_secure_data`)

## UI Conventions

### 🎨 BRAND COLORS - DO NOT DEVIATE

**Strict adherence to brand colors is mandatory.** Never introduce arbitrary colors.

| Purpose | Hex | Usage |
|---------|-----|-------|
| Primary | `#8B5CF6` | `violet-500`, primary buttons, active states |
| Primary Hover | `#7C3AED` | `violet-600`, hover states |
| **Success** | **`#94AF32`** | **OLIVE GREEN - INLINE STYLES ONLY** |
| Warning | `#F59E0B` | `amber-500`, warnings |
| Danger | `#EF4444` | `red-500`, errors, destructive actions |
| Info | `#3B82F6` | `blue-500`, informational |

### ⚠️ SUCCESS/GREEN COLOR - CRITICAL

**NEVER use Tailwind green/emerald classes:**
- ❌ `text-green-*`, `bg-green-*`
- ❌ `text-emerald-*`, `bg-emerald-*`
- ❌ `#10B981`, `#22c55e`, `#16a34a`

**ALWAYS use brand olive green `#94AF32`:**
```jsx
// ✅ CORRECT - Inline styles
style={{ color: '#94AF32' }}
style={{ backgroundColor: 'rgba(148, 175, 50, 0.15)', color: '#94AF32' }}

// ✅ CORRECT - Import from styleSystem
import { brandColors } from '../styles/styleSystem';
style={{ color: brandColors.success }}  // '#94AF32'
```

**Reference:** `src/styles/styleSystem.js` contains `brandColors.success` = `#94AF32`

**Rules:**
- Always use `useTheme()` to get palette colors
- Success states MUST use inline styles with `#94AF32`
- Never hardcode colors without checking ThemeContext first
- When in doubt, use `palette.primary` or `palette.textPrimary`

### No Custom Back Buttons
Use browser back or AppHeader navigation - don't add component-level back buttons.

### Priority Values
Standard priority levels: `urgent`, `high`, `medium`, `low` (lowercase in DB)

### Form Validation
Check for required fields, show inline errors, disable submit until valid.

## Key Files Reference

| Purpose | File |
|---------|------|
| Auth context | `src/contexts/AuthContext.js` |
| Theme context | `src/contexts/ThemeContext.js` |
| Voice AI brain | `src/contexts/AIBrainContext.js` |
| App state (AI) | `src/contexts/AppStateContext.js` |
| Project service | `src/services/projectService.js` |
| Equipment service | `src/services/projectEquipmentService.js` |
| Parts service | `src/services/partsService.js` |
| Wire drop service | `src/services/wireDropService.js` |
| SharePoint service | `src/services/sharePointStorageService.js` |
| Knowledge service | `src/services/knowledgeService.js` |

## Environment Variables

```bash
# Supabase
REACT_APP_SUPABASE_URL=xxx
REACT_APP_SUPABASE_ANON_KEY=xxx

# Microsoft (MSAL + Graph)
AZURE_TENANT_ID=xxx
AZURE_CLIENT_ID=xxx
AZURE_CLIENT_SECRET=xxx

# AI Services
REACT_APP_GEMINI_API_KEY=xxx
AZURE_SEARCH_SERVICE_NAME=unicorn-rag
AZURE_SEARCH_API_KEY=xxx
AZURE_SEARCH_INDEX_NAME=sharepoint-knowledge-index

# GitHub (Bug Reports)
GITHUB_TOKEN=xxx
```

## Debugging Tips

1. **RLS errors**: Check if table needs service role or RPC function
2. **Theme crashes**: Add defensive palette handling
3. **SharePoint 403**: Verify Graph API permissions and token
4. **Voice AI not responding**: Check publishState and registerActions in component
5. **API 404 on localhost**: Add production URL prefix for serverless functions

## Documentation
Full details in `AGENT.md` - reference for:
- Complete changelog history
- Migration scripts
- Detailed feature implementations
- Troubleshooting guides
