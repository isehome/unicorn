-- Service Reports Migration
-- Creates views and functions for service reporting

-- Service summary by customer view
CREATE OR REPLACE VIEW service_customer_summary AS
SELECT
  c.id as customer_id,
  c.full_name as customer_name,
  COUNT(DISTINCT t.id) as total_tickets,
  COUNT(DISTINCT CASE WHEN t.status = 'closed' THEN t.id END) as closed_tickets,
  COUNT(DISTINCT CASE WHEN t.status NOT IN ('closed', 'resolved') THEN t.id END) as open_tickets,
  COALESCE(SUM(EXTRACT(EPOCH FROM (stl.check_out - stl.check_in)) / 3600), 0) as total_hours,
  COALESCE(SUM(COALESCE(t.hourly_rate, 150) * EXTRACT(EPOCH FROM (stl.check_out - stl.check_in)) / 3600), 0) as total_labor_cost,
  COALESCE(SUM(stp.quantity_needed * stp.unit_cost), 0) as total_parts_cost,
  MIN(t.created_at) as first_ticket_date,
  MAX(t.created_at) as last_ticket_date
FROM contacts c
LEFT JOIN service_tickets t ON t.contact_id = c.id
LEFT JOIN service_time_logs stl ON stl.ticket_id = t.id AND stl.check_out IS NOT NULL
LEFT JOIN service_ticket_parts stp ON stp.ticket_id = t.id
GROUP BY c.id, c.full_name;

-- Service summary by technician view
CREATE OR REPLACE VIEW service_technician_summary AS
SELECT
  stl.technician_id,
  stl.technician_name,
  stl.technician_email,
  COUNT(DISTINCT stl.ticket_id) as tickets_worked,
  COUNT(*) as total_entries,
  COALESCE(SUM(EXTRACT(EPOCH FROM (stl.check_out - stl.check_in)) / 3600), 0) as total_hours,
  COALESCE(SUM(EXTRACT(EPOCH FROM (stl.check_out - stl.check_in)) / 60), 0)::INTEGER as total_minutes,
  DATE_TRUNC('month', stl.check_in) as month
FROM service_time_logs stl
WHERE stl.check_out IS NOT NULL
GROUP BY stl.technician_id, stl.technician_name, stl.technician_email, DATE_TRUNC('month', stl.check_in);

-- Function for flexible date-range service reports
CREATE OR REPLACE FUNCTION get_service_report(
  p_start_date DATE,
  p_end_date DATE,
  p_customer_id UUID DEFAULT NULL,
  p_technician_id UUID DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL
)
RETURNS TABLE (
  ticket_id UUID,
  ticket_number TEXT,
  title TEXT,
  status TEXT,
  priority TEXT,
  category TEXT,
  contact_id UUID,
  customer_name TEXT,
  assigned_to UUID,
  assigned_name TEXT,
  created_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  hourly_rate NUMERIC,
  total_minutes INTEGER,
  total_hours NUMERIC,
  labor_cost NUMERIC,
  parts_cost NUMERIC,
  total_cost NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id as ticket_id,
    t.ticket_number,
    t.title,
    t.status,
    t.priority,
    t.category,
    t.contact_id,
    COALESCE(t.customer_name, c.full_name) as customer_name,
    t.assigned_to,
    p.full_name as assigned_name,
    t.created_at,
    t.resolved_at,
    t.closed_at,
    COALESCE(t.hourly_rate, 150) as hourly_rate,
    COALESCE(time_summary.total_minutes, 0)::INTEGER as total_minutes,
    ROUND(COALESCE(time_summary.total_minutes, 0) / 60.0, 2)::NUMERIC as total_hours,
    ROUND(COALESCE(time_summary.total_minutes, 0) / 60.0 * COALESCE(t.hourly_rate, 150), 2)::NUMERIC as labor_cost,
    COALESCE(parts_summary.total_cost, 0)::NUMERIC as parts_cost,
    ROUND(
      (COALESCE(time_summary.total_minutes, 0) / 60.0 * COALESCE(t.hourly_rate, 150)) +
      COALESCE(parts_summary.total_cost, 0),
      2
    )::NUMERIC as total_cost
  FROM service_tickets t
  LEFT JOIN contacts c ON c.id = t.contact_id
  LEFT JOIN profiles p ON p.id = t.assigned_to
  LEFT JOIN (
    SELECT
      stl.ticket_id,
      SUM(
        EXTRACT(EPOCH FROM (stl.check_out - stl.check_in)) / 60
      )::INTEGER as total_minutes
    FROM service_time_logs stl
    WHERE stl.check_out IS NOT NULL
    GROUP BY stl.ticket_id
  ) time_summary ON time_summary.ticket_id = t.id
  LEFT JOIN (
    SELECT
      stp.ticket_id,
      SUM(stp.quantity_needed * stp.unit_cost) as total_cost
    FROM service_ticket_parts stp
    GROUP BY stp.ticket_id
  ) parts_summary ON parts_summary.ticket_id = t.id
  WHERE
    t.created_at >= p_start_date
    AND t.created_at < (p_end_date + INTERVAL '1 day')
    AND (p_customer_id IS NULL OR t.contact_id = p_customer_id)
    AND (p_technician_id IS NULL OR t.assigned_to = p_technician_id)
    AND (p_category IS NULL OR t.category = p_category)
    AND (p_status IS NULL OR t.status = p_status)
  ORDER BY t.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get service summary totals
CREATE OR REPLACE FUNCTION get_service_summary(
  p_start_date DATE,
  p_end_date DATE,
  p_customer_id UUID DEFAULT NULL,
  p_technician_id UUID DEFAULT NULL
)
RETURNS TABLE (
  total_tickets BIGINT,
  closed_tickets BIGINT,
  open_tickets BIGINT,
  total_hours NUMERIC,
  total_labor_cost NUMERIC,
  total_parts_cost NUMERIC,
  total_revenue NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT t.id)::BIGINT as total_tickets,
    COUNT(DISTINCT CASE WHEN t.status = 'closed' THEN t.id END)::BIGINT as closed_tickets,
    COUNT(DISTINCT CASE WHEN t.status NOT IN ('closed', 'resolved') THEN t.id END)::BIGINT as open_tickets,
    ROUND(COALESCE(SUM(
      EXTRACT(EPOCH FROM (stl.check_out - stl.check_in)) / 3600
    ), 0), 2)::NUMERIC as total_hours,
    ROUND(COALESCE(SUM(
      EXTRACT(EPOCH FROM (stl.check_out - stl.check_in)) / 3600 * COALESCE(t.hourly_rate, 150)
    ), 0), 2)::NUMERIC as total_labor_cost,
    ROUND(COALESCE(SUM(parts.total_cost), 0), 2)::NUMERIC as total_parts_cost,
    ROUND(
      COALESCE(SUM(
        EXTRACT(EPOCH FROM (stl.check_out - stl.check_in)) / 3600 * COALESCE(t.hourly_rate, 150)
      ), 0) +
      COALESCE(SUM(parts.total_cost), 0),
      2
    )::NUMERIC as total_revenue
  FROM service_tickets t
  LEFT JOIN service_time_logs stl ON stl.ticket_id = t.id AND stl.check_out IS NOT NULL
  LEFT JOIN (
    SELECT
      stp.ticket_id,
      SUM(stp.quantity_needed * stp.unit_cost) as total_cost
    FROM service_ticket_parts stp
    GROUP BY stp.ticket_id
  ) parts ON parts.ticket_id = t.id
  WHERE
    t.created_at >= p_start_date
    AND t.created_at < (p_end_date + INTERVAL '1 day')
    AND (p_customer_id IS NULL OR t.contact_id = p_customer_id)
    AND (p_technician_id IS NULL OR t.assigned_to = p_technician_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get monthly service overview
CREATE OR REPLACE FUNCTION get_service_monthly_overview(
  p_year INTEGER,
  p_month INTEGER
)
RETURNS TABLE (
  day_of_month INTEGER,
  tickets_created BIGINT,
  tickets_closed BIGINT,
  hours_worked NUMERIC
) AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
BEGIN
  v_start_date := make_date(p_year, p_month, 1);
  v_end_date := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  RETURN QUERY
  SELECT
    EXTRACT(DAY FROM d.day)::INTEGER as day_of_month,
    COALESCE(ticket_counts.created, 0)::BIGINT as tickets_created,
    COALESCE(ticket_counts.closed, 0)::BIGINT as tickets_closed,
    ROUND(COALESCE(time_totals.hours, 0), 2)::NUMERIC as hours_worked
  FROM generate_series(v_start_date, v_end_date, '1 day'::INTERVAL) as d(day)
  LEFT JOIN (
    SELECT
      DATE(t.created_at) as created_date,
      COUNT(*) as created,
      COUNT(CASE WHEN t.status = 'closed' AND DATE(t.closed_at) = DATE(t.created_at) THEN 1 END) as closed
    FROM service_tickets t
    WHERE t.created_at >= v_start_date AND t.created_at <= v_end_date + INTERVAL '1 day'
    GROUP BY DATE(t.created_at)
  ) ticket_counts ON ticket_counts.created_date = d.day::DATE
  LEFT JOIN (
    SELECT
      DATE(stl.check_in) as work_date,
      SUM(EXTRACT(EPOCH FROM (stl.check_out - stl.check_in)) / 3600) as hours
    FROM service_time_logs stl
    WHERE stl.check_out IS NOT NULL
      AND stl.check_in >= v_start_date
      AND stl.check_in <= v_end_date + INTERVAL '1 day'
    GROUP BY DATE(stl.check_in)
  ) time_totals ON time_totals.work_date = d.day::DATE
  ORDER BY d.day;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get technician hours by date range
CREATE OR REPLACE FUNCTION get_technician_hours_report(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  technician_id UUID,
  technician_name TEXT,
  technician_email TEXT,
  tickets_worked BIGINT,
  total_entries BIGINT,
  total_hours NUMERIC,
  total_minutes INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    stl.technician_id,
    stl.technician_name,
    stl.technician_email,
    COUNT(DISTINCT stl.ticket_id)::BIGINT as tickets_worked,
    COUNT(*)::BIGINT as total_entries,
    ROUND(SUM(EXTRACT(EPOCH FROM (stl.check_out - stl.check_in)) / 3600), 2)::NUMERIC as total_hours,
    SUM(EXTRACT(EPOCH FROM (stl.check_out - stl.check_in)) / 60)::INTEGER as total_minutes
  FROM service_time_logs stl
  WHERE stl.check_out IS NOT NULL
    AND stl.check_in >= p_start_date
    AND stl.check_in < (p_end_date + INTERVAL '1 day')
  GROUP BY stl.technician_id, stl.technician_name, stl.technician_email
  ORDER BY total_hours DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get customer hours by date range
CREATE OR REPLACE FUNCTION get_customer_hours_report(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  contact_id UUID,
  customer_name TEXT,
  total_tickets BIGINT,
  total_hours NUMERIC,
  total_labor_cost NUMERIC,
  total_parts_cost NUMERIC,
  total_cost NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.contact_id,
    COALESCE(t.customer_name, c.full_name) as customer_name,
    COUNT(DISTINCT t.id)::BIGINT as total_tickets,
    ROUND(COALESCE(SUM(
      EXTRACT(EPOCH FROM (stl.check_out - stl.check_in)) / 3600
    ), 0), 2)::NUMERIC as total_hours,
    ROUND(COALESCE(SUM(
      EXTRACT(EPOCH FROM (stl.check_out - stl.check_in)) / 3600 * COALESCE(t.hourly_rate, 150)
    ), 0), 2)::NUMERIC as total_labor_cost,
    ROUND(COALESCE(SUM(parts.total_cost), 0), 2)::NUMERIC as total_parts_cost,
    ROUND(
      COALESCE(SUM(
        EXTRACT(EPOCH FROM (stl.check_out - stl.check_in)) / 3600 * COALESCE(t.hourly_rate, 150)
      ), 0) +
      COALESCE(SUM(parts.total_cost), 0),
      2
    )::NUMERIC as total_cost
  FROM service_tickets t
  LEFT JOIN contacts c ON c.id = t.contact_id
  LEFT JOIN service_time_logs stl ON stl.ticket_id = t.id AND stl.check_out IS NOT NULL
  LEFT JOIN (
    SELECT
      stp.ticket_id,
      SUM(stp.quantity_needed * stp.unit_cost) as total_cost
    FROM service_ticket_parts stp
    GROUP BY stp.ticket_id
  ) parts ON parts.ticket_id = t.id
  WHERE
    t.created_at >= p_start_date
    AND t.created_at < (p_end_date + INTERVAL '1 day')
  GROUP BY t.contact_id, COALESCE(t.customer_name, c.full_name)
  HAVING COUNT(DISTINCT t.id) > 0
  ORDER BY total_cost DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT SELECT ON service_customer_summary TO authenticated;
GRANT SELECT ON service_technician_summary TO authenticated;
GRANT EXECUTE ON FUNCTION get_service_report TO authenticated;
GRANT EXECUTE ON FUNCTION get_service_summary TO authenticated;
GRANT EXECUTE ON FUNCTION get_service_monthly_overview TO authenticated;
GRANT EXECUTE ON FUNCTION get_technician_hours_report TO authenticated;
GRANT EXECUTE ON FUNCTION get_customer_hours_report TO authenticated;
