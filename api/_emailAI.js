/**
 * Email AI Analyzer
 *
 * Uses Gemini to analyze incoming emails and decide on actions.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.REACT_APP_GEMINI_API_KEY || process.env.GEMINI_API_KEY);

/**
 * Get email agent configuration
 */
async function getAgentConfig() {
  const { data: configs } = await supabase
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
 * Lookup customer by email in global_contacts
 */
async function lookupCustomer(email) {
  if (!email) return null;

  const { data: contact } = await supabase
    .from('global_contacts')
    .select('*')
    .ilike('email', email)
    .single();

  return contact;
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
 * Analyze email with Gemini AI
 */
async function analyzeEmail(email, customer, config) {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const customerContext = customer
    ? `
Customer Information:
- Name: ${customer.name || 'Unknown'}
- Company: ${customer.company || 'N/A'}
- Email: ${customer.email}
- Phone: ${customer.phone || 'N/A'}
- Previous interactions: Existing customer in our system
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
  "classification": "support" | "sales" | "spam" | "reply_to_notification" | "unknown",
  "summary": "Brief 1-2 sentence summary of the email",
  "urgency": "low" | "medium" | "high" | "critical",
  "sentiment": "positive" | "neutral" | "negative" | "frustrated",
  "confidence": 0.0 to 1.0,
  "action_items": ["list", "of", "action items"],
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
- "spam": Marketing, newsletters, automated messages
- "reply_to_notification": Reply to an email we sent (ticket update, PO, etc.)
- "unknown": Cannot determine intent

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
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

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
  analyzeEmail,
  generateReply,
};
