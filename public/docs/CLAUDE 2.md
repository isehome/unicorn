# CLAUDE.md - AI Assistant Guidelines for Unicorn Project

## ⚠️ CRITICAL: READ THIS FIRST

This file contains **mandatory instructions** for any AI assistant (Claude, GPT, Gemini, etc.) working on this project. Following these rules prevents codebase clutter and maintains project organization.

---

## 📁 PROJECT STRUCTURE - DO NOT DEVIATE

```
unicorn/
├── src/                    # Application source code ONLY
│   ├── components/         # React components
│   ├── services/           # Business logic services
│   ├── contexts/           # React contexts
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utilities (supabase, cache, etc.)
│   ├── config/             # Configuration files
│   ├── modules/            # Feature modules
│   ├── pages/              # Page components
│   └── utils/              # Helper functions
│
├── api/                    # Vercel serverless functions ONLY
│
├── database/               # ALL database-related files
│   ├── schema.sql          # Current complete schema
│   ├── seed.sql            # Seed data
│   ├── migrations/         # Dated migration files
│   └── scripts/            # Utility SQL scripts
│
├── docs/                   # ALL documentation (SOURCE OF TRUTH)
│   ├── README.md           # Documentation index
│   ├── PROJECT_OVERVIEW.md # Complete system overview
│   └── [topic].md          # Topic-specific docs
│
├── public/docs/            # Auto-generated on build (DO NOT EDIT)
│
├── scripts/                # Build/deploy/utility scripts
├── archive/                # Old/deprecated files (reference only)
├── public/                 # Static assets
└── node_modules/           # Dependencies (gitignored)
```

---

## 📝 DOCUMENTATION MAINTENANCE - MANDATORY

### The Rule: ALWAYS Update Docs After Changes

Every code change MUST include corresponding documentation updates. This is NOT optional.

### Which Doc File to Update

| What You Changed | Update This File |
|------------------|------------------|
| New component or feature | `docs/PROJECT_OVERVIEW.md` + feature-specific doc |
| Wire drop system | `docs/WIRE_DROPS.md` |
| Equipment/parts system | `docs/EQUIPMENT.md` |
| Procurement/PO system | `docs/PROCUREMENT.md` |
| Progress gauges | `docs/MILESTONES.md` |
| Authentication/RLS | `docs/AUTHENTICATION.md` |
| SharePoint integration | `docs/SHAREPOINT.md` |
| UniFi integration | `docs/UNIFI_INTEGRATION.md` |
| Any integration | `docs/INTEGRATIONS.md` |
| Deployment process | `docs/DEPLOYMENT.md` |
| Bug fix for common issue | `docs/TROUBLESHOOTING.md` |
| New database table | `docs/PROJECT_OVERVIEW.md` (Database section) |
| New API endpoint | `docs/INTEGRATIONS.md` (API section) |
| Future plans discussed | `docs/ROADMAP.md` |

### How to Update Documentation

#### Adding a New Feature
Add to the appropriate doc file:
```markdown
### Feature Name
**Added:** [Date]
**Files:** `src/components/NewComponent.js`, `src/services/newService.js`

Description of what it does.

**How to use:**
1. Step one
2. Step two

**Configuration:** (if any)
- Environment variable X
- Database table Y
```

#### Modifying Existing Feature
Find the existing section and:
1. Update the description if behavior changed
2. Update file paths if files moved/renamed
3. Add "**Modified:** [Date] - [what changed]" note

#### Fixing a Bug
Add to `docs/TROUBLESHOOTING.md`:
```markdown
### Issue: Brief description
**Symptom:** What the user sees
**Cause:** Why it happened
**Solution:** How to fix it
**Fixed in:** [Date] - [files changed]
```

#### Adding Database Table
1. Add migration to `database/migrations/YYYY-MM-DD_description.sql`
2. Update `docs/PROJECT_OVERVIEW.md` Database Schema section:
```markdown
| table_name | Purpose description |
```

#### Adding API Endpoint
Update `docs/INTEGRATIONS.md` API section:
```markdown
| `/api/endpoint-name` | What it does |
```

### Documentation Format Standards

Always use this structure in doc files:
```markdown
## Section Name

### Subsection

**Key term:** Definition

- Bullet points for lists
- Another item

| Column 1 | Column 2 |
|----------|----------|
| Data     | Data     |

` ` `javascript
// Code examples in fenced blocks
` ` `
```

### End of Session Checklist

Before finishing any coding session, verify:
- [ ] All new files are documented
- [ ] Modified features have updated docs  
- [ ] New issues/solutions added to TROUBLESHOOTING.md
- [ ] Database changes reflected in PROJECT_OVERVIEW.md
- [ ] API changes reflected in INTEGRATIONS.md
- [ ] Commit message describes the documentation updates

---

## 🚫 NEVER DO THESE THINGS

### 1. NEVER Create Files in Root Directory
❌ **WRONG:**
```
unicorn/FIX_SOMETHING.md
unicorn/NEW_FEATURE_PLAN.md
unicorn/SOME_SCRIPT.sql
```

✅ **CORRECT:**
```
unicorn/docs/FIX_SOMETHING.md (if needed, or update existing doc)
unicorn/database/scripts/some_script.sql
```

### 2. NEVER Create Random Documentation Files
❌ **WRONG:** Creating `IMPLEMENTATION_COMPLETE.md`, `BUG_FIX_STATUS.md`, `NOTES.md`

✅ **CORRECT:** Update the appropriate existing doc in `docs/` folder

### 3. NEVER Leave SQL Files Scattered
❌ **WRONG:** Creating `.sql` files in root or random locations

✅ **CORRECT:** 
- New migrations → `database/migrations/YYYY-MM-DD_description.sql`
- Utility scripts → `database/scripts/`
- Schema changes → Update `database/schema.sql`

### 4. NEVER Create Duplicate Components
❌ **WRONG:** Creating `ComponentNameNew.js` or `ComponentNameV2.js`

✅ **CORRECT:** Modify existing component or create `ComponentNameEnhanced.js` and DELETE the old one

### 5. NEVER Skip Documentation
❌ **WRONG:** "I'll document this later" or "The code is self-documenting"

✅ **CORRECT:** Update docs IN THE SAME SESSION as the code change

---

## ✅ ALWAYS DO THESE THINGS

### 1. Update Documentation After Changes
See the Documentation Maintenance section above - this is MANDATORY.

### 2. Follow Existing Code Patterns
Before writing new code, check existing patterns:
- **Services:** Look at `src/services/wireDropService.js` for pattern
- **Components:** Look at `src/components/WireDropDetailEnhanced.js` for pattern
- **Hooks:** Look at `src/hooks/useNetworkStatus.js` for pattern

### 3. Use Proper File Locations

| File Type | Location |
|-----------|----------|
| React components | `src/components/` or `src/components/[feature]/` |
| Services | `src/services/` |
| API functions | `api/` |
| SQL migrations | `database/migrations/` |
| SQL scripts | `database/scripts/` |
| Documentation | `docs/` |
| Shell scripts | `scripts/` |
| Test files | `src/__tests__/` (create if needed) |

### 4. Clean Up After Yourself
- Remove console.log statements before finishing
- Delete backup files you created
- Remove commented-out code blocks
- Update imports if you move/rename files

---

## 🔧 CODING STANDARDS

### React Components
```jsx
// Use functional components with hooks
// Use Tailwind for styling
// Support dark mode with dark: prefix
// Use lucide-react for icons

import { useState } from 'react';
import { SomeIcon } from 'lucide-react';

const MyComponent = ({ prop1, prop2 }) => {
  const [state, setState] = useState(null);
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
      {/* Component content */}
    </div>
  );
};

export default MyComponent;
```

### Services
```javascript
// Use class-based services
// Export singleton instance
// Include JSDoc comments

import { supabase } from '../lib/supabase';

class MyService {
  /**
   * Description of method
   * @param {string} param1 - Description
   * @returns {Promise<Object>} Description
   */
  async myMethod(param1) {
    // Implementation
  }
}

export const myService = new MyService();
export default myService;
```

### SQL Migrations
```sql
-- Migration: YYYY-MM-DD_description.sql
-- Description: What this migration does
-- Author: AI Assistant / Steve

-- Add new column
ALTER TABLE table_name
ADD COLUMN IF NOT EXISTS column_name type;

-- Always include RLS policies for new tables
-- Remember: Use 'anon, authenticated' for both roles (we use MSAL, not Supabase Auth)
CREATE POLICY "policy_name" ON public.table_name
FOR ALL TO anon, authenticated
USING (true);
```

---

## 🎨 STYLING RULES

### Tailwind Classes (Always Use)
```jsx
// Colors
bg-violet-500      // Primary
bg-green-500       // Success
bg-yellow-500      // Warning  
bg-red-500         // Error

// Dark mode (always include)
bg-white dark:bg-gray-800
text-gray-900 dark:text-white
border-gray-200 dark:border-gray-700

// Common patterns
rounded-lg shadow-sm p-4           // Cards
px-4 py-2 rounded-lg               // Buttons
w-full px-3 py-2 border rounded-lg // Inputs
```

### Never Use
- Inline styles (except for dynamic values)
- Separate CSS files
- CSS modules
- styled-components

---

## 🗄️ DATABASE RULES

### RLS Policies (Critical!)
We use Microsoft MSAL for auth, NOT Supabase Auth. This means:
- Supabase client connects as `anon` role
- ALL policies must include `anon` role

```sql
-- CORRECT
CREATE POLICY "name" ON public.table
FOR ALL TO anon, authenticated
USING (true);

-- WRONG (will fail!)
CREATE POLICY "name" ON public.table
FOR ALL TO authenticated  -- Missing anon!
USING (true);
```

### Naming Conventions
- Tables: `snake_case` (e.g., `wire_drops`, `project_equipment`)
- Columns: `snake_case` (e.g., `created_at`, `project_id`)
- Foreign keys: `referenced_table_id` (e.g., `project_id`, `wire_drop_id`)

---

## 📦 DEPENDENCIES

### Before Adding New Packages
1. Check if functionality exists in current dependencies
2. Prefer well-maintained, popular packages
3. Check bundle size impact
4. Update `docs/PROJECT_OVERVIEW.md` if adding significant dependency

### Current Key Dependencies
- UI: React, Tailwind, Lucide React
- State: React Query (@tanstack/react-query)
- Database: Supabase (@supabase/supabase-js)
- Auth: MSAL (@azure/msal-browser, @azure/msal-react)
- PDF: jspdf, jspdf-autotable
- CSV: papaparse

---

## 🚀 DEPLOYMENT NOTES

### Environment Variables
Never commit secrets. Required vars:
- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_ANON_KEY`
- `REACT_APP_AZURE_CLIENT_ID`
- `REACT_APP_AZURE_TENANT_ID`

### Before Deploying
1. Run `npm run build` locally to check for errors
2. Test authentication flow
3. Verify database migrations are applied
4. Update documentation if needed

---

## 🔄 GIT PRACTICES

### Commit Messages
```
feat: Add new procurement dashboard
fix: Resolve wire drop photo upload issue
docs: Update API integration guide
refactor: Consolidate milestone calculations
chore: Clean up unused imports
```

### Before Committing
- Remove console.log statements
- Remove commented code
- Update relevant documentation
- Test the feature works

---

## 📞 CONTEXT FOR AI ASSISTANTS

### Project Owner
- **Name:** Steve
- **Company:** Intelligent Systems (low-voltage installation)
- **Technical Level:** Non-programmer, relies on AI assistance

### How to Help Steve
1. Provide complete, copy-paste ready code
2. Specify exact file paths
3. Explain changes in plain terms
4. Show before/after for edits
5. Test logic mentally before suggesting

### Current Tech Stack
- Frontend: React 18, Tailwind CSS, React Router
- Backend: Supabase (PostgreSQL)
- Auth: Azure MSAL (Microsoft 365)
- Hosting: Vercel
- Integrations: SharePoint, Lucid Charts, UniFi

---

## 📋 QUICK REFERENCE

### File Location Cheat Sheet
| I need to... | Put it in... |
|--------------|--------------|
| Create React component | `src/components/` |
| Create service | `src/services/` |
| Create API endpoint | `api/` |
| Add SQL migration | `database/migrations/` |
| Write documentation | `docs/` |
| Add utility script | `scripts/` |
| Store old/reference files | `archive/` |

### Common Commands
```bash
npm start          # Run dev server
npm run build      # Build for production
npm run sync-docs  # Copy docs to public folder
npm test           # Run tests
```

---

## 🌐 LIVE DOCUMENTATION

Documentation is also available at the deployed app:
- **Human-readable:** `https://[app-url]/docs/`
- **Raw markdown:** `https://[app-url]/docs/[filename].md`
- **File index:** `https://[app-url]/docs/index.json`

The `docs/` folder is the source of truth. Files are auto-copied to `public/docs/` during build.

---

*This file should be read by AI assistants at the start of every session.*
*Last Updated: November 2025*