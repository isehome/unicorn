/**
 * Azure AI Search API
 * 
 * Searches the SharePoint-indexed knowledge base using Azure AI Search.
 * Replaces the Supabase pgvector search for manufacturer documentation.
 * 
 * Endpoint: POST /api/azure-ai-search
 * Body: { query, manufacturer?, limit? }
 */

const { requireAuth } = require('./_authMiddleware');

const AZURE_SEARCH_SERVICE = process.env.AZURE_SEARCH_SERVICE_NAME || 'unicorn-rag';
const AZURE_SEARCH_API_KEY = process.env.AZURE_SEARCH_API_KEY;
const AZURE_SEARCH_INDEX = process.env.AZURE_SEARCH_INDEX_NAME || 'sharepoint-knowledge-index';
const API_VERSION = '2024-07-01';

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Auth required for knowledge endpoints
    const user = await requireAuth(req, res);
    if (!user) return;

    // Check configuration
    if (!AZURE_SEARCH_API_KEY) {
        console.error('[Azure Search] AZURE_SEARCH_API_KEY not configured');
        return res.status(500).json({ 
            error: 'Azure AI Search not configured',
            details: 'Missing AZURE_SEARCH_API_KEY environment variable'
        });
    }

    try {
        const { 
            query, 
            manufacturer = null, 
            manufacturerSlug = null,
            limit = 5,
            searchType = 'semantic' // 'semantic', 'simple', or 'full'
        } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        console.log(`[Azure Search] Query: "${query}" | Manufacturer: ${manufacturer || manufacturerSlug || 'all'} | Type: ${searchType}`);

        // Build Azure Search request
        const searchUrl = `https://${AZURE_SEARCH_SERVICE}.search.windows.net/indexes/${AZURE_SEARCH_INDEX}/docs/search?api-version=${API_VERSION}`;
        
        // Build filter for manufacturer if specified
        const mfg = manufacturer || manufacturerSlug;
        let filter = null;
        if (mfg) {
            // Filter by folder path containing manufacturer name
            // SharePoint paths look like: sites/Unicorn/Knowledge/Lutron/filename.md
            filter = `search.ismatch('${mfg}', 'metadata_spo_item_path')`;
        }

        const searchBody = {
            search: query,
            top: limit,
            select: 'metadata_spo_item_name,metadata_spo_item_path,content,metadata_spo_item_last_modified',
            searchMode: 'any',
            queryType: searchType === 'simple' ? 'simple' : 'semantic',
        };

        // Add semantic configuration if using semantic search
        if (searchType === 'semantic') {
            searchBody.semanticConfiguration = 'default';
            searchBody.answers = 'extractive|count-3';
            searchBody.captions = 'extractive|highlight-true';
        }

        // Add filter if manufacturer specified
        if (filter) {
            searchBody.filter = filter;
        }

        const response = await fetch(searchUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': AZURE_SEARCH_API_KEY
            },
            body: JSON.stringify(searchBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Azure Search] Error: ${response.status}`, errorText);
            
            // If semantic search fails, fall back to simple search
            if (searchType === 'semantic' && response.status === 400) {
                console.log('[Azure Search] Semantic search failed, trying simple search...');
                return await fallbackSimpleSearch(req, res, query, mfg, limit);
            }
            
            return res.status(response.status).json({ 
                error: 'Search failed', 
                details: errorText 
            });
        }

        const data = await response.json();
        
        // Format results for voice AI consumption
        const results = (data.value || []).map(doc => {
            // Extract manufacturer from path
            // Path format: sites/Unicorn/Knowledge/Manufacturer/file.md
            const pathParts = (doc.metadata_spo_item_path || '').split('/');
            const knowledgeIdx = pathParts.findIndex(p => p.toLowerCase() === 'knowledge');
            const extractedMfg = knowledgeIdx >= 0 && pathParts[knowledgeIdx + 1] 
                ? pathParts[knowledgeIdx + 1] 
                : 'General';

            return {
                documentTitle: doc.metadata_spo_item_name || 'Untitled',
                manufacturer: extractedMfg,
                content: doc.content || '',
                path: doc.metadata_spo_item_path,
                lastModified: doc.metadata_spo_item_last_modified,
                // Include captions if available (semantic search)
                caption: doc['@search.captions']?.[0]?.text || null,
                highlights: doc['@search.captions']?.[0]?.highlights || null
            };
        });

        // Include semantic answers if available
        const semanticAnswers = data['@search.answers'] || [];

        console.log(`[Azure Search] Found ${results.length} results`);

        return res.status(200).json({
            success: true,
            query,
            searchType: data['@search.semanticPartialResponseReason'] ? 'semantic' : 'simple',
            resultCount: results.length,
            results,
            // Include top semantic answer if available
            topAnswer: semanticAnswers[0]?.text || null
        });

    } catch (error) {
        console.error('[Azure Search] Exception:', error);
        return res.status(500).json({
            error: 'Search failed',
            details: error.message
        });
    }
};

// Fallback to simple search if semantic fails
async function fallbackSimpleSearch(req, res, query, manufacturer, limit) {
    const searchUrl = `https://${AZURE_SEARCH_SERVICE}.search.windows.net/indexes/${AZURE_SEARCH_INDEX}/docs/search?api-version=${API_VERSION}`;
    
    const searchBody = {
        search: query,
        top: limit,
        select: 'metadata_spo_item_name,metadata_spo_item_path,content,metadata_spo_item_last_modified',
        searchMode: 'any',
        queryType: 'simple'
    };

    if (manufacturer) {
        searchBody.filter = `search.ismatch('${manufacturer}', 'metadata_spo_item_path')`;
    }

    const response = await fetch(searchUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-key': AZURE_SEARCH_API_KEY
        },
        body: JSON.stringify(searchBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: 'Search failed', details: errorText });
    }

    const data = await response.json();
    
    const results = (data.value || []).map(doc => {
        const pathParts = (doc.metadata_spo_item_path || '').split('/');
        const knowledgeIdx = pathParts.findIndex(p => p.toLowerCase() === 'knowledge');
        const extractedMfg = knowledgeIdx >= 0 && pathParts[knowledgeIdx + 1] 
            ? pathParts[knowledgeIdx + 1] 
            : 'General';

        return {
            documentTitle: doc.metadata_spo_item_name || 'Untitled',
            manufacturer: extractedMfg,
            content: doc.content || '',
            path: doc.metadata_spo_item_path,
            lastModified: doc.metadata_spo_item_last_modified
        };
    });

    return res.status(200).json({
        success: true,
        query,
        searchType: 'simple',
        resultCount: results.length,
        results
    });
}
