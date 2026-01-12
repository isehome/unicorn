/**
 * Test endpoint for calendar response processing
 * GET /api/test-calendar-process?scheduleId=xxx
 */

const { createClient } = require('@supabase/supabase-js');
const { processCalendarResponses } = require('./_calendarResponseProcessor');

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async (req, res) => {
  const { scheduleId } = req.query;
  const VERSION = 'v3-debug';

  try {
    console.log(`[TestCalendarProcess] ${VERSION} - Starting test...`);

    // First, let's debug what the query returns
    if (scheduleId) {
      const supabase = getSupabase();

      // Direct query for this schedule
      const { data: directSchedule, error: directError } = await supabase
        .from('service_schedules')
        .select('id, schedule_status, calendar_event_id, ticket_id')
        .eq('id', scheduleId)
        .single();

      console.log('[TestCalendarProcess] Direct query result:', directSchedule, directError);

      // Try to query the ticket directly
      if (directSchedule?.ticket_id) {
        const { data: ticketData, error: ticketError } = await supabase
          .from('service_tickets')
          .select('id, customer_email, customer_name')
          .eq('id', directSchedule.ticket_id)
          .single();

        console.log('[TestCalendarProcess] Ticket query result:', ticketData, ticketError);

        if (!ticketData) {
          return res.status(200).json({
            success: false,
            version: VERSION,
            message: 'Ticket not found - this is the bug!',
            scheduleId,
            ticketId: directSchedule.ticket_id,
            ticketError: ticketError?.message,
            note: 'The schedule exists but the ticket cannot be queried from the processor. Check RLS policies on service_tickets table.'
          });
        }
      }

      // Query with the same filter as processCalendarResponses
      const { data: filteredSchedules, error: filterError } = await supabase
        .from('service_schedules')
        .select('id, schedule_status, calendar_event_id')
        .not('calendar_event_id', 'is', null)
        .in('id', [scheduleId]);

      console.log('[TestCalendarProcess] Filtered query result:', filteredSchedules, filterError);

      // If not found with filter, show why
      if (!filteredSchedules || filteredSchedules.length === 0) {
        return res.status(200).json({
          success: false,
          message: 'Schedule not found by processor query',
          directQuery: directSchedule,
          directError: directError?.message,
          filterError: filterError?.message,
          reason: directSchedule?.calendar_event_id
            ? 'Schedule has calendar_event_id but query still failed - check RLS policies'
            : 'Schedule has no calendar_event_id'
        });
      }
    }

    // If scheduleId provided, process just that one
    const scheduleIds = scheduleId ? [scheduleId] : null;

    const results = await processCalendarResponses(scheduleIds);
    console.log('[TestCalendarProcess] Results:', JSON.stringify(results, null, 2));

    return res.status(200).json({
      success: true,
      version: VERSION,
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
