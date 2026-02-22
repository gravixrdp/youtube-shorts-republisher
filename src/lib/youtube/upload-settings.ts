import { getChannelMappingById, getConfig, type ChannelMapping } from '@/lib/supabase/database';

export interface UploadBehavior {
  mapping: ChannelMapping | null;
  visibility: 'public' | 'unlisted' | 'private';
  aiEnabled: boolean;
  scheduledPublishAt: string | null;
  delayHours: number;
}

function normalizeVisibility(raw: string | null | undefined): 'public' | 'unlisted' | 'private' {
  if (raw === 'public' || raw === 'unlisted' || raw === 'private') {
    return raw;
  }
  return 'public';
}

function parseDelayHours(raw: string | null): number {
  if (!raw) {
    return 0;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return parsed;
}

export async function resolveUploadBehavior(mappingId: string | null): Promise<UploadBehavior> {
  const [mapping, globalVisibilityRaw, globalAiRaw, delayRaw] = await Promise.all([
    mappingId ? getChannelMappingById(mappingId) : Promise.resolve(null),
    getConfig('default_visibility'),
    getConfig('ai_enhancement_enabled'),
    getConfig('unlisted_publish_delay_hours'),
  ]);

  const globalVisibility = normalizeVisibility(globalVisibilityRaw);
  const mappingVisibility = normalizeVisibility(mapping?.default_visibility || globalVisibility);
  const aiEnabled = mapping ? Boolean(mapping.ai_enhancement_enabled) : globalAiRaw === 'true';
  const delayHours = parseDelayHours(delayRaw);
  const shouldSchedulePublish =
    delayHours > 0 && (mappingVisibility === 'unlisted' || mappingVisibility === 'private');

  return {
    mapping,
    visibility: mappingVisibility,
    aiEnabled,
    scheduledPublishAt: shouldSchedulePublish ? new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString() : null,
    delayHours,
  };
}
