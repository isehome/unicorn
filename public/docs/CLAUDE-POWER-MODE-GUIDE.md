# Claude Power Mode Setup Guide

> **Created:** 2026-02-05
> **Purpose:** Maximum automation for hands-off coding sessions

---

## What Was Set Up

### 1. Permission Configuration (`.claude/settings.json`)

**Auto-approved operations (no prompts):**
- All file read/edit/write operations
- Git operations (status, diff, add, commit, push, pull, etc.)
- npm commands (run, test, install, build)
- GitHub CLI (issues, PRs, API)
- Vercel and Supabase CLI
- Standard terminal commands (ls, cat, find, etc.)

**Blocked operations (always denied):**
- Reading `.env` files (security)
- `rm -rf` commands (safety)
- `sudo` commands (security)

### 2. CLAUDE.md Pointer File

A lightweight (50-line) file that:
- Loads quickly (doesn't consume context)
- Contains CRITICAL rules that must never be broken
- Points to specific AGENT.md sections by line number
- Prevents Claude from reading the entire 354KB AGENT.md

### 3. Hooks (`.claude/hooks.json`)

**Automatic actions:**
- Runs ESLint after every file edit
- Runs lint check before git commits

### 4. Subagents (`.claude/agents/`)

| Agent | Purpose | Speed |
|-------|---------|-------|
| `unicorn-explorer` | Search codebase, find files | Fast (Haiku) |
| `code-reviewer` | Check Unicorn rules, quality | Standard (Sonnet) |
| `test-runner` | Verify builds, run tests | Fast (Haiku) |

**How they work:**
Claude can spawn these as parallel workers. Example workflow:
1. You ask: "Fix the wire drop photo upload bug"
2. Claude spawns `unicorn-explorer` to find relevant code
3. Claude implements the fix
4. Claude spawns `code-reviewer` + `test-runner` in parallel to verify

### 5. Updated Unicorn Skill

The skill now:
- References the subagents
- Provides efficient AGENT.md reading commands
- Enforces the parallel verification workflow

---

## Folder Structure

```
unicorn/
├── CLAUDE.md                  ← NEW: Lightweight pointer (auto-loaded)
├── AGENT.md                   ← Existing: Full documentation (read selectively)
├── .claude/
│   ├── settings.json          ← NEW: Shared permissions (commit to git)
│   ├── settings.local.json    ← UPDATED: Fixed syntax + personal overrides
│   ├── hooks.json             ← NEW: Auto-lint hooks
│   ├── agents/                ← NEW: Subagent definitions
│   │   ├── code-reviewer.md
│   │   ├── test-runner.md
│   │   └── unicorn-explorer.md
│   └── skills/
│       └── unicorn/
│           └── SKILL.md       ← UPDATED: References new architecture
└── docs/
    └── CLAUDE-POWER-MODE-GUIDE.md  ← This file
```

---

## How to Use

### In Cowork (Claude Desktop)

The Task tool spawns subagents automatically. Just ask naturally:

```
"Fix the milestone calculation bug, then verify the build passes"
```

Claude will:
1. Search for the bug
2. Fix it
3. Spawn test-runner to verify
4. Update changelog

### In Claude Code CLI

Same workflow, plus you get:
- `settings.json` permissions (auto-approve operations)
- `hooks.json` auto-actions (lint after edit)
- `/agents` command to manage subagents

---

## GitHub Push Access

**Already configured in settings.json:**
```json
"Bash(git push)",
"Bash(git push *)"
```

**To ensure GitHub authentication works:**

1. **For HTTPS:** Configure git credential helper
   ```bash
   git config --global credential.helper osxkeychain  # Mac
   ```

2. **For SSH:** Ensure your SSH key is added
   ```bash
   ssh -T git@github.com  # Test connection
   ```

3. **For GitHub CLI:** Authenticate once
   ```bash
   gh auth login
   ```

---

## Troubleshooting

### "Permission denied" for git push
- Verify GitHub authentication: `gh auth status`
- Check remote URL: `git remote -v`

### Claude still asks for permission
- Verify `settings.json` is in `.claude/` folder
- Check JSON syntax is valid
- In Cowork, some operations may still require approval (security)

### Subagents not working
- Subagents work via the Task tool
- Ask Claude to "use the code-reviewer agent" explicitly if needed

---

## What's Different: Cowork vs Claude Code CLI

| Feature | Cowork | Claude Code CLI |
|---------|--------|-----------------|
| Task/Subagents | Works | Works |
| CLAUDE.md | Read | Read |
| Skills | Works | Works |
| settings.json | Limited* | Full support |
| hooks.json | Limited* | Full support |

*Cowork runs in a sandbox with its own security model. Some settings may be overridden.

---

## Agent Teams (Multi-Agent Coordination)

**Status:** Enabled in your settings.json

Agent teams let you spawn multiple Claude instances that work in parallel and communicate directly with each other. Unlike subagents (which report back to the main agent), teammates coordinate autonomously.

### When to Use Agent Teams vs Subagents

| Use Case | Best Choice |
|----------|-------------|
| Quick focused tasks | Subagents |
| Parallel exploration | Agent Teams |
| Tasks with dependencies | Subagents |
| Independent parallel work | Agent Teams |
| Low token usage | Subagents |
| Complex multi-faceted review | Agent Teams |

### Creating an Agent Team

Ask Claude naturally:
```
Create an agent team to investigate this bug:
- Teammate 1: Check the frontend component
- Teammate 2: Check the API endpoint
- Teammate 3: Check the database queries

Each teammate should investigate independently and report findings.
```

### Good Use Cases for Unicorn

1. **PR Review** - Security, performance, and Unicorn-rules reviewers in parallel
2. **Bug Investigation** - Multiple hypotheses tested simultaneously
3. **Feature Implementation** - Different components built in parallel
4. **Codebase Analysis** - Frontend, API, and database layers analyzed together

### Limitations

- No session resumption for teammates
- Can't manage multiple teams at once
- Higher token usage
- Teammates can't spawn their own teams

---

## Recommended Workflow

1. **Start work:** Ask Claude what you want done
2. **Trust the process:** Claude will spawn agents as needed
3. **Review results:** Claude provides summary with verification
4. **No babysitting:** Only intervene if something looks wrong

Example prompt for maximum automation:
```
Fix the prewire stage photo upload issue. Use subagents to find the relevant
code, implement the fix, run code review, verify the build, and update the
changelog. Don't ask me anything unless there's a critical decision.
```
