# UNICORN Voice AI Reference - Working State (January 2025)

> **RESTORE POINT DOCUMENT**
> This document captures the EXACT working state of the Voice AI system.
> If voice breaks, use this as reference to restore functionality.

**Related Documents:**
- [AI-AWARENESS-MAP.md](AI-AWARENESS-MAP.md) - Complete inventory of all pages, modals, and form fields

---

## Quick Stats (Current State - Updated Jan 9, 2025)

| Metric | Value |
|--------|-------|
| Routes with AppState | **31 of 51 (60.8%)** ✅ |
| Modals with AI awareness | **8 of 9 (88.9%)** ✅ |
| Form fields AI can fill | **~80+ (multiple pages)** |
| Navigation targets | **35+ destinations** |
| Quick create types | **5 (todo, issue, ticket, contact, note)** |
| Orphaned hook files | **0** (deleted Jan 2025) |

### New Capabilities (Jan 9, 2025)
- **Expanded Navigation**: 35+ voice navigation targets
- **Quick Create Tool**: Create todos, issues, tickets, contacts, notes by voice
- **Modal State Publishing**: 8 modals publish their state for AI awareness
- **Teaching Mode**: teach_page, get_page_training, answer_page_question tools

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Core Files (DO NOT BREAK)](#core-files-do-not-break)
3. [Audio Pipeline](#audio-pipeline)
4. [WebSocket Connection Flow](#websocket-connection-flow)
5. [Tool System](#tool-system)
6. [AppState Integration Pattern](#appstate-integration-pattern)
7. [Training Mode Integration](#training-mode-integration)
8. [Critical Configuration Values](#critical-configuration-values)
9. [Common Issues & Fixes](#common-issues--fixes)
10. [Pages with AppState Integration](#pages-with-appstate-integration)
11. [Orphaned Code to Delete](#orphaned-code-to-delete)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              VoiceCopilotOverlay.js                       │  │
│  │   - Mic button (bottom-right)                             │  │
│  │   - Status display (idle/connecting/listening/speaking)   │  │
│  │   - Debug panel toggle                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       AI BRAIN LAYER                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              AIBrainContext.js                            │  │
│  │   - WebSocket to Gemini Live API                         │  │
│  │   - Audio capture (mic → 16kHz PCM)                      │  │
│  │   - Audio playback (24kHz PCM → speaker)                 │  │
│  │   - Tool execution (8 tools)                             │  │
│  │   - System prompt building                               │  │
│  │   - Training mode support                                │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     APP STATE LAYER (SSOT)                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              AppStateContext.js                           │  │
│  │   - Current view (dashboard/shade-detail/etc)            │  │
│  │   - Project/Room/Shade context                           │  │
│  │   - Form state (measurements, etc)                       │  │
│  │   - Action handlers registry                             │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     PAGE COMPONENTS                             │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐   │
│  │ ShadeDetailPage│  │ ShadeManager   │  │ PMDashboard    │   │
│  │ - publishState │  │ - publishState │  │ - publishState │   │
│  │ - registerActions│ │ - registerActions│ │              │   │
│  └────────────────┘  └────────────────┘  └────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Files (DO NOT BREAK)

### 1. AIBrainContext.js
**Path:** `src/contexts/AIBrainContext.js`
**Lines:** ~1087

**Critical Functions:**
| Function | Line | Purpose |
|----------|------|---------|
| `startSession` | 873-1041 | Opens WebSocket, requests mic, starts audio capture |
| `endSession` | 1043-1054 | Closes everything cleanly |
| `handleWebSocketMessage` | 599-727 | Processes Gemini responses (audio/text/tools) |
| `startAudioCapture` | 764-845 | Sets up ScriptProcessor for mic input |
| `playNextChunk` | 398-506 | Plays audio from queue with resampling |
| `handleToolCall` | 267-342 | Routes tool calls to appropriate handlers |
| `buildSystemInstruction` | 158-200 | Builds the AI's system prompt |

**State Variables:**
```javascript
const [status, setStatus] = useState('idle');  // idle|connecting|listening|speaking|error
const [error, setError] = useState(null);
const [audioLevel, setAudioLevel] = useState(0);  // 0-100
const [lastTranscript, setLastTranscript] = useState('');
const [isTrainingMode, setIsTrainingModeInternal] = useState(false);
```

### 2. AppStateContext.js
**Path:** `src/contexts/AppStateContext.js`
**Lines:** ~229

**Key Methods:**
| Method | Purpose |
|--------|---------|
| `publishState(updates)` | Components publish their current state |
| `registerActions(handlers)` | Components register callable actions |
| `executeAction(name, params)` | AI calls actions by name |
| `getState()` | Get current app state snapshot |
| `getAvailableActions()` | List actions available in current context |

**State Structure:**
```javascript
{
  view: 'shade-detail',       // Current view identifier
  project: { id, name, address },
  room: { id, name },
  shade: { id, name, roomName, productType },
  form: { widthTop, widthMiddle, widthBottom, height, mountDepth },
  activeField: 'widthTop',    // Currently focused field
  shades: [],                 // List of all shades
  rooms: [],                  // List of rooms
}
```

### 3. VoiceCopilotOverlay.js
**Path:** `src/components/VoiceCopilotOverlay.js`
**Lines:** ~306

**UI States:**
| Status | Button Color | Icon | Description |
|--------|--------------|------|-------------|
| `idle` | White | Mic | Ready to start |
| `connecting` | Gray pulse | Spinner | Opening WebSocket |
| `listening` | Violet + ping | Mic | Waiting for speech |
| `speaking` | Violet glow | Activity pulse | Playing AI response |
| `error` | Red | MicOff | Connection failed |

---

## Audio Pipeline

### Input (Microphone → Gemini)

```
[Microphone]
     │
     ▼ getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }})
[MediaStream]
     │
     ▼ createMediaStreamSource()
[AudioContext @ device sample rate (48kHz on iOS)]
     │
     ▼ ScriptProcessor (bufferSize: 4096)
[Float32Array chunks]
     │
     ▼ downsampleForGemini() - Linear interpolation
[Float32Array @ 16kHz]
     │
     ▼ floatTo16BitPCM()
[Int16Array @ 16kHz]
     │
     ▼ btoa() - Base64 encode
[String]
     │
     ▼ WebSocket.send({ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: base64 }}})
[Gemini Live API]
```

### Output (Gemini → Speaker)

```
[Gemini Live API]
     │
     ▼ WebSocket.onmessage - serverContent.modelTurn.parts[].inlineData.data
[Base64 String]
     │
     ▼ base64ToFloat32()
[Float32Array @ 24kHz (Gemini output rate)]
     │
     ▼ resampleAudio() to device sample rate
[Float32Array @ 48kHz (iOS) or 44.1kHz (desktop)]
     │
     ▼ createBuffer() + createBufferSource()
[AudioBuffer]
     │
     ▼ GainNode (2.0x boost for iOS)
[Amplified signal]
     │
     ▼ audioContext.destination
[Speaker]
```

### Critical Audio Constants
```javascript
const GEMINI_INPUT_SAMPLE_RATE = 16000;   // Gemini expects 16kHz input
const GEMINI_OUTPUT_SAMPLE_RATE = 24000;  // Gemini sends 24kHz output
```

---

## WebSocket Connection Flow

### 1. Connect
```javascript
const socket = new WebSocket(
  `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`
);
```

### 2. Setup Message (sent on open)
```javascript
{
  setup: {
    model: "models/gemini-2.5-flash-native-audio-preview-12-2025",
    generationConfig: {
      responseModalities: ['AUDIO'],  // AUDIO only for native audio model
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Puck' }  // User configurable
        }
      }
    },
    systemInstruction: { parts: [{ text: systemPrompt }] },
    tools: [{ functionDeclarations: [...8 tools...] }],
    realtimeInputConfig: {
      automaticActivityDetection: {
        disabled: false,
        startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
        endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
        prefixPaddingMs: 300,
        silenceDurationMs: 1000
      }
    }
  }
}
```

### 3. Audio Input Message Format
```javascript
{
  realtimeInput: {
    audio: {
      mimeType: "audio/pcm;rate=16000",
      data: "<base64-encoded-pcm>"
    }
  }
}
```

### 4. Response Message Types
```javascript
// Setup complete
{ setupComplete: true }

// Audio response
{ serverContent: { modelTurn: { parts: [{ inlineData: { data: "...", mimeType: "audio/*" }}]}}}

// Text response
{ serverContent: { modelTurn: { parts: [{ text: "Hello!" }]}}}

// Tool call
{ toolCall: { functionCalls: [{ name: "get_context", args: {}, id: "abc123" }]}}

// Turn complete
{ serverContent: { turnComplete: true }}

// Transcription (input)
{ serverContent: { inputTranscription: { text: "user said this" }}}

// Transcription (output)
{ serverContent: { outputTranscription: { text: "AI said this" }}}
```

### 5. Tool Response Format
```javascript
{
  toolResponse: {
    functionResponses: [{
      name: "get_context",
      response: { /* result object */ },
      id: "abc123"  // MUST match the call ID
    }]
  }
}
```

---

## Tool System

### Available Tools (8 total)

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_context` | Get current app state (CALL FIRST) | none |
| `execute_action` | Run an action in current view | `action`, `params` |
| `search_knowledge` | Azure AI Search for product docs | `query`, `manufacturer?` |
| `navigate` | Go to dashboard/prewire/project/etc | `destination`, `section?` |
| `web_search` | General web search | `query` |
| `get_page_training` | Get trained context for page | `pageRoute?` |
| `teach_page` | Start teaching user about page | `style` |
| `answer_page_question` | Answer FAQ about page | `question` |

### Tool Declaration Format
```javascript
{
  name: 'execute_action',
  description: 'Execute action: highlight_field, set_measurement, save_measurements, etc.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string' },
      params: { type: 'object' }
    },
    required: ['action']
  }
}
```

### Context-Specific Actions (via AppState)

**ShadeDetailPage:**
- `highlight_field` - Highlight a measurement field
- `set_measurement` - Set a measurement value
- `clear_measurement` - Clear a field
- `save_measurements` - Save and exit
- `read_back` - Read all measurements
- `next_shade` - Go to next shade

**ShadeManager:**
- `open_shade` - Open a shade for measuring
- `list_rooms` - List rooms in project
- `go_to_next_pending` - Find next unmeasured shade

---

## AppState Integration Pattern

### How Components Register with AppState

```javascript
// In any page component:
import { useAppState } from '../../contexts/AppStateContext';

function MyPage() {
  const { publishState, registerActions, unregisterActions } = useAppState();

  // 1. Publish state when component mounts or data changes
  useEffect(() => {
    publishState({
      view: 'my-page',
      project: currentProject,
      form: formData,
      // ... any relevant state
    });
  }, [currentProject, formData]);

  // 2. Register actions the AI can call
  useEffect(() => {
    registerActions({
      do_something: async (params) => {
        // Handle the action
        return { success: true, message: 'Done!' };
      },
      another_action: async (params) => {
        // ...
      }
    });

    // Cleanup on unmount
    return () => unregisterActions(['do_something', 'another_action']);
  }, []);
}
```

### What AI Sees

When AI calls `get_context`, it receives:
```javascript
{
  view: 'shade-detail',
  project: { id: '123', name: 'Smith Residence', address: '...' },
  shade: { id: '456', name: 'Master Bedroom - Window 1', roomName: 'Master Bedroom' },
  form: { widthTop: '48', widthMiddle: '', widthBottom: '', height: '', mountDepth: '' },
  activeField: 'widthMiddle',
  availableActions: ['highlight_field', 'set_measurement', 'clear_measurement', 'save_measurements'],
  hint: 'Measuring window. Guide through: top->middle->bottom width, height, mount depth.'
}
```

---

## Training Mode Integration

### How Training Mode Works

1. **Admin enters training mode** via TrainingModeContext
2. **AIBrainContext detects training mode** and uses different system prompt
3. **Transcripts are captured** via `transcriptCallbackRef`
4. **Auto-saved to Supabase** via pageContextService

### Key Integration Points in AIBrainContext:

```javascript
// Training mode state
const [isTrainingMode, setIsTrainingModeInternal] = useState(false);
const trainingContextRef = useRef(null); // { pageRoute, pageTitle, sessionType }
const transcriptCallbackRef = useRef(null);

// Different system prompt for training
const buildSystemInstruction = useCallback(() => {
  if (isTrainingMode && trainingContextRef.current) {
    return buildTrainingSystemInstruction();  // Interview-style prompt
  }
  return buildNormalSystemInstruction();  // Normal assistant prompt
});

// Exposed methods for TrainingModeContext
enterTrainingMode: (trainingContext) => { ... },
exitTrainingMode: () => { ... },
setTranscriptCallback: (callback) => { ... },
clearTranscriptCallback: () => { ... },
```

---

## Critical Configuration Values

### Environment Variables
```
REACT_APP_GEMINI_API_KEY=<your-api-key>
```

### LocalStorage Settings (User Configurable)
```javascript
ai_voice: 'Puck'           // Gemini voice name
ai_persona: 'brief'        // 'brief' or 'detailed'
ai_custom_instructions: '' // User's custom prompt additions
ai_vad_start: '1'          // 1=HIGH (sensitive), 2=LOW (needs clear speech)
ai_vad_end: '2'            // 1=HIGH (quick cutoff), 2=LOW (patient)
ai_model: 'gemini-2.5-flash-native-audio-preview-12-2025'
```

### Valid Live API Models
```javascript
const VALID_LIVE_MODELS = [
  'gemini-2.0-flash-exp',
  'gemini-2.5-flash-native-audio-preview-12-2025',  // DEFAULT
];
```

---

## Common Issues & Fixes

### Issue: No audio output on iOS Safari
**Symptom:** Mic works, chunks sent, but no speaker output
**Fix:**
1. AudioContext must be created from user gesture (tap)
2. Resume AudioContext if suspended: `await audioContext.resume()`
3. Gain boost (2.0x) is applied to compensate for Safari's low volume
4. Check `audioContext.state` is 'running'

### Issue: WebSocket closes immediately (code 1000)
**Symptom:** Connection opens, setup sent, then closes
**Fix:**
1. Check model name is valid for Live API
2. Check `tools` format - must be single array with `functionDeclarations`
3. Check API key is valid

### Issue: Silence detected (no mic input)
**Symptom:** `audioLevel` stays at 0, "Input buffer is completely silent" warnings
**Fix:**
1. Check microphone permissions in browser
2. Check `echoCancellation: true` doesn't completely cancel input
3. Try different microphone
4. Check `mediaStream.current.getAudioTracks()[0].enabled === true`

### Issue: Audio plays but is garbled/wrong speed
**Symptom:** Chipmunk voice or slow motion
**Fix:**
1. Verify input sample rate: Gemini expects 16kHz
2. Verify output sample rate: Gemini sends 24kHz
3. Check `resampleAudio()` is using correct rates
4. Device sample rate auto-detected from `audioContext.sampleRate`

### Issue: Tool calls not working
**Symptom:** AI says it will do something but nothing happens
**Fix:**
1. Check `functionResponses` includes matching `id` from request
2. Check response format - must not double-wrap in `{ result: ... }`
3. Check action is registered via `registerActions`
4. Check `executeAction` returns proper success/error format

---

## Pages with AppState Integration

### Currently Integrated (Working)
| Page | File | publishState | registerActions |
|------|------|--------------|-----------------|
| ShadeDetailPage | `src/components/Shades/ShadeDetailPage.js` | ✅ | ✅ |
| ShadeManager | `src/components/Shades/ShadeManager.js` | ✅ | ✅ |
| PMDashboard | `src/components/PMDashboard.js` | ✅ | ❌ |

### Service Pages (useAppState imported but minimal)
| Page | File | Status |
|------|------|--------|
| ServiceTicketDetail | `src/components/Service/ServiceTicketDetail.js` | Imported |
| ServiceTicketList | `src/components/Service/ServiceTicketList.js` | Imported |
| NewTicketForm | `src/components/Service/NewTicketForm.js` | Imported |
| ServiceDashboard | `src/components/Service/ServiceDashboard.js` | Imported |

### Needs Integration (From Master Plan)
- WeeklyPlanning
- EquipmentListPage
- WireDropDetail
- PrewireMode
- All project detail sections
- All modals

---

## Provider Hierarchy (App.js)

The providers MUST be in this order:
```jsx
<AuthProvider>
  <AppStateProvider>
    <TrainingModeProvider>
      <AIBrainProvider>
        <Router>
          <VoiceCopilotOverlay />
          {/* Routes */}
        </Router>
      </AIBrainProvider>
    </TrainingModeProvider>
  </AppStateProvider>
</AuthProvider>
```

**Why this order matters:**
1. `AuthProvider` - Must be outermost (user auth for everything)
2. `AppStateProvider` - AIBrain reads from this, so must be above it
3. `TrainingModeProvider` - Uses auth, used by AIBrain
4. `AIBrainProvider` - Uses all of the above, provides voice to children

---

## Database Tables (Supabase)

### page_ai_context
Stores trained page knowledge:
```sql
- id (uuid)
- page_route (text, unique)
- component_name (text)
- page_title (text)
- functional_description (text)
- business_context (text)
- workflow_position (text)
- common_mistakes (jsonb[])
- best_practices (jsonb[])
- faq (jsonb[])
- is_trained (boolean)
- is_published (boolean)
- training_version (int)
```

### ai_training_transcripts
Stores training conversation transcripts:
```sql
- id (uuid)
- page_route (text)
- session_type (text) -- 'initial', 'append', 'retrain'
- trained_by (uuid)
- transcript (jsonb)
- is_complete (boolean)
```

---

## Quick Restore Checklist

If voice breaks, check in this order:

1. **Is API key set?** `process.env.REACT_APP_GEMINI_API_KEY`
2. **Is mic working?** Check `audioLevel` in debug panel
3. **Is WebSocket connecting?** Check `status` and debug log
4. **Is audio playing?** Check `audioChunksReceived` in debug
5. **Is model valid?** Must be in `VALID_LIVE_MODELS`
6. **Is tools format correct?** Single `functionDeclarations` array
7. **Is AudioContext running?** Must not be 'suspended'
8. **Are providers in order?** Check App.js hierarchy

---

## File Checksums (for reference)

Generate checksums to detect changes:
```bash
md5 src/contexts/AIBrainContext.js
md5 src/contexts/AppStateContext.js
md5 src/components/VoiceCopilotOverlay.js
```

---

## Orphaned Code to Delete

### Hook Files (Safe to Delete)

These files call `registerTools()` which is a **stub function that does nothing**:

| File | Lines | Status |
|------|-------|--------|
| `src/hooks/useKnowledgeTools.js` | 893 | Never imported - DELETE |
| `src/hooks/useShadeDetailTools.js` | 392 | Never imported - DELETE |
| `src/hooks/useShadeManagerTools.js` | 331 | Never imported - DELETE |

### File to KEEP

| File | Lines | Status |
|------|-------|--------|
| `src/hooks/usePrewireTools.js` | 434 | Imported by PrewireMode.js |

### Stub Functions in AIBrainContext

In `AIBrainContext.js` line 1063, these are empty stubs:
```javascript
registerTools: () => { }, unregisterTools: () => { },
```

**Note:** The functionality from the orphaned hooks is ALREADY implemented via:
- `ShadeDetailPage.js` - uses `registerActions` for measurement tools
- `ShadeManager.js` - uses `registerActions` for navigation tools
- `AIBrainContext.js` - has `search_knowledge` tool built-in

### Cleanup Commands

```bash
# Delete orphaned hooks
rm src/hooks/useKnowledgeTools.js
rm src/hooks/useShadeDetailTools.js
rm src/hooks/useShadeManagerTools.js

# Then in AIBrainContext.js, remove the stub functions from the provider value
```

---

*Document created: January 2025*
*Last working commit: 78a131e (Voice AI training system - working audio + RLS fixes)*
*AI Awareness Map: See [AI-AWARENESS-MAP.md](AI-AWARENESS-MAP.md) for full inventory*
