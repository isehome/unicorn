-- ============================================================
-- Public Issue + Vendor Tracking Portal Infrastructure
-- ============================================================
-- Creates access link tables, upload queues, and reminder helpers
-- for public issue sharing and vendor tracking submissions.

-- Ensure pgcrypto for hashing helpers
create extension if not exists "pgcrypto";

-- Generic touch helper for updated_at columns
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Deterministic SHA-256 helper for secret hashing
create or replace function public.sha256_hex(input text)
returns text as $$
  select encode(digest(coalesce(input, ''), 'sha256'), 'hex');
$$ language sql immutable;

-- Table: issue_public_access_links
create table if not exists public.issue_public_access_links (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  issue_stakeholder_tag_id uuid not null references public.issue_stakeholder_tags(id) on delete cascade,
  contact_email text not null,
  contact_name text,
  token_hash text not null unique,
  otp_hash text not null,
  otp_expires_at timestamptz not null,
  session_token_hash text,
  session_expires_at timestamptz,
  session_version integer not null default 0,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_notified_at timestamptz,
  last_verified_at timestamptz,
  verification_attempts integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint issue_public_access_unique_tag unique(issue_stakeholder_tag_id)
);
create index if not exists idx_issue_public_access_issue on public.issue_public_access_links(issue_id);
create index if not exists idx_issue_public_access_project on public.issue_public_access_links(project_id);
create index if not exists idx_issue_public_access_token on public.issue_public_access_links(token_hash);

create trigger trg_issue_public_access_touch
  before update on public.issue_public_access_links
  for each row execute function public.touch_updated_at();

-- Table: issue_external_uploads (quarantine queue)
create table if not exists public.issue_external_uploads (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  issue_public_access_link_id uuid references public.issue_public_access_links(id) on delete set null,
  stakeholder_name text,
  stakeholder_email text,
  file_name text not null,
  file_size bigint,
  mime_type text,
  storage_path text not null,
  status text not null default 'pending' check (status in ('pending','uploaded','awaiting_review','approved','rejected','failed')),
  submitted_at timestamptz not null default now(),
  uploaded_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text,
  review_notes text,
  sharepoint_drive_id text,
  sharepoint_item_id text,
  final_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_issue_external_uploads_issue on public.issue_external_uploads(issue_id);
create index if not exists idx_issue_external_uploads_status on public.issue_external_uploads(status);

create trigger trg_issue_external_uploads_touch
  before update on public.issue_external_uploads
  for each row execute function public.touch_updated_at();

-- Table: po_public_access_links (vendor portal tokens)
create table if not exists public.po_public_access_links (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  contact_email text,
  contact_name text,
  token_hash text not null unique,
  reminder_frequency interval not null default interval '1 day',
  reminder_grace interval not null default interval '1 day',
  last_reminder_sent_at timestamptz,
  reminders_paused boolean not null default false,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint po_public_access_unique unique(purchase_order_id)
);
create index if not exists idx_po_public_access_po on public.po_public_access_links(purchase_order_id);
create index if not exists idx_po_public_access_token on public.po_public_access_links(token_hash);

create trigger trg_po_public_access_touch
  before update on public.po_public_access_links
  for each row execute function public.touch_updated_at();

-- Table: po_public_tracking_submissions (audit vendor submissions)
create table if not exists public.po_public_tracking_submissions (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  po_public_access_link_id uuid references public.po_public_access_links(id) on delete set null,
  tracking_id uuid references public.shipment_tracking(id) on delete set null,
  contact_name text,
  contact_email text,
  carrier text not null,
  tracking_number text not null,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_po_tracking_submissions_po on public.po_public_tracking_submissions(po_id);

-- Auto revoke helper when issues are resolved/closed
create or replace function public.issue_public_links_auto_revoke()
returns trigger as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if lower(coalesce(new.status, '')) in ('resolved','closed','completed') then
      update public.issue_public_access_links
        set revoked_at = now()
      where issue_id = new.id
        and revoked_at is null;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_issue_public_links_auto_revoke
  after update on public.issues
  for each row execute function public.issue_public_links_auto_revoke();

-- Enable RLS + policies
alter table public.issue_public_access_links enable row level security;
alter table public.issue_external_uploads enable row level security;
alter table public.po_public_access_links enable row level security;
alter table public.po_public_tracking_submissions enable row level security;

-- Issue link policies
drop policy if exists issue_public_access_authenticated on public.issue_public_access_links;
create policy issue_public_access_authenticated on public.issue_public_access_links
  for all to authenticated using (true) with check (true);

-- Upload queue policies
drop policy if exists issue_external_uploads_authenticated on public.issue_external_uploads;
create policy issue_external_uploads_authenticated on public.issue_external_uploads
  for all to authenticated using (true) with check (true);

-- Vendor link policies
drop policy if exists po_public_access_authenticated on public.po_public_access_links;
create policy po_public_access_authenticated on public.po_public_access_links
  for all to authenticated using (true) with check (true);

-- Vendor submission policies
drop policy if exists po_public_tracking_authenticated on public.po_public_tracking_submissions;
create policy po_public_tracking_authenticated on public.po_public_tracking_submissions
  for all to authenticated using (true) with check (true);
