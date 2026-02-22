import { supabaseAdmin } from '@/lib/supabase/client';
import { getConfig, setConfig } from '@/lib/supabase/database';

const DESTINATION_CHANNELS_CONFIG_KEY = 'youtube_destination_channels';
let destinationChannelsMigrationChecked = false;

export interface DestinationChannelCredential {
  channel_id: string;
  channel_title: string;
  refresh_token: string;
  connected_at: string;
  updated_at: string;
}

function parseDestinationChannels(raw: string | null): DestinationChannelCredential[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => {
        const channel = item as Partial<DestinationChannelCredential>;

        if (
          typeof channel.channel_id !== 'string' ||
          typeof channel.channel_title !== 'string' ||
          typeof channel.refresh_token !== 'string'
        ) {
          return null;
        }

        return {
          channel_id: channel.channel_id,
          channel_title: channel.channel_title,
          refresh_token: channel.refresh_token,
          connected_at: typeof channel.connected_at === 'string' ? channel.connected_at : new Date().toISOString(),
          updated_at: typeof channel.updated_at === 'string' ? channel.updated_at : new Date().toISOString(),
        };
      })
      .filter((item): item is DestinationChannelCredential => Boolean(item));
  } catch {
    return [];
  }
}

async function migrateLegacyDestinationChannelsIfNeeded(): Promise<void> {
  if (destinationChannelsMigrationChecked) {
    return;
  }
  destinationChannelsMigrationChecked = true;

  const { count, error: countError } = await supabaseAdmin
    .from('destination_channels')
    .select('channel_id', { count: 'exact', head: true });

  if (countError) {
    console.error('Failed to read destination_channels table:', countError);
    return;
  }

  if ((count || 0) > 0) {
    return;
  }

  const legacyRaw = await getConfig(DESTINATION_CHANNELS_CONFIG_KEY);
  const legacyChannels = parseDestinationChannels(legacyRaw);
  if (legacyChannels.length === 0) {
    return;
  }

  const { error: migrateError } = await supabaseAdmin
    .from('destination_channels')
    .upsert(legacyChannels, { onConflict: 'channel_id' });

  if (migrateError) {
    console.error('Failed to migrate legacy destination channels:', migrateError);
    return;
  }
}

async function syncLegacyDestinationChannelsConfig(): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('destination_channels')
    .select('channel_id, channel_title, refresh_token, connected_at, updated_at')
    .order('connected_at', { ascending: false });

  if (error) {
    console.error('Failed to sync destination_channels back to legacy config:', error);
    return;
  }

  await setConfig(DESTINATION_CHANNELS_CONFIG_KEY, JSON.stringify(data || []));
}

export async function getDestinationChannelsWithTokens(): Promise<DestinationChannelCredential[]> {
  await migrateLegacyDestinationChannelsIfNeeded();

  const { data, error } = await supabaseAdmin
    .from('destination_channels')
    .select('channel_id, channel_title, refresh_token, connected_at, updated_at')
    .order('connected_at', { ascending: false });

  if (error) {
    console.error('Failed to read destination channels from table, falling back to legacy config:', error);
    const raw = await getConfig(DESTINATION_CHANNELS_CONFIG_KEY);
    return parseDestinationChannels(raw);
  }

  return (data || []) as DestinationChannelCredential[];
}

export async function getDestinationChannelsPublic(): Promise<Array<{ channel_id: string; channel_title: string; connected_at: string; updated_at: string }>> {
  const channels = await getDestinationChannelsWithTokens();

  return channels.map((channel) => ({
    channel_id: channel.channel_id,
    channel_title: channel.channel_title,
    connected_at: channel.connected_at,
    updated_at: channel.updated_at,
  }));
}

export async function saveDestinationChannels(channels: DestinationChannelCredential[]): Promise<boolean> {
  await migrateLegacyDestinationChannelsIfNeeded();

  if (channels.length > 0) {
    const { error: upsertError } = await supabaseAdmin
      .from('destination_channels')
      .upsert(channels, { onConflict: 'channel_id' });

    if (upsertError) {
      console.error('Failed to upsert destination channels:', upsertError);
      return false;
    }
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('destination_channels')
    .select('channel_id');

  if (existingError) {
    console.error('Failed to read existing destination channels for cleanup:', existingError);
    return false;
  }

  const keepIds = new Set(channels.map((channel) => channel.channel_id));
  const deleteIds = (existing || [])
    .map((row) => row.channel_id as string)
    .filter((id) => id && !keepIds.has(id));

  if (deleteIds.length > 0) {
    const { error: deleteError } = await supabaseAdmin
      .from('destination_channels')
      .delete()
      .in('channel_id', deleteIds);

    if (deleteError) {
      console.error('Failed to delete stale destination channels:', deleteError);
      return false;
    }
  }

  await syncLegacyDestinationChannelsConfig();
  return true;
}

export async function getRefreshTokenForDestinationChannel(channelId: string): Promise<string | null> {
  await migrateLegacyDestinationChannelsIfNeeded();

  const { data, error } = await supabaseAdmin
    .from('destination_channels')
    .select('refresh_token')
    .eq('channel_id', channelId)
    .single();

  if (error) {
    console.error(`Failed to read refresh token for destination ${channelId}:`, error);
    return null;
  }

  return (data?.refresh_token as string | undefined) || null;
}

export async function upsertDestinationChannelsFromOAuth(
  channelsFromOAuth: Array<{ channel_id: string; channel_title: string }>,
  refreshToken: string
): Promise<Array<{ channel_id: string; channel_title: string; connected_at: string; updated_at: string }>> {
  await migrateLegacyDestinationChannelsIfNeeded();
  const existing = await getDestinationChannelsWithTokens();
  const now = new Date().toISOString();
  const map = new Map(existing.map((channel) => [channel.channel_id, channel]));

  for (const channel of channelsFromOAuth) {
    const prev = map.get(channel.channel_id);

    map.set(channel.channel_id, {
      channel_id: channel.channel_id,
      channel_title: channel.channel_title,
      refresh_token: refreshToken,
      connected_at: prev?.connected_at || now,
      updated_at: now,
    });
  }

  const merged = Array.from(map.values());
  const saved = await saveDestinationChannels(merged);
  if (!saved) {
    return [];
  }

  return merged.map((channel) => ({
    channel_id: channel.channel_id,
    channel_title: channel.channel_title,
    connected_at: channel.connected_at,
    updated_at: channel.updated_at,
  }));
}
