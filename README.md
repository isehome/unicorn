# 🦄 Unicorn

**Project Management for Low-Voltage Installations**

A comprehensive React application for managing network cabling, wire drops, and AV installations. Built for Intelligent Systems.

---

## ⚠️ AI ASSISTANTS: READ THIS SECTION FIRST

This project has strict organizational rules. **Failure to follow these will create mess.**

### Critical Rules

1. **NEVER create files in root directory** - Use proper folders (see structure below)
2. **NEVER create random .md files** - Update existing docs or add to `docs/` folder  
3. **NEVER leave SQL files scattered** - Put in `database/migrations/` or `database/scripts/`
4. **ALWAYS update documentation** after implementing features
5. **ALWAYS use Tailwind CSS** - No separate CSS files, no inline styles (except dynamic)
6. **ALWAYS include `anon` in RLS policies** - We use MSAL auth, not Supabase Auth

### File Location Rules

| File Type | Correct Location |
|-----------|------------------|
| React components | `src/components/` |
| Services/business logic | `src/services/` |
| API endpoints | `api/` |
| SQL migrations | `database/migrations/` |
| SQL utility scripts | `database/scripts/` |
| Documentation | `docs/` |
| Shell/utility scripts | `scripts/` |
| Old/deprecated files | `archive/` |

### Project Structure

```
unicorn/
├── src/                    # React application source
│   ├── components/         # React components
│   ├── services/           # Business logic
│   ├── contexts/           # React contexts (Auth, Theme, Printer)
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utilities (supabase client, cache)
│   ├── config/             # Configuration files
│   └── pages/              # Page components
├── api/                    # Vercel serverless functions
├── database/               # SQL schema and migrations
│   ├── schema.sql          # Current complete schema
│   ├── migrations/         # Dated migration files
│   └── scripts/            # Utility SQL scripts
├── docs/                   # All documentation
├── scripts/                # Build/deploy scripts
├── archive/                # Old/deprecated files (reference only)
├── public/                 # Static assets
├── CLAUDE.md               # Detailed AI guidelines
└── README.md               # This file
```

### RLS Policy Pattern (CRITICAL)

We use Microsoft MSAL for auth, NOT Supabase Auth. The Supabase client connects as `anon` role.

```sql
-- CORRECT: Include both roles
CREATE POLICY "name" ON public.table_name
FOR ALL TO anon, authenticated
USING (true);

-- WRONG: Will fail silently!
CREATE POLICY "name" ON public.table_name
FOR ALL TO authenticated  -- Missing anon!
USING (true);
```

### Code Patterns to Follow

**Components:** Functional React with hooks, Tailwind CSS, dark mode support
```jsx
const MyComponent = () => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
      {/* Content */}
    </div>
  );
};
```

**Services:** Class-based, singleton export
```javascript
class MyService {
  async myMethod() { /* ... */ }
}
export const myService = new MyService();
```

### For Complete AI Guidelines

See [CLAUDE.md](CLAUDE.md) for comprehensive rules on:
- Coding standards
- Documentation requirements  
- Git practices
- Troubleshooting

---

## Features

- **Wire Drop Management** - Track installations through prewire, trim-out, and commissioning stages
- **Equipment Tracking** - Import from CSV, manage inventory, link to wire drops
- **Procurement** - Generate POs, manage vendors, track shipments
- **Progress Dashboards** - Real-time milestone gauges for PMs and technicians
- **Photo Documentation** - Stage photos stored in SharePoint
- **Floor Plans** - Import from Lucid Charts, visualize wire drop locations
- **Network Integration** - Match equipment to UniFi network clients

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Tailwind CSS, React Router, React Query |
| Backend | Supabase (PostgreSQL) |
| Auth | Azure MSAL (Microsoft 365) |
| Hosting | Vercel |
| Integrations | SharePoint, Lucid Charts, UniFi, Brady Printers |

---

## Quick Start

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env.local
# Edit .env.local with your credentials

# Start development server
npm start
```

---

## Environment Variables

```bash
# Required
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
REACT_APP_AZURE_CLIENT_ID=your-azure-client-id
REACT_APP_AZURE_TENANT_ID=your-azure-tenant-id

# Optional integrations
REACT_APP_UNIFI_API_KEY=your-unifi-key
REACT_APP_LUCID_CLIENT_ID=your-lucid-id
REACT_APP_LUCID_CLIENT_SECRET=your-lucid-secret
```

---

## Documentation

All documentation is in [`docs/`](docs/):

| Document | Description |
|----------|-------------|
| [PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) | Complete system architecture |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment guide |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues and fixes |
| [INTEGRATIONS.md](docs/INTEGRATIONS.md) | Third-party integrations |
| [WIRE_DROPS.md](docs/WIRE_DROPS.md) | Wire drop system |
| [PROCUREMENT.md](docs/PROCUREMENT.md) | PO system |
| [MILESTONES.md](docs/MILESTONES.md) | Progress gauges |

---

## Key Files for Understanding the Codebase

| File | What It Shows |
|------|---------------|
| `src/App.js` | All routes, app structure |
| `src/contexts/AuthContext.js` | MSAL authentication flow |
| `src/services/wireDropService.js` | Service class pattern |
| `src/services/milestoneService.js` | Milestone calculations |
| `src/components/WireDropDetailEnhanced.js` | Complex component pattern |
| `src/lib/supabase.js` | Database client setup |

---

## Owner Context

**Owner:** Steve (Intelligent Systems)  
**Technical Level:** Non-programmer, relies on AI assistance  
**Preferred Help Style:**
- Complete, copy-paste ready code
- Explicit file paths and line numbers
- Plain English explanations
- Step-by-step instructions

---

*Built with ❤️ and AI assistance*  
*Last Updated: November 2025*