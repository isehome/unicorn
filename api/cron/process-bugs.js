/**
 * Bug Reports AI Processing Cron Job
 *
 * Runs every 3 minutes to process pending bug reports with Gemini AI.
 */

// Simple test first - just return env status
module.exports = async (req, res) => {
  try {
    // Test 1: Return basic info
    const info = {
      timestamp: new Date().toISOString(),
      method: req.method,
      nodeVersion: process.version
    };

    // Test 2: Check env vars
    info.env = {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'SET' : 'MISSING',
      GITHUB_TOKEN: process.env.GITHUB_TOKEN ? 'SET' : 'MISSING',
      SUPABASE_URL: (process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL) ? 'SET' : 'MISSING',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING'
    };

    // Test 3: Try to import supabase
    try {
      const { createClient } = require('@supabase/supabase-js');
      info.imports = { supabase: 'OK' };

      // Test 4: Try to create client
      try {
        const supabase = createClient(
          process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
          { auth: { persistSession: false } }
        );
        info.supabaseClient = 'CREATED';

        // Test 5: Try to query
        try {
          const { data, error } = await supabase
            .from('bug_reports')
            .select('id, status')
            .eq('status', 'pending')
            .limit(1);

          if (error) {
            info.query = { error: error.message };
          } else {
            info.query = { success: true, count: data?.length || 0 };
          }
        } catch (queryErr) {
          info.query = { error: queryErr.message };
        }
      } catch (clientErr) {
        info.supabaseClient = 'FAILED: ' + clientErr.message;
      }
    } catch (importErr) {
      info.imports = { supabase: 'FAILED: ' + importErr.message };
    }

    // Test 6: Try to import Gemini
    try {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      info.imports = info.imports || {};
      info.imports.gemini = 'OK';
    } catch (geminiErr) {
      info.imports = info.imports || {};
      info.imports.gemini = 'FAILED: ' + geminiErr.message;
    }

    return res.json(info);
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
};
