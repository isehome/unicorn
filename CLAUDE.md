# Unicorn Project - Claude Instructions

> **CRITICAL:** This file is auto-loaded. Keep it under 50 lines. Details live in `AGENT.md`.

## What This Is

Unicorn = Project management app for low-voltage installations (network cabling, AV, smart home).
Stack: React 18 + Supabase + Azure MSAL + Tailwind + Vercel

## Mandatory Rules (Never Break These)

### Colors
- Success: `style={{ color: '#94AF32' }}` - **NEVER** `green-*` or `emerald-*`
- Theme: `zinc-*` not `gray-*`, always include `dark:` variants
- Primary: `violet-500`

### Auth
- Use `useAuth()` from AuthContext - **NEVER** `supabase.auth.getUser()` (always null)
- RLS policies: `FOR ALL TO anon, authenticated` (we use MSAL)

### Code Patterns
- Services only: `import { projectService } from '../services/projectService'`
- Timestamps: Every `*_at` needs `*_by`: `{ completed_at: now, completed_by: userId }`

## Reading AGENT.md (354KB - Read Selectively!)

| Need | Lines | Read Command |
|------|-------|--------------|
| Wire drops | 48-400 | `Read AGENT.md offset=48 limit=350` |
| Equipment | 400-700 | `Read AGENT.md offset=400 limit=300` |
| Milestones | 700-1000 | `Read AGENT.md offset=700 limit=300` |
| **Brand colors** | 1604-1700 | `Read AGENT.md offset=1604 limit=100` |
| Styling | 1700-1900 | `Read AGENT.md offset=1700 limit=200` |
| Database | 2000-2400 | `Read AGENT.md offset=2000 limit=400` |
| Voice AI | 2722-3100 | `Read AGENT.md offset=2722 limit=400` |
| Changelog | 3800+ | `Read AGENT.md offset=3800 limit=200` |

## After ANY Code Change

**Auto-update changelog in AGENT.md (line 3800+):**
```markdown
### YYYY-MM-DD - [Feature Name]
**What:** [Brief description]
**Why:** [Business value]
**Files:** `src/...`, `api/...`
```

## Bug Reports

Bugs are GitHub PRs with `[Bug]` prefix:
```bash
gh pr list --repo isehome/unicorn --state open --search "[Bug]"
```

## Commands

- Build: `npm run build`
- Lint: `npm run lint`
- Deploy: `vercel` or push to main
