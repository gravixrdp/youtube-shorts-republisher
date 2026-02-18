import { supabaseAdmin } from './client';
import type { ShortsData, Config, UploadLog, SchedulerState } from './client';

// ==================== CONFIG OPERATIONS ====================

export async function getConfig(key: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('config')
    .select('value')
    .eq('key', key)
    .single();

  if (error) return null;
  return data?.value || null;
}

export async function setConfig(key: string, value: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('config')
    .upsert({ key, value }, { onConflict: 'key' });

  return !error;
}

export async function getAllConfig(): Promise<Record<string, string>> {
  const { data, error } = await supabaseAdmin
    .from('config')
    .select('key, value');

  if (error || !data) return {};
  
  return data.reduce((acc, item) => {
    acc[item.key] = item.value;
    return acc;
  }, {} as Record<string, string>);
}

export async function setMultipleConfig(configs: Record<string, string>): Promise<boolean> {
  const entries = Object.entries(configs).map(([key, value]) => ({ key, value }));
  
  const { error } = await supabaseAdmin
    .from('config')
    .upsert(entries, { onConflict: 'key' });

  return !error;
}

// ==================== SHORTS DATA OPERATIONS ====================

export async function createShort(data: Partial<ShortsData>): Promise<ShortsData | null> {
  const { data: result, error } = await supabaseAdmin
    .from('shorts_data')
    .insert(data)
    .select()
    .single();

  if (error) {
    console.error('Error creating short:', error);
    return null;
  }
  return result;
}

export async function getShortById(id: string): Promise<ShortsData | null> {
  const { data, error } = await supabaseAdmin
    .from('shorts_data')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return data;
}

export async function getShortByVideoId(videoId: string): Promise<ShortsData | null> {
  const { data, error } = await supabaseAdmin
    .from('shorts_data')
    .select('*')
    .eq('video_id', videoId)
    .single();

  if (error) return null;
  return data;
}

export async function getPendingShorts(limit: number = 10): Promise<ShortsData[]> {
  const { data, error } = await supabaseAdmin
    .from('shorts_data')
    .select('*')
    .eq('status', 'Pending')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) return [];
  return data || [];
}

export async function getShortsByStatus(status: string): Promise<ShortsData[]> {
  const { data, error } = await supabaseAdmin
    .from('shorts_data')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false });

  if (error) return [];
  return data || [];
}

export async function getAllShorts(limit: number = 100, offset: number = 0): Promise<{ data: ShortsData[], total: number }> {
  const [dataResult, countResult] = await Promise.all([
    supabaseAdmin
      .from('shorts_data')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1),
    supabaseAdmin
      .from('shorts_data')
      .select('*', { count: 'exact', head: true })
  ]);

  return {
    data: dataResult.data || [],
    total: countResult.count || 0
  };
}

export async function updateShort(id: string, data: Partial<ShortsData>): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('shorts_data')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id);

  return !error;
}

export async function deleteShort(id: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('shorts_data')
    .delete()
    .eq('id', id);

  return !error;
}

export async function incrementRetryCount(id: string, errorLog: string): Promise<boolean> {
  const { error } = await supabaseAdmin.rpc('increment_retry_count', {
    short_id: id,
    error_message: errorLog
  });

  // Fallback if RPC doesn't exist
  if (error) {
    const short = await getShortById(id);
    if (!short) return false;
    
    return updateShort(id, {
      retry_count: short.retry_count + 1,
      error_log: errorLog,
      status: short.retry_count >= 2 ? 'Failed' : 'Pending'
    });
  }
  
  return true;
}

// ==================== UPLOAD LOGS ====================

export async function createLog(
  shortId: string, 
  action: string, 
  status: 'success' | 'error', 
  message?: string, 
  details?: object
): Promise<void> {
  await supabaseAdmin
    .from('upload_logs')
    .insert({
      short_id: shortId,
      action,
      status,
      message,
      details: details ? JSON.stringify(details) : null
    });
}

export async function getLogs(shortId: string): Promise<UploadLog[]> {
  const { data, error } = await supabaseAdmin
    .from('upload_logs')
    .select('*')
    .eq('short_id', shortId)
    .order('created_at', { ascending: false });

  if (error) return [];
  return data || [];
}

export async function getRecentLogs(limit: number = 50): Promise<UploadLog[]> {
  const { data, error } = await supabaseAdmin
    .from('upload_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return data || [];
}

// ==================== SCHEDULER STATE ====================

export async function getSchedulerState(): Promise<SchedulerState | null> {
  const { data, error } = await supabaseAdmin
    .from('scheduler_state')
    .select('*')
    .limit(1)
    .single();

  if (error) return null;
  return data;
}

export async function updateSchedulerState(data: Partial<SchedulerState>): Promise<boolean> {
  // Get existing state or create new one
  const existing = await getSchedulerState();
  
  if (existing) {
    const { error } = await supabaseAdmin
      .from('scheduler_state')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    return !error;
  } else {
    const { error } = await supabaseAdmin
      .from('scheduler_state')
      .insert(data);
    return !error;
  }
}

export async function resetDailyUploads(): Promise<boolean> {
  return updateSchedulerState({ uploads_today: 0 });
}

// ==================== STATISTICS ====================

export async function getStats() {
  const [
    totalResult,
    pendingResult,
    uploadedResult,
    failedResult,
    todayResult
  ] = await Promise.all([
    supabaseAdmin.from('shorts_data').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('shorts_data').select('*', { count: 'exact', head: true }).eq('status', 'Pending'),
    supabaseAdmin.from('shorts_data').select('*', { count: 'exact', head: true }).eq('status', 'Uploaded'),
    supabaseAdmin.from('shorts_data').select('*', { count: 'exact', head: true }).eq('status', 'Failed'),
    supabaseAdmin.from('shorts_data').select('*', { count: 'exact', head: true })
      .gte('uploaded_date', new Date().toISOString().split('T')[0])
  ]);

  return {
    total: totalResult.count || 0,
    pending: pendingResult.count || 0,
    uploaded: uploadedResult.count || 0,
    failed: failedResult.count || 0,
    uploadedToday: todayResult.count || 0
  };
}
