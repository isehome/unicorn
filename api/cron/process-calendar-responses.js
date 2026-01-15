/**
 * Cron Job: Process Calendar Responses
 *
 * Polls pending service schedules and checks their calendar event
 * attendee responses to advance the 3-step workflow.
 *
 * Workflow:
 * 1. Find schedules in 'pending_tech' or 'pending_customer' status
 * 2. For each, fetch the calendar event from Graph API
 * 3. Check attendee response statuses
 * 4. Update service_schedules based on responses:
 *    - Tech accepts: status → pending_customer, add customer to invite
 *    - Customer accepts: status → confirmed
 *    - Anyone declines: status → cancelled, ticket → unscheduled
 *
 * Schedule: Every 3 minutes (cron: 0/3 * * * *)
 */

const { processCalendarResponses } = require('../_calendarResponseProcessor');

module.exports = async (req, res) => {
  // Verify cron secret for Vercel cron jobs
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Allow manual triggers without auth in development
    if (process.env.NODE_ENV === 'production') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  console.log('[ProcessCalendar] Starting calendar response processing');

  try {
    const results = await processCalendarResponses();
    console.log('[ProcessCalendar] Processing complete:', results);

    return res.status(200).json({
      success: true,
      ...results
    });

  } catch (error) {
    console.error('[ProcessCalendar] Fatal error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
