/**
 * Test endpoint to debug bug analysis
 * GET /api/test-bug-analyze
 */

const { requireAuth } = require('./_authMiddleware');

module.exports = async (req, res) => {
  // Auth required
  const user = await requireAuth(req, res);
  if (!user) return;

  const steps = [];

  try {
    steps.push('1. Starting test');

    // Test Supabase
    steps.push('2. Testing Supabase import');
    const { createClient } = require('@supabase/supabase-js');
    steps.push('2a. Supabase imported');

    const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.json({
        error: 'Missing Supabase env vars',
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseKey,
        steps
      });
    }
    steps.push('2b. Supabase env vars present');

    // Test Gemini
    steps.push('3. Testing Gemini import');
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    steps.push('3a. Gemini imported');

    if (!process.env.GEMINI_API_KEY) {
      return res.json({ error: 'Missing GEMINI_API_KEY', steps });
    }
    steps.push('3b. Gemini API key present');

    // Test analyze module
    steps.push('4. Testing analyze module import');
    const analyze = require('./bugs/analyze');
    steps.push('4a. Analyze module imported');
    steps.push('4b. Analyze exports: ' + Object.keys(analyze).join(', '));

    // Test github module
    steps.push('5. Testing github module import');
    const github = require('./bugs/github');
    steps.push('5a. Github module imported');

    // Test graphMail module
    steps.push('6. Testing graphMail module import');
    const graphMail = require('./_graphMail');
    steps.push('6a. GraphMail module imported');

    // Test process-bugs module
    steps.push('7. Testing process-bugs module import');
    const processBugs = require('./cron/process-bugs');
    steps.push('7a. Process-bugs module imported');
    steps.push('7b. Process-bugs type: ' + typeof processBugs);

    return res.json({
      success: true,
      message: 'All modules loaded successfully',
      steps,
      env: {
        hasSupabaseUrl: !!supabaseUrl,
        hasSupabaseKey: !!supabaseKey,
        hasGeminiKey: !!process.env.GEMINI_API_KEY,
        hasGithubToken: !!process.env.GITHUB_TOKEN,
        nodeVersion: process.version
      }
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message,
      stack: error.stack,
      steps
    });
  }
};
