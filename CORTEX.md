# CORTEX — Personal AI Assistant Module

> **This is the living intelligence file for Cortex, a module within the Unicorn app.**
> Referenced from `AGENT.md`. Do NOT merge this into AGENT.md — Cortex will grow independently.

**Last Updated:** 2026-03-07

---

## PART 1: WHAT THIS IS

### Product Vision
Cortex is Stephe's virtual clone — a personal AI assistant that captures thoughts, organizes ideas, manages tasks, remembers context across conversations, and acts autonomously on his behalf. It's not literally Stephe, but an extension of his mind and will.

### Origin
- Conceived in a Claude.ai conversation (March 2026, "Stephe's Clone" project)
- Originally considered as a standalone app called "Axiom"
- Decision: Build as a **gated module inside Unicorn** rather than a separate app
- Rationale: Unicorn already has auth (MSAL), Supabase, Vercel, voice-ai infrastructure — no reason to rebuild

### The Name
"Cortex" — the thinking part of the brain. Implies where thoughts get processed. Chosen over: Axiom, Proxy, Adjutant, Aegis.

### Who Uses It
- **Primary:** Stephe only (gated by MSAL email whitelist)
- **Future:** Stephe can grant access to others when he decides it makes sense
- Access controlled via `ALLOWED_EMAILS` array in `CortexPage.js`

### The Core Need
Stephe has too many ideas, tasks, and things on his mind to track everything. He needs an app that:
1. Captures thoughts from voice or text instantly
2. Understands context and creates structure from raw input
3. Remembers previous conversations and finds connections
4. Manages tasks and delegates work
5. Acts autonomously on his behalf when possible
6. Grows and learns over time with a memory system

---

## PART 2: ARCHITECTURE

### Tech Stack (What We Use)
| Layer | Technology | Reason |
|-------|-----------|--------|
| Frontend | React 18 (inside Unicorn) | Already built, no migration needed |
| Routing | React Router `/cortex` | Gated route, hides Unicorn chrome |
| Auth | Azure MSAL (Unicorn's existing) | Already works, email-based gating |
| AI Brain | Claude API (Anthropic) | Best for understanding, context, reasoning |
| Voice Input | Unicorn's voice-ai system | Provider-agnostic, already built |
| Database | Supabase (Unicorn's existing) | New tables for Cortex memory/tasks |
| Deployment | Vercel | Serverless API routes for Claude proxy |
| Styling | Tailwind CSS | zinc-* palette, dark mode |

### Tech Stack (What We Decided NOT to Use)
| Technology | Why Not |
|-----------|---------|
| Next.js | Unicorn is React 18 + Vercel serverless — already has what Next.js provides. Migration would be massive for no gain. |
| Deepgram | Nice-to-have for transcription but Gemini/OpenAI voice already transcribes. Can add later if quality isn't enough. |
| Separate app | No reason to rebuild auth, DB, deployment when Unicorn has it all. |

### Architecture Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-07 | Build inside Unicorn, not standalone | Reuse existing infrastructure |
| 2026-03-07 | Claude API as the brain | Best reasoning/context model for personal assistant |
| 2026-03-07 | Keep MSAL auth | Already set up, works, familiar |
| 2026-03-07 | HAL 9000 eye as avatar (not 3D) | 3D avatar latency/compute not worth it now. HAL is iconic and simple. Placeholder architecture allows swap to 3D later. |
| 2026-03-07 | Full-screen dynamic canvas | Cortex controls the display — user doesn't navigate, they talk |

---

## PART 3: INTERFACE DESIGN

### Layout Philosophy
Cortex is a **conversation-first, full-screen experience**. No menus, no sidebar, no Unicorn navigation chrome. You open Cortex and you're immediately talking to your AI partner.

### Page Structure
```
┌─────────────────────────────────────────┐
│                                         │
│          DYNAMIC CANVAS                 │
│   (Cortex controls this entire area)    │
│                                         │
│   Shows: HAL eye / documents / tasks    │
│          / chat history / diagrams      │
│                                         │
├─────────────────────────────────────────┤
│  [Tasks] [Notes] [Schedule]  ← quick   │
├─────────────────────────────────────────┤
│  🎤 │ Talk to Cortex...          │ ➤   │
└─────────────────────────────────────────┘
```

### Dynamic Canvas
The canvas is a **component slot** that renders different content based on Cortex's decisions:

| Mode | What Renders | When |
|------|-------------|------|
| `avatar` | HAL 9000 eye (centered, full canvas) | Default state, voice conversations |
| `chat` | Message history (user right, assistant left) | Text conversations |
| `document` | Formatted text/markdown viewer | When Cortex presents a document |
| `tasks` | Task list with checkboxes | When showing tasks/todos |
| `browser` | Embedded iframe with nav toolbar | When user says "open [url]" |

### Browser Mode
The canvas doubles as a built-in web browser. User says "open apple.com" and the canvas renders an iframe with:
- Address bar showing current URL
- Back button (tracks navigation history)
- Refresh button
- Close button (returns to previous canvas mode)
- Full iframe with `sandbox` permissions for safe browsing

URL detection is client-side — handles patterns like:
- "open apple.com" / "go to google.com" / "browse amazon.com"
- "visit https://example.com" / "pull up reddit.com"
- Just typing "apple.com" directly

Claude can also trigger browser mode via canvas actions in its response.

**Note:** Some sites block iframe embedding (X-Frame-Options). This is a browser security feature, not a bug. Most content sites work; login-gated sites often don't.

**Future canvas modes (planned):**
- `diagram` — Visual diagrams, flowcharts
- `calendar` — Schedule/timeline view
- `image` — Generated or referenced images
- `3d-avatar` — Realistic 3D avatar (ReadyPlayerMe + Three.js)

### HAL 9000 Eye (Avatar)
- Inspired by 2001: A Space Odyssey
- Glowing circle/lens with concentric rings for depth
- **Color states:**
  - Idle: Warm amber/gold, gentle breathing pulse
  - Listening: Bright cyan/blue-white, ring expands with audio
  - Thinking: Rotating purple/violet shimmer
  - Speaking: Soft green/teal, pulses with audio output
- State label below: "Cortex Ready" / "Listening..." / "Thinking..." / "Speaking..."
- Self-contained CSS animations (no external libraries)

### Control Bar
- Fixed to bottom of screen
- Dark glassmorphism: `bg-zinc-800/90` with `backdrop-blur`
- Components:
  - Text input (always visible, "Talk to Cortex...")
  - Mic toggle (left of input, red pulse when listening)
  - Send button (right of input, visible when text entered)
  - Quick action pills above input: Tasks, Notes, Schedule

### 3D Avatar Roadmap (Future)
When ready to upgrade from HAL eye:
1. **ReadyPlayerMe + Three.js** — Design avatar, export GLB, render in browser
2. **Lip sync** — Rhubarb Lip Sync or Oculus Viseme mapping
3. **Expressions** — Listening, thinking, speaking, reacting states
4. **Architecture** — Canvas component slot makes this a drop-in replacement
5. **Alternative:** Simli API for instant realistic avatar (per-minute cost)

---

## PART 4: CODEBASE MAP

### Files Created (2026-03-07)
```
src/components/Cortex/
├── CortexPage.js          # Main page — layout, state, access gating
├── HalEye.js              # HAL 9000 eye avatar with state colors
├── CortexControlBar.js    # Bottom control bar — input, mic, quick keys
└── DynamicCanvas.js       # Content renderer — avatar/chat/document/tasks

src/services/
└── cortexService.js       # API client for Claude endpoint

api/cortex/
└── chat.js                # Vercel serverless — Claude API proxy
```

### App.js Integration
- Lazy import: `const CortexPage = lazy(() => import('./components/Cortex/CortexPage'))`
- Route: `/cortex` wrapped in `<ProtectedRoute>`
- `hideChrome` includes `/cortex` — no AppHeader or BottomNavigation
- No padding on main container when Cortex is active

### Key Patterns
- **Access gating:** `ALLOWED_EMAILS` whitelist in CortexPage.js
- **Canvas architecture:** State machine with `canvasMode` switching components
- **Service pattern:** Singleton class export matching Unicorn convention
- **API proxy:** Serverless function strips ANTHROPIC_API_KEY from frontend

---

## PART 5: API & INTEGRATIONS

### Claude API Integration
- **Endpoint:** `/api/cortex/chat.js` (Vercel serverless)
- **Model:** `claude-sonnet-4-20250514`
- **Max tokens:** 4096
- **System prompt:** Positions Cortex as Stephe's virtual extension — direct, efficient, proactive
- **Canvas actions:** Claude can include `<!--CANVAS:{"mode":"tasks","data":{...}}-->` blocks to trigger UI changes
- **Auth:** `ANTHROPIC_API_KEY` env var (server-side only, never exposed to frontend)

### Environment Variables Needed
```bash
ANTHROPIC_API_KEY=sk-ant-...  # Claude API key (add to Vercel env vars)
```

### Future Integrations (Planned)
| Integration | Purpose | Priority |
|-------------|---------|----------|
| Supabase tables | Persistent memory, task storage | Phase 2 |
| Voice-ai system | Real-time voice conversation | Phase 2 |
| Apple Notes MCP | Capture/sync notes | Phase 3 |
| Calendar MCP | Schedule awareness | Phase 3 |
| Email integration | Send/draft emails on behalf | Phase 3 |
| Home Assistant | Smart home control | Phase 3 |

---

## PART 6: HARD RULES

1. **Cortex route hides ALL Unicorn chrome** — no AppHeader, no BottomNavigation
2. **Email whitelist is the ONLY access gate** — no role-based system needed yet
3. **Claude API key NEVER touches frontend** — always proxied through serverless
4. **Canvas is a slot architecture** — any component can render there, easy to swap
5. **HAL eye is temporary avatar** — architecture must allow drop-in 3D replacement
6. **Dark theme only** — Cortex doesn't follow Unicorn's light/dark toggle
7. **Follow Unicorn code standards** — zinc-* not gray-*, services pattern, touch targets

---

## PART 7: KNOWN ISSUES & TODOS

### Current Status: Initial Build (2026-03-07)
- [x] CortexPage with access gating
- [x] HAL eye component with 4 color states
- [x] Control bar with text input, mic toggle, quick keys
- [x] Dynamic canvas with mode switching
- [x] Claude API serverless endpoint
- [x] cortexService.js frontend client
- [x] Route added to App.js with hideChrome
- [ ] ANTHROPIC_API_KEY needs to be added to Vercel env vars
- [ ] Voice input integration (currently toggles state only)
- [ ] Supabase tables for memory/conversation persistence
- [ ] Actual task management (create, track, complete)
- [ ] Document viewer with real content rendering
- [ ] Conversation history persistence across sessions

### Future Phases
**Phase 2 — Memory & Persistence**
- Supabase tables: cortex_conversations, cortex_thoughts, cortex_tasks
- Conversation history saved and loadable
- Context window that spans across sessions
- Task CRUD with status tracking

**Phase 3 — Autonomy & Integrations**
- Voice conversation mode (wire into existing voice-ai)
- Email drafting and sending
- Calendar awareness and scheduling
- Apple Notes sync
- Proactive suggestions based on stored context

**Phase 4 — 3D Avatar**
- ReadyPlayerMe avatar creation
- Three.js / React Three Fiber rendering
- Lip sync with voice output
- Expression states

---

## PART 8: CHANGELOG

### 2026-03-07 — Initial Build
**What:** Created the entire Cortex module from scratch
**Why:** Stephe wants a personal AI virtual clone built into Unicorn
**Decision trail:**
- Started as "Axiom" standalone app concept → decided to build inside Unicorn
- Considered Next.js migration → stayed with React 18 + Vercel serverless
- Considered Deepgram → deferred, existing voice-ai handles transcription
- Considered realistic 3D avatar → deferred, HAL 9000 eye for now with swap architecture
- Named "Cortex" (over Axiom, Proxy, Adjutant, Aegis)

**Files created:**
- `src/components/Cortex/CortexPage.js` — Main page with access gating
- `src/components/Cortex/HalEye.js` — HAL 9000 eye avatar
- `src/components/Cortex/CortexControlBar.js` — Bottom control bar
- `src/components/Cortex/DynamicCanvas.js` — Dynamic content renderer
- `src/services/cortexService.js` — API client
- `api/cortex/chat.js` — Claude API proxy
- `CORTEX.md` — This file

**App.js changes:**
- Added lazy import for CortexPage
- Added `/cortex` to `hideChrome` check (no AppHeader/BottomNav)
- Added `/cortex` route inside ProtectedRoute
