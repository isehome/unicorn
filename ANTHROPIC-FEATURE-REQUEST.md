# Feature Request: Custom Skills Support in Claude Cowork

**Submitted by:** Steve / Intelligent Systems
**Date:** January 28, 2026
**Product:** Claude Cowork (Desktop App)

---

## Summary

Request to enable custom skill loading in Cowork, matching the functionality available in Claude Code CLI via `.claude/skills/` folders.

---

## Use Case: AI-First Application Development

I'm building **Unicorn**, a field operations management app for smart home installations. The app is designed as an **AI-first application** where:

1. **Voice/AI is the primary interface** - Users interact primarily through an AI copilot (currently using Retell AI for phone, Gemini for in-app voice)
2. **Traditional UI is secondary** - Visual interface exists but all functionality is AI-accessible
3. **AI agents need complete comprehension** - Voice copilots, chat assistants, and development AI must understand the entire system

### The Documentation Challenge

For AI to effectively operate my app, it needs comprehensive knowledge of:
- Business workflows (prewire → trim-out → commissioning)
- Domain terminology (wire drops, head-end, global parts)
- Brand standards (specific colors, UI patterns)
- Database schema and relationships
- API endpoints and service layers
- Bug fix protocols and troubleshooting
- User personas and capabilities

I maintain this in a comprehensive `AGENT.md` (~300KB) that serves as the "AI brain" for the application.

---

## Current Problem

### In Claude Code CLI ✅
- Custom skills in `.claude/skills/` auto-load based on triggers
- I can create a "unicorn" skill that loads context when working on the project
- Skills can route to specific documentation based on task type
- Efficient: only loads what's needed, but AI has full awareness

### In Claude Cowork ❌
- Only built-in skills work (docx, xlsx, pptx, pdf)
- `.claude/skills/` folder is ignored
- No way to install custom `.skill` packages
- Every session requires manually asking Claude to read documentation
- No persistent project context

### The Impact

Every Cowork session, I must:
1. Manually tell Claude to read my documentation
2. Re-establish project context
3. Risk incomplete understanding if I forget to load key docs
4. Either load the full 300KB AGENT.md (exhausting context) or fragment understanding across smaller docs

This friction undermines the AI-first development workflow.

---

## Requested Feature

### Option A: Project Skills (Preferred)
Allow Cowork to recognize and load skills from `.claude/skills/` in the selected workspace folder, matching Claude Code behavior.

**When user selects a folder containing `.claude/skills/unicorn/SKILL.md`:**
1. Skill description appears in available skills list
2. Skill auto-triggers on relevant keywords (same as Claude Code)
3. Skill body loads when triggered

### Option B: User-Installable Skills
Allow users to install custom `.skill` packages (zip files) into Cowork, adding them to the skills manifest.

### Option C: Folder-Specific Auto-Load
When a workspace folder is selected, automatically load a designated file (e.g., `CLAUDE.md` or `.claude/context.md`) at session start.

---

## Why This Matters for AI-First Development

The future of software is AI-native applications where:
- AI agents are first-class interfaces, not afterthoughts
- Documentation IS the product - it's what enables AI to operate
- Human and AI users need equal access to functionality

Custom skills enable developers to give AI agents the comprehensive context they need to be effective partners, not just tools that need constant re-instruction.

---

## Current Workaround

I've created:
- `START-SESSION.md` - Instructions for Claude to load the right docs
- `docs/CORE.md` - Comprehensive but smaller context file
- Packaged `unicorn.skill` file (ready if installation becomes possible)

But this requires manual intervention every session, breaking the seamless AI-first workflow.

---

## Technical Notes

- I successfully packaged a skill using `skill-creator/scripts/package_skill.py`
- The `.skills/` folder in Cowork is read-only (system-managed)
- The manifest.json structure supports skill registration
- Claude Code skill format appears compatible

---

## Contact

Happy to discuss further or provide the Unicorn codebase as a test case for this feature.

**Steve**
Intelligent Systems
stephe@isehome.com
