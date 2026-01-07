/**
 * Test endpoint to check environment variables
 * GET /api/bugs/test-env
 */

module.exports = async (req, res) => {
  const envCheck = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'SET (' + process.env.GEMINI_API_KEY.slice(0, 8) + '...)' : 'MISSING',
    GITHUB_TOKEN: process.env.GITHUB_TOKEN ? 'SET (' + process.env.GITHUB_TOKEN.slice(0, 8) + '...)' : 'MISSING',
    SUPABASE_URL: process.env.SUPABASE_URL ? 'SET' : (process.env.REACT_APP_SUPABASE_URL ? 'SET (REACT_APP)' : 'MISSING'),
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING',
  };

  // Test imports
  const importTests = {};

  try {
    require('@supabase/supabase-js');
    importTests['@supabase/supabase-js'] = 'OK';
  } catch (e) {
    importTests['@supabase/supabase-js'] = 'FAILED: ' + e.message;
  }

  try {
    require('@google/generative-ai');
    importTests['@google/generative-ai'] = 'OK';
  } catch (e) {
    importTests['@google/generative-ai'] = 'FAILED: ' + e.message;
  }

  try {
    require('./analyze');
    importTests['./analyze'] = 'OK';
  } catch (e) {
    importTests['./analyze'] = 'FAILED: ' + e.message;
  }

  try {
    require('./github');
    importTests['./github'] = 'OK';
  } catch (e) {
    importTests['./github'] = 'FAILED: ' + e.message;
  }

  try {
    require('../_graphMail');
    importTests['../_graphMail'] = 'OK';
  } catch (e) {
    importTests['../_graphMail'] = 'FAILED: ' + e.message;
  }

  return res.json({
    success: true,
    timestamp: new Date().toISOString(),
    environment: envCheck,
    imports: importTests,
    nodeVersion: process.version
  });
};
