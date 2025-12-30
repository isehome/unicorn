/**
 * api/retell/check-schedule.js
 * Check technician availability for Premium SLA customers
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        let body = req.body;
        if (req.body?.args) body = req.body.args;

        const { days_ahead = 3 } = body;

        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + days_ahead);

        // Get existing schedules
        const { data: schedules } = await supabase
            .from('service_schedules')
            .select('scheduled_date, scheduled_time_start, technician_name')
            .gte('scheduled_date', startDate.toISOString().split('T')[0])
            .lte('scheduled_date', endDate.toISOString().split('T')[0])
            .in('status', ['scheduled', 'confirmed']);

        // Build availability
        const availability = [];
        const current = new Date(startDate);

        while (current <= endDate) {
            const dateStr = current.toISOString().split('T')[0];
            const daySchedules = (schedules || []).filter(s => s.scheduled_date === dateStr);

            const hasMorning = daySchedules.some(s => parseInt(s.scheduled_time_start?.split(':')[0] || '0') < 12);
            const hasAfternoon = daySchedules.some(s => parseInt(s.scheduled_time_start?.split(':')[0] || '0') >= 12);

            if (!hasMorning || !hasAfternoon) {
                availability.push({
                    date: dateStr,
                    day: current.toLocaleDateString('en-US', { weekday: 'long' }),
                    morning: !hasMorning,
                    afternoon: !hasAfternoon
                });
            }
            current.setDate(current.getDate() + 1);
        }

        let message;
        if (availability.length === 0) {
            message = `We're fully booked for the next ${days_ahead} days. I can create a ticket and have someone call you to schedule.`;
        } else {
            const slots = availability.slice(0, 3).map(a => {
                const times = [];
                if (a.morning) times.push('morning');
                if (a.afternoon) times.push('afternoon');
                return `${a.day} ${times.join(' or ')}`;
            });
            message = `We have availability: ${slots.join(', ')}. Which works best for you?`;
        }

        return res.json({
            result: {
                availability,
                message,
                note: "I'll create a ticket with your preferred time and our team will confirm."
            }
        });

    } catch (error) {
        console.error('[Retell CheckSchedule] Error:', error);
        return res.json({
            result: {
                message: "I'm having trouble checking availability. Let me create a ticket and someone will call you to schedule."
            }
        });
    }
};
