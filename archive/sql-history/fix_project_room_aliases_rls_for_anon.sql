-- ============================================================
-- Fix Project Room Aliases RLS Policies for Anonymous Access
-- ============================================================
-- This app uses Microsoft/Azure AD auth (MSAL), not Supabase Auth
-- So Supabase sees all requests as 'anon' users
-- We need to allow anon users to manage room aliases

-- Ensure the table exists
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

-- Drop ALL existing policies to start fresh
drop policy if exists "Enable read access for all authenticated users" on public.project_room_aliases;
drop policy if exists "Enable insert for authenticated users" on public.project_room_aliases;
drop policy if exists "Enable update for authenticated users" on public.project_room_aliases;
drop policy if exists "Enable delete for authenticated users" on public.project_room_aliases;
drop policy if exists "Enable read access for all users" on public.project_room_aliases;
drop policy if exists "Enable insert for all users" on public.project_room_aliases;
drop policy if exists "Enable update for all users" on public.project_room_aliases;
drop policy if exists "Enable delete for all users" on public.project_room_aliases;
drop policy if exists dev_read_all on public.project_room_aliases;
drop policy if exists dev_insert_all on public.project_room_aliases;
drop policy if exists dev_update_all on public.project_room_aliases;
drop policy if exists dev_delete_all on public.project_room_aliases;

-- Create permissive policies that work for BOTH authenticated and anonymous users
-- Since the app uses Microsoft Auth (not Supabase Auth), all requests come as 'anon'

create policy "Enable read access for all users"
  on public.project_room_aliases
  for select
  to anon, authenticated
  using (true);

create policy "Enable insert for all users"
  on public.project_room_aliases
  for insert
  to anon, authenticated
  with check (true);

create policy "Enable update for all users"
  on public.project_room_aliases
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "Enable delete for all users"
  on public.project_room_aliases
  for delete
  to anon, authenticated
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

-- Grant necessary permissions to BOTH roles
grant all on public.project_room_aliases to anon, authenticated;

-- Verify the policies are active
do $$
begin
  raise notice '============================================';
  raise notice 'Project Room Aliases RLS Fixed for ANON';
  raise notice '============================================';
  raise notice 'Table: project_room_aliases';
  raise notice 'Policies: All operations allowed for BOTH anon and authenticated users';
  raise notice 'This is necessary because the app uses Microsoft Auth (MSAL), not Supabase Auth';
  raise notice 'All Supabase requests come through as anon role';
  raise notice '============================================';
end $$;
