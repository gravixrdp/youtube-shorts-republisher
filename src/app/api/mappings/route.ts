import { NextRequest, NextResponse } from 'next/server';
import { 
  getChannelMappings, 
  getActiveChannelMappings,
  type ChannelMapping,
  createChannelMapping, 
  updateChannelMapping, 
  deleteChannelMapping,
  linkUnmappedSourceShortsToMapping,
  getMappingPublishDelayHoursMap,
  setMappingPublishDelayHours
} from '@/lib/supabase/database';

function normalizeTime(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(trimmed) ? trimmed : fallback;
}

function normalizeUploadsPerDay(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.min(24, Math.max(1, Math.floor(numeric)));
}

function normalizePublishDelayHours(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed || trimmed === 'global' || trimmed === '__global__') {
      return null;
    }
  }

  const numeric = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  return Math.min(72, Math.max(0, Math.floor(numeric)));
}

// GET - Fetch all channel mappings
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const activeOnly = searchParams.get('active') === 'true';
    
    const mappings = activeOnly 
      ? await getActiveChannelMappings() 
      : await getChannelMappings();

    const delayByMappingId = await getMappingPublishDelayHoursMap((mappings || []).map((mapping) => mapping.id));
    const hydratedMappings = (mappings || []).map((mapping) => ({
      ...mapping,
      publish_delay_hours: delayByMappingId.get(mapping.id) ?? null,
    }));

    return NextResponse.json({ success: true, mappings: hydratedMappings });
  } catch (error) {
    console.error('Mappings GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch channel mappings' },
      { status: 500 }
    );
  }
}

// POST - Create new channel mapping
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      name,
      source_channel_id, 
      source_channel_url,
      source_channel_name,
      target_channel_id, 
      target_channel_name,
      uploads_per_day,
      upload_time_morning,
      upload_time_evening,
      default_visibility,
      ai_enhancement_enabled,
      publish_delay_hours,
    } = body;
    
    if (!name || !source_channel_id || !source_channel_url || !target_channel_id) {
      return NextResponse.json(
        { success: false, error: 'Name, source channel, source channel URL, and target channel are required' },
        { status: 400 }
      );
    }
    
    const mapping = await createChannelMapping({
      name,
      source_channel_id: source_channel_id || '',
      source_channel_url,
      source_channel_name,
      target_channel_id,
      target_channel_name,
      uploads_per_day: normalizeUploadsPerDay(uploads_per_day, 2),
      upload_time_morning: normalizeTime(upload_time_morning, '09:00'),
      upload_time_evening: normalizeTime(upload_time_evening, '18:00'),
      default_visibility: default_visibility || 'public',
      ai_enhancement_enabled: ai_enhancement_enabled || false,
      is_active: true
    });
    
    if (mapping) {
      const delaySaved = await setMappingPublishDelayHours(mapping.id, normalizePublishDelayHours(publish_delay_hours));
      const linkedShorts = await linkUnmappedSourceShortsToMapping(
        mapping.id,
        source_channel_id,
        source_channel_url,
        target_channel_id
      );

      if (!delaySaved) {
        return NextResponse.json(
          { success: false, error: 'Mapping created but failed to save publish delay override' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        mapping: {
          ...mapping,
          publish_delay_hours: normalizePublishDelayHours(publish_delay_hours),
        },
        linked_shorts: linkedShorts,
      });
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to create channel mapping' },
      { status: 500 }
    );
  } catch (error) {
    console.error('Mappings POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create mapping' },
      { status: 500 }
    );
  }
}

// PUT - Update channel mapping
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, publish_delay_hours, ...data } = body;
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID is required' },
        { status: 400 }
      );
    }
    
    const normalizedData = { ...data } as Partial<ChannelMapping> & Record<string, unknown>;

    if ('upload_time_morning' in normalizedData) {
      normalizedData.upload_time_morning = normalizeTime(normalizedData.upload_time_morning, '09:00');
    }

    if ('upload_time_evening' in normalizedData) {
      normalizedData.upload_time_evening = normalizeTime(normalizedData.upload_time_evening, '18:00');
    }

    if ('uploads_per_day' in normalizedData) {
      normalizedData.uploads_per_day = normalizeUploadsPerDay(normalizedData.uploads_per_day, 2);
    }

    const hasDelayOverride = Object.prototype.hasOwnProperty.call(body, 'publish_delay_hours');
    const [success, delaySaved] = await Promise.all([
      updateChannelMapping(id, normalizedData),
      hasDelayOverride ? setMappingPublishDelayHours(id, normalizePublishDelayHours(publish_delay_hours)) : Promise.resolve(true),
    ]);

    return NextResponse.json({ success: success && delaySaved });
  } catch (error) {
    console.error('Mappings PUT error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update mapping' },
      { status: 500 }
    );
  }
}

// DELETE - Delete channel mapping
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    const cleanupMappedShorts = searchParams.get('cleanupMappedShorts') !== 'false';
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID is required' },
        { status: 400 }
      );
    }
    
    const success = await deleteChannelMapping(id, { removeMappedShorts: cleanupMappedShorts });
    return NextResponse.json({ success, cleanupMappedShorts });
  } catch (error) {
    console.error('Mappings DELETE error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete mapping' },
      { status: 500 }
    );
  }
}
