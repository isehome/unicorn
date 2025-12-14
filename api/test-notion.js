/**
 * Test Notion Connection Endpoint
 *
 * Used to verify that the Notion integration is properly configured.
 * Visit: https://your-app.vercel.app/api/test-notion
 */

// Static require to force Vercel to bundle the module
// (dynamic imports are not traced by Vercel's bundler)
const { Client } = require('@notionhq/client');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Check if API key is configured
  const apiKey = process.env.NOTION_API_KEY;

  if (!apiKey) {
    return res.status(200).json({
      success: false,
      error: 'NOTION_API_KEY not configured',
      hint: 'Add NOTION_API_KEY to your Vercel environment variables. Get it from https://www.notion.so/my-integrations',
      steps: [
        '1. Go to https://www.notion.so/my-integrations',
        '2. Create a new integration called "Unicorn Copilot"',
        '3. Copy the Internal Integration Secret',
        '4. Go to Vercel project settings → Environment Variables',
        '5. Add NOTION_API_KEY with the secret value',
        '6. Redeploy or wait for next deploy'
      ]
    });
  }

  // API key exists - try to use Notion
  try {
    const notion = new Client({ auth: apiKey });

    // Try to search for anything - this tests the connection
    const response = await notion.search({
      query: '',
      page_size: 5
    });

    const pageCount = response.results.length;
    const pageNames = response.results.map(page => {
      const titleProp = page.properties?.Name || page.properties?.title || page.properties?.Title;
      if (titleProp?.title?.[0]?.plain_text) {
        return titleProp.title[0].plain_text;
      }
      return 'Untitled';
    });

    return res.status(200).json({
      success: true,
      message: 'Notion connection working!',
      pagesAccessible: pageCount > 0,
      pageCount: pageCount,
      samplePages: pageNames.slice(0, 3),
      hint: pageCount === 0
        ? 'No pages found. Make sure you shared pages with the integration in Notion.'
        : `Found ${pageCount} accessible page(s).`
    });
  } catch (error) {
    console.error('[test-notion] Error:', error);

    let hint = 'Check Notion integration settings.';
    if (error.code === 'unauthorized') {
      hint = 'Invalid API key. Generate a new one at notion.so/my-integrations';
    } else if (error.code === 'MODULE_NOT_FOUND' || error.message?.includes('Cannot find module')) {
      hint = 'Notion client library not available. This may be a deployment issue.';
    }

    return res.status(200).json({
      success: false,
      error: error.message || 'Unknown error',
      code: error.code,
      hint: hint
    });
  }
};
