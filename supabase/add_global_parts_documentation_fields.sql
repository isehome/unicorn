-- Add dedicated documentation fields to global_parts table
-- These fields provide structured storage for part documentation rather than
-- relying solely on the generic resource_links JSONB field.

-- Add schematic field (single link)
alter table if exists public.global_parts
  add column if not exists schematic_url text;

-- Add install manuals field (array of links)
alter table if exists public.global_parts
  add column if not exists install_manual_urls text[] default '{}';

-- Add technical manuals field (array of links)
alter table if exists public.global_parts
  add column if not exists technical_manual_urls text[] default '{}';

-- Add column comments for documentation
comment on column public.global_parts.schematic_url is
  'URL or link to the equipment schematic/wiring diagram';

comment on column public.global_parts.install_manual_urls is
  'Array of URLs for installation manuals and guides';

comment on column public.global_parts.technical_manual_urls is
  'Array of URLs for technical manuals, datasheets, and specifications';

-- Create indexes for better query performance if needed
create index if not exists idx_global_parts_schematic
  on public.global_parts(schematic_url)
  where schematic_url is not null;

-- Note: The existing resource_links JSONB field can still be used for additional
-- miscellaneous documents, but these dedicated fields provide clearer structure
-- for the most important documentation types.
