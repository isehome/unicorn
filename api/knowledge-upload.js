/**
 * Knowledge Upload API
 *
 * Handles file uploads for the RAG knowledge base.
 * - Accepts PDF, MD, TXT files
 * - Stores file metadata in knowledge_documents table
 * - Triggers async processing for text extraction and embedding
 */

require('dotenv').config();
const { requireAuth } = require('./_authMiddleware');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role for admin operations
);

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Auth required for knowledge endpoints
    const user = await requireAuth(req, res);
    if (!user) return;

    try {
        switch (req.method) {
            case 'GET':
                return await handleGet(req, res);
            case 'POST':
                return await handlePost(req, res);
            case 'DELETE':
                return await handleDelete(req, res);
            default:
                return res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (error) {
        console.error('[Knowledge Upload Error]', error);
        return res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
};

/**
 * GET - List documents and manufacturers
 */
async function handleGet(req, res) {
    const { type, manufacturerId } = req.query;

    if (type === 'manufacturers') {
        const { data, error } = await supabase
            .from('knowledge_manufacturers')
            .select('*')
            .order('name');

        if (error) throw error;
        return res.status(200).json({ success: true, manufacturers: data });
    }

    // List documents
    let query = supabase
        .from('knowledge_documents')
        .select(`
            *,
            manufacturer:knowledge_manufacturers(id, name, slug)
        `)
        .order('created_at', { ascending: false });

    if (manufacturerId) {
        query = query.eq('manufacturer_id', manufacturerId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return res.status(200).json({ success: true, documents: data });
}

/**
 * POST - Create manufacturer or upload document metadata
 */
async function handlePost(req, res) {
    const { action } = req.body;

    if (action === 'create_manufacturer') {
        return await createManufacturer(req, res);
    }

    if (action === 'create_document') {
        return await createDocument(req, res);
    }

    return res.status(400).json({ error: 'Invalid action. Use "create_manufacturer" or "create_document"' });
}

/**
 * Create a new manufacturer
 */
async function createManufacturer(req, res) {
    const { name, description, logoUrl } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Manufacturer name is required' });
    }

    // Create slug from name
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const { data, error } = await supabase
        .from('knowledge_manufacturers')
        .insert({
            name,
            slug,
            description: description || null,
            logo_url: logoUrl || null
        })
        .select()
        .single();

    if (error) {
        if (error.code === '23505') { // Unique violation
            return res.status(409).json({ error: 'Manufacturer already exists' });
        }
        throw error;
    }

    return res.status(201).json({ success: true, manufacturer: data });
}

/**
 * Create document record (metadata only - processing happens separately)
 */
async function createDocument(req, res) {
    const {
        manufacturerId,
        title,
        fileName,
        fileType,
        fileSize,
        fileUrl,
        category,
        description,
        tags,
        uploadedBy
    } = req.body;

    // Validate required fields
    if (!title || !fileName || !fileType) {
        return res.status(400).json({
            error: 'Missing required fields',
            required: ['title', 'fileName', 'fileType']
        });
    }

    // Validate file type
    const validTypes = ['pdf', 'md', 'txt', 'docx'];
    if (!validTypes.includes(fileType.toLowerCase())) {
        return res.status(400).json({
            error: `Invalid file type: ${fileType}`,
            validTypes
        });
    }

    // Validate category if provided
    const validCategories = [
        'spec-sheet',
        'installation-guide',
        'troubleshooting',
        'training',
        'technical-bulletin',
        'user-manual',
        'quick-reference',
        'other'
    ];
    if (category && !validCategories.includes(category)) {
        return res.status(400).json({
            error: `Invalid category: ${category}`,
            validCategories
        });
    }

    const { data, error } = await supabase
        .from('knowledge_documents')
        .insert({
            manufacturer_id: manufacturerId || null,
            title,
            file_name: fileName,
            file_type: fileType.toLowerCase(),
            file_size: fileSize || null,
            file_url: fileUrl || null,
            category: category || 'other',
            description: description || null,
            tags: tags || [],
            uploaded_by: uploadedBy || null,
            status: 'processing'
        })
        .select(`
            *,
            manufacturer:knowledge_manufacturers(id, name, slug)
        `)
        .single();

    if (error) throw error;

    return res.status(201).json({
        success: true,
        document: data,
        message: 'Document created. Call /api/knowledge-process to extract and embed content.'
    });
}

/**
 * DELETE - Remove document and its chunks
 */
async function handleDelete(req, res) {
    const { documentId, manufacturerId } = req.body;

    if (documentId) {
        // Delete document (chunks cascade automatically)
        const { error } = await supabase
            .from('knowledge_documents')
            .delete()
            .eq('id', documentId);

        if (error) throw error;
        return res.status(200).json({ success: true, message: 'Document deleted' });
    }

    if (manufacturerId) {
        // Delete manufacturer (sets documents.manufacturer_id to null due to ON DELETE SET NULL)
        const { error } = await supabase
            .from('knowledge_manufacturers')
            .delete()
            .eq('id', manufacturerId);

        if (error) throw error;
        return res.status(200).json({ success: true, message: 'Manufacturer deleted' });
    }

    return res.status(400).json({ error: 'documentId or manufacturerId required' });
}
