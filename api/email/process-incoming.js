/**
 * Process Incoming Emails
 *
 * Main email processing endpoint. Called by cron job every 5 minutes.
 * Fetches unread emails, analyzes with AI, and takes appropriate action.
 *
 * Endpoint: POST /api/email/process-incoming
 */

const { createClient } = require('@supabase/supabase-js');
const { getUnreadEmails, markEmailAsRead, replyToEmail, forwardEmail } = require('../_systemGraphEmail');
const { systemSendMail, getSystemAccountEmail, clearCaches } = require('../_systemGraph');
const {
  getAgentConfig,
  isInternalEmail,
  shouldIgnoreEmail,
  lookupCustomer,
  isReplyToNotification,
  isCalendarOrAutoReply,
  analyzeEmail,
  generateReply,
} = require('../_emailAI');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();
  const results = {
    processed: 0,
    skipped: 0,
    tickets_created: 0,
    replies_sent: 0,
    forwarded: 0,
    errors: [],
  };

  try {
    // Get agent configuration
    const config = await getAgentConfig();

    if (!config.enabled) {
      console.log('[EmailAgent] Agent is disabled');
      return res.json({ success: true, message: 'Email agent is disabled', results });
    }

    console.log('[EmailAgent] Starting email processing...');

    // Fetch unread emails (retry once with fresh token on auth failure)
    let emails;
    try {
      emails = await getUnreadEmails({ top: 20 });
    } catch (fetchErr) {
      if (fetchErr.message && fetchErr.message.includes('403')) {
        console.log('[EmailAgent] Got 403 - clearing token cache and retrying with fresh token...');
        clearCaches();
        emails = await getUnreadEmails({ top: 20 });
      } else {
        throw fetchErr;
      }
    }
    console.log(`[EmailAgent] Found ${emails.length} unread emails`);

    if (emails.length === 0) {
      return res.json({ success: true, message: 'No unread emails', results });
    }

    // Process each email
    for (const email of emails) {
      const emailStartTime = Date.now();

      try {
        // Check if already processed
        const { data: existing } = await supabase
          .from('processed_emails')
          .select('id')
          .eq('email_id', email.id)
          .single();

        if (existing) {
          console.log(`[EmailAgent] Skipping already processed: ${email.subject}`);
          results.skipped++;
          continue;
        }

        // Check if should ignore (noreply, etc.)
        if (shouldIgnoreEmail(email.from.email, config.ignoreDomains)) {
          console.log(`[EmailAgent] Ignoring email from: ${email.from.email}`);
          await markEmailAsRead(email.id);
          await logProcessedEmail(email, {
            ai_classification: 'spam',
            action_taken: 'ignored',
            ai_summary: 'Automated/no-reply address - ignored',
          });
          results.skipped++;
          continue;
        }

        // Auto-ignore calendar responses (Accepted/Declined/Tentative) and auto-replies (OOO)
        const calendarOrAutoReply = isCalendarOrAutoReply(email.subject, email.body || email.bodyPreview);
        if (calendarOrAutoReply) {
          console.log(`[EmailAgent] Auto-ignoring ${calendarOrAutoReply}: ${email.subject}`);
          await markEmailAsRead(email.id);
          await logProcessedEmail(email, {
            ai_classification: calendarOrAutoReply === 'calendar_response' ? 'reply_to_notification' : 'internal',
            action_taken: 'ignored',
            ai_confidence: 1.0,
            ai_summary: calendarOrAutoReply === 'calendar_response'
              ? 'Calendar accept/decline/tentative response - auto-ignored'
              : 'Auto-reply or out-of-office message - auto-ignored',
          });
          results.skipped++;
          continue;
        }

        // Lookup customer BEFORE internal domain check
        // Known clients should always be processed, even from internal domains
        const customer = await lookupCustomer(email.from.email);
        console.log(`[EmailAgent] Customer lookup: ${customer ? customer.name : 'Not found'}`);

        // Check if internal email — but only skip if sender is NOT a known client
        if (isInternalEmail(email.from.email, config.internalDomains) && !customer) {
          console.log(`[EmailAgent] Skipping internal email from: ${email.from.email} (not a known client)`);
          await markEmailAsRead(email.id);
          await logProcessedEmail(email, {
            ai_classification: 'internal',
            action_taken: 'ignored',
            ai_summary: 'Internal email from non-client - no action needed',
          });
          results.skipped++;
          continue;
        }
        if (isInternalEmail(email.from.email, config.internalDomains) && customer) {
          console.log(`[EmailAgent] Internal domain but known client: ${customer.name} - processing normally`);
        }

        // Check if reply to notification
        const isNotificationReply = isReplyToNotification(email.subject, email.body || email.bodyPreview);

        // Analyze with AI
        console.log(`[EmailAgent] Analyzing: ${email.subject}`);
        const analysis = await analyzeEmail(email, customer, config);

        // Override classification if it's a notification reply
        if (isNotificationReply && analysis.classification !== 'spam') {
          analysis.classification = 'reply_to_notification';
        }

        // Determine action based on analysis
        let actionTaken = 'pending_review';
        let ticketId = null;
        let replyEmailId = null;
        let forwardedTo = null;

        // Check confidence threshold
        // needsReview gates auto-reply (sending emails to customers) but NOT ticket creation
        // Tickets are internal and safe to create even when human review is flagged
        const lowConfidence = analysis.confidence < config.reviewThreshold;
        const needsReview = lowConfidence || analysis.requires_human_review;

        // Create ticket if needed
        // Only block on low confidence - requires_human_review should not prevent ticket creation
        // (The AI may flag review for name mismatches, scheduling needs, etc. but ticket should still be made)
        if (analysis.should_create_ticket && config.autoCreateTickets && !lowConfidence) {
          try {
            const ticket = await createServiceTicket(email, analysis, customer);
            ticketId = ticket.id;
            actionTaken = 'ticket_created';
            results.tickets_created++;
            console.log(`[EmailAgent] Created ticket: ${ticket.id}`);
          } catch (ticketError) {
            console.error('[EmailAgent] Ticket creation failed:', ticketError);
            results.errors.push(`Ticket creation failed: ${ticketError.message}`);
          }
        }

        // Send reply if needed
        // Auto-reply IS gated by needsReview - we don't auto-respond when human review is flagged
        if (analysis.should_reply && config.autoReply && !needsReview) {
          try {
            const replyBody = await generateReply(email, analysis, customer, config);

            // Build CC list
            const ccList = [];
            if (config.ccEmail) {
              ccList.push(config.ccEmail);
            }

            await replyToEmail(email.id, {
              body: replyBody,
              cc: ccList,
            });

            if (!ticketId) actionTaken = 'replied';
            results.replies_sent++;
            console.log(`[EmailAgent] Sent reply to: ${email.from.email}`);
          } catch (replyError) {
            console.error('[EmailAgent] Reply failed:', replyError);
            results.errors.push(`Reply failed: ${replyError.message}`);
          }
        }

        // Forward if needed
        if (analysis.should_forward && config.forwardEmail) {
          try {
            await forwardEmail(email.id, {
              to: config.forwardEmail,
              comment: `AI Classification: ${analysis.classification}\nConfidence: ${analysis.confidence}\nSummary: ${analysis.summary}\n\nReason for forwarding: ${analysis.forward_reason || 'Requires human review'}`,
            });

            forwardedTo = config.forwardEmail;
            actionTaken = 'forwarded';
            results.forwarded++;
            console.log(`[EmailAgent] Forwarded to: ${config.forwardEmail}`);
          } catch (forwardError) {
            console.error('[EmailAgent] Forward failed:', forwardError);
            results.errors.push(`Forward failed: ${forwardError.message}`);
          }
        }

        // If no action taken but needs review
        if (actionTaken === 'pending_review' && needsReview) {
          // Forward to manager for review
          if (config.forwardEmail) {
            try {
              await forwardEmail(email.id, {
                to: config.forwardEmail,
                comment: `Requires Human Review\n\nAI Classification: ${analysis.classification}\nConfidence: ${(analysis.confidence * 100).toFixed(0)}%\nReason: ${analysis.review_reason || 'Low confidence or flagged for review'}\n\nSummary: ${analysis.summary}`,
              });
              forwardedTo = config.forwardEmail;
            } catch (e) {
              console.error('[EmailAgent] Review forward failed:', e);
            }
          }
        }

        // Mark as read
        await markEmailAsRead(email.id);

        // Log processed email
        const processingTime = Date.now() - emailStartTime;
        await logProcessedEmail(email, {
          matched_contact_id: customer?.id,
          matched_customer_name: customer?.name,
          match_method: customer ? 'email' : null,
          ai_classification: analysis.classification,
          ai_summary: analysis.summary,
          ai_urgency: analysis.urgency,
          ai_sentiment: analysis.sentiment,
          ai_action_items: analysis.action_items || [],
          ai_suggested_response: analysis.suggested_response,
          ai_confidence: analysis.confidence,
          ai_raw_response: { analysis },
          action_taken: actionTaken,
          action_details: {
            ticket_created: !!ticketId,
            reply_sent: results.replies_sent > 0,
            forwarded: !!forwardedTo,
          },
          ticket_id: ticketId,
          forwarded_to: forwardedTo,
          processing_time_ms: processingTime,
          status: needsReview ? 'pending_review' : 'processed',
          requires_human_review: needsReview,
        });

        results.processed++;
        console.log(`[EmailAgent] Processed: ${email.subject} -> ${actionTaken} (${processingTime}ms)`);

      } catch (emailError) {
        console.error(`[EmailAgent] Error processing email ${email.id}:`, emailError);
        results.errors.push(`${email.subject}: ${emailError.message}`);

        // Log the failure
        await logProcessedEmail(email, {
          action_taken: 'failed',
          error_message: emailError.message,
          status: 'failed',
        });
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`[EmailAgent] Completed in ${totalTime}ms:`, results);

    res.json({
      success: true,
      duration_ms: totalTime,
      results,
    });

  } catch (error) {
    console.error('[EmailAgent] Fatal error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      results,
    });
  }
};

/**
 * Log processed email to database
 */
async function logProcessedEmail(email, data) {
  try {
    await supabase.from('processed_emails').insert({
      email_id: email.id,
      conversation_id: email.conversationId,
      internet_message_id: email.internetMessageId,
      from_email: email.from.email,
      from_name: email.from.name,
      to_email: email.to?.[0]?.email,
      subject: email.subject,
      body_preview: email.bodyPreview?.substring(0, 500),
      received_at: email.receivedAt,
      ...data,
    });
  } catch (error) {
    console.error('[EmailAgent] Failed to log email:', error);
  }
}

/**
 * Create a service ticket from email
 */
async function createServiceTicket(email, analysis, customer) {
  const systemEmail = await getSystemAccountEmail();

  const ticketData = {
    title: analysis.ticket_title || email.subject,
    description: analysis.ticket_description || analysis.summary,
    status: 'new',
    priority: mapUrgencyToPriority(analysis.urgency),
    source: 'email',
    customer_email: email.from.email,
    customer_name: customer?.name || email.from.name,
    customer_phone: customer?.phone,
    contact_id: customer?.id,
    category: analysis.ticket_category || 'general',
    metadata: {
      email_id: email.id,
      conversation_id: email.conversationId,
      ai_classification: analysis.classification,
      ai_summary: analysis.summary,
      original_subject: email.subject,
      has_attachments: email.hasAttachments,
    },
    created_by_email: systemEmail,
  };

  const { data: ticket, error } = await supabase
    .from('service_tickets')
    .insert(ticketData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create ticket: ${error.message}`);
  }

  return ticket;
}

/**
 * Map AI urgency to ticket priority
 */
function mapUrgencyToPriority(urgency) {
  const map = {
    critical: 'urgent',
    high: 'high',
    medium: 'normal',
    low: 'low',
  };
  return map[urgency] || 'normal';
}
