/**
 * Notion Knowledge Base API
 *
 * Queries Intelligent Systems' Notion workspace for:
 * - Company procedures/SOPs
 * - Product documentation
 * - Troubleshooting guides
 * - Best practices
 *
 * Used by the Gemini Voice Copilot to answer technician questions.
 */

// Import at top level so Vercel bundles the dependency
const { Client } = require('@notionhq/client');

// Lazy-initialize Notion client (only when API key is available)
let notion = null;
function getNotionClient() {
  if (!notion && process.env.NOTION_API_KEY) {
    notion = new Client({ auth: process.env.NOTION_API_KEY });
  }
  return notion;
}

// Your Notion database IDs (configure in Vercel env vars)
const DATABASES = {
  knowledgeBase: process.env.NOTION_KB_DATABASE_ID,
  products: process.env.NOTION_PRODUCTS_DATABASE_ID,
  procedures: process.env.NOTION_PROCEDURES_DATABASE_ID,
  troubleshooting: process.env.NOTION_TROUBLESHOOTING_DATABASE_ID
};

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
  const searchResults = await getNotionClient().search({
    query: query,
    filter: {
      property: 'object',
      value: 'page'
    },
    page_size: 10
  });

  // Extract and format results
  const results = await Promise.all(
    searchResults.results.map(async (page) => {
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

  const page = await getNotionClient().pages.retrieve({ page_id: pageId });
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
    const searchResults = await getNotionClient().search({
      query: category,
      filter: { property: 'object', value: 'page' },
      page_size: 20
    });
    
    const results = searchResults.results.map(page => ({
      id: page.id,
      title: extractTitle(page),
      url: page.url
    }));
    
    return res.status(200).json({ success: true, results });
  }

  const response = await getNotionClient().databases.query({
    database_id: databaseId,
    page_size: 50
  });

  const results = response.results.map(page => ({
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
    const response = await getNotionClient().blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100
    });
    blocks.push(...response.results);
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);
  
  return blocks;
}

// Helper: Get preview (first few blocks)
async function getPagePreview(pageId) {
  try {
    const response = await getNotionClient().blocks.children.list({
      block_id: pageId,
      page_size: 5
    });
    return blocksToText(response.results).slice(0, 500);
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
