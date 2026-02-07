/**
 * Bug Reports List API
 *
 * GET /api/bugs/list - List bug reports with filtering and pagination
 *
 * Query params:
 * - status: pending | processing | analyzed | pending_review | failed | fixed | all (default: all)
 * - page: page number (default: 1)
 * - limit: items per page (default: 20, max: 100)
 * - sort: created_at | processed_at | severity (default: created_at)
 * - order: asc | desc (default: desc)
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      status = 'all',
      page = 1,
      limit = 20,
      sort = 'created_at',
      order = 'desc'
    } = req.query;

    // Validate and sanitize params
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    // Validate sort column
    const allowedSorts = ['created_at', 'processed_at', 'ai_severity', 'reported_by_name'];
    const sortColumn = allowedSorts.includes(sort) ? sort : 'created_at';
    const ascending = order === 'asc';

    // Build query - exclude screenshot_base64 to reduce payload size
    let query = supabase
      .from('bug_reports')
      .select(`
        id,
        created_at,
        updated_at,
        reported_by_email,
        reported_by_name,
        url,
        user_agent,
        description,
        console_errors,
        status,
        processed_at,
        processing_error,
        bug_report_id,
        md_file_path,
        ai_summary,
        ai_severity,
        ai_suggested_files,
        ai_fix_prompt,
        pr_url,
        pr_number,
        branch_name,
        initial_email_sent_at,
        analysis_email_sent_at,
        fix_summary,
        fixed_at
      `, { count: 'exact' })
      .order(sortColumn, { ascending })
      .range(offset, offset + limitNum - 1);

    // Apply status filter
    if (status === 'all') {
      query = query.not('status', 'eq', 'fixed');
    } else if (status === 'fixed') {
      query = query.eq('status', 'fixed');
    } else {
      query = query.eq('status', status);
    }

    const { data: bugs, error, count } = await query;

    if (error) {
      console.error('[BugsList] Query error:', error);
      return res.status(500).json({ error: 'Failed to fetch bug reports', details: error.message });
    }

    // Get stats for the status counts
    const { data: statsData } = await supabase
      .from('bug_reports')
      .select('status')
      .then(({ data }) => {
        const stats = {
          pending: 0,
          processing: 0,
          analyzed: 0,
          pending_review: 0,
          failed: 0,
          fixed: 0,
          total: 0
        };
        if (data) {
          data.forEach(row => {
            stats[row.status] = (stats[row.status] || 0) + 1;
            if (row.status !== 'fixed') {
              stats.total++;
            }
          });
        }
        return { data: stats };
      });

    return res.json({
      success: true,
      bugs: bugs || [],
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limitNum)
      },
      stats: statsData
    });

  } catch (error) {
    console.error('[BugsList] Error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
