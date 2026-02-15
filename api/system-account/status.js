/**
 * System Account Status
 *
 * Endpoint: GET /api/system-account/status
 * Returns the status of the system account configuration
 */

const { requireAuth } = require('../_authMiddleware');
const { getSystemAccountStatus } = require('../_systemGraph');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth required for internal system-account endpoints
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const status = await getSystemAccountStatus();
    res.json(status);
  } catch (err) {
    console.error('[SystemAccount] Status error:', err);
    res.status(500).json({
      connected: false,
      healthy: false,
      error: err.message,
    });
  }
};
