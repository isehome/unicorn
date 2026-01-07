/**
 * Bug Reports AI Processing - Manual Trigger
 * GET /api/process-bug-reports
 */

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  try {
    // Return basic info
    const info = {
      timestamp: new Date().toISOString(),
      method: req.method
    };

    // Check env vars
    info.env = {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'SET' : 'MISSING',
      GITHUB_TOKEN: process.env.GITHUB_TOKEN ? 'SET' : 'MISSING',
      SUPABASE_URL: (process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL) ? 'SET' : 'MISSING',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING'
    };

    // Try to query pending bugs
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    const { data, error } = await supabase
      .from('bug_reports')
      .select('id, status, description')
      .eq('status', 'pending')
      .limit(3);

    if (error) {
      info.query = { error: error.message };
    } else {
      info.query = { success: true, pendingBugs: data?.length || 0 };
      if (data?.length > 0) {
        info.bugs = data.map(b => ({
          id: b.id,
          description: b.description?.substring(0, 50) + '...'
        }));
      }
    }

    return res.json(info);
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
};
