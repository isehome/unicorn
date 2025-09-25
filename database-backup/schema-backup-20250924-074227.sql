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
  uid text not null default gen_random_uuid()::text,
  name text not null,
  location text,
  type text default 'CAT6',
  prewire_photo text,
  installed_photo text,
  created_at timestamptz default now(),
  constraint wire_drops_uid_key unique (uid)
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

-- Project to-dos
create table if not exists public.project_todos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  is_complete boolean default false,
  created_at timestamptz default now()
);

-- Issue photos (optional)
create table if not exists public.issue_photos (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  url text not null,
  created_at timestamptz default now()
);

-- Issue contact tags (people tagged on issues)
create table if not exists public.issue_contacts (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz default now(),
  constraint issue_contacts_unique unique (issue_id, contact_id)
);

-- Stakeholder roles (internal/external buckets)
create table if not exists public.stakeholder_roles (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  category text not null check (category in ('internal','external')),
  description text,
  auto_issue_default boolean default false,
  created_at timestamptz default now()
);

-- Default stakeholders applied to new projects
create table if not exists public.stakeholder_defaults (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.stakeholder_roles(id) on delete cascade,
  full_name text,
  email text not null,
  profile_id uuid references public.profiles(id) on delete set null,
  is_internal boolean not null default true,
  active boolean not null default true,
  created_at timestamptz default now()
);

-- Project internal stakeholder assignments
create table if not exists public.project_internal_stakeholders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  role_id uuid not null references public.stakeholder_roles(id) on delete cascade,
  -- New unified linkage to contacts table (added via alter below if table already exists)
  contact_id uuid references public.contacts(id) on delete cascade,
  full_name text,
  email text,
  profile_id uuid references public.profiles(id) on delete set null,
  is_primary boolean default false,
  created_at timestamptz default now(),
  constraint project_internal_stakeholders_unique unique (project_id, role_id)
);

-- Project external stakeholder assignments (maps contacts to roles)
create table if not exists public.project_external_stakeholders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  role_id uuid not null references public.stakeholder_roles(id) on delete cascade,
  is_primary boolean default false,
  created_at timestamptz default now(),
  constraint project_external_stakeholders_unique unique (project_id, contact_id, role_id)
);

-- Contacts
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  first_name text,
  last_name text,
  name text not null,
  role text,
  email text,
  phone text,
  company text,
  address text,
  report boolean default false,
  stakeholder_role_id uuid references public.stakeholder_roles(id),
  is_internal boolean not null default false,
  is_primary boolean not null default false,
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
alter table public.project_todos enable row level security;
alter table public.issue_photos enable row level security;
alter table public.issue_contacts enable row level security;
alter table public.contacts enable row level security;
alter table public.time_logs enable row level security;
alter table public.project_stakeholders enable row level security;
alter table public.stakeholder_roles enable row level security;
alter table public.stakeholder_defaults enable row level security;
alter table public.project_internal_stakeholders enable row level security;
alter table public.project_external_stakeholders enable row level security;

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
  begin
    alter table public.wire_drops alter column uid set default gen_random_uuid()::text;
  exception when others then
    null;
  end;
  if not exists (
    select 1 from pg_constraint where conname = 'wire_drops_uid_key'
  ) then
    alter table public.wire_drops add constraint wire_drops_uid_key unique (uid);
  end if;

  -- issues
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='issues' and policyname='dev_read_all'
  ) then
    create policy dev_read_all on public.issues
      for select to anon, authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='issues' and policyname='dev_insert_all'
  ) then
    create policy dev_insert_all on public.issues
      for insert to anon, authenticated with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='issues' and policyname='dev_update_all'
  ) then
    create policy dev_update_all on public.issues
      for update to anon, authenticated using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='issues' and policyname='dev_delete_all'
  ) then
    create policy dev_delete_all on public.issues
      for delete to authenticated using (true);
  end if;

  -- project_todos
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='project_todos' and policyname='dev_read_all'
  ) then
    create policy dev_read_all on public.project_todos
      for select to anon, authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='project_todos' and policyname='dev_insert_all'
  ) then
    create policy dev_insert_all on public.project_todos
      for insert to anon, authenticated with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='project_todos' and policyname='dev_update_all'
  ) then
    create policy dev_update_all on public.project_todos
      for update to anon, authenticated using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='project_todos' and policyname='dev_delete_all'
  ) then
    create policy dev_delete_all on public.project_todos
      for delete to anon, authenticated using (true);
  end if;

  -- issue_photos
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='issue_photos' and policyname='dev_read_all'
  ) then
    create policy dev_read_all on public.issue_photos
      for select to anon, authenticated using (true);
  end if;

  -- issue_contacts
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='issue_contacts' and policyname='dev_read_all'
  ) then
    create policy dev_read_all on public.issue_contacts
      for select to anon, authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='issue_contacts' and policyname='dev_insert_all'
  ) then
    create policy dev_insert_all on public.issue_contacts
      for insert to anon, authenticated with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='issue_contacts' and policyname='dev_delete_all'
  ) then
    create policy dev_delete_all on public.issue_contacts
      for delete to anon, authenticated using (true);
  end if;

  -- contacts
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='contacts' and policyname='dev_read_all'
  ) then
    create policy dev_read_all on public.contacts
      for select to anon, authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='contacts' and policyname='dev_insert_all'
  ) then
    create policy dev_insert_all on public.contacts
      for insert to anon, authenticated with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='contacts' and policyname='dev_update_all'
  ) then
    create policy dev_update_all on public.contacts
      for update to anon, authenticated using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='contacts' and policyname='dev_delete_all'
  ) then
    create policy dev_delete_all on public.contacts
      for delete to authenticated using (true);
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

  -- stakeholder_roles
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='stakeholder_roles' and policyname='dev_read_all'
  ) then
    create policy dev_read_all on public.stakeholder_roles
      for select to anon, authenticated using (true);
  end if;

  -- stakeholder_defaults
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='stakeholder_defaults' and policyname='dev_read_all'
  ) then
    create policy dev_read_all on public.stakeholder_defaults
      for select to anon, authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='stakeholder_defaults' and policyname='dev_insert_all'
  ) then
    create policy dev_insert_all on public.stakeholder_defaults
      for insert to anon, authenticated with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='stakeholder_defaults' and policyname='dev_update_all'
  ) then
    create policy dev_update_all on public.stakeholder_defaults
      for update to anon, authenticated using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='stakeholder_defaults' and policyname='dev_delete_all'
  ) then
    create policy dev_delete_all on public.stakeholder_defaults
      for delete to anon, authenticated using (true);
  end if;

  -- project_internal_stakeholders
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='project_internal_stakeholders' and policyname='dev_read_all'
  ) then
    create policy dev_read_all on public.project_internal_stakeholders
      for select to anon, authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='project_internal_stakeholders' and policyname='dev_insert_all'
  ) then
    create policy dev_insert_all on public.project_internal_stakeholders
      for insert to anon, authenticated with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='project_internal_stakeholders' and policyname='dev_update_all'
  ) then
    create policy dev_update_all on public.project_internal_stakeholders
      for update to anon, authenticated using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='project_internal_stakeholders' and policyname='dev_delete_all'
  ) then
    create policy dev_delete_all on public.project_internal_stakeholders
      for delete to anon, authenticated using (true);
  end if;

  -- project_external_stakeholders
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='project_external_stakeholders' and policyname='dev_read_all'
  ) then
    create policy dev_read_all on public.project_external_stakeholders
      for select to anon, authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='project_external_stakeholders' and policyname='dev_insert_all'
  ) then
    create policy dev_insert_all on public.project_external_stakeholders
      for insert to anon, authenticated with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='project_external_stakeholders' and policyname='dev_update_all'
  ) then
    create policy dev_update_all on public.project_external_stakeholders
      for update to anon, authenticated using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='project_external_stakeholders' and policyname='dev_delete_all'
  ) then
    create policy dev_delete_all on public.project_external_stakeholders
      for delete to anon, authenticated using (true);
  end if;
end $$;

-- Migration-safe: ensure contact_id exists on internal stakeholders and backfill from email
do $$ begin
  begin
    alter table public.project_internal_stakeholders add column if not exists contact_id uuid references public.contacts(id) on delete cascade;
  exception when others then null;
  end;
  -- Backfill contact_id by matching email if possible
  begin
    update public.project_internal_stakeholders pis
    set contact_id = c.id
    from public.contacts c
    where pis.contact_id is null
      and pis.email is not null
      and c.email is not null
      and lower(c.email) = lower(pis.email);
  exception when others then null;
  end;
end $$;

-- Roles lookup for contact roles
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  active boolean default true,
  sort_order int default 0
);

alter table public.roles enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='roles' and policyname='dev_read_all'
  ) then
    create policy dev_read_all on public.roles for select to anon, authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='roles' and policyname='dev_insert_all'
  ) then
    create policy dev_insert_all on public.roles for insert to anon, authenticated with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='roles' and policyname='dev_update_all'
  ) then
    create policy dev_update_all on public.roles for update to anon, authenticated using (true) with check (true);
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
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='wire_types' and policyname='dev_insert_all'
  ) then
    create policy dev_insert_all on public.wire_types
      for insert to anon, authenticated with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='wire_types' and policyname='dev_update_all'
  ) then
    create policy dev_update_all on public.wire_types
      for update to anon, authenticated using (true) with check (true);
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
