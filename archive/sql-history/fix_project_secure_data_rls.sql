-- Fix RLS policies for project_secure_data table
-- The issue is that the broad "for all" policy isn't working correctly for INSERT operations

-- Drop existing policies
drop policy if exists "Secure data viewable by authenticated only" on public.project_secure_data;
drop policy if exists "Secure data editable by authenticated users" on public.project_secure_data;

-- Create more specific policies

-- SELECT policy - authenticated users can view all secure data
create policy "Secure data viewable by authenticated" 
  on public.project_secure_data
  for select 
  to authenticated 
  using (true);

-- INSERT policy - authenticated users can create secure data
create policy "Secure data insertable by authenticated" 
  on public.project_secure_data
  for insert 
  to authenticated 
  with check (true);

-- UPDATE policy - authenticated users can update secure data
create policy "Secure data updatable by authenticated" 
  on public.project_secure_data
  for update 
  to authenticated 
  using (true)
  with check (true);

-- DELETE policy - authenticated users can delete secure data
create policy "Secure data deletable by authenticated" 
  on public.project_secure_data
  for delete 
  to authenticated 
  using (true);
