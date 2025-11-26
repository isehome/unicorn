-- ============================================================
-- ADD PROJECT TODOS FIELDS
-- Ensures the project_todos table has extended fields used by UI
-- (description, due/do dates, importance, sort order).
-- Safe to run multiple times via IF NOT EXISTS guards.
-- ============================================================

BEGIN;

ALTER TABLE public.project_todos
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.project_todos
  ADD COLUMN IF NOT EXISTS due_by date;

ALTER TABLE public.project_todos
  ADD COLUMN IF NOT EXISTS do_by date;

ALTER TABLE public.project_todos
  ADD COLUMN IF NOT EXISTS importance text DEFAULT 'normal';

ALTER TABLE public.project_todos
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

-- Normalize defaults for legacy rows
ALTER TABLE public.project_todos
  ALTER COLUMN importance SET DEFAULT 'normal';

UPDATE public.project_todos
SET importance = 'normal'
WHERE importance IS NULL;

COMMIT;
