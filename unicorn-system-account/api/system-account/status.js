/**
 * /api/system-account/status.js
 * 
 * Returns the current status of the system account connection.
 */

const { getSystemAccountStatus } = require('../_systemGraph');

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
    const status = await getSystemAccountStatus();
    return res.status(200).json(status);
  } catch (error) {
    console.error('[SystemAccount] Status error:', error);
    return res.status(500).json({
      error: 'Failed to get system account status',
      details: error.message
    });
  }
};
