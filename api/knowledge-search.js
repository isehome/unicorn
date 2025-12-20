/**
 * Knowledge Search API
 *
 * Semantic search across the knowledge base using vector similarity.
 * - Generates embedding for query
 * - Performs cosine similarity search in pgvector
 * - Returns top matching chunks with context
 *
 * Also supports:
 * - Full-text search fallback
 * - Manufacturer filtering
 * - Category filtering
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = 'text-embedding-ada-002';

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

    try {
        const {
            query,
            manufacturerId,
            manufacturerSlug,
            category,
            limit = 5,
            threshold = 0.7,
            searchType = 'vector' // 'vector', 'text', or 'hybrid'
        } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        let results;

        if (searchType === 'text') {
            results = await fullTextSearch(query, { manufacturerId, category, limit });
        } else if (searchType === 'hybrid') {
            results = await hybridSearch(query, { manufacturerId, category, limit, threshold });
        } else {
            // Default: vector search
            if (!OPENAI_API_KEY) {
                // Fallback to text search if no API key
                console.warn('[Search] No OpenAI API key, falling back to text search');
                results = await fullTextSearch(query, { manufacturerId, category, limit });
            } else {
                results = await vectorSearch(query, { manufacturerId, manufacturerSlug, category, limit, threshold });
            }
        }

        return res.status(200).json({
            success: true,
            query,
            searchType: OPENAI_API_KEY ? searchType : 'text',
            resultCount: results.length,
            results
        });

    } catch (error) {
        console.error('[Knowledge Search Error]', error);
        return res.status(500).json({
            error: 'Search failed',
            details: error.message
        });
    }
};

/**
 * Vector similarity search using OpenAI embeddings
 */
async function vectorSearch(query, options) {
    const { manufacturerId, manufacturerSlug, category, limit, threshold } = options;

    // Generate query embedding
    const embedding = await generateEmbedding(query);

    // Resolve manufacturer ID from slug if provided
    let mfgId = manufacturerId;
    if (!mfgId && manufacturerSlug) {
        const { data } = await supabase
            .from('knowledge_manufacturers')
            .select('id')
            .eq('slug', manufacturerSlug.toLowerCase())
            .single();
        mfgId = data?.id;
    }

    // Use the search_knowledge function we created in SQL
    const { data, error } = await supabase.rpc('search_knowledge', {
        query_embedding: JSON.stringify(embedding),
        match_threshold: threshold,
        match_count: limit,
        filter_manufacturer_id: mfgId || null
    });

    if (error) {
        console.error('[Vector Search Error]', error);
        throw error;
    }

    // Format results
    return (data || []).map(row => ({
        chunkId: row.chunk_id,
        documentId: row.document_id,
        documentTitle: row.document_title,
        manufacturer: row.manufacturer_name,
        content: row.content,
        similarity: Math.round(row.similarity * 100) / 100,
        relevanceScore: Math.round(row.similarity * 100)
    }));
}

/**
 * Full-text search using PostgreSQL tsvector
 */
async function fullTextSearch(query, options) {
    const { manufacturerId, category, limit } = options;

    const { data, error } = await supabase.rpc('search_knowledge_text', {
        search_query: query,
        match_count: limit,
        filter_manufacturer_id: manufacturerId || null
    });

    if (error) {
        console.error('[Text Search Error]', error);
        throw error;
    }

    return (data || []).map(row => ({
        chunkId: row.chunk_id,
        documentId: row.document_id,
        documentTitle: row.document_title,
        manufacturer: row.manufacturer_name,
        content: row.content,
        rank: Math.round(row.rank * 100) / 100
    }));
}

/**
 * Hybrid search: combine vector and text search results
 */
async function hybridSearch(query, options) {
    const { manufacturerId, category, limit, threshold } = options;

    // Run both searches in parallel
    const [vectorResults, textResults] = await Promise.all([
        OPENAI_API_KEY
            ? vectorSearch(query, { manufacturerId, category, limit: limit * 2, threshold })
            : Promise.resolve([]),
        fullTextSearch(query, { manufacturerId, category, limit: limit * 2 })
    ]);

    // Combine and deduplicate results
    const seen = new Set();
    const combined = [];

    // Add vector results first (generally more relevant)
    for (const result of vectorResults) {
        if (!seen.has(result.chunkId)) {
            seen.add(result.chunkId);
            combined.push({
                ...result,
                searchType: 'vector'
            });
        }
    }

    // Add text results that weren't in vector results
    for (const result of textResults) {
        if (!seen.has(result.chunkId)) {
            seen.add(result.chunkId);
            combined.push({
                ...result,
                searchType: 'text',
                similarity: result.rank // Normalize naming
            });
        }
    }

    // Sort by similarity/relevance and limit
    return combined
        .sort((a, b) => (b.similarity || b.rank || 0) - (a.similarity || a.rank || 0))
        .slice(0, limit);
}

/**
 * Generate embedding for a single text
 */
async function generateEmbedding(text) {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            input: text,
            model: EMBEDDING_MODEL
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error: ${error.error?.message || response.status}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
}
