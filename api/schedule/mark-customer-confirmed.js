/**
 * API endpoint to manually mark customer as confirmed
 * POST /api/schedule/mark-customer-confirmed
 *
 * Moves schedule from tech_accepted OR pending_customer → confirmed
 * Used when staff confirms on behalf of customer
 */

const { markCustomerConfirmed } = require('../_calendarResponseProcessor');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { scheduleId, confirmedBy } = req.body;

  if (!scheduleId) {
    return res.status(400).json({ error: 'scheduleId is required' });
  }

  try {
    const result = await markCustomerConfirmed(scheduleId, confirmedBy);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[mark-customer-confirmed] Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to mark customer confirmed',
      details: error.toString()
    });
  }
};
