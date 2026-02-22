import { supabaseAdmin } from '@/lib/supabase/client';
import { getConfig, setConfig } from '@/lib/supabase/database';
import { extractChannelId } from '@/lib/youtube/scraper';

const SOURCE_CHANNELS_CONFIG_KEY = 'youtube_source_channels';
let sourceChannelsMigrationChecked = false;

export interface SourceChannel {
  channel_id: string;
  channel_title: string;
  channel_url: string;
  is_active: boolean;
  connected_at: string;
  updated_at: string;
}

export interface UpsertSourceChannelInput {
  channel_id?: string;
  channel_title?: string;
  channel_url: string;
  is_active?: boolean;
}

function normalizeChannelUrl(value: string): string {
  return value.trim();
}

function deriveSourceChannelId(input: { channel_id?: string; channel_url: string }): string {
  const explicitId = input.channel_id?.trim();
  if (explicitId) {
    return explicitId;
  }

  const extracted = extractChannelId(input.channel_url.trim());
  if (extracted?.trim()) {
    return extracted.trim();
  }

  return `source_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function parseSourceChannels(raw: string | null): SourceChannel[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => {
        const source = item as Partial<SourceChannel>;

        if (
          typeof source.channel_id !== 'string' ||
          typeof source.channel_title !== 'string' ||
          typeof source.channel_url !== 'string'
        ) {
          return null;
        }

        return {
          channel_id: source.channel_id,
          channel_title: source.channel_title,
          channel_url: source.channel_url,
          is_active: typeof source.is_active === 'boolean' ? source.is_active : true,
          connected_at: typeof source.connected_at === 'string' ? source.connected_at : new Date().toISOString(),
          updated_at: typeof source.updated_at === 'string' ? source.updated_at : new Date().toISOString(),
        };
      })
      .filter((item): item is SourceChannel => Boolean(item));
  } catch {
    return [];
  }
}

async function migrateLegacySourceChannelsIfNeeded(): Promise<void> {
  if (sourceChannelsMigrationChecked) {
    return;
  }
  sourceChannelsMigrationChecked = true;

  const { count, error: countError } = await supabaseAdmin
    .from('source_channels')
    .select('channel_id', { count: 'exact', head: true });

  if (countError) {
    console.error('Failed to read source_channels table:', countError);
    return;
  }

  if ((count || 0) > 0) {
    return;
  }

  const legacyRaw = await getConfig(SOURCE_CHANNELS_CONFIG_KEY);
  const legacyChannels = parseSourceChannels(legacyRaw);
  if (legacyChannels.length === 0) {
    return;
  }

  const { error: migrateError } = await supabaseAdmin
    .from('source_channels')
    .upsert(legacyChannels, { onConflict: 'channel_id' });

  if (migrateError) {
    console.error('Failed to migrate legacy source channels:', migrateError);
    return;
  }
}

async function syncLegacySourceChannelsConfig(): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('source_channels')
    .select('channel_id, channel_title, channel_url, is_active, connected_at, updated_at')
    .order('connected_at', { ascending: false });

  if (error) {
    console.error('Failed to sync source_channels back to legacy config:', error);
    return;
  }

  await setConfig(SOURCE_CHANNELS_CONFIG_KEY, JSON.stringify(data || []));
}

export async function getSourceChannels(): Promise<SourceChannel[]> {
  await migrateLegacySourceChannelsIfNeeded();

  const { data, error } = await supabaseAdmin
    .from('source_channels')
    .select('channel_id, channel_title, channel_url, is_active, connected_at, updated_at')
    .order('connected_at', { ascending: false });

  if (error) {
    console.error('Failed to read source channels from table, falling back to legacy config:', error);
    const raw = await getConfig(SOURCE_CHANNELS_CONFIG_KEY);
    return parseSourceChannels(raw);
  }

  return (data || []) as SourceChannel[];
}

export async function saveSourceChannels(channels: SourceChannel[]): Promise<boolean> {
  await migrateLegacySourceChannelsIfNeeded();

  if (channels.length > 0) {
    const { error: upsertError } = await supabaseAdmin
      .from('source_channels')
      .upsert(channels, { onConflict: 'channel_id' });

    if (upsertError) {
      console.error('Failed to upsert source channels:', upsertError);
      return false;
    }
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('source_channels')
    .select('channel_id');

  if (existingError) {
    console.error('Failed to read existing source channels for cleanup:', existingError);
    return false;
  }

  const keepIds = new Set(channels.map((channel) => channel.channel_id));
  const deleteIds = (existing || [])
    .map((row) => row.channel_id as string)
    .filter((id) => id && !keepIds.has(id));

  if (deleteIds.length > 0) {
    const { error: deleteError } = await supabaseAdmin
      .from('source_channels')
      .delete()
      .in('channel_id', deleteIds);

    if (deleteError) {
      console.error('Failed to delete stale source channels:', deleteError);
      return false;
    }
  }

  await syncLegacySourceChannelsConfig();
  return true;
}

export async function upsertSourceChannel(input: UpsertSourceChannelInput): Promise<SourceChannel | null> {
  const normalizedUrl = normalizeChannelUrl(input.channel_url);
  if (!normalizedUrl) {
    return null;
  }

  await migrateLegacySourceChannelsIfNeeded();
  const existing = await getSourceChannels();
  const now = new Date().toISOString();
  const channelId = deriveSourceChannelId({ channel_id: input.channel_id, channel_url: normalizedUrl });

  const previous = existing.find(
    (channel) => channel.channel_id === channelId || channel.channel_url === normalizedUrl,
  );

  const updated: SourceChannel = {
    channel_id: previous?.channel_id || channelId,
    channel_title: input.channel_title?.trim() || previous?.channel_title || channelId,
    channel_url: normalizedUrl,
    is_active: typeof input.is_active === 'boolean' ? input.is_active : previous?.is_active ?? true,
    connected_at: previous?.connected_at || now,
    updated_at: now,
  };

  const { data, error } = await supabaseAdmin
    .from('source_channels')
    .upsert(updated, { onConflict: 'channel_id' })
    .select('channel_id, channel_title, channel_url, is_active, connected_at, updated_at')
    .single();

  if (error) {
    console.error('Failed to save source channel:', error);
    return null;
  }

  await syncLegacySourceChannelsConfig();
  return (data || null) as SourceChannel | null;
}

export async function updateSourceChannel(
  channelId: string,
  patch: Partial<Pick<SourceChannel, 'channel_title' | 'channel_url' | 'is_active'>>,
): Promise<SourceChannel | null> {
  await migrateLegacySourceChannelsIfNeeded();
  const existing = await getSourceChannels();
  const index = existing.findIndex((channel) => channel.channel_id === channelId);

  if (index < 0) {
    return null;
  }

  const current = existing[index];
  const updated: SourceChannel = {
    ...current,
    channel_title: typeof patch.channel_title === 'string' ? patch.channel_title.trim() || current.channel_title : current.channel_title,
    channel_url: typeof patch.channel_url === 'string' ? normalizeChannelUrl(patch.channel_url) || current.channel_url : current.channel_url,
    is_active: typeof patch.is_active === 'boolean' ? patch.is_active : current.is_active,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('source_channels')
    .update({
      channel_title: updated.channel_title,
      channel_url: updated.channel_url,
      is_active: updated.is_active,
      updated_at: updated.updated_at,
    })
    .eq('channel_id', channelId)
    .select('channel_id, channel_title, channel_url, is_active, connected_at, updated_at')
    .single();

  if (error) {
    console.error('Failed to update source channel:', error);
    return null;
  }

  await syncLegacySourceChannelsConfig();
  return (data || null) as SourceChannel | null;
}

export async function removeSourceChannel(channelId: string): Promise<{ success: boolean; removed?: SourceChannel }> {
  await migrateLegacySourceChannelsIfNeeded();

  const { data: removed, error: readError } = await supabaseAdmin
    .from('source_channels')
    .select('channel_id, channel_title, channel_url, is_active, connected_at, updated_at')
    .eq('channel_id', channelId)
    .single();

  if (readError || !removed) {
    if (readError) {
      console.error('Failed to load source channel before delete:', readError);
    }
    return { success: false };
  }

  const { error: deleteError } = await supabaseAdmin
    .from('source_channels')
    .delete()
    .eq('channel_id', channelId);

  if (deleteError) {
    console.error('Failed to delete source channel:', deleteError);
    return { success: false };
  }

  await syncLegacySourceChannelsConfig();

  return { success: true, removed: removed as SourceChannel };
}
