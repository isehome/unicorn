# Workstream 3: Telephony & Call Center Architecture

## Overview

**Problem:** Current Skybridge VOIP service is outdated (feels like 2020 tech), poor mobile app, bad voicemail transcription, limited features.

**Solution:** Evaluate switching to Telnyx for telephony backbone while keeping Retell AI for voice agent.

**Current Usage:** ~26 calls/month (low volume)

---

## Current State

### What You Have
- **Skybridge** - VOIP provider (unhappy with service)
- **Retell AI** - AI voice agent (Sarah) for inbound service calls
- **Low volume** - ~26 calls/month

### Pain Points with Skybridge
- Web app is outdated
- Mobile app is poor
- Voice-to-text transcription is bad
- No modern features
- Keeping only because it's cheap and reselling to a few clients

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        INBOUND CALLS                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      TELNYX (Telephony)                          │
│  • Phone numbers                                                 │
│  • SIP trunking                                                  │
│  • SMS in/out                                                    │
│  • Auto-attendant                                                │
│  • Voicemail                                                     │
│  • Call recording                                                │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
       ┌───────────┐   ┌───────────┐   ┌───────────┐
       │ Press 1   │   │ Press 2   │   │ Voicemail │
       │ Service   │   │ Sales     │   │           │
       └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
             │               │               │
             ▼               ▼               ▼
       ┌───────────┐   ┌───────────┐   ┌───────────┐
       │ Retell AI │   │ Forward   │   │ Webhook   │
       │ (Sarah)   │   │ to Cell   │   │ to Unicorn│
       └───────────┘   └───────────┘   └───────────┘
```

---

## Component Comparison

### Telephony Provider: Telnyx vs Twilio

| Feature | Telnyx | Twilio |
|---------|--------|--------|
| **Pricing** | Cheaper (~40% less) | More expensive |
| **Voice Quality** | Excellent | Excellent |
| **SMS** | ✅ Included | ✅ Included |
| **MCP Support** | ✅ Has MCP server | ❌ No MCP |
| **API Quality** | Excellent | Excellent |
| **Auto-attendant** | ✅ TeXML | ✅ TwiML |
| **SIP Trunking** | ✅ Native | ✅ Elastic SIP |
| **Voicemail** | ✅ Built-in | ✅ Built-in |
| **Transcription** | ✅ AI-powered | ✅ AI-powered |

**Recommendation:** Telnyx - Better pricing, has MCP for Claude configuration

### AI Voice: Keep Retell

| Feature | Why Keep Retell |
|---------|-----------------|
| **Already integrated** | Sarah is built and working |
| **Service-focused** | Good for support/troubleshooting calls |
| **Custom tools** | Connected to Unicorn, UniFi, knowledge base |
| **MCP Support** | ✅ Has MCP server |
| **Pricing** | $0.07-0.12/min (reasonable for 26 calls/month) |

---

## Features to Implement

### 1. Main Business Line
- Professional auto-attendant
- Business hours routing
- After-hours handling
- Call recording

### 2. SMS Capability
- Two-way SMS with customers
- Appointment reminders
- Status updates
- Integration with Unicorn tickets

### 3. Voicemail System
- AI transcription
- Email notification
- Playback in Unicorn app
- Archive/search

### 4. AI Service Line (Sarah)
- Dedicated DID or menu option
- 24/7 availability
- Ticket creation
- Network diagnostics

### 5. Website Chat (Future)
- Retell web widget
- Same knowledge base as Sarah
- Escalation to human

---

## Implementation Phases

### Phase 1: Telnyx Setup
- [ ] Create Telnyx account
- [ ] Port existing number or get new DID
- [ ] Configure SIP credentials
- [ ] Test basic call routing

### Phase 2: Auto-Attendant
- [ ] Design call flow (IVR menu)
- [ ] Record greetings
- [ ] Configure routing rules
- [ ] Test all paths

### Phase 3: Retell Integration
- [ ] Configure Retell to receive from Telnyx
- [ ] Update webhook URLs
- [ ] Test Sarah receives calls
- [ ] Verify tool integrations work

### Phase 4: Voicemail System
- [ ] Configure voicemail boxes
- [ ] Set up transcription
- [ ] Create webhook for new voicemails
- [ ] Build Unicorn voicemail UI

### Phase 5: SMS Integration
- [ ] Enable SMS on Telnyx number
- [ ] Create SMS webhook endpoint
- [ ] Build SMS UI in Unicorn
- [ ] Test two-way messaging

### Phase 6: Unicorn Integration
- [ ] Voicemail playback component
- [ ] SMS inbox/compose
- [ ] Call history view
- [ ] Recording playback

---

## API Endpoints Needed

### `/api/telephony/voicemail.js`
```javascript
// Webhook for new voicemail notifications
// Stores in database, triggers notification
```

### `/api/telephony/sms-webhook.js`
```javascript
// Webhook for incoming SMS
// Creates ticket or links to existing conversation
```

### `/api/telephony/sms-send.js`
```javascript
// Send SMS to customer
// POST { to: "+1234567890", message: "..." }
```

### `/api/telephony/call-status.js`
```javascript
// Webhook for call status updates
// Logs call duration, outcome, etc.
```

---

## Unicorn UI Components

### Voicemail Component
```javascript
// src/components/VoicemailInbox.js
- List of voicemails with transcription preview
- Audio player for playback
- Link to customer/project
- Mark as read/resolved
- Archive functionality
```

### SMS Component
```javascript
// src/components/SMSConversation.js
- Thread view by customer
- Compose new message
- Link to ticket if related
- Quick replies / templates
```

### Call Log Component
```javascript
// src/components/CallHistory.js
- Recent calls list
- Filter by type (inbound/outbound/missed)
- Recording playback
- Link to customer
```

---

## Cost Estimate

### Telnyx (Monthly)
| Item | Cost |
|------|------|
| Phone Number | $1/month |
| Inbound Calls | ~$0.01/min |
| Outbound Calls | ~$0.01/min |
| SMS | ~$0.004/message |
| **Estimated Total** | ~$10-20/month |

### Retell (Monthly)
| Item | Cost |
|------|------|
| Voice Minutes | $0.07-0.12/min |
| 26 calls × 5 min avg | ~$10-15/month |
| **Estimated Total** | ~$10-15/month |

### Total: ~$20-35/month
(vs current Skybridge cost - compare to see savings)

---

## Migration Plan

### Week 1: Setup
- Create Telnyx account
- Get new number for testing
- Configure basic routing

### Week 2: Testing
- Test auto-attendant
- Test Retell integration
- Test voicemail

### Week 3: Soft Launch
- Route test calls through new system
- Monitor for issues
- Gather feedback

### Week 4: Full Migration
- Port main number to Telnyx
- Decommission Skybridge
- Update all documentation

---

## Questions for Steve

1. **Number porting** - Do you want to port existing Skybridge number or get new?
2. **Auto-attendant script** - What menu options do you want?
3. **Business hours** - What hours should route to AI vs voicemail?
4. **SMS opt-in** - Do you have customer consent for SMS?
5. **Skybridge clients** - What happens to clients you resell Skybridge to?

---

## Dependencies

- None - can be done in parallel with other workstreams
- Nice to have: Workstream 1 complete for secure credential storage

---

## Timeline Estimate

| Phase | Time |
|-------|------|
| Telnyx Setup | 2 hours |
| Auto-Attendant | 4 hours |
| Retell Integration | 2 hours |
| Voicemail System | 6 hours |
| SMS Integration | 6 hours |
| Unicorn UI | 8 hours |
| Testing & Migration | 8 hours |

**Total: ~36 hours**
