/**
 * Test Notion Connection Endpoint
 *
 * Uses native fetch() instead of @notionhq/client to avoid Vercel bundling issues.
 * Visit: https://your-app.vercel.app/api/test-notion
 */

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

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

  // API key exists - try to use Notion with native fetch
  try {
    const response = await fetch(`${NOTION_API_BASE}/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: '',
        page_size: 5
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw {
        code: errorData.code || response.status,
        message: errorData.message || `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const data = await response.json();
    const pageCount = data.results?.length || 0;

    const pageNames = (data.results || []).map(page => {
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
    if (error.code === 'unauthorized' || error.code === 401) {
      hint = 'Invalid API key. Generate a new one at notion.so/my-integrations';
    } else if (error.code === 'restricted_resource') {
      hint = 'API key is valid but no pages are shared. Share pages with the integration in Notion.';
    }

    return res.status(200).json({
      success: false,
      error: error.message || 'Unknown error',
      code: error.code,
      hint: hint
    });
  }
};
