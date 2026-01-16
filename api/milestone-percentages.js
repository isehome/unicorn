/**
 * Milestone Percentages API Endpoint
 *
 * Returns calculated milestone percentages for a project.
 * This is the SINGLE SOURCE OF TRUTH for milestone data.
 *
 * Usage:
 *   GET /api/milestone-percentages?projectId={uuid}
 *
 * Response:
 *   {
 *     "success": true,
 *     "percentages": {
 *       "planning_design": 100,
 *       "prewire_orders": 75,
 *       "prewire_receiving": 50,
 *       "prewire": 80,
 *       "prewire_phase": { "percentage": 68, "orders": {...}, "receiving": {...}, "stages": {...} },
 *       "trim_orders": 0,
 *       "trim_receiving": 0,
 *       "trim": 0,
 *       "trim_phase": { "percentage": 0, "orders": {...}, "receiving": {...}, "stages": {...} },
 *       "commissioning": 0
 *     }
 *   }
 */

const { calculateAllMilestones } = require('./_milestoneCalculations');

module.exports = async function handler(req, res) {
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

  const { projectId } = req.query;

  if (!projectId) {
    return res.status(400).json({
      success: false,
      error: 'projectId query parameter is required'
    });
  }

  try {
    const percentages = await calculateAllMilestones(projectId);

    return res.status(200).json({
      success: true,
      projectId,
      calculatedAt: new Date().toISOString(),
      percentages
    });
  } catch (error) {
    console.error('Error calculating milestone percentages:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to calculate milestone percentages',
      details: error.message
    });
  }
};
