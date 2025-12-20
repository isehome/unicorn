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
 * Get all manufacturers
 */
export async function getManufacturers() {
    const response = await fetch(`${API_BASE}/knowledge-upload?type=manufacturers`);
    if (!response.ok) {
        throw new Error('Failed to fetch manufacturers');
    }
    const data = await response.json();
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
        const error = await response.json();
        throw new Error(error.error || 'Failed to create manufacturer');
    }

    return await response.json();
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
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete manufacturer');
    }

    return await response.json();
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

    const data = await response.json();
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
        const error = await response.json();
        throw new Error(error.error || 'Failed to create document');
    }

    return await response.json();
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
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete document');
    }

    return await response.json();
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
        const error = await response.json();
        throw new Error(error.error || 'Failed to process document');
    }

    return await response.json();
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

    // 3. Get public URL
    const { data: urlData } = supabase.storage
        .from('knowledge-docs')
        .getPublicUrl(filePath);

    const fileUrl = urlData?.publicUrl;

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

    // 5. If it's a text-based file, read content and process immediately
    if (fileExtension === 'txt' || fileExtension === 'md') {
        const text = await file.text();
        await processDocument(docResult.document.id, text);
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
        const error = await response.json();
        throw new Error(error.error || 'Search failed');
    }

    return await response.json();
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
    searchKnowledgeForVoice
};
