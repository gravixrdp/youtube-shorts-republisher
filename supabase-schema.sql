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
CREATE INDEX IF NOT EXISTS idx_logs_short_id ON upload_logs(short_id);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON upload_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_mappings_active ON channel_mappings(is_active);

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

-- Allow all operations for service role
CREATE POLICY "Allow all for service role" ON config FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON shorts_data FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON upload_logs FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON scheduler_state FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON channel_mappings FOR ALL USING (true);

-- Insert default scheduler state
INSERT INTO scheduler_state (is_running, uploads_today)
SELECT FALSE, 0
WHERE NOT EXISTS (SELECT 1 FROM scheduler_state);

-- Sample configuration defaults
INSERT INTO config (key, value) VALUES
    ('uploads_per_day', '2'),
    ('upload_time_morning', '09:00'),
    ('upload_time_evening', '18:00'),
    ('default_visibility', 'public'),
    ('ai_enhancement_enabled', 'false'),
    ('automation_enabled', 'false'),
    ('max_retry_count', '3')
ON CONFLICT (key) DO NOTHING;
