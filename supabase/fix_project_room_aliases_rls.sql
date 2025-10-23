-- ============================================================
-- Fix Project Room Aliases RLS Policies
-- ============================================================
-- This ensures the project_room_aliases table exists with proper
-- RLS policies that allow authenticated users to manage room aliases

-- Ensure the table exists with all required columns
create table if not exists public.project_room_aliases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  project_room_id uuid not null references public.project_rooms(id) on delete cascade,
  alias text not null,
  normalized_alias text generated always as (
    lower(trim(regexp_replace(alias, '\s+', ' ', 'g')))
  ) stored,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint project_room_aliases_unique unique (project_id, normalized_alias)
);

-- Enable RLS
alter table public.project_room_aliases enable row level security;

-- Drop existing policies to ensure clean slate
drop policy if exists "Enable read access for all authenticated users" on public.project_room_aliases;
drop policy if exists "Enable insert for authenticated users" on public.project_room_aliases;
drop policy if exists "Enable update for authenticated users" on public.project_room_aliases;
drop policy if exists "Enable delete for authenticated users" on public.project_room_aliases;
drop policy if exists dev_read_all on public.project_room_aliases;
drop policy if exists dev_insert_all on public.project_room_aliases;
drop policy if exists dev_update_all on public.project_room_aliases;
drop policy if exists dev_delete_all on public.project_room_aliases;

-- Create comprehensive policies for authenticated users
-- These policies allow any authenticated user to manage room aliases
create policy "Enable read access for all authenticated users"
  on public.project_room_aliases
  for select
  to authenticated, anon
  using (true);

create policy "Enable insert for authenticated users"
  on public.project_room_aliases
  for insert
  to authenticated
  with check (true);

create policy "Enable update for authenticated users"
  on public.project_room_aliases
  for update
  to authenticated
  using (true)
  with check (true);

create policy "Enable delete for authenticated users"
  on public.project_room_aliases
  for delete
  to authenticated
  using (true);

-- Create indexes for performance
create index if not exists idx_project_room_aliases_room
  on public.project_room_aliases(project_room_id);

create index if not exists idx_project_room_aliases_project
  on public.project_room_aliases(project_id, normalized_alias);

create index if not exists idx_project_room_aliases_normalized
  on public.project_room_aliases(normalized_alias);

-- Create updated_at trigger
drop trigger if exists trg_project_room_aliases_updated_at on public.project_room_aliases;
create trigger trg_project_room_aliases_updated_at
  before update on public.project_room_aliases
  for each row execute function public.update_updated_at_column();

-- Grant necessary permissions
grant all on public.project_room_aliases to authenticated;
grant select on public.project_room_aliases to anon;

-- Verify the policies are active
do $$
begin
  raise notice 'Project room aliases RLS policies have been updated';
  raise notice 'Table: project_room_aliases';
  raise notice 'Policies: Read (all), Insert (authenticated), Update (authenticated), Delete (authenticated)';
end $$;
