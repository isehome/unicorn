/**
 * API Endpoint: Get Bug Report Markdown Content from GitHub
 *
 * GET /api/bugs/markdown?path=bug-reports/2026-01/BR-xxx.md
 */

const { getBugReportContent } = require('./github');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { path } = req.query;

    if (!path) {
      return res.status(400).json({ error: 'path parameter is required' });
    }

    // Validate path is in bug-reports folder
    if (!path.startsWith('bug-reports/')) {
      return res.status(400).json({ error: 'Invalid path - must be in bug-reports folder' });
    }

    const content = await getBugReportContent(path);

    return res.status(200).json({
      success: true,
      path,
      content
    });

  } catch (error) {
    console.error('[bugs/markdown] Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch markdown content',
      message: error.message
    });
  }
};
