/**
 * Email AI Analyzer
 *
 * Uses Gemini to analyze incoming emails and decide on actions.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

// Lazy-initialized clients
let _supabase = null;
let _genAI = null;

function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return _supabase;
}

function getGenAI() {
  if (!_genAI) {
    _genAI = new GoogleGenerativeAI(process.env.REACT_APP_GEMINI_API_KEY || process.env.GEMINI_API_KEY);
  }
  return _genAI;
}

/**
 * Get email agent configuration
 */
async function getAgentConfig() {
  const { data: configs } = await getSupabase()
    .from('app_configuration')
    .select('key, value')
    .like('key', 'email_agent_%');

  const config = {};
  configs?.forEach(c => {
    const shortKey = c.key.replace('email_agent_', '');
    config[shortKey] = c.value;
  });

  return {
    enabled: config.enabled !== 'false',
    autoReply: config.auto_reply !== 'false',
    autoCreateTickets: config.auto_create_tickets !== 'false',
    ccEmail: config.cc_email || '',
    forwardEmail: config.forward_email || '',
    reviewThreshold: parseFloat(config.require_review_threshold) || 0.7,
    autoReplyThreshold: parseFloat(config.auto_reply_threshold) || 0.98,
    internalDomains: (config.internal_domains || 'isehome.com').split(',').map(d => d.trim().toLowerCase()),
    ignoreDomains: (config.ignore_domains || '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean),
    systemPrompt: config.system_prompt || 'You are a helpful customer service AI assistant.',
    signature: config.signature || '',
  };
}

/**
 * Check if email is from internal domain
 */
function isInternalEmail(fromEmail, internalDomains) {
  if (!fromEmail) return false;
  const domain = fromEmail.split('@')[1]?.toLowerCase();
  return internalDomains.some(d => domain === d || domain?.endsWith('.' + d));
}

/**
 * Check if email should be ignored
 */
function shouldIgnoreEmail(fromEmail, ignoreDomains) {
  if (!fromEmail) return true;
  const lowerEmail = fromEmail.toLowerCase();
  return ignoreDomains.some(d => lowerEmail.includes(d));
}

/**
 * Lookup customer by email in contacts table
 * Also checks project_contacts to find associated projects
 */
async function lookupCustomer(email) {
  if (!email) return null;

  try {
    // First check contacts table for a direct email match
    const { data: contact, error } = await getSupabase()
      .from('contacts')
      .select('id, name, first_name, last_name, email, phone, company, address, is_internal, is_active')
      .ilike('email', email)
      .eq('is_archived', false)
      .limit(1)
      .single();

    if (error || !contact) {
      console.log(`[EmailAI] No contact found for: ${email}`);
      return null;
    }

    // Look up associated projects for richer context
    const { data: projectLinks } = await getSupabase()
      .from('project_contacts')
      .select('project_id, projects(id, name, status)')
      .eq('contact_id', contact.id)
      .limit(5);

    const projects = projectLinks
      ?.map(pl => pl.projects)
      .filter(Boolean) || [];

    return {
      ...contact,
      projects,
      has_active_projects: projects.some(p => p.status === 'active' || p.status === 'in_progress'),
    };
  } catch (err) {
    console.error(`[EmailAI] Customer lookup error for ${email}:`, err.message);
    return null;
  }
}

/**
 * Check if this is a reply to a system-generated notification
 */
function isReplyToNotification(subject, body) {
  const notificationPatterns = [
    /ticket\s*#?\d+/i,
    /issue\s*#?\d+/i,
    /po\s*#?\d+/i,
    /purchase\s*order/i,
    /shade\s*measurement/i,
    /service\s*confirmation/i,
    /re:\s*\[unicorn\]/i,
  ];

  const combined = `${subject} ${body}`.toLowerCase();
  return notificationPatterns.some(p => p.test(combined));
}

/**
 * Check if email is a calendar response (accept/decline/tentative)
 * or an auto-reply (out of office, automatic reply)
 * These should be silently ignored by the email agent.
 */
function isCalendarOrAutoReply(subject, body) {
  const subjectLower = (subject || '').trim();

  // Calendar accept/decline/tentative patterns
  // Outlook formats: "Accepted: ...", "Declined: ...", "Tentative: ..."
  const calendarPrefixes = [
    /^accepted:\s/i,
    /^declined:\s/i,
    /^tentative:\s/i,
    /^tentatively accepted:\s/i,
    /^canceled:\s/i,
    /^cancelled:\s/i,
  ];

  if (calendarPrefixes.some(p => p.test(subjectLower))) {
    return 'calendar_response';
  }

  // Auto-reply / out-of-office patterns
  const autoReplyPrefixes = [
    /^automatic reply:\s/i,
    /^auto-?reply:\s/i,
    /^out of office:\s/i,
    /^out-of-office:\s/i,
  ];

  if (autoReplyPrefixes.some(p => p.test(subjectLower))) {
    return 'auto_reply';
  }

  return false;
}

/**
 * Analyze email with Gemini AI
 */
async function analyzeEmail(email, customer, config) {
  const model = getGenAI().getGenerativeModel({ model: 'gemini-3-flash-preview' });

  const projectList = customer?.projects?.length
    ? customer.projects.map(p => `  - ${p.name} (${p.status})`).join('\n')
    : '  - None found';

  const customerContext = customer
    ? `
Customer Information:
- Name: ${customer.name || 'Unknown'}
- Company: ${customer.company || 'N/A'}
- Email: ${customer.email}
- Phone: ${customer.phone || 'N/A'}
- Status: Existing customer in our system
- Active projects: ${customer.has_active_projects ? 'Yes' : 'No'}
- Projects:
${projectList}
`
    : `
Customer Information:
- Email: ${email.from.email}
- Name: ${email.from.name || 'Unknown'}
- Status: Not found in our customer database (may be new inquiry)
`;

  const prompt = `${config.systemPrompt}

---

You are analyzing an incoming email to decide how to handle it. Analyze the email and provide a structured response.

${customerContext}

Email Details:
- From: ${email.from.name} <${email.from.email}>
- Subject: ${email.subject}
- Received: ${email.receivedAt}
- Has Attachments: ${email.hasAttachments ? 'Yes' : 'No'}

Email Body:
---
${email.body || email.bodyPreview}
---

Analyze this email and respond with ONLY a JSON object (no markdown, no explanation) with these fields:

{
  "classification": "support" | "sales" | "spam" | "reply_to_notification" | "vendor" | "billing" | "scheduling" | "unknown",
  "summary": "Brief 1-2 sentence summary of what this email is about and what the sender wants",
  "urgency": "low" | "medium" | "high" | "critical",
  "priority_reasoning": "1 sentence explaining WHY you assigned this urgency level",
  "sentiment": "positive" | "neutral" | "negative" | "frustrated",
  "confidence": 0.0 to 1.0,
  "intent": "request_service" | "provide_info" | "ask_question" | "complaint" | "follow_up" | "schedule" | "escalation" | "feedback" | "purchase_order" | "other",
  "topics": ["array", "of", "topic tags relevant to this email (e.g. wifi, network, home_theater, camera, audio, lighting, shades, control, security, billing, scheduling)"],
  "entities": {
    "systems_mentioned": ["specific equipment or systems mentioned (e.g. Sonos, Lutron, Ubiquiti, Control4)"],
    "locations_mentioned": ["rooms or areas mentioned (e.g. home theater, master bedroom, patio)"],
    "people_mentioned": ["names of people referenced in the email"],
    "dates_mentioned": ["any dates, deadlines, or time references"],
    "project_references": ["any project names or numbers mentioned"]
  },
  "department": "service" | "sales" | "project_management" | "admin" | "billing" | "unknown",
  "suggested_assignee_role": "service_tech" | "project_manager" | "sales_rep" | "office_admin" | "owner" | "unknown",
  "routing_reasoning": "1-2 sentences explaining WHY this should go to that department/role",
  "action_items": ["list", "of", "specific next steps to take"],
  "should_create_ticket": true | false,
  "ticket_title": "Suggested ticket title if creating one",
  "ticket_description": "Suggested ticket description",
  "ticket_category": "network" | "av" | "security" | "automation" | "general",
  "should_reply": true | false,
  "suggested_response": "Your suggested reply to the customer (professional, helpful)",
  "should_forward": true | false,
  "forward_reason": "Why forwarding is needed (if applicable)",
  "requires_human_review": true | false,
  "review_reason": "Why human review is needed (if applicable)"
}

Classification guidelines:
- "support": Customer needs help with existing system/service
- "sales": New inquiry, quote request, or sales question
- "vendor": Communication from a vendor or supplier
- "billing": Invoice, payment, or billing related
- "scheduling": Appointment scheduling or calendar coordination
- "spam": Marketing, newsletters, automated messages
- "reply_to_notification": Reply to an email we sent (ticket update, PO, etc.)
- "unknown": Cannot determine intent

Intent guidelines:
- "request_service": Customer wants something fixed, installed, or serviced
- "ask_question": Customer has a question about their system or our services
- "complaint": Customer is unhappy and expressing dissatisfaction
- "follow_up": Continuing a previous conversation or checking on status
- "schedule": Wants to set up an appointment or change a schedule
- "escalation": Issue has been ongoing, customer wants it elevated
- "feedback": Positive or negative feedback about completed work
- "provide_info": Sending information we requested or FYI
- "purchase_order": Sending a PO or order-related communication
- "other": None of the above

Urgency guidelines:
- "critical": System down, security issue, business-impacting
- "high": Service degraded, time-sensitive request
- "medium": Standard support request
- "low": General question, feedback, non-urgent

Remember: Respond with ONLY the JSON object, no other text.`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    // Parse JSON from response (handle potential markdown wrapping)
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }

    const analysis = JSON.parse(jsonStr);

    return {
      success: true,
      ...analysis,
      raw_response: response,
    };
  } catch (error) {
    console.error('[EmailAI] Analysis failed:', error);
    return {
      success: false,
      error: error.message,
      classification: 'unknown',
      summary: 'AI analysis failed',
      urgency: 'medium',
      sentiment: 'neutral',
      confidence: 0,
      should_create_ticket: false,
      should_reply: false,
      should_forward: true,
      requires_human_review: true,
      review_reason: `AI analysis error: ${error.message}`,
    };
  }
}

/**
 * Generate a professional reply based on AI analysis
 */
async function generateReply(email, analysis, customer, config) {
  // If AI already suggested a response, use it
  if (analysis.suggested_response) {
    return formatReplyHtml(analysis.suggested_response, config.signature);
  }

  // Otherwise generate a new one
  const model = getGenAI().getGenerativeModel({ model: 'gemini-3-flash-preview' });

  const prompt = `${config.systemPrompt}

Generate a professional email reply for this situation:

Original Email From: ${email.from.name} <${email.from.email}>
Subject: ${email.subject}
Summary: ${analysis.summary}
Customer Status: ${customer ? 'Existing customer' : 'New contact'}

${analysis.should_create_ticket ? `A service ticket has been created for this request.` : ''}

Write a helpful, professional reply that:
1. Acknowledges their message
2. ${analysis.should_create_ticket ? 'Confirms a ticket has been created and they will be contacted' : 'Addresses their question or directs them appropriately'}
3. Is warm but professional
4. Is concise (2-3 short paragraphs max)

Do not include a greeting (Hi/Hello) or signature - those will be added automatically.
Respond with ONLY the body text of the email.`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    return formatReplyHtml(responseText, config.signature);
  } catch (error) {
    console.error('[EmailAI] Reply generation failed:', error);
    // Return a safe fallback
    return formatReplyHtml(
      `Thank you for your email. We have received your message and a team member will review it shortly.\n\nIf this is urgent, please call us directly.`,
      config.signature
    );
  }
}

/**
 * Format reply as HTML with signature
 */
function formatReplyHtml(text, signature) {
  // Convert newlines to <br> and wrap in HTML
  const htmlBody = text
    .split('\n')
    .map(line => line.trim())
    .join('<br>\n');

  const htmlSignature = signature
    .split('\n')
    .map(line => line.trim())
    .join('<br>\n');

  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color: #333;">
  <p>${htmlBody}</p>
  <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #666; font-size: 12px;">
    ${htmlSignature}
  </div>
</div>
  `.trim();
}

module.exports = {
  getAgentConfig,
  isInternalEmail,
  shouldIgnoreEmail,
  lookupCustomer,
  isReplyToNotification,
  isCalendarOrAutoReply,
  analyzeEmail,
  generateReply,
};
