/**
 * Knowledge Service
 * 
 * Frontend service for interacting with the knowledge base.
 * NOW USES: Azure AI Search (SharePoint-indexed content)
 * 
 * Handles:
 * - Semantic search via Azure AI Search
 * - Manufacturer filtering
 * - Voice AI formatted responses
 */

const API_BASE = '/api';

/**
 * Helper to safely parse JSON response
 */
async function parseResponse(response) {
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        return await response.json();
    }
    const text = await response.text();
    if (text.includes('<!DOCTYPE html>')) {
        throw new Error('API not available. Are you running "vercel dev"?');
    }
    throw new Error(text || response.statusText);
}

/**
 * Search the knowledge base using Azure AI Search
 * This searches the SharePoint Knowledge library indexed by Azure
 */
export async function searchKnowledge({
    query,
    manufacturerId = null,
    manufacturerSlug = null,
    category = null,
    limit = 5,
    threshold = 0.7,
    searchType = 'semantic'
}) {
    // Use the new Azure AI Search endpoint
    const response = await fetch(`${API_BASE}/azure-ai-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query,
            manufacturer: manufacturerSlug || manufacturerId,
            limit,
            searchType
        })
    });

    if (!response.ok) {
        let errorMsg = 'Search failed';
        try {
            const error = await parseResponse(response);
            errorMsg = error.error || errorMsg;
        } catch (e) { 
            errorMsg = e.message; 
        }
        throw new Error(errorMsg);
    }

    return await parseResponse(response);
}

/**
 * Search with formatted response for voice AI
 * Returns a concise summary suitable for spoken response
 */
export async function searchKnowledgeForVoice(query, manufacturer = null) {
    try {
        const result = await searchKnowledge({
            query,
            manufacturerSlug: manufacturer,
            limit: 3,
            searchType: 'semantic'
        });

        if (!result.results || result.results.length === 0) {
            return {
                found: false,
                message: `I couldn't find any documentation about "${query}".`
            };
        }

        // Format results for voice
        const topResult = result.results[0];
        const sources = [...new Set(result.results.map(r => r.documentTitle))].slice(0, 2);

        return {
            found: true,
            content: topResult.content,
            documentTitle: topResult.documentTitle,
            manufacturer: topResult.manufacturer,
            relevance: topResult.caption ? 95 : 80, // Semantic matches are higher confidence
            sources,
            resultCount: result.results.length,
            voiceSummary: formatForVoice(result.results, result.topAnswer)
        };
    } catch (error) {
        console.error('[KnowledgeService] Search error:', error);
        return {
            found: false,
            message: `Search failed: ${error.message}`
        };
    }
}

/**
 * Format search results for voice output
 */
function formatForVoice(results, topAnswer = null) {
    if (!results.length) return '';

    // If we have a semantic answer, use it
    if (topAnswer) {
        let summary = topAnswer;
        if (summary.length > 500) {
            summary = summary.substring(0, 450) + '...';
        }
        if (results[0]?.documentTitle) {
            summary += ` This is from ${results[0].documentTitle}.`;
        }
        return summary;
    }

    // Otherwise use the top result content
    const topResult = results[0];
    let summary = topResult.content || '';

    // Truncate to reasonable voice length (~500 chars)
    if (summary.length > 500) {
        const sentences = summary.split(/(?<=[.!?])\s+/);
        summary = '';
        for (const sentence of sentences) {
            if (summary.length + sentence.length > 450) break;
            summary += sentence + ' ';
        }
        summary = summary.trim();
    }

    // Add source attribution
    if (topResult.documentTitle) {
        summary += ` This is from ${topResult.documentTitle}.`;
    }

    return summary;
}

// ============================================
// LEGACY FUNCTIONS (kept for backward compat)
// These were for Supabase-based knowledge base
// ============================================

/**
 * Get all manufacturers (legacy - may be deprecated)
 */
export async function getManufacturers() {
    const response = await fetch(`${API_BASE}/knowledge-upload?type=manufacturers`);
    if (!response.ok) {
        throw new Error('Failed to fetch manufacturers');
    }
    const data = await parseResponse(response);
    return data.manufacturers || [];
}

/**
 * Create a new manufacturer (legacy)
 */
export async function createManufacturer({ name, description, logoUrl }) {
    const response = await fetch(`${API_BASE}/knowledge-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'create_manufacturer',
            name,
            description,
            logoUrl
        })
    });

    if (!response.ok) {
        let errorMsg = 'Failed to create manufacturer';
        try {
            const error = await parseResponse(response);
            errorMsg = error.error || errorMsg;
        } catch (e) { errorMsg = e.message; }
        throw new Error(errorMsg);
    }

    return await parseResponse(response);
}

/**
 * Delete a manufacturer (legacy)
 */
export async function deleteManufacturer(manufacturerId) {
    const response = await fetch(`${API_BASE}/knowledge-upload`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manufacturerId })
    });

    if (!response.ok) {
        let errorMsg = 'Failed to delete manufacturer';
        try {
            const error = await parseResponse(response);
            errorMsg = error.error || errorMsg;
        } catch (e) { errorMsg = e.message; }
        throw new Error(errorMsg);
    }

    return await parseResponse(response);
}

/**
 * Get all documents (legacy)
 */
export async function getDocuments(manufacturerId = null) {
    const url = manufacturerId
        ? `${API_BASE}/knowledge-upload?manufacturerId=${manufacturerId}`
        : `${API_BASE}/knowledge-upload`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error('Failed to fetch documents');
    }
    const data = await parseResponse(response);
    return data.documents || [];
}

/**
 * Create a document record (legacy)
 */
export async function createDocument({
    manufacturerId,
    title,
    fileName,
    fileType,
    fileSize,
    fileUrl,
    category,
    description,
    tags
}) {
    const response = await fetch(`${API_BASE}/knowledge-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'create_document',
            manufacturerId,
            title,
            fileName,
            fileType,
            fileSize,
            fileUrl,
            category,
            description,
            tags
        })
    });

    if (!response.ok) {
        let errorMsg = 'Failed to create document';
        try {
            const error = await parseResponse(response);
            errorMsg = error.error || errorMsg;
        } catch (e) { errorMsg = e.message; }
        throw new Error(errorMsg);
    }

    return await parseResponse(response);
}

/**
 * Delete a document (legacy)
 */
export async function deleteDocument(documentId) {
    const response = await fetch(`${API_BASE}/knowledge-upload`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId })
    });

    if (!response.ok) {
        let errorMsg = 'Failed to delete document';
        try {
            const error = await parseResponse(response);
            errorMsg = error.error || errorMsg;
        } catch (e) { errorMsg = e.message; }
        throw new Error(errorMsg);
    }

    return await parseResponse(response);
}

/**
 * Process a document (legacy - for Supabase)
 */
export async function processDocument(documentId, text = null) {
    const response = await fetch(`${API_BASE}/knowledge-process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            documentId,
            text
        })
    });

    if (!response.ok) {
        let errorMsg = 'Failed to process document';
        try {
            const error = await parseResponse(response);
            errorMsg = error.error || errorMsg;
        } catch (e) { errorMsg = e.message; }
        throw new Error(errorMsg);
    }

    return await parseResponse(response);
}

/**
 * Upload file to Supabase Storage (legacy)
 */
export async function uploadAndProcessDocument(file, metadata, supabase) {
    const { manufacturerId, title, category, description, tags } = metadata;

    const fileExtension = file.name.split('.').pop().toLowerCase();
    const validTypes = ['pdf', 'md', 'txt', 'docx'];
    if (!validTypes.includes(fileExtension)) {
        throw new Error(`Invalid file type: ${fileExtension}. Supported: ${validTypes.join(', ')}`);
    }

    const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = `knowledge/${manufacturerId || 'general'}/${fileName}`;

    const { error: uploadError } = await supabase.storage
        .from('knowledge-docs')
        .upload(filePath, file);

    if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data: urlData, error: urlError } = await supabase.storage
        .from('knowledge-docs')
        .createSignedUrl(filePath, 3600);

    if (urlError) {
        console.error('[Knowledge] Failed to create signed URL:', urlError);
        throw new Error(`Failed to get file URL: ${urlError.message}`);
    }

    const fileUrl = urlData?.signedUrl;
    console.log('[Knowledge] File uploaded, signed URL created:', filePath);

    const docResult = await createDocument({
        manufacturerId,
        title: title || file.name.replace(/\.[^/.]+$/, ''),
        fileName: file.name,
        fileType: fileExtension,
        fileSize: file.size,
        fileUrl,
        category: category || 'other',
        description,
        tags
    });

    if (fileExtension === 'txt' || fileExtension === 'md') {
        const text = await file.text();
        await processDocument(docResult.document.id, text);
    } else if (fileExtension === 'pdf') {
        try {
            await processDocument(docResult.document.id);
        } catch (err) {
            console.warn('[Knowledge] PDF processing failed:', err.message);
        }
    }

    return docResult;
}

// ============================================
// SCRAPING FUNCTIONS (for SharePoint import)
// ============================================

/**
 * Scan a site for PDF links (v1)
 */
export async function scanSite({ url, username, password }) {
    const response = await fetch(`${API_BASE}/scrape-knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'scan',
            url,
            username,
            password
        })
    });

    if (!response.ok) {
        let errorMsg = 'Scan failed';
        try {
            const error = await parseResponse(response);
            errorMsg = error.error || errorMsg;
        } catch (e) { errorMsg = e.message; }
        throw new Error(errorMsg);
    }

    return await parseResponse(response);
}

/**
 * Deep crawl a site (v2)
 */
export async function crawlSite({ url, maxDepth = 3, maxPages = 50 }) {
    const response = await fetch(`${API_BASE}/scrape-knowledge-v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'crawl',
            url,
            maxDepth,
            maxPages
        })
    });

    if (!response.ok) {
        let errorMsg = 'Crawl failed';
        try {
            const error = await parseResponse(response);
            errorMsg = error.error || errorMsg;
        } catch (e) { errorMsg = e.message; }
        throw new Error(errorMsg);
    }

    return await parseResponse(response);
}

/**
 * Import crawled items to SharePoint
 */
export async function importCrawledItems({ items, manufacturerName, libraryUrl }) {
    const response = await fetch(`${API_BASE}/scrape-knowledge-v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'import',
            items,
            manufacturerName,
            libraryUrl
        })
    });

    if (!response.ok) {
        let errorMsg = 'Import failed';
        try {
            const error = await parseResponse(response);
            errorMsg = error.error || errorMsg;
        } catch (e) { errorMsg = e.message; }
        throw new Error(errorMsg);
    }

    return await parseResponse(response);
}

/**
 * Process a scraped file (legacy v1)
 */
export async function processScrapedFile({ fileUrl, manufacturerName, rootUrl }) {
    const response = await fetch(`${API_BASE}/scrape-knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'process_file',
            fileUrl,
            manufacturerName,
            rootUrl
        })
    });

    if (!response.ok) {
        let errorMsg = 'Processing failed';
        try {
            const error = await parseResponse(response);
            errorMsg = error.error || errorMsg;
        } catch (e) { errorMsg = e.message; }
        throw new Error(errorMsg);
    }

    return await parseResponse(response);
}

/**
 * Process a scraped page (legacy v1)
 */
export async function processPage({ url, manufacturerName, rootUrl }) {
    const response = await fetch(`${API_BASE}/scrape-knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'process_page',
            url,
            manufacturerName,
            rootUrl
        })
    });

    if (!response.ok) {
        let errorMsg = 'Processing failed';
        try {
            const error = await parseResponse(response);
            errorMsg = error.error || errorMsg;
        } catch (e) { errorMsg = e.message; }
        throw new Error(errorMsg);
    }

    return await parseResponse(response);
}

// Export all functions
export default {
    getManufacturers,
    crawlSite,
    importCrawledItems,
    createManufacturer,
    deleteManufacturer,
    getDocuments,
    createDocument,
    deleteDocument,
    processDocument,
    uploadAndProcessDocument,
    searchKnowledge,
    searchKnowledgeForVoice,
    scanSite,
    processScrapedFile,
    processPage
};
