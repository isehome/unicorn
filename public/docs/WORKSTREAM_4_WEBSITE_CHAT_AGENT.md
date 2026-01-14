# Workstream 4: Website Chat Agent

## Overview

**Problem:** Want an AI chat agent on the company website for customer self-service.

**Solution:** Deploy Retell's web chat widget or build custom chat interface using same backend as Sarah.

**Priority:** Lower - Complete after core voice/telephony is solid

---

## Options

### Option A: Retell Web Widget (Recommended)
- **Pros:** Same platform as Sarah, shared knowledge base, minimal development
- **Cons:** Monthly cost, less customization
- **Effort:** Low (configuration only)

### Option B: Custom Chat with OpenAI/Claude
- **Pros:** Full control, no per-minute costs
- **Cons:** More development, separate from voice
- **Effort:** High (full build)

### Option C: Third-Party Chat (Intercom, Drift, etc.)
- **Pros:** Feature-rich, proven solutions
- **Cons:** Doesn't share Sarah's knowledge, separate system
- **Effort:** Medium (integration)

**Recommendation:** Start with Retell Web Widget for consistency with voice agent.

---

## Retell Web Chat Implementation

### Setup Steps

1. **Enable Web Chat in Retell Dashboard**
   - Use same agent as phone (Sarah)
   - Or create dedicated web agent with same knowledge

2. **Get Embed Code**
   ```html
   <script src="https://cdn.retellai.com/widget.js"></script>
   <script>
     Retell.init({
       agentId: "your-agent-id",
       // Customize appearance
     });
   </script>
   ```

3. **Add to Website**
   - Embed in footer/template
   - Configure position (bottom-right typical)
   - Set colors to match brand

4. **Connect to Unicorn**
   - Same webhook endpoints work
   - Transcripts saved to same database
   - Tickets created same way

---

## Features

### Must Have
- [ ] Customer identification (if logged in)
- [ ] Ticket creation
- [ ] Knowledge base search
- [ ] Escalation to human

### Nice to Have
- [ ] Pre-chat form (name, email)
- [ ] Proactive triggers (time on page)
- [ ] File/image upload
- [ ] Chat history persistence

---

## Website Integration Points

### Intelligent Systems Website
- [ ] Add chat widget to all pages
- [ ] Configure business hours availability
- [ ] Set up offline message handling

### Unicorn App (Customer Portal Future)
- [ ] Embedded support chat
- [ ] Context-aware (knows which project)
- [ ] Quick actions (check ticket status)

---

## Cost Estimate

| Item | Cost |
|------|------|
| Retell Web Chat | ~$0.10/minute |
| Estimated 50 chats/month × 3 min | ~$15/month |

---

## Timeline

| Task | Time |
|------|------|
| Retell configuration | 1 hour |
| Website embed | 1 hour |
| Testing | 2 hours |
| Webhook adjustments | 2 hours |

**Total: ~6 hours**

---

## Dependencies

- Workstream 3 (Telephony) - Should be stable first
- Retell account with web chat enabled

---

## Notes

This is lowest priority of the four workstreams. Focus on:
1. ✅ Secure data encryption (Workstream 1)
2. Home Assistant integration (Workstream 2)
3. Telephony improvements (Workstream 3)
4. Then website chat (Workstream 4)
