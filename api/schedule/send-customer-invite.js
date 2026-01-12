/**
 * API endpoint to send customer invite for a schedule
 * POST /api/schedule/send-customer-invite
 *
 * Moves schedule from tech_accepted → pending_customer
 * Sends calendar invite and confirmation email to customer
 */

const { sendCustomerInviteForSchedule } = require('../_calendarResponseProcessor');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { scheduleId } = req.body;

  if (!scheduleId) {
    return res.status(400).json({ error: 'scheduleId is required' });
  }

  try {
    const result = await sendCustomerInviteForSchedule(scheduleId);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[send-customer-invite] Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to send customer invite',
      details: error.toString()
    });
  }
};
