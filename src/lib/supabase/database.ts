import { supabaseAdmin } from './client';
import type { ShortsData, Config, UploadLog, SchedulerState } from './client';

const MAPPING_PUBLISH_DELAY_CONFIG_PREFIX = 'mapping_publish_delay_hours:';

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

export async function deleteConfig(key: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('config')
    .delete()
    .eq('key', key);

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

// ==================== CHANNEL MAPPINGS ====================

export interface ChannelMapping {
  id: string;
  name: string;
  source_channel_id: string;
  source_channel_url: string;
  source_channel_name: string | null;
  target_channel_id: string;
  target_channel_name: string | null;
  is_active: boolean;
  uploads_per_day: number;
  upload_time_morning: string | null;
  upload_time_evening: string | null;
  default_visibility: string | null;
  ai_enhancement_enabled: boolean;
  publish_delay_hours?: number | null;
  last_fetched_at: string | null;
  total_fetched: number;
  total_uploaded: number;
  created_at: string;
  updated_at: string;
}

function mappingPublishDelayConfigKey(mappingId: string): string {
  return `${MAPPING_PUBLISH_DELAY_CONFIG_PREFIX}${mappingId}`;
}

function parsePublishDelayHours(raw: string | null): number | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.min(72, Math.floor(parsed));
}

export async function getMappingPublishDelayHours(mappingId: string): Promise<number | null> {
  if (!mappingId?.trim()) {
    return null;
  }

  const raw = await getConfig(mappingPublishDelayConfigKey(mappingId));
  return parsePublishDelayHours(raw);
}

export async function getMappingPublishDelayHoursMap(mappingIds: string[]): Promise<Map<string, number | null>> {
  const normalizedIds = Array.from(new Set(mappingIds.map((id) => id?.trim()).filter(Boolean) as string[]));
  const result = new Map<string, number | null>(normalizedIds.map((id) => [id, null]));

  if (normalizedIds.length === 0) {
    return result;
  }

  const keys = normalizedIds.map((id) => mappingPublishDelayConfigKey(id));
  const { data, error } = await supabaseAdmin
    .from('config')
    .select('key, value')
    .in('key', keys);

  if (error || !data) {
    return result;
  }

  for (const row of data) {
    const key = (row.key as string | undefined) || '';
    if (!key.startsWith(MAPPING_PUBLISH_DELAY_CONFIG_PREFIX)) {
      continue;
    }

    const mappingId = key.slice(MAPPING_PUBLISH_DELAY_CONFIG_PREFIX.length);
    if (!mappingId) {
      continue;
    }

    result.set(mappingId, parsePublishDelayHours((row.value as string | null | undefined) ?? null));
  }

  return result;
}

export async function setMappingPublishDelayHours(mappingId: string, delayHours: number | null): Promise<boolean> {
  if (!mappingId?.trim()) {
    return false;
  }

  if (delayHours === null || delayHours === undefined) {
    return deleteConfig(mappingPublishDelayConfigKey(mappingId));
  }

  const normalized = Math.min(72, Math.max(0, Math.floor(delayHours)));
  return setConfig(mappingPublishDelayConfigKey(mappingId), String(normalized));
}

export async function getChannelMappings(): Promise<ChannelMapping[]> {
  const { data, error } = await supabaseAdmin
    .from('channel_mappings')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching channel mappings:', error);
    return [];
  }
  return data || [];
}

export async function getChannelMappingById(id: string): Promise<ChannelMapping | null> {
  const { data, error } = await supabaseAdmin
    .from('channel_mappings')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return data;
}

export async function getActiveChannelMappings(): Promise<ChannelMapping[]> {
  const { data, error } = await supabaseAdmin
    .from('channel_mappings')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) return [];
  return data || [];
}

export async function createChannelMapping(mapping: Partial<ChannelMapping>): Promise<ChannelMapping | null> {
  const { data, error } = await supabaseAdmin
    .from('channel_mappings')
    .insert(mapping)
    .select()
    .single();

  if (error) {
    console.error('Error creating channel mapping:', error);
    return null;
  }
  return data;
}

export async function updateChannelMapping(id: string, data: Partial<ChannelMapping>): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('channel_mappings')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id);

  return !error;
}

interface DeleteMappingOptions {
  removeMappedShorts?: boolean;
}

function chunkValues<T>(values: T[], chunkSize: number = 200): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

async function deleteLogsByShortIds(shortIds: string[]): Promise<boolean> {
  const normalized = Array.from(new Set(shortIds.map((id) => id?.trim()).filter(Boolean) as string[]));
  if (normalized.length === 0) {
    return true;
  }

  for (const batch of chunkValues(normalized, 200)) {
    const { error } = await supabaseAdmin
      .from('upload_logs')
      .delete()
      .in('short_id', batch);

    if (error) {
      console.error('Error deleting upload logs by short IDs:', error);
      return false;
    }
  }

  return true;
}

function normalizeSearchTokens(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim().toLowerCase())
        .filter((value): value is string => Boolean(value && value.length >= 3))
    )
  );
}

async function deleteLooseLogsBySearchValues(values: Array<string | null | undefined>): Promise<boolean> {
  const tokens = normalizeSearchTokens(values);
  if (tokens.length === 0) {
    return true;
  }

  const { data, error } = await supabaseAdmin
    .from('upload_logs')
    .select('id, message, details')
    .is('short_id', null)
    .limit(20000);

  if (error) {
    console.error('Error reading loose logs for cleanup:', error);
    return false;
  }

  const matchedLogIds = (data || [])
    .filter((log) => {
      const haystack = `${log.message || ''} ${log.details || ''}`.toLowerCase();
      return tokens.some((token) => haystack.includes(token));
    })
    .map((log) => log.id as string)
    .filter(Boolean);

  if (matchedLogIds.length === 0) {
    return true;
  }

  for (const batch of chunkValues(matchedLogIds, 200)) {
    const { error: deleteError } = await supabaseAdmin
      .from('upload_logs')
      .delete()
      .in('id', batch);

    if (deleteError) {
      console.error('Error deleting loose logs by search tokens:', deleteError);
      return false;
    }
  }

  return true;
}

async function deleteShortsAndLogsBySourceValues(values: Array<string | null | undefined>): Promise<boolean> {
  const sourceValues = Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))
  );

  if (sourceValues.length === 0) {
    return true;
  }

  const { data: sourceShorts, error: readError } = await supabaseAdmin
    .from('shorts_data')
    .select('id')
    .in('source_channel', sourceValues);

  if (readError) {
    console.error('Error reading source shorts before cleanup:', readError);
    return false;
  }

  const shortIds = (sourceShorts || [])
    .map((row) => row.id as string)
    .filter(Boolean);

  const logsDeleted = await deleteLogsByShortIds(shortIds);
  if (!logsDeleted) {
    return false;
  }

  const { error: deleteError } = await supabaseAdmin
    .from('shorts_data')
    .delete()
    .in('source_channel', sourceValues);

  if (deleteError) {
    console.error('Error deleting source shorts during cleanup:', deleteError);
    return false;
  }

  return true;
}

async function deleteShortsAndLogsByTargetChannel(targetChannelId: string): Promise<boolean> {
  const normalizedTarget = targetChannelId?.trim();
  if (!normalizedTarget) {
    return true;
  }

  const { data: targetShorts, error: readError } = await supabaseAdmin
    .from('shorts_data')
    .select('id')
    .eq('target_channel', normalizedTarget);

  if (readError) {
    console.error('Error reading destination shorts before cleanup:', readError);
    return false;
  }

  const shortIds = (targetShorts || [])
    .map((row) => row.id as string)
    .filter(Boolean);

  const logsDeleted = await deleteLogsByShortIds(shortIds);
  if (!logsDeleted) {
    return false;
  }

  const { error: deleteError } = await supabaseAdmin
    .from('shorts_data')
    .delete()
    .eq('target_channel', normalizedTarget);

  if (deleteError) {
    console.error('Error deleting destination shorts during cleanup:', deleteError);
    return false;
  }

  return true;
}

async function deleteShortsByMappingId(mappingId: string): Promise<boolean> {
  const { data: mappedShorts, error: readError } = await supabaseAdmin
    .from('shorts_data')
    .select('id')
    .eq('mapping_id', mappingId);

  if (readError) {
    console.error('Error reading mapped shorts before delete:', readError);
    return false;
  }

  const shortIds = (mappedShorts || [])
    .map((item) => item.id as string)
    .filter(Boolean);

  if (shortIds.length > 0) {
    // Keep cleanup explicit even though FK can cascade in some deployments.
    const { error: logDeleteError } = await supabaseAdmin
      .from('upload_logs')
      .delete()
      .in('short_id', shortIds);

    if (logDeleteError) {
      console.error('Error deleting mapped upload logs:', logDeleteError);
      return false;
    }
  }

  const { error: shortDeleteError } = await supabaseAdmin
    .from('shorts_data')
    .delete()
    .eq('mapping_id', mappingId);

  if (shortDeleteError) {
    console.error('Error deleting mapped shorts:', shortDeleteError);
    return false;
  }

  return true;
}

export async function deleteChannelMapping(id: string, options?: DeleteMappingOptions): Promise<boolean> {
  const removeMappedShorts = options?.removeMappedShorts ?? true;
  const mapping = await getChannelMappingById(id);

  if (removeMappedShorts) {
    const removed = await deleteShortsByMappingId(id);
    if (!removed) {
      return false;
    }
  }

  const { error } = await supabaseAdmin
    .from('channel_mappings')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting channel mapping:', error);
    return false;
  }

  const delayDeleted = await deleteConfig(mappingPublishDelayConfigKey(id));
  if (!delayDeleted) {
    console.error(`Warning: failed to delete publish delay override for mapping ${id}`);
  }

  const looseLogsDeleted = await deleteLooseLogsBySearchValues([mapping?.id || id]);
  if (!looseLogsDeleted) {
    console.error(`Error deleting loose logs for mapping ${id}`);
    return false;
  }

  return true;
}

export async function deleteMappingsByTargetChannelId(targetChannelId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('channel_mappings')
    .select('id')
    .eq('target_channel_id', targetChannelId);

  if (error) {
    console.error('Error loading mappings for destination channel cleanup:', error);
    return false;
  }

  for (const mapping of data || []) {
    const success = await deleteChannelMapping(mapping.id as string, { removeMappedShorts: true });
    if (!success) {
      return false;
    }
  }

  const destinationCleanup = await deleteShortsAndLogsByTargetChannel(targetChannelId);
  if (!destinationCleanup) {
    return false;
  }

  const looseLogsDeleted = await deleteLooseLogsBySearchValues([targetChannelId]);
  if (!looseLogsDeleted) {
    return false;
  }

  return true;
}

export async function deleteMappingsBySourceChannel(sourceChannelId: string, sourceChannelUrl?: string): Promise<boolean> {
  const mappingIds = new Set<string>();

  if (sourceChannelId) {
    const { data: byId, error: byIdError } = await supabaseAdmin
      .from('channel_mappings')
      .select('id')
      .eq('source_channel_id', sourceChannelId);

    if (byIdError) {
      console.error('Error loading mappings by source_channel_id:', byIdError);
      return false;
    }

    for (const row of byId || []) {
      if (row.id) {
        mappingIds.add(row.id as string);
      }
    }
  }

  if (sourceChannelUrl) {
    const { data: byUrl, error: byUrlError } = await supabaseAdmin
      .from('channel_mappings')
      .select('id')
      .eq('source_channel_url', sourceChannelUrl);

    if (byUrlError) {
      console.error('Error loading mappings by source_channel_url:', byUrlError);
      return false;
    }

    for (const row of byUrl || []) {
      if (row.id) {
        mappingIds.add(row.id as string);
      }
    }
  }

  for (const mappingId of mappingIds) {
    const success = await deleteChannelMapping(mappingId, { removeMappedShorts: true });
    if (!success) {
      return false;
    }
  }

  const sourceCleanup = await deleteShortsAndLogsBySourceValues([sourceChannelId, sourceChannelUrl]);
  if (!sourceCleanup) {
    return false;
  }

  const looseLogsDeleted = await deleteLooseLogsBySearchValues([sourceChannelId, sourceChannelUrl]);
  if (!looseLogsDeleted) {
    return false;
  }

  return true;
}

export async function updateLastFetched(id: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('channel_mappings')
    .update({ last_fetched_at: new Date().toISOString() })
    .eq('id', id);

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

export async function getPendingShorts(limit: number = 10, mappingId?: string): Promise<ShortsData[]> {
  let query = supabaseAdmin
    .from('shorts_data')
    .select('*')
    .eq('status', 'Pending')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (mappingId) {
    query = query.eq('mapping_id', mappingId);
  }

  const { data, error } = await query;

  if (error) return [];
  return data || [];
}

export async function claimOldestUnmappedPendingShortForMapping(
  mappingId: string,
  sourceChannelId?: string | null,
  sourceChannelUrl?: string | null,
  targetChannelId?: string | null
): Promise<ShortsData | null> {
  const sourceValues = Array.from(
    new Set(
      [sourceChannelId?.trim(), sourceChannelUrl?.trim()].filter(
        (value): value is string => Boolean(value)
      )
    )
  );

  if (sourceValues.length === 0) {
    return null;
  }

  const { data: candidates, error } = await supabaseAdmin
    .from('shorts_data')
    .select('*')
    .eq('status', 'Pending')
    .is('mapping_id', null)
    .in('source_channel', sourceValues)
    .order('created_at', { ascending: true })
    .limit(20);

  if (error || !candidates || candidates.length === 0) {
    return null;
  }

  for (const candidate of candidates) {
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from('shorts_data')
      .update({
        mapping_id: mappingId,
        target_channel: targetChannelId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', candidate.id)
      .eq('status', 'Pending')
      .is('mapping_id', null)
      .select('*')
      .maybeSingle();

    if (claimError) {
      continue;
    }

    if (claimed) {
      return claimed as ShortsData;
    }
  }

  return null;
}

export async function getNextGlobalPendingShort(excludedSourceValues: string[] = []): Promise<ShortsData | null> {
  const { data, error } = await supabaseAdmin
    .from('shorts_data')
    .select('*')
    .eq('status', 'Pending')
    .is('mapping_id', null)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error || !data || data.length === 0) {
    return null;
  }

  const excluded = new Set(excludedSourceValues.map((value) => value.trim()).filter(Boolean));

  for (const short of data) {
    const sourceValue = short.source_channel?.trim();
    if (sourceValue && excluded.has(sourceValue)) {
      continue;
    }
    return short as ShortsData;
  }

  return null;
}

export async function getDueScheduledPublishShorts(limit: number = 20): Promise<ShortsData[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('shorts_data')
    .select('*')
    .eq('status', 'Uploaded')
    .not('scheduled_date', 'is', null)
    .not('target_video_id', 'is', null)
    .lte('scheduled_date', nowIso)
    .order('scheduled_date', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Error loading due scheduled publish shorts:', error);
    return [];
  }

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

interface SourceShortsStats {
  total: number;
  pending: number;
  uploaded: number;
  failed: number;
  lastCreatedAt: string | null;
}

async function getSourceStatsForSingleValue(sourceValue: string): Promise<SourceShortsStats> {
  const [totalResult, pendingResult, uploadedResult, failedResult, latestResult] = await Promise.all([
    supabaseAdmin.from('shorts_data').select('id', { count: 'exact', head: true }).eq('source_channel', sourceValue),
    supabaseAdmin
      .from('shorts_data')
      .select('id', { count: 'exact', head: true })
      .eq('source_channel', sourceValue)
      .eq('status', 'Pending'),
    supabaseAdmin
      .from('shorts_data')
      .select('id', { count: 'exact', head: true })
      .eq('source_channel', sourceValue)
      .eq('status', 'Uploaded'),
    supabaseAdmin
      .from('shorts_data')
      .select('id', { count: 'exact', head: true })
      .eq('source_channel', sourceValue)
      .eq('status', 'Failed'),
    supabaseAdmin
      .from('shorts_data')
      .select('created_at')
      .eq('source_channel', sourceValue)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    total: totalResult.count || 0,
    pending: pendingResult.count || 0,
    uploaded: uploadedResult.count || 0,
    failed: failedResult.count || 0,
    lastCreatedAt: latestResult.data?.created_at || null,
  };
}

export async function getSourceShortsStats(sourceChannelId: string, sourceChannelUrl?: string | null): Promise<SourceShortsStats> {
  const values = Array.from(
    new Set([sourceChannelId?.trim(), sourceChannelUrl?.trim()].filter((value): value is string => Boolean(value)))
  );

  if (values.length === 0) {
    return { total: 0, pending: 0, uploaded: 0, failed: 0, lastCreatedAt: null };
  }

  const stats = await Promise.all(values.map((value) => getSourceStatsForSingleValue(value)));

  return stats.reduce<SourceShortsStats>(
    (acc, item) => {
      const lastCreatedAt =
        !acc.lastCreatedAt || (item.lastCreatedAt && item.lastCreatedAt > acc.lastCreatedAt)
          ? item.lastCreatedAt
          : acc.lastCreatedAt;

      return {
        total: acc.total + item.total,
        pending: acc.pending + item.pending,
        uploaded: acc.uploaded + item.uploaded,
        failed: acc.failed + item.failed,
        lastCreatedAt,
      };
    },
    { total: 0, pending: 0, uploaded: 0, failed: 0, lastCreatedAt: null }
  );
}

export async function updateShort(id: string, data: Partial<ShortsData>): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('shorts_data')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id);

  return !error;
}

export async function linkUnmappedSourceShortsToMapping(
  mappingId: string,
  sourceChannelId: string,
  sourceChannelUrl: string | null | undefined,
  targetChannelId: string
): Promise<number> {
  const now = new Date().toISOString();
  let linked = 0;

  const { data: byId, error: byIdError } = await supabaseAdmin
    .from('shorts_data')
    .update({
      mapping_id: mappingId,
      target_channel: targetChannelId,
      updated_at: now,
    })
    .is('mapping_id', null)
    .eq('source_channel', sourceChannelId)
    .select('id');

  if (byIdError) {
    console.error('Error linking source shorts by channel_id:', byIdError);
  } else {
    linked += (byId || []).length;
  }

  if (sourceChannelUrl) {
    const { data: byUrl, error: byUrlError } = await supabaseAdmin
      .from('shorts_data')
      .update({
        mapping_id: mappingId,
        target_channel: targetChannelId,
        updated_at: now,
      })
      .is('mapping_id', null)
      .eq('source_channel', sourceChannelUrl)
      .select('id');

    if (byUrlError) {
      console.error('Error linking source shorts by channel_url:', byUrlError);
    } else {
      linked += (byUrl || []).length;
    }
  }

  return linked;
}

export async function deleteShort(id: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('shorts_data')
    .delete()
    .eq('id', id);

  return !error;
}

export async function incrementRetryCount(id: string, errorLog: string): Promise<boolean> {
  const short = await getShortById(id);
  if (!short) return false;
  
  return updateShort(id, {
    retry_count: short.retry_count + 1,
    error_log: errorLog,
    status: short.retry_count >= 2 ? 'Failed' : 'Pending'
  });
}

function extractSourceIdentifiers(
  short: Pick<ShortsData, 'source_channel'>,
  mapping: Pick<ChannelMapping, 'source_channel_id' | 'source_channel_url'> | null
): { sourceChannelId?: string; sourceChannelUrl?: string } {
  const fromMappingId = mapping?.source_channel_id?.trim();
  const fromMappingUrl = mapping?.source_channel_url?.trim();
  const fromShort = short.source_channel?.trim();

  const sourceChannelUrl =
    fromMappingUrl ||
    (fromShort && fromShort.includes('youtube.com') ? fromShort : undefined);

  const sourceChannelId =
    fromMappingId ||
    (fromShort && !fromShort.includes('youtube.com') ? fromShort : undefined);

  return {
    sourceChannelId: sourceChannelId || undefined,
    sourceChannelUrl: sourceChannelUrl || undefined,
  };
}

async function getActiveMappingCountForSource(
  sourceChannelId?: string,
  sourceChannelUrl?: string
): Promise<number | null> {
  const mappingIds = new Set<string>();

  if (sourceChannelId) {
    const { data, error } = await supabaseAdmin
      .from('channel_mappings')
      .select('id')
      .eq('is_active', true)
      .eq('source_channel_id', sourceChannelId);

    if (error) {
      console.error('Error fetching active mappings by source_channel_id:', error);
      return null;
    }

    for (const row of data || []) {
      if (row.id) mappingIds.add(row.id as string);
    }
  }

  if (sourceChannelUrl) {
    const { data, error } = await supabaseAdmin
      .from('channel_mappings')
      .select('id')
      .eq('is_active', true)
      .eq('source_channel_url', sourceChannelUrl);

    if (error) {
      console.error('Error fetching active mappings by source_channel_url:', error);
      return null;
    }

    for (const row of data || []) {
      if (row.id) mappingIds.add(row.id as string);
    }
  }

  return mappingIds.size;
}

export async function cleanupUploadedShortsForSingleDestination(
  options?: { olderThanHours?: number; limit?: number }
): Promise<{ checked: number; deleted: number }> {
  const olderThanHours = options?.olderThanHours ?? 5;
  const limit = options?.limit ?? 200;
  const cutoffDate = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();

  const { data: uploadedShorts, error } = await supabaseAdmin
    .from('shorts_data')
    .select('id, mapping_id, source_channel')
    .eq('status', 'Uploaded')
    .lte('uploaded_date', cutoffDate)
    .order('uploaded_date', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Error loading uploaded shorts for cleanup:', error);
    return { checked: 0, deleted: 0 };
  }

  const mappingCache = new Map<string, ChannelMapping | null>();
  let deleted = 0;

  for (const short of uploadedShorts || []) {
    let mapping: ChannelMapping | null = null;

    if (short.mapping_id) {
      if (!mappingCache.has(short.mapping_id)) {
        const loaded = await getChannelMappingById(short.mapping_id);
        mappingCache.set(short.mapping_id, loaded);
      }
      mapping = mappingCache.get(short.mapping_id) || null;
    }

    const { sourceChannelId, sourceChannelUrl } = extractSourceIdentifiers(short, mapping);
    if (!sourceChannelId && !sourceChannelUrl) {
      continue;
    }

    const activeMappingCount = await getActiveMappingCountForSource(sourceChannelId, sourceChannelUrl);
    if (activeMappingCount === null) {
      continue;
    }

    // Keep shorts only if source channel is actively mapped to multiple destinations.
    if (activeMappingCount > 1) {
      continue;
    }

    const { error: logDeleteError } = await supabaseAdmin
      .from('upload_logs')
      .delete()
      .eq('short_id', short.id);

    if (logDeleteError) {
      console.error('Error deleting logs during uploaded-short cleanup:', logDeleteError);
      continue;
    }

    const { error: shortDeleteError } = await supabaseAdmin
      .from('shorts_data')
      .delete()
      .eq('id', short.id);

    if (shortDeleteError) {
      console.error('Error deleting uploaded short during cleanup:', shortDeleteError);
      continue;
    }

    deleted++;
  }

  return {
    checked: (uploadedShorts || []).length,
    deleted,
  };
}

// ==================== UPLOAD LOGS ====================

export async function createLog(
  shortId: string | null, 
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

export async function getRecentScrapeRuns(limit: number = 50): Promise<UploadLog[]> {
  const { data, error } = await supabaseAdmin
    .from('upload_logs')
    .select('*')
    .eq('action', 'scrape')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return data || [];
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
    todayResult,
    mappingsResult
  ] = await Promise.all([
    supabaseAdmin.from('shorts_data').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('shorts_data').select('*', { count: 'exact', head: true }).eq('status', 'Pending'),
    supabaseAdmin.from('shorts_data').select('*', { count: 'exact', head: true }).eq('status', 'Uploaded'),
    supabaseAdmin.from('shorts_data').select('*', { count: 'exact', head: true }).eq('status', 'Failed'),
    supabaseAdmin.from('shorts_data').select('*', { count: 'exact', head: true })
      .gte('uploaded_date', new Date().toISOString().split('T')[0]),
    supabaseAdmin.from('channel_mappings').select('*', { count: 'exact', head: true }).eq('is_active', true)
  ]);

  return {
    total: totalResult.count || 0,
    pending: pendingResult.count || 0,
    uploaded: uploadedResult.count || 0,
    failed: failedResult.count || 0,
    uploadedToday: todayResult.count || 0,
    activeMappings: mappingsResult.count || 0
  };
}
