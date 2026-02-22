-- YouTube Shorts Republisher Database Schema for GRAVIX
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Config table for storing app configuration
CREATE TABLE IF NOT EXISTS config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT UNIQUE NOT NULL,
    value TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Channel Mappings table (source -> destination)
CREATE TABLE IF NOT EXISTS channel_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    source_channel_id TEXT NOT NULL,
    source_channel_url TEXT NOT NULL,
    source_channel_name TEXT,
    target_channel_id TEXT NOT NULL,
    target_channel_name TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    uploads_per_day INTEGER DEFAULT 2,
    upload_time_morning TEXT DEFAULT '09:00',
    upload_time_evening TEXT DEFAULT '18:00',
    default_visibility TEXT DEFAULT 'public',
    ai_enhancement_enabled BOOLEAN DEFAULT FALSE,
    last_fetched_at TIMESTAMP WITH TIME ZONE,
    total_fetched INTEGER DEFAULT 0,
    total_uploaded INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Source channels table (explicit, readable channel registry)
CREATE TABLE IF NOT EXISTS source_channels (
    channel_id TEXT PRIMARY KEY,
    channel_title TEXT NOT NULL,
    channel_url TEXT UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Destination channels table (OAuth destination registry)
CREATE TABLE IF NOT EXISTS destination_channels (
    channel_id TEXT PRIMARY KEY,
    channel_title TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shorts data table
CREATE TABLE IF NOT EXISTS shorts_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    video_id TEXT UNIQUE NOT NULL,
    video_url TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    tags TEXT[],
    thumbnail_url TEXT,
    duration INTEGER NOT NULL,
    published_date TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Downloaded', 'Uploading', 'Uploaded', 'Failed')),
    scheduled_date TIMESTAMP WITH TIME ZONE,
    uploaded_date TIMESTAMP WITH TIME ZONE,
    target_video_id TEXT,
    retry_count INTEGER DEFAULT 0,
    error_log TEXT,
    ai_title TEXT,
    ai_description TEXT,
    ai_hashtags TEXT,
    mapping_id UUID REFERENCES channel_mappings(id) ON DELETE SET NULL,
    source_channel TEXT,
    target_channel TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Upload logs table
CREATE TABLE IF NOT EXISTS upload_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    short_id UUID REFERENCES shorts_data(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    status TEXT CHECK (status IN ('success', 'error')),
    message TEXT,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Scheduler state table
CREATE TABLE IF NOT EXISTS scheduler_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    last_run_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE,
    is_running BOOLEAN DEFAULT FALSE,
    uploads_today INTEGER DEFAULT 0,
    current_status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_shorts_status ON shorts_data(status);
CREATE INDEX IF NOT EXISTS idx_shorts_scheduled_date ON shorts_data(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_shorts_created_at ON shorts_data(created_at);
CREATE INDEX IF NOT EXISTS idx_shorts_mapping_id ON shorts_data(mapping_id);
CREATE INDEX IF NOT EXISTS idx_shorts_source_channel ON shorts_data(source_channel);
CREATE INDEX IF NOT EXISTS idx_shorts_target_channel ON shorts_data(target_channel);
CREATE INDEX IF NOT EXISTS idx_shorts_uploaded_date ON shorts_data(uploaded_date);
CREATE INDEX IF NOT EXISTS idx_shorts_source_status ON shorts_data(source_channel, status);
CREATE INDEX IF NOT EXISTS idx_shorts_status_uploaded_date ON shorts_data(status, uploaded_date);
CREATE INDEX IF NOT EXISTS idx_shorts_source_created_at ON shorts_data(source_channel, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_short_id ON upload_logs(short_id);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON upload_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_logs_action ON upload_logs(action);
CREATE INDEX IF NOT EXISTS idx_logs_action_created_at ON upload_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mappings_active ON channel_mappings(is_active);
CREATE INDEX IF NOT EXISTS idx_mappings_source_channel_id ON channel_mappings(source_channel_id);
CREATE INDEX IF NOT EXISTS idx_mappings_target_channel_id ON channel_mappings(target_channel_id);
CREATE INDEX IF NOT EXISTS idx_mappings_active_source_id ON channel_mappings(is_active, source_channel_id);
CREATE INDEX IF NOT EXISTS idx_mappings_active_source_url ON channel_mappings(is_active, source_channel_url);
CREATE INDEX IF NOT EXISTS idx_source_channels_url ON source_channels(channel_url);
CREATE INDEX IF NOT EXISTS idx_source_channels_active ON source_channels(is_active);
CREATE INDEX IF NOT EXISTS idx_destination_channels_connected ON destination_channels(connected_at DESC);

-- Migrate legacy JSON config to explicit channel tables (idempotent)
INSERT INTO source_channels (channel_id, channel_title, channel_url, is_active, connected_at, updated_at)
SELECT
    entry ->> 'channel_id' AS channel_id,
    COALESCE(NULLIF(entry ->> 'channel_title', ''), entry ->> 'channel_id') AS channel_title,
    entry ->> 'channel_url' AS channel_url,
    COALESCE((entry ->> 'is_active')::boolean, TRUE) AS is_active,
    COALESCE((entry ->> 'connected_at')::timestamptz, NOW()) AS connected_at,
    COALESCE((entry ->> 'updated_at')::timestamptz, NOW()) AS updated_at
FROM config cfg
CROSS JOIN LATERAL jsonb_array_elements(
    CASE
        WHEN cfg.value IS NULL OR cfg.value = '' THEN '[]'::jsonb
        ELSE cfg.value::jsonb
    END
) AS entry
WHERE cfg.key = 'youtube_source_channels'
  AND entry ? 'channel_id'
  AND entry ? 'channel_url'
ON CONFLICT (channel_id) DO UPDATE
SET
    channel_title = EXCLUDED.channel_title,
    channel_url = EXCLUDED.channel_url,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

INSERT INTO destination_channels (channel_id, channel_title, refresh_token, connected_at, updated_at)
SELECT
    entry ->> 'channel_id' AS channel_id,
    COALESCE(NULLIF(entry ->> 'channel_title', ''), entry ->> 'channel_id') AS channel_title,
    entry ->> 'refresh_token' AS refresh_token,
    COALESCE((entry ->> 'connected_at')::timestamptz, NOW()) AS connected_at,
    COALESCE((entry ->> 'updated_at')::timestamptz, NOW()) AS updated_at
FROM config cfg
CROSS JOIN LATERAL jsonb_array_elements(
    CASE
        WHEN cfg.value IS NULL OR cfg.value = '' THEN '[]'::jsonb
        ELSE cfg.value::jsonb
    END
) AS entry
WHERE cfg.key = 'youtube_destination_channels'
  AND entry ? 'channel_id'
  AND entry ? 'refresh_token'
ON CONFLICT (channel_id) DO UPDATE
SET
    channel_title = EXCLUDED.channel_title,
    refresh_token = EXCLUDED.refresh_token,
    updated_at = NOW();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_config_updated_at ON config;
CREATE TRIGGER update_config_updated_at
    BEFORE UPDATE ON config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_shorts_data_updated_at ON shorts_data;
CREATE TRIGGER update_shorts_data_updated_at
    BEFORE UPDATE ON shorts_data
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_channel_mappings_updated_at ON channel_mappings;
CREATE TRIGGER update_channel_mappings_updated_at
    BEFORE UPDATE ON channel_mappings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_source_channels_updated_at ON source_channels;
CREATE TRIGGER update_source_channels_updated_at
    BEFORE UPDATE ON source_channels
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_destination_channels_updated_at ON destination_channels;
CREATE TRIGGER update_destination_channels_updated_at
    BEFORE UPDATE ON destination_channels
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_scheduler_state_updated_at ON scheduler_state;
CREATE TRIGGER update_scheduler_state_updated_at
    BEFORE UPDATE ON scheduler_state
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE shorts_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduler_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE destination_channels ENABLE ROW LEVEL SECURITY;

-- Allow all operations for service role
CREATE POLICY "Allow all for service role" ON config FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON shorts_data FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON upload_logs FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON scheduler_state FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON channel_mappings FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON source_channels FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON destination_channels FOR ALL USING (true);

-- Human-readable database views for channel-wise monitoring
CREATE OR REPLACE VIEW source_channel_scrape_stats AS
SELECT
    sc.channel_id,
    sc.channel_title,
    sc.channel_url,
    sc.is_active,
    sc.connected_at,
    sc.updated_at,
    COUNT(sd.id) AS total_shorts,
    COUNT(sd.id) FILTER (WHERE sd.status = 'Pending') AS pending_shorts,
    COUNT(sd.id) FILTER (WHERE sd.status = 'Uploaded') AS uploaded_shorts,
    COUNT(sd.id) FILTER (WHERE sd.status = 'Failed') AS failed_shorts,
    MAX(sd.created_at) AS last_short_added_at,
    MAX(sd.uploaded_date) AS last_uploaded_at
FROM source_channels sc
LEFT JOIN shorts_data sd
    ON sd.source_channel = sc.channel_id OR sd.source_channel = sc.channel_url
GROUP BY
    sc.channel_id,
    sc.channel_title,
    sc.channel_url,
    sc.is_active,
    sc.connected_at,
    sc.updated_at;

CREATE OR REPLACE VIEW destination_channel_upload_stats AS
SELECT
    dc.channel_id,
    dc.channel_title,
    dc.connected_at,
    dc.updated_at,
    COUNT(sd.id) AS total_shorts,
    COUNT(sd.id) FILTER (WHERE sd.status = 'Pending') AS pending_shorts,
    COUNT(sd.id) FILTER (WHERE sd.status = 'Uploaded') AS uploaded_shorts,
    COUNT(sd.id) FILTER (WHERE sd.status = 'Failed') AS failed_shorts,
    MAX(sd.uploaded_date) AS last_uploaded_at
FROM destination_channels dc
LEFT JOIN shorts_data sd
    ON sd.target_channel = dc.channel_id
GROUP BY
    dc.channel_id,
    dc.channel_title,
    dc.connected_at,
    dc.updated_at;

CREATE OR REPLACE VIEW shorts_channel_overview AS
SELECT
    sd.id,
    sd.video_id,
    sd.title,
    sd.status,
    sd.duration,
    sd.source_channel,
    COALESCE(sc.channel_title, cm.source_channel_name, sd.source_channel) AS source_channel_name,
    sd.target_channel,
    COALESCE(dc.channel_title, cm.target_channel_name, sd.target_channel) AS destination_channel_name,
    sd.mapping_id,
    cm.name AS mapping_name,
    sd.created_at,
    sd.uploaded_date
FROM shorts_data sd
LEFT JOIN channel_mappings cm
    ON cm.id = sd.mapping_id
LEFT JOIN source_channels sc
    ON sd.source_channel = sc.channel_id OR sd.source_channel = sc.channel_url
LEFT JOIN destination_channels dc
    ON sd.target_channel = dc.channel_id;

-- Insert default scheduler state
INSERT INTO scheduler_state (is_running, uploads_today)
SELECT FALSE, 0
WHERE NOT EXISTS (SELECT 1 FROM scheduler_state);

-- Sample configuration defaults
INSERT INTO config (key, value) VALUES
    ('uploads_per_day', '2'),
    ('upload_time_morning', '09:00'),
    ('upload_time_evening', '18:00'),
    ('scheduler_timezone', 'UTC'),
    ('default_visibility', 'public'),
    ('ai_enhancement_enabled', 'false'),
    ('gemini_api_key', ''),
    ('gemini_model', 'gemini-2.5-flash'),
    ('automation_enabled', 'false'),
    ('uploaded_cleanup_hours', '5'),
    ('max_retry_count', '3')
ON CONFLICT (key) DO NOTHING;
