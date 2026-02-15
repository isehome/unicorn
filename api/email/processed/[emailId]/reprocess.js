/**
 * Reprocess Email
 *
 * Re-runs reply/forward logic for an already-processed email using current config.
 * Useful when config was wrong at original processing time (e.g., auto_reply was off).
 *
 * POST /api/email/processed/:emailId/reprocess
 */

const { requireAuth } = require('../../../_authMiddleware');
const { createClient } = require('@supabase/supabase-js');
const { replyToEmail, forwardEmail } = require('../../../_systemGraphEmail');
const { getAgentConfig } = require('../../../_emailAI');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { emailId } = req.query;

  if (!emailId) {
    return res.status(400).json({ error: 'Missing emailId' });
  }

  try {
    console.log(`[Reprocess] Starting reprocess for: ${emailId}`);

    // 1. Look up the processed email record
    const { data: record, error: fetchErr } = await supabase
      .from('processed_emails')
      .select('*')
      .eq('id', emailId)
      .single();

    if (fetchErr || !record) {
      console.error('[Reprocess] Record not found:', fetchErr);
      return res.status(404).json({ error: 'Processed email not found' });
    }

    // 2. Get current config
    const config = await getAgentConfig();

    // 3. Determine what to do
    const actions = [];
    const actionDetails = record.action_details || {};
    let updatedDetails = { ...actionDetails };

    // Send reply if: has a suggested response + auto_reply is on + reply wasn't already sent
    const alreadyReplied = actionDetails.reply_sent === true;
    const hasResponse = !!record.ai_suggested_response;
    const confidence = parseFloat(record.ai_confidence) || 0;
    const meetsThreshold = confidence >= config.autoReplyThreshold;

    if (!alreadyReplied && hasResponse && config.autoReply && meetsThreshold) {
      try {
        // Build CC list
        const ccList = [];
        if (config.ccEmail) {
          ccList.push(config.ccEmail);
        }

        // Format as HTML — same format as _emailAI.formatReplyHtml()
        const htmlText = record.ai_suggested_response
          .split('\n')
          .map(line => line.trim())
          .join('<br>\n');

        const htmlSignature = (config.signature || '')
          .split('\n')
          .map(line => line.trim())
          .join('<br>\n');

        const htmlBody = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color: #333;">
  <p>${htmlText}</p>
  <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #666; font-size: 12px;">
    ${htmlSignature}
  </div>
</div>`.trim();

        await replyToEmail(record.email_id, {
          body: htmlBody,
          cc: ccList,
        });

        updatedDetails.reply_sent = true;
        updatedDetails.reply_sent_at = new Date().toISOString();
        updatedDetails.reply_method = 'reprocess';
        actions.push('reply_sent');
        console.log(`[Reprocess] Reply sent to: ${record.from_email}`);
      } catch (replyErr) {
        console.error('[Reprocess] Reply failed:', replyErr);
        return res.status(500).json({
          error: `Reply failed: ${replyErr.message}`,
          emailId,
        });
      }
    } else if (alreadyReplied) {
      actions.push('already_replied');
    } else if (!hasResponse) {
      actions.push('no_suggested_response');
    } else if (!config.autoReply) {
      actions.push('auto_reply_disabled');
    } else if (!meetsThreshold) {
      actions.push('below_threshold');
    }

    // 4. Update the record
    const { error: updateErr } = await supabase
      .from('processed_emails')
      .update({
        action_details: updatedDetails,
        updated_at: new Date().toISOString(),
      })
      .eq('id', emailId);

    if (updateErr) {
      console.error('[Reprocess] Update failed:', updateErr);
    }

    res.json({
      success: true,
      emailId,
      actions,
      message: actions.includes('reply_sent')
        ? 'Reply sent successfully'
        : `No action needed: ${actions.join(', ')}`,
    });
  } catch (error) {
    console.error('[Reprocess] Exception:', error);
    res.status(500).json({ error: error.message });
  }
};
