-- Enable required extension for UUIDs
create extension if not exists "pgcrypto";

-- Profiles (optional, for future auth linkage)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text unique,
  created_at timestamptz default now()
);

-- Projects
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text,
  address text,
  phase text,
  start_date date,
  end_date date,
  assigned_technician uuid references public.profiles(id),
  wiring_diagram_url text,
  portal_proposal_url text,
  one_drive_photos text,
  one_drive_files text,
  one_drive_procurement text,
  created_at timestamptz default now()
);

-- Wire Drops
create table if not exists public.wire_drops (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  uid text not null,
  name text not null,
  location text,
  type text default 'CAT6',
  prewire_photo text,
  installed_photo text,
  created_at timestamptz default now()
);

-- Issues
create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  status text check (status in ('open','blocked','resolved')) default 'open',
  notes text,
  created_at timestamptz default now()
);

-- Issue photos (optional)
create table if not exists public.issue_photos (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  url text not null,
  created_at timestamptz default now()
);

-- Contacts
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  role text,
  email text,
  phone text,
  company text,
  created_at timestamptz default now()
);

-- Time logs (optional)
create table if not exists public.time_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  technician_id uuid references public.profiles(id),
  check_in timestamptz,
  check_out timestamptz,
  created_at timestamptz default now()
);

-- Stakeholders emails (optional)
create table if not exists public.project_stakeholders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  email text not null
);

-- RLS: allow reads for development (tighten later)
alter table public.projects enable row level security;
alter table public.wire_drops enable row level security;
alter table public.issues enable row level security;
alter table public.issue_photos enable row level security;
alter table public.contacts enable row level security;
alter table public.time_logs enable row level security;
alter table public.project_stakeholders enable row level security;

do $$ begin
  -- projects
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='projects' and policyname='dev_read_all'
  ) then
    create policy dev_read_all on public.projects
      for select to anon, authenticated using (true);
  end if;

  -- wire_drops
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='wire_drops' and policyname='dev_read_all'
  ) then
    create policy dev_read_all on public.wire_drops
      for select to anon, authenticated using (true);
  end if;

  -- issues
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='issues' and policyname='dev_read_all'
  ) then
    create policy dev_read_all on public.issues
      for select to anon, authenticated using (true);
  end if;

  -- issue_photos
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='issue_photos' and policyname='dev_read_all'
  ) then
    create policy dev_read_all on public.issue_photos
      for select to anon, authenticated using (true);
  end if;

  -- contacts
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='contacts' and policyname='dev_read_all'
  ) then
    create policy dev_read_all on public.contacts
      for select to anon, authenticated using (true);
  end if;

  -- time_logs
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='time_logs' and policyname='dev_read_all'
  ) then
    create policy dev_read_all on public.time_logs
      for select to anon, authenticated using (true);
  end if;

  -- project_stakeholders
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='project_stakeholders' and policyname='dev_read_all'
  ) then
    create policy dev_read_all on public.project_stakeholders
      for select to anon, authenticated using (true);
  end if;
end $$;

-- Lookup: wire_types
create table if not exists public.wire_types (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  active boolean default true,
  sort_order int default 0
);

alter table public.wire_types enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='wire_types' and policyname='dev_read_all'
  ) then
    create policy dev_read_all on public.wire_types
      for select to anon, authenticated using (true);
  end if;
end $$;

-- Dev write policies for inserts/updates during development
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='wire_drops' and policyname='dev_insert_all'
  ) then
    create policy dev_insert_all on public.wire_drops
      for insert to anon, authenticated with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='wire_drops' and policyname='dev_update_all'
  ) then
    create policy dev_update_all on public.wire_drops
      for update to anon, authenticated using (true) with check (true);
  end if;
end $$;
