/**
 * Knowledge Process API
 *
 * Processes uploaded documents:
 * 1. Extracts text from PDF/MD/TXT files
 * 2. Chunks text into smaller pieces (500-1000 tokens)
 * 3. Generates embeddings via OpenAI
 * 4. Stores chunks with embeddings in knowledge_chunks table
 *
 * Can be called:
 * - After upload to process a specific document
 * - With raw text to process inline
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = 'text-embedding-ada-002';
const CHUNK_SIZE = 800; // tokens (roughly 3200 chars)
const CHUNK_OVERLAP = 100; // tokens (roughly 400 chars)

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

    if (!OPENAI_API_KEY) {
        return res.status(500).json({
            error: 'OpenAI API key not configured',
            message: 'Set OPENAI_API_KEY in environment variables'
        });
    }

    try {
        const { documentId, text, fileUrl } = req.body;

        if (documentId) {
            // Process existing document
            return await processDocument(req, res, documentId);
        }

        if (text) {
            // Process raw text (for testing or inline processing)
            return await processRawText(req, res, text);
        }

        return res.status(400).json({
            error: 'documentId or text required'
        });
    } catch (error) {
        console.error('[Knowledge Process Error]', error);
        return res.status(500).json({
            error: 'Processing failed',
            details: error.message
        });
    }
};

/**
 * Process a document by ID
 */
async function processDocument(req, res, documentId) {
    // Get document details
    const { data: doc, error: docError } = await supabase
        .from('knowledge_documents')
        .select('*')
        .eq('id', documentId)
        .single();

    if (docError || !doc) {
        return res.status(404).json({ error: 'Document not found' });
    }

    // Update status to processing
    await supabase
        .from('knowledge_documents')
        .update({ status: 'processing' })
        .eq('id', documentId);

    try {
        let text = '';

        // Extract text based on file type and source
        if (doc.file_url) {
            text = await extractTextFromUrl(doc.file_url, doc.file_type);
        } else if (req.body.text) {
            // Allow passing text directly for documents without URLs
            text = req.body.text;
        } else {
            throw new Error('No file URL or text provided');
        }

        if (!text || text.trim().length < 50) {
            throw new Error('Extracted text is too short or empty');
        }

        // Chunk the text
        const chunks = chunkText(text, CHUNK_SIZE, CHUNK_OVERLAP);
        console.log(`[Process] Created ${chunks.length} chunks from document ${documentId}`);

        // Delete existing chunks for this document (in case of reprocessing)
        await supabase
            .from('knowledge_chunks')
            .delete()
            .eq('document_id', documentId);

        // Generate embeddings and store chunks
        const storedChunks = await processChunks(chunks, documentId);

        // Update document status
        await supabase
            .from('knowledge_documents')
            .update({
                status: 'ready',
                chunk_count: storedChunks.length,
                error_message: null
            })
            .eq('id', documentId);

        return res.status(200).json({
            success: true,
            documentId,
            chunksCreated: storedChunks.length,
            totalCharacters: text.length
        });

    } catch (error) {
        // Update document with error status
        await supabase
            .from('knowledge_documents')
            .update({
                status: 'error',
                error_message: error.message
            })
            .eq('id', documentId);

        throw error;
    }
}

/**
 * Process raw text (returns chunks and embeddings without storing to a document)
 */
async function processRawText(req, res, text) {
    const chunks = chunkText(text, CHUNK_SIZE, CHUNK_OVERLAP);

    // Generate embeddings for all chunks
    const embeddings = await generateEmbeddings(chunks);

    return res.status(200).json({
        success: true,
        chunkCount: chunks.length,
        chunks: chunks.map((content, i) => ({
            index: i,
            content,
            tokenCount: estimateTokens(content),
            embeddingDimensions: embeddings[i]?.length || 0
        }))
    });
}

/**
 * Extract text from URL based on file type
 */
async function extractTextFromUrl(url, fileType) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status}`);
    }

    if (fileType === 'txt' || fileType === 'md') {
        return await response.text();
    }

    if (fileType === 'pdf') {
        // For PDF, we need to use a different approach
        // Since pdf-parse has issues in serverless, we'll use a simpler method
        // or require the text to be extracted client-side
        const buffer = await response.arrayBuffer();
        return await extractPdfText(Buffer.from(buffer));
    }

    throw new Error(`Unsupported file type: ${fileType}`);
}

/**
 * Extract text from PDF buffer
 * Uses a simple regex-based extraction as fallback
 */
async function extractPdfText(buffer) {
    // Try to use pdf-parse if available
    try {
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(buffer);
        return data.text;
    } catch (e) {
        console.warn('[PDF] pdf-parse not available, using fallback extraction');
        // Fallback: Extract readable text from PDF buffer
        // This is a simple approach that works for many PDFs
        const text = buffer.toString('utf8');
        // Extract text between stream markers
        const textMatches = text.match(/stream[\s\S]*?endstream/g) || [];
        let extracted = textMatches
            .map(m => m.replace(/stream|endstream/g, ''))
            .join(' ')
            .replace(/[^\x20-\x7E\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (extracted.length < 100) {
            throw new Error('PDF text extraction failed. Please provide the text content directly.');
        }

        return extracted;
    }
}

/**
 * Chunk text into smaller pieces with overlap
 */
function chunkText(text, chunkSize, overlap) {
    const chunks = [];
    const charChunkSize = chunkSize * 4; // ~4 chars per token
    const charOverlap = overlap * 4;

    // Clean up text
    text = text
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    // Split by paragraphs first
    const paragraphs = text.split(/\n\n+/);
    let currentChunk = '';

    for (const para of paragraphs) {
        // If adding this paragraph exceeds chunk size
        if (currentChunk.length + para.length > charChunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());

            // Start new chunk with overlap from end of previous
            const overlapText = currentChunk.slice(-charOverlap);
            currentChunk = overlapText + '\n\n' + para;
        } else {
            currentChunk += (currentChunk ? '\n\n' : '') + para;
        }
    }

    // Add final chunk
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }

    // If we got very few chunks, also split long chunks further
    const finalChunks = [];
    for (const chunk of chunks) {
        if (chunk.length > charChunkSize * 1.5) {
            // Split by sentences
            const sentences = chunk.split(/(?<=[.!?])\s+/);
            let subChunk = '';

            for (const sentence of sentences) {
                if (subChunk.length + sentence.length > charChunkSize) {
                    if (subChunk) finalChunks.push(subChunk.trim());
                    subChunk = sentence;
                } else {
                    subChunk += (subChunk ? ' ' : '') + sentence;
                }
            }
            if (subChunk) finalChunks.push(subChunk.trim());
        } else {
            finalChunks.push(chunk);
        }
    }

    return finalChunks.filter(c => c.length > 50); // Filter out very short chunks
}

/**
 * Estimate token count (rough approximation)
 */
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}

/**
 * Generate embeddings for an array of texts
 */
async function generateEmbeddings(texts) {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            input: texts,
            model: EMBEDDING_MODEL
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error: ${error.error?.message || response.status}`);
    }

    const data = await response.json();
    return data.data.map(d => d.embedding);
}

/**
 * Process chunks: generate embeddings and store in database
 */
async function processChunks(chunks, documentId) {
    const storedChunks = [];

    // Filter out chunks that are too long (max ~6000 tokens to be safe)
    const maxTokens = 6000;
    const validChunks = chunks.filter(chunk => {
        const tokens = estimateTokens(chunk);
        if (tokens > maxTokens) {
            console.warn(`[Process] Skipping oversized chunk: ${tokens} tokens`);
            return false;
        }
        return true;
    });

    console.log(`[Process] Processing ${validChunks.length} valid chunks (filtered ${chunks.length - validChunks.length} oversized)`);

    // Process in small batches to stay under token limit
    // With ~800 tokens per chunk, batch of 8 = ~6400 tokens (safe under 8192)
    const batchSize = 8;

    for (let i = 0; i < validChunks.length; i += batchSize) {
        const batch = validChunks.slice(i, i + batchSize);
        const embeddings = await generateEmbeddings(batch);

        // Prepare chunk records
        const chunkRecords = batch.map((content, j) => ({
            document_id: documentId,
            chunk_index: i + j,
            content,
            token_count: estimateTokens(content),
            embedding: JSON.stringify(embeddings[j]), // pgvector accepts JSON array
            metadata: {}
        }));

        // Insert batch
        const { data, error } = await supabase
            .from('knowledge_chunks')
            .insert(chunkRecords)
            .select('id, chunk_index');

        if (error) throw error;
        storedChunks.push(...(data || []));

        console.log(`[Process] Stored batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(validChunks.length / batchSize)}`);
    }

    return storedChunks;
}
