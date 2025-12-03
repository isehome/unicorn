-- Migration: Add calendar integration fields to project_todos
-- Date: 2025-12-02
-- Description: Adds planned_hours for time estimation, do_by_time for start time,
--              and calendar_event_id for syncing todos with Microsoft Calendar events

-- Add planned_hours column (decimal to support partial hours like 1.5)
ALTER TABLE project_todos ADD COLUMN IF NOT EXISTS planned_hours decimal(4,2);

-- Add do_by_time to store the start time for calendar events (e.g., '09:00')
ALTER TABLE project_todos ADD COLUMN IF NOT EXISTS do_by_time time;

-- Add calendar_event_id to store the Microsoft Graph event ID for synced todos
ALTER TABLE project_todos ADD COLUMN IF NOT EXISTS calendar_event_id text;

-- Add comments for documentation
COMMENT ON COLUMN project_todos.planned_hours IS 'Estimated hours to complete the task (used for calendar event duration)';
COMMENT ON COLUMN project_todos.do_by_time IS 'Start time for the calendar event (defaults to 9:00 AM if not set)';
COMMENT ON COLUMN project_todos.calendar_event_id IS 'Microsoft Graph calendar event ID when synced to Outlook';

-- Create index for calendar lookups
CREATE INDEX IF NOT EXISTS idx_project_todos_calendar_event_id ON project_todos(calendar_event_id) WHERE calendar_event_id IS NOT NULL;
