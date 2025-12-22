/**
 * Knowledge Service
 *
 * Frontend service for interacting with the knowledge base API.
 * Handles:
 * - Manufacturer management
 * - Document uploads
 * - Semantic search
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
    // Check if it looks like the React HTML fallback
    if (text.includes('<!DOCTYPE html>')) {
        throw new Error('API not available. Are you running "vercel dev"?');
    }
    throw new Error(text || response.statusText);
}

/**
 * Get all manufacturers
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
 * Create a new manufacturer
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
 * Delete a manufacturer
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
 * Get all documents, optionally filtered by manufacturer
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
 * Create a document record
 * Note: This creates the metadata record. Use uploadAndProcessDocument for full upload flow.
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
 * Delete a document (and its chunks)
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
 * Process a document (extract text, chunk, embed)
 */
export async function processDocument(documentId, text = null) {
    const response = await fetch(`${API_BASE}/knowledge-process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            documentId,
            text // Optional: pass text directly if not using file URL
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
 * Upload file to Supabase Storage and create document record
 * Full upload flow for the UI
 */
export async function uploadAndProcessDocument(file, metadata, supabase) {
    const { manufacturerId, title, category, description, tags } = metadata;

    // 1. Determine file type
    const fileExtension = file.name.split('.').pop().toLowerCase();
    const validTypes = ['pdf', 'md', 'txt', 'docx'];
    if (!validTypes.includes(fileExtension)) {
        throw new Error(`Invalid file type: ${fileExtension}. Supported: ${validTypes.join(', ')}`);
    }

    // 2. Upload to Supabase Storage
    const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = `knowledge/${manufacturerId || 'general'}/${fileName}`;

    const { error: uploadError } = await supabase.storage
        .from('knowledge-docs')
        .upload(filePath, file);

    if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // 3. Get signed URL (more reliable than public URL)
    const { data: urlData, error: urlError } = await supabase.storage
        .from('knowledge-docs')
        .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (urlError) {
        console.error('[Knowledge] Failed to create signed URL:', urlError);
        throw new Error(`Failed to get file URL: ${urlError.message}`);
    }

    const fileUrl = urlData?.signedUrl;
    console.log('[Knowledge] File uploaded, signed URL created:', filePath);

    // 4. Create document record
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

    // 5. Process the document
    // For text files, read and process immediately
    // For PDFs, we need to trigger processing with the URL
    if (fileExtension === 'txt' || fileExtension === 'md') {
        const text = await file.text();
        await processDocument(docResult.document.id, text);
    } else if (fileExtension === 'pdf') {
        // Trigger PDF processing - the API will fetch from the URL
        // If URL fetch fails, the document will stay in 'processing' status
        try {
            await processDocument(docResult.document.id);
        } catch (err) {
            console.warn('[Knowledge] PDF processing failed, may need manual text input:', err.message);
            // Don't throw - document is created, user can retry or provide text manually
        }
    }

    return docResult;
}

/**
 * Search the knowledge base
 */
export async function searchKnowledge({
    query,
    manufacturerId = null,
    manufacturerSlug = null,
    category = null,
    limit = 5,
    threshold = 0.7,
    searchType = 'vector'
}) {
    const response = await fetch(`${API_BASE}/knowledge-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query,
            manufacturerId,
            manufacturerSlug,
            category,
            limit,
            threshold,
            searchType
        })
    });

    if (!response.ok) {
        let errorMsg = 'Search failed';
        try {
            const error = await parseResponse(response);
            errorMsg = error.error || errorMsg;
        } catch (e) { errorMsg = e.message; }
        throw new Error(errorMsg);
    }

    return await parseResponse(response);
}

/**
 * Search with formatted response for voice AI
 * Returns a concise summary suitable for spoken response
 */
export async function searchKnowledgeForVoice(query, manufacturer = null) {
    const result = await searchKnowledge({
        query,
        manufacturerSlug: manufacturer,
        limit: 3,
        threshold: 0.65
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
        relevance: topResult.relevanceScore || topResult.similarity * 100,
        sources,
        resultCount: result.results.length,
        // Formatted for voice response
        voiceSummary: formatForVoice(result.results)
    };
}

/**
 * Format search results for voice output
 */
function formatForVoice(results) {
    if (!results.length) return '';

    const topResult = results[0];
    let summary = topResult.content;

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

/**
 * Scan a manufacturer site for PDF links
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
 * Process a scraped file (download & upload to SharePoint)
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
 * Process a scraped page (convert to MD & upload to SharePoint)
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

// Export all functions as named exports
export default {
    getManufacturers,
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
