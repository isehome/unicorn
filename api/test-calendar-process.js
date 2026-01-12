/**
 * Test endpoint for calendar response processing
 * GET /api/test-calendar-process?scheduleId=xxx
 */

const { processCalendarResponses } = require('./_calendarResponseProcessor');

module.exports = async (req, res) => {
  const { scheduleId } = req.query;

  try {
    console.log('[TestCalendarProcess] Starting test...');

    // If scheduleId provided, process just that one
    const scheduleIds = scheduleId ? [scheduleId] : null;

    const results = await processCalendarResponses(scheduleIds);
    console.log('[TestCalendarProcess] Results:', JSON.stringify(results, null, 2));

    return res.status(200).json({
      success: true,
      ...results
    });

  } catch (error) {
    console.error('[TestCalendarProcess] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
};
