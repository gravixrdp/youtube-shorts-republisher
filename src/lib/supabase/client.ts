import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Client for public operations (with RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client for server-side operations (bypasses RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Type definitions
export interface ShortsData {
  id: string;
  video_id: string;
  video_url: string;
  title: string;
  description: string | null;
  tags: string[] | null;
  thumbnail_url: string | null;
  duration: number;
  published_date: string | null;
  status: 'Pending' | 'Downloaded' | 'Uploading' | 'Uploaded' | 'Failed';
  scheduled_date: string | null;
  uploaded_date: string | null;
  target_video_id: string | null;
  retry_count: number;
  error_log: string | null;
  ai_title: string | null;
  ai_description: string | null;
  ai_hashtags: string | null;
  mapping_id: string | null;
  source_channel: string | null;
  target_channel: string | null;
  created_at: string;
  updated_at: string;
}

export interface Config {
  id: string;
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
}

export interface UploadLog {
  id: string;
  short_id: string | null;
  action: string;
  status: 'success' | 'error';
  message: string | null;
  details: string | null;
  created_at: string;
}

export interface SchedulerState {
  id: string;
  last_run_at: string | null;
  next_run_at: string | null;
  is_running: boolean;
  uploads_today: number;
  current_status: string | null;
  created_at: string;
  updated_at: string;
}
