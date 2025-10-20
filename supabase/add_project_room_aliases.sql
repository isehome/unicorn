-- ============================================================
-- Project Room Aliases & Wire Drop Room Linking
-- ============================================================

-- Table: project_room_aliases
-- Stores alternate spellings / names for rooms on a per-project basis
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

alter table public.project_room_aliases
  drop constraint if exists project_room_aliases_created_by_fkey;

alter table public.project_room_aliases enable row level security;

drop policy if exists dev_read_all on public.project_room_aliases;
drop policy if exists dev_insert_all on public.project_room_aliases;
drop policy if exists dev_update_all on public.project_room_aliases;
drop policy if exists dev_delete_all on public.project_room_aliases;

create policy dev_read_all on public.project_room_aliases
  for select to anon, authenticated using (true);

create policy dev_insert_all on public.project_room_aliases
  for insert to authenticated with check (true);

create policy dev_update_all on public.project_room_aliases
  for update to authenticated using (true) with check (true);

create policy dev_delete_all on public.project_room_aliases
  for delete to authenticated using (true);

create index if not exists idx_project_room_aliases_room
  on public.project_room_aliases(project_room_id);

create index if not exists idx_project_room_aliases_project
  on public.project_room_aliases(project_id, normalized_alias);

drop trigger if exists trg_project_room_aliases_updated_at on public.project_room_aliases;
create trigger trg_project_room_aliases_updated_at
  before update on public.project_room_aliases
  for each row execute function public.update_updated_at_column();

-- ============================================================
-- Wire Drop linkage to canonical project rooms
-- ============================================================
alter table public.wire_drops
  add column if not exists project_room_id uuid references public.project_rooms(id) on delete set null;

create index if not exists idx_wire_drops_project_room
  on public.wire_drops(project_room_id);

-- Backfill existing wire drops where possible using exact normalized name match
update public.wire_drops wd
set project_room_id = pr.id
from public.project_rooms pr
where wd.project_room_id is null
  and pr.project_id = wd.project_id
  and pr.normalized_name = lower(trim(regexp_replace(wd.room_name, '\s+', ' ', 'g')));
