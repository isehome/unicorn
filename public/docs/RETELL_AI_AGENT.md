# Retell AI Phone Agent - Sarah

**Last Updated:** December 31, 2024  
**Status:** Production - Active Development

---

## Overview

Sarah is an AI-powered phone assistant for Intelligent Systems that handles incoming customer service calls 24/7. She can:

- Identify customers by phone number
- Look up their projects and equipment
- Run real-time network diagnostics (UniFi)
- Create service tickets
- Collect scheduling preferences

**Important:** This is separate from the Gemini-based Voice AI Agent (see VOICE_AI_AGENT.md) which is for in-app voice control. Sarah handles external phone calls.

---

## Architecture

### Components

| Component | Purpose |
|-----------|---------|
| **Retell AI Platform** | Voice AI infrastructure, speech-to-text, text-to-speech |
| **Retell LLM** | Claude-based language model that powers Sarah's responses |
| **Custom Tools (API)** | Our Vercel endpoints that Sarah calls for data |
| **Supabase** | Database for customers, tickets, network cache |
| **UniFi Site Manager API** | Real-time network diagnostics |

### Data Flow

```
Phone Call → Retell → Sarah (LLM) → Custom Tools → Supabase/UniFi
                ↓
        Tool Response → Sarah → Spoken Response → Customer
```

---

## Retell AI Configuration

### Account Details

| Item | Value |
|------|-------|
| Agent ID | `agent_569081761d8bbd630c0794095d` |
| LLM ID | `llm_a897cdd41f9c7de05c5528a895b9` |
| Voice | ElevenLabs "Hailey" (friendly, professional) |
| Model | Claude (via Retell) |

### When to Use MCP vs Direct API

Retell provides both an MCP server (for Claude Desktop/AI assistants) and a REST API.

#### Use MCP Server When:
- Listing agents, calls, phone numbers
- Getting call details and transcripts
- Quick lookups and queries
- Working interactively in Claude

**MCP Tools Available:**
- `list_agents`, `get_agent`, `create_agent`, `update_agent`
- `list_calls`, `get_call`, `create_phone_call`, `create_web_call`
- `list_phone_numbers`, `get_phone_number`
- `list_voices`, `get_voice`
- `list_retell_llms`, `get_retell_llm`, `create_retell_llm`, `update_retell_llm`

#### Use Direct API When:
- Updating LLM prompts (complex JSON)
- Configuring custom tools with specific schemas
- Setting tool execution options (speak_during_execution, etc.)
- Batch operations
- Anything involving nested JSON that MCP struggles with

**API Endpoint Pattern:**
```bash
# Update LLM (prompt + tools)
curl -X PATCH 'https://api.retellai.com/update-retell-llm/{llm_id}' \
  -H 'Authorization: Bearer {api_key}' \
  -H 'Content-Type: application/json' \
  -d '{"general_prompt": "...", "general_tools": [...]}'

# Update Agent
curl -X PATCH 'https://api.retellai.com/update-agent/{agent_id}' \
  -H 'Authorization: Bearer {api_key}' \
  -H 'Content-Type: application/json' \
  -d '{"voice_id": "...", "agent_name": "..."}'
```

**API Key:** Stored as `RETELL_API_KEY` in environment variables.

---

## Custom Tools (Vercel API Endpoints)

Sarah uses custom HTTP tools to interact with our systems:

### 1. identify_customer

**Endpoint:** `POST /api/retell/identify`  
**Purpose:** Look up customer by phone number

**Input:**
```json
{"phone_number": "+13175551234"}
```

**Returns:**
- Customer name, email, phone, address
- SLA tier and response time
- Projects (with team members, UniFi site ID)
- Recent tickets
- Equipment summary

**Database Function:** `find_customer_by_phone()`

**Matching Logic:**
1. Normalize phone (strip non-digits, remove leading 1)
2. Find contact with matching phone
3. Find projects where `projects.client` matches contact name or company
4. Get internal stakeholders (PM, Lead Tech) for those projects
5. Return aggregated data

**Important:** Only matches projects where `client` field is non-empty to avoid false matches.

### 2. create_ticket

**Endpoint:** `POST /api/retell/create-ticket`  
**Purpose:** Create service ticket

**Input:**
```json
{
  "title": "WiFi dropping intermittently",
  "description": "Customer reports WiFi disconnects every few minutes...",
  "category": "network",
  "priority": "medium",
  "customer_name": "Stacey Blansette",
  "customer_phone": "3173136608",
  "customer_email": "customer@email.com",
  "customer_address": "123 Main St",
  "preferred_time": "Monday morning",
  "unifi_site_id": "74ACB93B..." 
}
```

**Category Mapping:**
| LLM Says | Maps To |
|----------|---------|
| audio, video, tv, speaker | av |
| wifi, internet, router | network |
| keypad, switch, dimmer, lutron | lighting |
| shade, blind | shades |
| control4, crestron, automation | control |
| (anything else) | general |

**Network Diagnostics Auto-Include:**
If `unifi_site_id` is provided and category is "network", the endpoint automatically fetches cached diagnostics from `retell_network_cache` table and includes them in `triage_notes`.

**Ticket Number Format:** `ST-YYYYMMDD-XXXX` (e.g., ST-20251231-1234)

### 3. check_network

**Endpoint:** `POST /api/retell/check-network`  
**Purpose:** Real-time UniFi network diagnostics

**Input:**
```json
{"unifi_site_id": "74ACB93B59570000000004ACC6540000000004E1D1DD000000005EB714C1:1557506879"}
```

**Returns:**
```json
{
  "checked": true,
  "online": true,
  "healthy": true,
  "message": "The network looks healthy. 5 devices connected, everything online.",
  "triage_summary": "=== NETWORK DIAGNOSTICS ===\nStatus: ONLINE (Healthy)\nGateway: UDMPRO | ISP: Spectrum..."
}
```

**Data Retrieved from UniFi Site Manager API:**
- Gateway status (online/offline)
- Device counts (total, offline, pending updates)
- Client counts (WiFi, wired, guest)
- WAN uptime percentage
- External IP address
- ISP name
- Critical alerts
- Latency issues
- WiFi retry rate

**Caching:** Results are stored in `retell_network_cache` table (15-minute TTL) so create_ticket can auto-include them.

### 4. end_call

**Type:** Built-in Retell tool  
**Purpose:** Properly disconnect the call when conversation is complete

---

## LLM Prompt Structure

The prompt tells Sarah how to behave:

```
# Sarah - Intelligent Systems Phone Assistant

## CALL START
IMMEDIATELY call identify_customer with {{caller_phone}}. Wait for result before speaking.

## GREETING
Greet naturally based on time of day. Confirm you are speaking with the customer.

## HANDLING ISSUES
Listen carefully. Ask ONE clarifying question if needed.

For network/WiFi issues: Call check_network with unifi_site_id. Tell customer what you found.

## CATEGORIES
- network: WiFi, internet, connectivity
- av: TV, speakers, display, audio
- lighting: Keypads, switches, dimmers
- control: Control4, Crestron, automation
- shades: Motorized blinds
- wiring: Cables, ethernet
- general: Other

Keypads/switches = lighting

## CREATING TICKET
Confirm email and preferred timing.

Call create_ticket with:
- title, description, category, priority
- customer info (name, phone, email, address)
- preferred_time
- unifi_site_id (for network issues - this auto-includes diagnostics)

Confirm ticket number on success.

## ENDING
Ask if anything else. If no, thank them and use end_call.

## STYLE
Warm, natural, brief. No specific times or pricing.
```

---

## Tool Configuration Details

### speak_during_execution vs speak_after_execution

| Setting | Value | Effect |
|---------|-------|--------|
| `speak_during_execution` | `false` | Sarah stays silent while tool runs |
| `speak_after_execution` | `true` | Sarah speaks after receiving tool result |

**Best Practice:** Set `speak_during_execution: false` for identify_customer so Sarah waits for results before greeting.

### Tool Schema Example

```json
{
  "type": "custom",
  "name": "identify_customer",
  "description": "Look up customer by phone. Call FIRST before speaking.",
  "url": "https://unicorn-one.vercel.app/api/retell/identify",
  "speak_during_execution": false,
  "speak_after_execution": true,
  "parameters": {
    "type": "object",
    "properties": {
      "phone_number": {
        "type": "string",
        "description": "Customer phone number"
      }
    },
    "required": ["phone_number"]
  }
}
```

---

## Database Tables

### service_tickets

Main table for service tickets created by Sarah.

**Key Constraints:**
| Field | Valid Values |
|-------|-------------|
| category | network, av, shades, control, wiring, installation, maintenance, general, lighting |
| priority | low, medium, high, urgent |
| source | manual, phone_ai, email, portal, issue_escalation |
| status | open, triaged, scheduled, in_progress, waiting_parts, waiting_customer, resolved, closed |

### retell_network_cache

Temporary cache for network diagnostics during phone calls.

```sql
CREATE TABLE retell_network_cache (
    site_id TEXT PRIMARY KEY,
    diagnostics TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Auto-cleanup trigger removes entries older than 15 minutes.

### retell_call_logs

Stores call history and transcripts (created in earlier migration).

### customer_sla_tiers / customer_sla_assignments

SLA tier configuration for response time promises.

---

## Testing

### Web Test Interface

**URL:** `https://unicorn-one.vercel.app/service/ai-test`

This page allows testing Sarah without a real phone call:
- Enter a phone number for caller ID simulation
- Uses browser microphone for voice
- Shows real-time transcript

### API Testing

```bash
# Test identify
curl -X POST 'https://unicorn-one.vercel.app/api/retell/identify' \
  -H 'Content-Type: application/json' \
  -d '{"phone_number": "+13173136608"}'

# Test check-network
curl -X POST 'https://unicorn-one.vercel.app/api/retell/check-network' \
  -H 'Content-Type: application/json' \
  -d '{"unifi_site_id": "74ACB93B..."}'

# Test create-ticket
curl -X POST 'https://unicorn-one.vercel.app/api/retell/create-ticket' \
  -H 'Content-Type: application/json' \
  -d '{"title": "Test", "description": "Test ticket", "category": "general"}'
```

---

## Updating Sarah

### To Update the Prompt

```bash
curl -X PATCH 'https://api.retellai.com/update-retell-llm/llm_a897cdd41f9c7de05c5528a895b9' \
  -H 'Authorization: Bearer {RETELL_API_KEY}' \
  -H 'Content-Type: application/json' \
  -d '{"general_prompt": "Your new prompt here..."}'
```

### To Update Tools

```bash
curl -X PATCH 'https://api.retellai.com/update-retell-llm/llm_a897cdd41f9c7de05c5528a895b9' \
  -H 'Authorization: Bearer {RETELL_API_KEY}' \
  -H 'Content-Type: application/json' \
  -d '{"general_tools": [{...tool definitions...}]}'
```

### To Update Voice/Agent Settings

```bash
curl -X PATCH 'https://api.retellai.com/update-agent/agent_569081761d8bbd630c0794095d' \
  -H 'Authorization: Bearer {RETELL_API_KEY}' \
  -H 'Content-Type: application/json' \
  -d '{"voice_id": "new_voice_id", "agent_name": "New Name"}'
```

---

## Common Issues & Solutions

### Issue: Tool not being called
**Solution:** Check tool description - make it clear WHEN to call. Use phrases like "Call FIRST" or "MUST call for WiFi issues".

### Issue: LLM not including data in ticket
**Solution:** Don't rely on LLM to copy data. Use backend caching (like retell_network_cache) and auto-include in create-ticket.

### Issue: Greeting sounds awkward/repeated
**Solution:** Set `speak_during_execution: false` so Sarah waits for tool results before speaking.

### Issue: Wrong category assigned
**Solution:** Update prompt with explicit examples. "Keypads = lighting, NOT control".

### Issue: Database constraint error
**Solution:** Check all CHECK constraints on service_tickets table. Map LLM values to valid values in API.

---

## Future Enhancements

### Planned
- [ ] Calendar integration (send appointment invites)
- [ ] Technician notification (SMS when ticket created)
- [ ] Knowledge base integration for troubleshooting
- [ ] Call recording storage and playback
- [ ] Escalation to live agent

### Considered
- [ ] Outbound reminder calls
- [ ] Follow-up satisfaction surveys
- [ ] Multi-language support

---

## Files Reference

| File | Purpose |
|------|---------|
| `api/retell/identify.js` | Customer lookup endpoint |
| `api/retell/create-ticket.js` | Ticket creation endpoint |
| `api/retell/check-network.js` | UniFi diagnostics endpoint |
| `database/migrations/20251230_retell_ai_integration.sql` | Database functions |
| `src/pages/service/AITestPage.js` | Web test interface |
| `docs/RETELL_AI_AGENT.md` | This documentation |

---

## Related Resources

- [Retell AI Documentation](https://docs.retellai.com/)
- [Retell API Reference](https://docs.retellai.com/api-references)
- [UniFi Site Manager API](https://developer.ui.com/)
- VOICE_AI_AGENT.md (in-app Gemini voice - separate system)
