-- What Orders records exist RIGHT NOW in the database?

SELECT
  ps.id as record_id,
  p.name as project_name,
  sr.name as role_name,
  c.full_name as contact_name,
  c.email,
  ps.created_at,
  'DELETE FROM project_stakeholders WHERE id = ''' || ps.id || ''';' as delete_command
FROM public.project_stakeholders ps
JOIN public.projects p ON ps.project_id = p.id
JOIN public.contacts c ON ps.contact_id = c.id
JOIN public.stakeholder_roles sr ON ps.stakeholder_role_id = sr.id
WHERE sr.name = 'Orders'
ORDER BY p.name, ps.created_at DESC;
