-- Knowledge Base Tables for RAG System
-- Supports multi-manufacturer document storage with vector embeddings

-- Enable pgvector extension (run separately if not already enabled)
-- CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- MANUFACTURERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS knowledge_manufacturers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    logo_url TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert common manufacturers
INSERT INTO knowledge_manufacturers (name, slug, description) VALUES
    ('Lutron', 'lutron', 'Motorized shades, lighting controls, and smart home systems'),
    ('Control4', 'control4', 'Home automation and control systems'),
    ('Ubiquiti', 'ubiquiti', 'Network infrastructure, UniFi access points and switches'),
    ('Sonos', 'sonos', 'Wireless speakers and audio systems'),
    ('Araknis', 'araknis', 'Enterprise-grade networking equipment'),
    ('Josh.ai', 'josh', 'Voice control and AI home automation'),
    ('Savant', 'savant', 'Luxury home automation systems'),
    ('Crestron', 'crestron', 'Commercial and residential automation')
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- DOCUMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS knowledge_documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    manufacturer_id UUID REFERENCES knowledge_manufacturers(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'md', 'txt', 'docx')),
    file_size INTEGER,
    file_url TEXT,
    category TEXT CHECK (category IN (
        'spec-sheet',
        'installation-guide',
        'troubleshooting',
        'training',
        'technical-bulletin',
        'user-manual',
        'quick-reference',
        'other'
    )),
    description TEXT,
    tags TEXT[] DEFAULT '{}',
    uploaded_by UUID,
    status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'error')),
    error_message TEXT,
    chunk_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CHUNKS TABLE (with vector embeddings)
-- ============================================
CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    document_id UUID REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    token_count INTEGER,
    embedding vector(1536), -- OpenAI text-embedding-ada-002 dimension
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Vector similarity search index (IVFFlat for performance)
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
ON knowledge_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Full-text search index as fallback
CREATE INDEX IF NOT EXISTS knowledge_chunks_content_fts_idx
ON knowledge_chunks
USING gin(to_tsvector('english', content));

-- Document lookup indexes
CREATE INDEX IF NOT EXISTS knowledge_documents_manufacturer_idx
ON knowledge_documents(manufacturer_id);

CREATE INDEX IF NOT EXISTS knowledge_documents_status_idx
ON knowledge_documents(status);

CREATE INDEX IF NOT EXISTS knowledge_documents_category_idx
ON knowledge_documents(category);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE knowledge_manufacturers ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- Everyone can read
CREATE POLICY "Anyone can view manufacturers"
ON knowledge_manufacturers FOR SELECT USING (true);

CREATE POLICY "Anyone can view documents"
ON knowledge_documents FOR SELECT USING (true);

CREATE POLICY "Anyone can view chunks"
ON knowledge_chunks FOR SELECT USING (true);

-- Authenticated users can insert (uploads)
CREATE POLICY "Authenticated users can insert manufacturers"
ON knowledge_manufacturers FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert documents"
ON knowledge_documents FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Service role handles chunk inserts (API backend)
CREATE POLICY "Service role can insert chunks"
ON knowledge_chunks FOR INSERT
WITH CHECK (true);

-- Authenticated users can delete their own documents
CREATE POLICY "Users can delete documents"
ON knowledge_documents FOR DELETE
USING (auth.uid() IS NOT NULL);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to search knowledge by vector similarity
CREATE OR REPLACE FUNCTION search_knowledge(
    query_embedding vector(1536),
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 5,
    filter_manufacturer_id uuid DEFAULT NULL
)
RETURNS TABLE (
    chunk_id uuid,
    document_id uuid,
    document_title text,
    manufacturer_name text,
    content text,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        kc.id as chunk_id,
        kc.document_id,
        kd.title as document_title,
        km.name as manufacturer_name,
        kc.content,
        1 - (kc.embedding <=> query_embedding) as similarity
    FROM knowledge_chunks kc
    JOIN knowledge_documents kd ON kc.document_id = kd.id
    LEFT JOIN knowledge_manufacturers km ON kd.manufacturer_id = km.id
    WHERE kd.status = 'ready'
        AND (filter_manufacturer_id IS NULL OR kd.manufacturer_id = filter_manufacturer_id)
        AND 1 - (kc.embedding <=> query_embedding) > match_threshold
    ORDER BY kc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Function for full-text search fallback
CREATE OR REPLACE FUNCTION search_knowledge_text(
    search_query text,
    match_count int DEFAULT 10,
    filter_manufacturer_id uuid DEFAULT NULL
)
RETURNS TABLE (
    chunk_id uuid,
    document_id uuid,
    document_title text,
    manufacturer_name text,
    content text,
    rank float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        kc.id as chunk_id,
        kc.document_id,
        kd.title as document_title,
        km.name as manufacturer_name,
        kc.content,
        ts_rank(to_tsvector('english', kc.content), plainto_tsquery('english', search_query)) as rank
    FROM knowledge_chunks kc
    JOIN knowledge_documents kd ON kc.document_id = kd.id
    LEFT JOIN knowledge_manufacturers km ON kd.manufacturer_id = km.id
    WHERE kd.status = 'ready'
        AND (filter_manufacturer_id IS NULL OR kd.manufacturer_id = filter_manufacturer_id)
        AND to_tsvector('english', kc.content) @@ plainto_tsquery('english', search_query)
    ORDER BY rank DESC
    LIMIT match_count;
END;
$$;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_knowledge_documents_updated_at
    BEFORE UPDATE ON knowledge_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_knowledge_manufacturers_updated_at
    BEFORE UPDATE ON knowledge_manufacturers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
