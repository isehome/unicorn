-- Convert all 21 SECURITY DEFINER views to SECURITY INVOKER
-- PG17 supports ALTER VIEW ... SET (security_invoker = on)
-- This makes views respect the querying user's RLS policies instead of the view creator's.
--
-- Safe because:
-- - 18 plain views: only SELECT/JOIN, no privileged access needed
-- - 3 decrypted views: call decrypt_field() which is itself SECURITY DEFINER,
--   so vault access is preserved through the function, not the view

-- Plain views (18)
ALTER VIEW public.service_technician_summary SET (security_invoker = on);
ALTER VIEW public.issue_stakeholder_tags_detailed SET (security_invoker = on);
ALTER VIEW public.issues_with_stats SET (security_invoker = on);
ALTER VIEW public.project_equipment_global_parts SET (security_invoker = on);
ALTER VIEW public.wire_drops_with_network_info SET (security_invoker = on);
ALTER VIEW public.project_milestone_status SET (security_invoker = on);
ALTER VIEW public.purchase_orders_summary SET (security_invoker = on);
ALTER VIEW public.project_equipment_with_rooms SET (security_invoker = on);
ALTER VIEW public.v_employee_review_status SET (security_invoker = on);
ALTER VIEW public.shade_procurement_summary SET (security_invoker = on);
ALTER VIEW public.service_customer_summary SET (security_invoker = on);
ALTER VIEW public.customer_service_history SET (security_invoker = on);
ALTER VIEW public.equipment_for_po SET (security_invoker = on);
ALTER VIEW public.searchable_contacts SET (security_invoker = on);
ALTER VIEW public.project_contacts_view SET (security_invoker = on);
ALTER VIEW public.time_logs_active SET (security_invoker = on);
ALTER VIEW public.time_logs_summary SET (security_invoker = on);
ALTER VIEW public.project_stakeholders_detailed SET (security_invoker = on);

-- Decrypted views (3) — decrypt_field() is SECURITY DEFINER, so vault access preserved
ALTER VIEW public.project_secure_data_decrypted SET (security_invoker = on);
ALTER VIEW public.project_home_assistant_decrypted SET (security_invoker = on);
ALTER VIEW public.contact_secure_data_decrypted SET (security_invoker = on);
