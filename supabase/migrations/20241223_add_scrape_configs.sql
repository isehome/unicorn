-- Manufacturer scrape configurations for scheduled syncs
-- Allows setting up manufacturer URLs that auto-sync periodically

CREATE TABLE IF NOT EXISTS manufacturer_scrape_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manufacturer_id UUID REFERENCES manufacturers(id) ON DELETE CASCADE,

    -- Scrape settings
    entry_url TEXT NOT NULL,                    -- Starting URL for crawl
    max_depth INTEGER DEFAULT 3,                -- How deep to crawl
    max_pages INTEGER DEFAULT 50,               -- Max pages per session

    -- Content filters (JSON arrays of patterns)
    include_patterns JSONB DEFAULT '[]',        -- URL patterns to include
    exclude_patterns JSONB DEFAULT '[]',        -- URL patterns to exclude

    -- Auth (encrypted in production)
    auth_username TEXT,
    auth_password TEXT,

    -- Scheduling
    sync_enabled BOOLEAN DEFAULT false,
    sync_frequency TEXT DEFAULT 'weekly',       -- daily, weekly, monthly
    last_sync_at TIMESTAMPTZ,
    next_sync_at TIMESTAMPTZ,

    -- Stats
    last_sync_stats JSONB DEFAULT '{}',         -- {pdfs: 0, pages: 0, errors: 0}
    total_documents_scraped INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for scheduled job queries
CREATE INDEX IF NOT EXISTS idx_scrape_configs_next_sync
ON manufacturer_scrape_configs(next_sync_at)
WHERE sync_enabled = true;

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_scrape_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_scrape_config_timestamp
    BEFORE UPDATE ON manufacturer_scrape_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_scrape_config_timestamp();

-- RLS policies
ALTER TABLE manufacturer_scrape_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated users" ON manufacturer_scrape_configs
    FOR ALL USING (true);
