# AGENT.md - Project Guidelines

**⚠️ AI ASSISTANT: Read this ENTIRE file before writing any code. Follow ALL rules strictly.**

---

# WHAT YOU MUST DO

1. **Read this entire file first**
2. **Follow all styling patterns exactly** (colors, dark mode, components)
3. **Put files in correct locations** (never in root)
4. **Update documentation after every change**
5. **Include RLS policies with `anon` role** for any database changes

---

# PROJECT STRUCTURE

```
unicorn/
├── src/
│   ├── components/         # React components go here
│   ├── services/           # Business logic services
│   ├── contexts/           # React contexts
│   ├── hooks/              # Custom hooks
│   ├── lib/                # Utilities
│   ├── styles/             # styleSystem.js (DO NOT MODIFY)
│   └── config/             # Configuration
├── api/                    # Vercel serverless functions
├── database/
│   ├── migrations/         # SQL migrations (YYYY-MM-DD_name.sql)
│   └── scripts/            # Utility SQL
├── docs/                   # Documentation (UPDATE AFTER CHANGES)
├── public/docs/            # Auto-deployed docs (don't edit directly)
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

### NEVER DO THIS
- ❌ Create ANY files in root directory
- ❌ Create .md files outside of `docs/`
- ❌ Create .sql files outside of `database/`
- ❌ Create duplicate components (ComponentV2, ComponentNew)

---

# STYLING SYSTEM

## Color Scale: ZINC (Not Gray)

**ALWAYS use `zinc`. NEVER use `gray`.**

```jsx
// ✅ CORRECT
bg-zinc-50 dark:bg-zinc-950      // Page background
bg-white dark:bg-zinc-900        // Cards
bg-zinc-100 dark:bg-zinc-800     // Muted backgrounds
text-zinc-900 dark:text-zinc-100 // Primary text
text-zinc-600 dark:text-zinc-400 // Secondary text
text-zinc-500                    // Muted text
border-zinc-200 dark:border-zinc-700  // Borders

// ❌ WRONG - Never use gray
bg-gray-50    // WRONG
bg-gray-100   // WRONG
bg-gray-800   // WRONG
bg-gray-900   // WRONG
text-gray-900 // WRONG
```

## Dark Mode: REQUIRED

**Every background, text, and border MUST have a dark: variant.**

```jsx
// ✅ CORRECT - Has dark mode
className="bg-white dark:bg-zinc-900"
className="text-zinc-900 dark:text-zinc-100"
className="border-zinc-200 dark:border-zinc-700"

// ❌ WRONG - Missing dark mode
className="bg-white"           // WRONG
className="text-zinc-900"      // WRONG
className="border-zinc-200"    // WRONG
```

## Brand Colors

| Purpose | Light | Dark | Tailwind |
|---------|-------|------|----------|
| Primary | `#8B5CF6` | `#8B5CF6` | `violet-500` |
| Primary Hover | `#7C3AED` | `#7C3AED` | `violet-600` |
| Success | `#94AF32` | `#94AF32` | Use hex or `emerald-500` |
| Warning | `#F59E0B` | `#F59E0B` | `amber-500` |
| Danger | `#EF4444` | `#EF4444` | `red-500` |
| Info | `#3B82F6` | `#3B82F6` | `blue-500` |

---

# COMPONENT PATTERNS

Copy these patterns exactly.

## Card
```jsx
<div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-sm p-4">
  {/* content */}
</div>
```

## Card with Hover
```jsx
<div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-sm p-4 transition-all hover:shadow-lg hover:border-violet-300 dark:hover:border-violet-600 cursor-pointer">
  {/* content */}
</div>
```

## Primary Button
```jsx
<button className="px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg font-medium transition-colors">
  Button
</button>
```

## Secondary Button
```jsx
<button className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-600 rounded-lg transition-colors">
  Button
</button>
```

## Danger Button
```jsx
<button className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors">
  Delete
</button>
```

## Text Input
```jsx
<input 
  className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
/>
```

## Select
```jsx
<select className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500">
  <option>Option</option>
</select>
```

## Status Badges
```jsx
// Success
<span className="px-2 py-1 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-full text-xs font-medium">Active</span>

// Warning
<span className="px-2 py-1 bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-full text-xs font-medium">Pending</span>

// Error
<span className="px-2 py-1 bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 rounded-full text-xs font-medium">Error</span>

// Info
<span className="px-2 py-1 bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400 rounded-full text-xs font-medium">Info</span>
```

## Collapsible Section
```jsx
// Chevron ALWAYS on LEFT, use ChevronRight/ChevronDown
<button onClick={() => setOpen(!open)} className="flex items-center gap-2 w-full p-3">
  {open ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
  <span>Section Title</span>
</button>
```

## Progress Bar Colors
```jsx
const getProgressColor = (pct) => {
  if (pct === 100) return '#8B5CF6'; // violet
  if (pct >= 75) return '#94AF32';   // success/olive
  if (pct >= 50) return '#3B82F6';   // blue
  if (pct >= 25) return '#F59E0B';   // amber
  return '#EF4444';                   // red
};
```

---

# DATABASE RULES

## RLS Policies - CRITICAL

We use **MSAL for auth, NOT Supabase Auth**. All policies MUST include `anon`:

```sql
-- ✅ CORRECT
CREATE POLICY "policy_name" ON public.table_name
FOR ALL TO anon, authenticated
USING (true);

-- ❌ WRONG (will silently fail)
CREATE POLICY "policy_name" ON public.table_name
FOR ALL TO authenticated  -- MISSING anon!
USING (true);
```

## Migration Format
```sql
-- File: database/migrations/YYYY-MM-DD_description.sql

ALTER TABLE table_name 
ADD COLUMN IF NOT EXISTS column_name type;

-- Always add RLS for new tables
CREATE POLICY "table_all" ON public.table_name
FOR ALL TO anon, authenticated USING (true);
```

---

# DOCUMENTATION UPDATES

## MANDATORY: Update Docs After Every Change

| What Changed | Update This File |
|--------------|------------------|
| New feature | `docs/PROJECT_OVERVIEW.md` |
| Wire drops | `docs/WIRE_DROPS.md` |
| Equipment | `docs/EQUIPMENT.md` |
| Procurement | `docs/PROCUREMENT.md` |
| Milestones/gauges | `docs/MILESTONES.md` |
| Authentication | `docs/AUTHENTICATION.md` |
| SharePoint | `docs/SHAREPOINT.md` |
| UniFi | `docs/UNIFI_INTEGRATION.md` |
| Any integration | `docs/INTEGRATIONS.md` |
| Bug fix | `docs/TROUBLESHOOTING.md` |
| Database table | `docs/PROJECT_OVERVIEW.md` |
| API endpoint | `docs/INTEGRATIONS.md` |
| Styling | `docs/STYLES.md` |

## Update Format
```markdown
### Feature Name
**Changed:** YYYY-MM-DD
**Files:** `src/components/File.js`

What was added or changed.
```

---

# CODE STANDARDS

## React Component
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

## Service Class
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

# PROJECT CONTEXT

**Owner:** Steve (Intelligent Systems - low-voltage installation)
**Tech Level:** Non-programmer, needs copy-paste ready code

**Stack:**
- React 18, Tailwind CSS, React Router
- Supabase (PostgreSQL)
- Azure MSAL (Microsoft 365 auth)
- Vercel hosting
- Integrations: SharePoint, Lucid Charts, UniFi, Brady Printers

**How to help:**
- Provide complete, copy-paste ready code
- Include exact file paths
- Explain in plain terms
- Always include documentation updates

---

# CHECKLIST BEFORE FINISHING

- [ ] Used `zinc` (not `gray`) for all neutral colors
- [ ] All colors have `dark:` variants
- [ ] Components follow patterns above
- [ ] Files in correct locations (not in root)
- [ ] Database policies include `anon`
- [ ] Updated relevant doc file in `docs/`
- [ ] Removed console.log statements

---

**This file is the single source of truth. Follow it exactly.**