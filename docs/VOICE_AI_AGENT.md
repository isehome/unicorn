# Voice AI Agent - Implementation Status

## Overview

The Voice AI Agent uses Google Gemini Live API to provide hands-free voice control for field technicians. The goal is context-aware assistance that understands where the user is in the app and what actions are available.

## Current Status: IN PROGRESS (Not Fully Working)

The voice AI is currently not properly understanding app context or navigating correctly. This document captures the work done so far for future reference.

---

## Architecture

### Key Files

| File | Purpose |
|------|---------|
| `src/contexts/VoiceCopilotContext.js` | Main voice session management, WebSocket to Gemini |
| `src/hooks/useAgentContext.js` | Location awareness & navigation tools |
| `src/hooks/usePrewireTools.js` | Prewire-specific voice commands |
| `src/services/voiceToolRegistry.js` | Centralized tool definitions |
| `src/components/VoiceCopilotOverlay.js` | Floating mic button UI |

### Data Model Concept

The app is **database-driven**, not page-driven:

```
Projects (top-level records)
  └── Rooms (belong to a project)
      └── Windows/Shades (belong to a room, need measuring)
```

**Important Terminology:**
- "windows", "shades", "blinds", "window treatments", "window coverings" = ALL THE SAME THING
- The app uses "shades" internally but users may say any of these terms

---

## Tools Implemented

### Global Navigation Tools (always available)

| Tool | Description |
|------|-------------|
| `get_current_location` | Returns current context: project, section, window data |
| `list_projects` | Query database for all projects |
| `open_project` | Open a project by name/ID, optionally to a section |
| `open_window` | Open a specific window for measuring |
| `go_to_app_section` | Navigate to dashboard, prewire, settings, etc. |
| `go_back` | Return to previous view |

### Prewire Tools (only in Prewire Mode)

| Tool | Description |
|------|-------------|
| `get_prewire_overview` | Summary of wire drops needing labels |
| `list_wire_drops_in_room` | Show drops in a specific room |
| `filter_by_floor` | Filter to specific floor |
| `filter_by_room` | Filter to specific room |
| `open_print_modal` | Open print dialog for a drop |
| `open_photo_modal` | Open camera for prewire photo |
| `get_next_unprinted` | Get next drop needing labels |

### Shade Measuring Tools (only in Shade Detail view)

| Tool | Description |
|------|-------------|
| `set_measurement` | Record a measurement value |
| `get_shade_context` | Get current shade info |
| `navigate_to_field` | Highlight a field (visual feedback) |
| `save_shade_measurements` | Save and finalize measurements |
| `clear_measurement` | Undo a recorded measurement |

---

## Known Issues

### 1. Context Not Working Properly
- AI doesn't reliably know which project/section the user is in
- `get_current_location` is called but response may not be processed correctly
- Navigation commands often fail or go to wrong location

### 2. Tool Execution Problems
- Tools are registered but may not execute
- Stale closure issues despite using refs
- Tool responses may not reach Gemini properly

### 3. Terminology Confusion
- Added extensive terminology mapping but AI still gets confused
- "shades" vs "windows" vs "window treatments" not always understood

### 4. Navigation URL Issues
- Different URL patterns for different sections cause problems
- `/projects/{id}/shades` vs `/pm-project/{id}` vs `/project/{id}/pm-issues`

---

## System Instructions

Current system instruction sent to Gemini at session start:

```
DATABASE MODEL - THIS IS CRITICAL:
This app is DATABASE-DRIVEN, not page-driven. Think of it like this:
- PROJECTS: Top-level records (jobs/clients)
- ROOMS: Each project has rooms (Living Room, Master Bedroom, etc.)
- WINDOWS: Each room has windows that need measuring

TERMINOLOGY - ALL MEAN THE SAME THING:
"windows", "shades", "blinds", "window treatments", "window coverings" = ALL THE SAME

ENTITY NAVIGATION TOOLS:
- get_current_location → Know which project/section you're in + get all windows data
- list_projects → Query database for all projects
- open_project → Open a project (by name or ID), optionally to a section
- open_window → Open a specific window for measuring
- go_to_app_section → Go to app sections: dashboard, prewire, settings, etc.
- go_back → Return to previous view

CRITICAL RULES:
1. ALWAYS call get_current_location FIRST to understand context
2. If user is in a project, you have the project ID and can open any section
3. If in windows section, get_current_location returns ALL windows with IDs
4. Use open_project with section="windows" to go to window treatments
5. Use open_window with windowName to open a specific window for measuring
```

---

## Debugging Tips

### Enable Verbose Logging
In `VoiceCopilotContext.js`, set `VERBOSE_LOGGING = true` to see all messages.

### Check Console for Tool Calls
Look for logs like:
- `[AgentContext] Registering global navigation tools`
- `[AgentContext] open_project: Navigating to /projects/{id}/shades`
- `[Copilot] Tool call received: {...}`
- `[Copilot] Executing tool: get_current_location`

### Verify Tool Registration
Tools should be logged at session start:
```
[Copilot] Tools from registry: 26, Dynamic: 0
```

---

## Next Steps to Fix

1. **Verify Gemini receives tools**: Check if `functionDeclarations` are in the setup config
2. **Debug tool call flow**: Add logging to see if Gemini sends tool calls and if responses are sent back
3. **Simplify first**: Try with just 2-3 tools to isolate the issue
4. **Check WebSocket messages**: Log all incoming/outgoing messages to verify format
5. **Test tool execution locally**: Call tool execute functions directly to verify they work

---

## Configuration

### Environment Variables
- `REACT_APP_GEMINI_API_KEY` - Google AI API key for Gemini

### User Settings (localStorage)
- `ai_voice` - Voice selection (Puck, Charon, Kore, etc.)
- `ai_persona` - Brief or detailed responses
- `ai_model` - Gemini model version
- `ai_vad_start` - Voice activity detection start sensitivity
- `ai_vad_end` - Voice activity detection end sensitivity
- `ai_custom_instructions` - User-defined personality tweaks

---

## Related Resources

- [Gemini Live API Docs](https://ai.google.dev/api/live)
- [Gemini Function Calling](https://ai.google.dev/gemini-api/docs/function-calling)

---

*Last Updated: December 2024*
*Status: Not working - needs debugging*
