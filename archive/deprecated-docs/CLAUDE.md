# UNICORN - Claude Code Instructions

> **Start every session by reading `docs/CORE.md`** - it has everything you need.
> Only read AGENT.md for AI agent onboarding, not for development.

## Quick Start

1. **Read `docs/CORE.md`** - Business context, brand colors, patterns, services
2. **Read topic-specific doc** if needed (see routing table below)
3. **After completing work**, offer to update documentation

## Documentation Routing

| Working On | Also Read |
|------------|-----------|
| Wire drops | `docs/WIRE_DROPS.md` |
| Equipment/Parts | `docs/EQUIPMENT.md` |
| Progress gauges | `docs/MILESTONES.md` |
| Purchase orders | `docs/PROCUREMENT.md` |
| Photo upload/display | `docs/SHAREPOINT.md` |
| External portals | `docs/EXTERNAL-PORTALS.md` |
| AI/Voice features | `docs/VOICE-AI-REFERENCE.md` |
| Database schema | `docs/DATABASE-SCHEMA-MAP.md` |

## 🎨 Brand Colors (Quick Ref)

| Purpose | Hex | Usage |
|---------|-----|-------|
| Primary | `#8B5CF6` | `violet-500` |
| **Success** | `#94AF32` | ⚠️ **INLINE ONLY** - never `green-*` |
| Warning | `#F59E0B` | `amber-500` |
| Danger | `#EF4444` | `red-500` |

Use `zinc-*` not `gray-*`. Always include `dark:` variants.

## After Implementing Features

**Always offer to update:**
1. `AGENT.md` - Changelog entry + business context
2. `docs/CORE.md` - If patterns/colors/services changed
3. Specific `docs/*.md` - Technical details

## NEVER

- ❌ Read AGENT.md for routine dev (300KB, exhausts context)
- ❌ Use `green-*` or `emerald-*` classes
- ❌ Use `gray-*` classes
- ❌ Direct Supabase in components (use services)
