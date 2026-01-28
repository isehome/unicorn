# Claude Workspace & Documentation Guide

> Created: January 28, 2026
> Purpose: How to work efficiently with Claude Code on the Unicorn project

---

## Documentation Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DOCUMENTATION SYSTEM                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    docs/CORE.md (~15KB)                         │   │
│   │  ─────────────────────────────────────────────────────────────  │   │
│   │  • Brand colors (PRIMARY source)                                │   │
│   │  • Business terminology                                         │   │
│   │  • Key services & tables                                        │   │
│   │  • Core patterns                                                │   │
│   │  • AI action registry                                           │   │
│   │  ─────────────────────────────────────────────────────────────  │   │
│   │           SINGLE SOURCE OF TRUTH - Update here first            │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                    ▲                              ▲                     │
│                    │ references                   │ references          │
│                    │                              │                     │
│   ┌────────────────┴─────────────┐  ┌────────────┴──────────────────┐  │
│   │     CLAUDE.md (~3KB)         │  │      AGENT.md (~300KB)        │  │
│   │  ─────────────────────────   │  │  ────────────────────────────  │  │
│   │  • Quick patterns            │  │  • Full business context      │  │
│   │  • File locations            │  │  • User workflows             │  │
│   │  • Update protocol           │  │  • AI copilot instructions    │  │
│   │                              │  │  • Feature changelog          │  │
│   │  FOR: Claude Code dev        │  │  • Voice agent (Sarah) info   │  │
│   │  LOADS: Automatically        │  │                               │  │
│   └──────────────────────────────┘  │  FOR: AI agents, onboarding   │
│                                     │  LOADS: When requested        │
│                                     └───────────────────────────────┘  │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    docs/*.md (Feature Docs)                     │   │
│   │  ─────────────────────────────────────────────────────────────  │   │
│   │  WIRE_DROPS.md, EQUIPMENT.md, PROCUREMENT.md, MILESTONES.md,   │   │
│   │  SHAREPOINT.md, DATABASE-SCHEMA-MAP.md, STYLES.md, etc.        │   │
│   │  ─────────────────────────────────────────────────────────────  │   │
│   │  FOR: Deep dives into specific features                         │   │
│   │  LOADS: Only when working on that feature                       │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## When to Update What

### After Implementing a Feature

| Change Type | Update | Example |
|-------------|--------|---------|
| New feature | AGENT.md (changelog + workflow) | "Added equipment connection tracking" |
| New service/table | docs/CORE.md + AGENT.md | "Created scheduleService.js" |
| UI pattern change | docs/CORE.md + docs/STYLES.md | "Changed collapsible chevron position" |
| Brand color | docs/CORE.md (all others reference it) | "Added new status color" |
| Bug fix | AGENT.md (changelog only) | "Fixed RLS policy on global_parts" |
| Deep technical | Specific docs/*.md | "Updated wire drop stage logic" |

### Update Protocol (Ask Claude to do this!)

```
"Please update the documentation for the feature we just built:
1. Add a changelog entry to AGENT.md
2. Update CORE.md if we changed any patterns
3. Update the relevant docs/*.md file"
```

---

## Working with Claude Code

### Starting a Session

**Don't say:** "Read AGENT.md and understand everything"
**Do say:** "I need to work on the wire drop photo upload feature"

Claude will:
1. Auto-load CLAUDE.md (3KB) - has brand colors and patterns
2. Trigger Unicorn skill - adds development context
3. Load specific docs only if needed

### For Different Tasks

| Task | What Claude Loads | You Say |
|------|-------------------|---------|
| Simple UI fix | CLAUDE.md only | "Change button color to primary" |
| Feature work | CLAUDE.md + skill + docs/*.md | "Read docs/WIRE_DROPS.md, I need to add a new stage" |
| AI agent work | AGENT.md (full) | "Read AGENT.md, I need to update the voice copilot context" |
| Onboarding new AI | AGENT.md (full) | "Read AGENT.md to understand the full system" |

### After Completing Work

**Always ask:** "Please update the documentation with this change"

This keeps AGENT.md comprehensive for AI agent onboarding while CLAUDE.md stays lean.

---

## File Size Summary

| File | Size | Purpose | When Loaded |
|------|------|---------|-------------|
| CLAUDE.md | ~3KB | Dev quick-ref | Auto (every session) |
| docs/CORE.md | ~15KB | Shared truth | When patterns needed |
| AGENT.md | ~300KB | AI onboarding | When requested |
| docs/*.md | 4-80KB each | Feature details | Per-feature |

---

## Permissions (Pre-Approved)

These commands run without prompts:

**Git:**
- `git add`, `commit`, `push`, `pull`, `status`, `diff`
- `git checkout`, `branch`, `fetch`, `merge`, `stash`, `log`

**NPM:**
- `npm run`, `npm install`, `npm test`, `npx`

**Files:**
- `ls`, `cat`, `head`, `tail`, `wc`, `find`
- `mkdir`, `mv`, `cp`

---

## Best Practices

### DO ✅

1. Let CLAUDE.md auto-load - don't force-read AGENT.md
2. Ask for specific doc files when working on features
3. Request documentation updates after completing features
4. Keep AGENT.md as the comprehensive AI onboarding source
5. Update docs/CORE.md when patterns change (it syncs everywhere)

### DON'T ❌

1. Load AGENT.md for routine development (too big)
2. Duplicate information between CLAUDE.md and AGENT.md
3. Forget to update changelog after feature work
4. Put brand colors anywhere except docs/CORE.md (source of truth)
5. Create new .md files in root (use docs/ folder)

---

## Quick Commands

```bash
# Check documentation sizes
du -h CLAUDE.md AGENT.md docs/CORE.md

# Find all docs
ls -la docs/*.md

# Search docs for a term
grep -r "wire drop" docs/

# View recent changelog entries
head -200 AGENT.md | grep -A 20 "^## 202"
```

---

*This guide: docs/CLAUDE-WORKSPACE-GUIDE.md*
