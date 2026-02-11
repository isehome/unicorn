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

## Git Branching (CRITICAL - EVERY SESSION MUST DO THIS)

**NEVER commit directly to main.** Each Claude session works on its own branch.

### Session Start (FIRST THING YOU DO)
```bash
source scripts/git-branch-session.sh "short-description-of-task"
# Example: source scripts/git-branch-session.sh "fix-email-agent"
# Creates: claude/2026-02-11-fix-email-agent
# Exports GIT_DIR and GIT_WORK_TREE (handles index.lock automatically)
```
After sourcing, all git commands use your isolated branch. Commit and push freely.

### When Done — Push Your Branch
```bash
git push origin claude/2026-02-11-your-branch-name
```
Do **NOT** push to main. Steve (or a merge session) combines branches.

### Merging Branches to Main (Steve or designated session only)
```bash
scripts/git-merge-branches.sh --list              # See all branches
scripts/git-merge-branches.sh --dry-run --all     # Preview merges
scripts/git-merge-branches.sh --all               # Merge everything
scripts/git-merge-branches.sh claude/2026-02-11-x # Merge one branch
```

## Git Safety (CRITICAL - NEVER SKIP)

**Problem:** Git plumbing (read-tree, update-index, write-tree, commit-tree) can silently DELETE files if you don't add them back to the tree. Commit 7c4d067 deleted 47 files this way.

**Before ANY git commit (plumbing or porcelain):**
1. Run `git diff --stat HEAD` to verify you're not accidentally deleting files
2. If using git plumbing, use `scripts/git-safe-commit.sh` wrapper instead of raw `git commit-tree`
3. **NEVER** use `git read-tree HEAD` and then selectively add files — this DELETES everything you don't add
4. Instead:
   - `git read-tree HEAD` to load the current tree
   - `git update-index --add` your changed files on top of it
   - Verify with `git diff-tree HEAD <new-tree>` before committing
5. A commit that deletes more than 3 files requires explicit user confirmation
6. A commit that deletes more than 500 lines of code requires explicit user confirmation

**Example safe workflow:**
```bash
# Load current state
git read-tree HEAD
git update-index --add src/components/MyComponent.tsx src/utils/helper.ts

# Verify before committing
NEW_TREE=$(git write-tree)
git diff-tree HEAD "$NEW_TREE"

# Use the safe commit wrapper
COMMIT=$(scripts/git-safe-commit.sh "$NEW_TREE" "HEAD" "Fix: xyz issue")
git reset --soft "$COMMIT"
```

---

## Autonomous Workflow Rules (NEVER BREAK THESE)

Steve's goal is **hands-free automation**. Every time you stop to prompt the user and wait for a response, the workflow fails. Self-recover from problems. Only ask Steve as a last resort after multiple failed attempts.

### Chrome / Browser Recovery
If the Chrome extension connection is lost, **do NOT stop and ask**. Auto-recover:
1. `osascript: tell application "Google Chrome" to quit`
2. Wait 3 seconds
3. `osascript: tell application "Google Chrome" to activate`
4. Retry `tabs_context_mcp`
5. Only alert Steve if recovery fails after 2 attempts

### MCP Fallback Priority
Before prompting Steve, exhaust all available tools in this order:
1. **Supabase MCP** — Direct DB queries, migrations, schema changes
2. **Vercel MCP** — Deployment status, project info, build/runtime logs
3. **Git CLI** — Repo operations, commit history, branch management
4. **Chrome MCP** — Browser automation, UI verification (restart Chrome if disconnected)
5. **Mac Control MCP** — osascript for system-level actions (restart apps, etc.)
6. **Notion / Apple Notes / iMessage MCPs** — Secondary data sources, notifications
7. **Only after exhausting all options** → Ask Steve

### Git Lock File Recovery
`.git/index.lock` can't be deleted in the sandbox. **Do NOT stop and ask.** Instead:
1. Copy `.git` to `/tmp/unicorn-git-N` (increment N each time)
2. Remove lock files from the temp copy
3. Use `GIT_DIR=/tmp/unicorn-git-N` for all subsequent git operations

### Network Restrictions
This sandbox blocks direct HTTP (curl/wget). **Never stop to explain this.** Use MCP alternatives:
- Supabase MCP for database operations
- Vercel MCP for deployment info
- Git CLI for repository operations

### Bug Fix Workflow

**STEP 1: Dedup check (ALWAYS do this first)**
Before fixing ANY bug, query Supabase for recently fixed bugs and compare:
```sql
SELECT bug_report_id, ai_summary, ai_suggested_files, fix_summary, fixed_at
FROM bug_reports WHERE status IN ('fixed', 'pending_review')
ORDER BY fixed_at DESC LIMIT 30;
```
For each open bug you're about to fix, compare its `ai_summary` and `ai_suggested_files` against this list. If an open bug looks like a duplicate of something already fixed (same files, same issue description, same root cause), **skip it** — don't try to fix it again. Instead mark it as fixed with a note:
```sql
UPDATE bug_reports SET status = 'fixed',
  fix_summary = 'Duplicate of BR-YYYY-MM-DD-NNNN — already fixed on [date]',
  fixed_at = NOW()
WHERE bug_report_id = 'BR-...';
```

**STEP 2: Fix the bug** — implement the fix, commit, push to your session branch (NOT main)

**STEP 3: Mark pending_review in Supabase** (don't try to call the Vercel API):
```sql
UPDATE bug_reports SET status = 'pending_review',
  fix_summary = 'What was fixed and how'
WHERE bug_report_id = 'BR-YYYY-MM-DD-NNNN';
```
Steve approves fixes through the Unicorn UI (green summary box → modal → Approve).
