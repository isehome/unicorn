-- ============================================================
-- UPDATE PO NUMBER FORMAT TO INCLUDE PROJECT NAME
-- Run this migration in Supabase SQL Editor
--
-- Changes PO number format from:
--   PO-2024-001-AMZ-001
-- To:
--   ProjectName-PO-2024-001-AMZ-001
-- ============================================================

-- Drop and recreate the function with project_id parameter
create or replace function public.generate_po_number(
  p_supplier_id uuid,
  p_project_id uuid default null
)
returns text
language plpgsql
security definer
as $$
declare
  v_year integer;
  v_sequence integer;
  v_supplier_code text;
  v_supplier_sequence integer;
  v_project_name text;
  v_project_prefix text;
  v_po_number text;
begin
  v_year := extract(year from current_date);

  -- Get or increment global sequence for this year
  insert into public.po_sequence (year, sequence)
  values (v_year, 1)
  on conflict (year)
  do update set sequence = po_sequence.sequence + 1
  returning sequence into v_sequence;

  -- Get supplier short code
  select short_code into v_supplier_code
  from public.suppliers
  where id = p_supplier_id;

  if v_supplier_code is null then
    raise exception 'Supplier not found';
  end if;

  -- Get supplier-specific sequence for this year
  select count(*) + 1 into v_supplier_sequence
  from public.purchase_orders
  where supplier_id = p_supplier_id
    and extract(year from created_at) = v_year;

  -- Get project name if project_id is provided
  if p_project_id is not null then
    select name into v_project_name
    from public.projects
    where id = p_project_id;

    if v_project_name is not null then
      -- Create a clean prefix from the project name:
      -- - Remove special characters except alphanumeric and spaces
      -- - Replace spaces with nothing (concatenate words)
      -- - Take first 20 chars max to keep PO number reasonable
      v_project_prefix := regexp_replace(v_project_name, '[^a-zA-Z0-9 ]', '', 'g');
      v_project_prefix := regexp_replace(v_project_prefix, '\s+', '', 'g');
      v_project_prefix := left(v_project_prefix, 20);
    end if;
  end if;

  -- Format PO number with or without project prefix
  if v_project_prefix is not null and v_project_prefix != '' then
    v_po_number := format('%s-PO-%s-%s-%s-%s',
      v_project_prefix,
      v_year,
      lpad(v_sequence::text, 3, '0'),
      upper(v_supplier_code),
      lpad(v_supplier_sequence::text, 3, '0')
    );
  else
    -- Fallback to original format if no project
    v_po_number := format('PO-%s-%s-%s-%s',
      v_year,
      lpad(v_sequence::text, 3, '0'),
      upper(v_supplier_code),
      lpad(v_supplier_sequence::text, 3, '0')
    );
  end if;

  return v_po_number;
end;
$$;

-- Verify the function was updated
do $$
begin
  raise notice '✅ generate_po_number function updated!';
  raise notice 'New format: ProjectName-PO-YYYY-NNN-SUP-NNN';
  raise notice '';
  raise notice 'The function now accepts an optional p_project_id parameter.';
  raise notice 'If provided, the project name will be prepended to the PO number.';
end $$;
