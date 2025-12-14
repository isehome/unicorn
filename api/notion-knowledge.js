/**
 * Notion Knowledge Base API
 *
 * Uses native fetch() instead of @notionhq/client to avoid Vercel bundling issues.
 *
 * Queries Intelligent Systems' Notion workspace for:
 * - Company procedures/SOPs
 * - Product documentation
 * - Troubleshooting guides
 * - Best practices
 *
 * Used by the Gemini Voice Copilot to answer technician questions.
 */

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// Your Notion database IDs (configure in Vercel env vars)
const DATABASES = {
  knowledgeBase: process.env.NOTION_KB_DATABASE_ID,
  products: process.env.NOTION_PRODUCTS_DATABASE_ID,
  procedures: process.env.NOTION_PROCEDURES_DATABASE_ID,
  troubleshooting: process.env.NOTION_TROUBLESHOOTING_DATABASE_ID
};

// Helper to make Notion API requests
async function notionFetch(endpoint, options = {}) {
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    throw new Error('NOTION_API_KEY not configured');
  }

  const response = await fetch(`${NOTION_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(errorData.message || `HTTP ${response.status}`);
    error.code = errorData.code || response.status;
    throw error;
  }

  return response.json();
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check if Notion is configured
  if (!process.env.NOTION_API_KEY) {
    return res.status(200).json({
      success: false,
      error: 'Notion not configured',
      message: 'NOTION_API_KEY environment variable is not set'
    });
  }

  try {
    const { action, query, category, pageId } = req.body;

    switch (action) {
      case 'search':
        return await handleSearch(res, query, category);

      case 'get_page':
        return await handleGetPage(res, pageId);

      case 'list_category':
        return await handleListCategory(res, category);

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('[Notion API Error]', error);
    return res.status(500).json({
      error: 'Failed to query Notion',
      details: error.message
    });
  }
};

/**
 * Search across Notion knowledge base
 */
async function handleSearch(res, query, category) {
  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  // Search across all connected pages
  const searchResults = await notionFetch('/search', {
    method: 'POST',
    body: JSON.stringify({
      query: query,
      filter: {
        property: 'object',
        value: 'page'
      },
      page_size: 10
    })
  });

  // Extract and format results
  const results = await Promise.all(
    (searchResults.results || []).map(async (page) => {
      const title = extractTitle(page);
      const content = await getPagePreview(page.id);

      return {
        id: page.id,
        title: title,
        url: page.url,
        preview: content,
        lastEdited: page.last_edited_time
      };
    })
  );

  return res.status(200).json({
    success: true,
    query: query,
    resultCount: results.length,
    results: results
  });
}

/**
 * Get full page content
 */
async function handleGetPage(res, pageId) {
  if (!pageId) {
    return res.status(400).json({ error: 'Page ID is required' });
  }

  const page = await notionFetch(`/pages/${pageId}`);
  const blocks = await getAllBlocks(pageId);
  const content = blocksToText(blocks);

  return res.status(200).json({
    success: true,
    title: extractTitle(page),
    content: content,
    url: page.url,
    lastEdited: page.last_edited_time
  });
}

/**
 * List all pages in a category/database
 */
async function handleListCategory(res, category) {
  const databaseId = DATABASES[category];

  if (!databaseId) {
    const searchResults = await notionFetch('/search', {
      method: 'POST',
      body: JSON.stringify({
        query: category,
        filter: { property: 'object', value: 'page' },
        page_size: 20
      })
    });

    const results = (searchResults.results || []).map(page => ({
      id: page.id,
      title: extractTitle(page),
      url: page.url
    }));

    return res.status(200).json({ success: true, results });
  }

  const response = await notionFetch(`/databases/${databaseId}/query`, {
    method: 'POST',
    body: JSON.stringify({
      page_size: 50
    })
  });

  const results = (response.results || []).map(page => ({
    id: page.id,
    title: extractTitle(page),
    properties: extractProperties(page)
  }));

  return res.status(200).json({ success: true, results });
}

// Helper: Extract title from page
function extractTitle(page) {
  const titleProp = page.properties?.Name || page.properties?.title || page.properties?.Title;
  if (titleProp?.title?.[0]?.plain_text) {
    return titleProp.title[0].plain_text;
  }
  return 'Untitled';
}

// Helper: Extract properties from database page
function extractProperties(page) {
  const props = {};
  for (const [key, value] of Object.entries(page.properties || {})) {
    if (value.type === 'rich_text' && value.rich_text?.[0]) {
      props[key] = value.rich_text[0].plain_text;
    } else if (value.type === 'select' && value.select) {
      props[key] = value.select.name;
    } else if (value.type === 'multi_select') {
      props[key] = value.multi_select.map(s => s.name);
    }
  }
  return props;
}

// Helper: Get all blocks from a page
async function getAllBlocks(pageId) {
  const blocks = [];
  let cursor;

  do {
    const params = new URLSearchParams({ page_size: '100' });
    if (cursor) params.set('start_cursor', cursor);

    const response = await notionFetch(`/blocks/${pageId}/children?${params}`);
    blocks.push(...(response.results || []));
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);

  return blocks;
}

// Helper: Get preview (first few blocks)
async function getPagePreview(pageId) {
  try {
    const response = await notionFetch(`/blocks/${pageId}/children?page_size=5`);
    return blocksToText(response.results || []).slice(0, 500);
  } catch {
    return '';
  }
}

// Helper: Convert blocks to plain text
function blocksToText(blocks) {
  return blocks.map(block => {
    const type = block.type;
    const content = block[type];

    if (content?.rich_text) {
      return content.rich_text.map(t => t.plain_text).join('');
    }
    if (type === 'bulleted_list_item' || type === 'numbered_list_item') {
      const text = content?.rich_text?.map(t => t.plain_text).join('') || '';
      return '• ' + text;
    }
    return '';
  }).filter(Boolean).join('\n');
}
