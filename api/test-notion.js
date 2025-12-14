/**
 * Test Notion Connection Endpoint
 *
 * Used to verify that the Notion integration is properly configured.
 * Visit: https://your-app.vercel.app/api/test-notion
 */

const { Client } = require('@notionhq/client');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Check if API key is configured
  if (!process.env.NOTION_API_KEY) {
    return res.status(500).json({
      success: false,
      error: 'NOTION_API_KEY not configured',
      hint: 'Add NOTION_API_KEY to your Vercel environment variables. Get it from https://www.notion.so/my-integrations'
    });
  }

  try {
    const notion = new Client({ auth: process.env.NOTION_API_KEY });

    // Try to search for anything - this tests the connection
    const response = await notion.search({
      query: '',
      page_size: 5
    });

    const pageCount = response.results.length;
    const pageNames = response.results.map(page => {
      // Extract title from page
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
        ? 'No pages found. Make sure you shared pages with the integration in Notion (click "..." → "Connections" on each page).'
        : `Found ${pageCount} accessible page(s). The integration can search and read these.`
    });
  } catch (error) {
    console.error('[test-notion] Error:', error);

    let hint = 'Check Notion integration settings.';
    if (error.code === 'unauthorized') {
      hint = 'Invalid API key. Generate a new one at https://www.notion.so/my-integrations and update NOTION_API_KEY in Vercel.';
    } else if (error.code === 'restricted_resource') {
      hint = 'The integration cannot access any pages. Share pages with it in Notion.';
    }

    return res.status(500).json({
      success: false,
      error: error.message,
      code: error.code,
      hint: hint
    });
  }
};
