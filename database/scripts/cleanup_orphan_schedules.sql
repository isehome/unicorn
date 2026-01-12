-- Cleanup Orphan Schedules
-- Run this to find and remove duplicate/orphan schedules with null end times
-- Date: 2026-01-12

-- Step 1: Find all schedules with null scheduled_time_end (potential orphans)
SELECT
    id,
    ticket_id,
    technician_id,
    scheduled_date,
    scheduled_time_start,
    scheduled_time_end,
    schedule_status,
    created_at
FROM service_schedules
WHERE scheduled_time_end IS NULL
ORDER BY scheduled_date, scheduled_time_start;

-- Step 2: Find duplicate schedules on same date/time for same ticket
SELECT
    s1.id as schedule_id_1,
    s2.id as schedule_id_2,
    s1.ticket_id,
    s1.scheduled_date,
    s1.scheduled_time_start,
    s1.scheduled_time_end as end_1,
    s2.scheduled_time_end as end_2,
    s1.schedule_status as status_1,
    s2.schedule_status as status_2
FROM service_schedules s1
JOIN service_schedules s2 ON s1.ticket_id = s2.ticket_id
    AND s1.scheduled_date = s2.scheduled_date
    AND s1.id != s2.id
ORDER BY s1.scheduled_date;

-- Step 3: DELETE the specific orphan schedule identified from console logs
-- (schedule with id 0decf9dc-2428-4acf-a51b-36591936829a has null end time)
-- UNCOMMENT AND RUN ONLY AFTER VERIFYING:
-- DELETE FROM service_schedules WHERE id = '0decf9dc-2428-4acf-a51b-36591936829a';

-- Step 4: Alternative - Delete all schedules with null end times
-- WARNING: Only run this if all null end time schedules are orphans
-- DELETE FROM service_schedules WHERE scheduled_time_end IS NULL;

SELECT 'Run Steps 1 and 2 first to verify orphan schedules before deleting' as instruction;
