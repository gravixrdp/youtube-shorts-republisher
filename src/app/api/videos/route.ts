import { NextRequest, NextResponse } from 'next/server';
import { 
  createShort, 
  getShortByVideoIdForScope,
  getAllShorts, 
  updateShort, 
  deleteShort,
  createLog,
  getChannelMappings,
  updateLastFetched,
  getChannelMappingById
} from '@/lib/supabase/database';
import { fetchShortsFromChannel } from '@/lib/youtube/scraper';
import { getSourceChannels } from '@/lib/youtube/source-channels';
import { supabaseAdmin, type ShortsData } from '@/lib/supabase/client';

type PipelineAction = 'process' | 'download' | 'validation' | 'quality' | 'upload' | 'publish';

interface PipelineLogRow {
  short_id: string | null;
  action: string;
  status: 'success' | 'error';
  message: string | null;
  created_at: string;
}

interface LivePipelineState {
  live_stage: string;
  live_message: string;
  live_at: string;
  live_action: PipelineAction | null;
  live_action_status: 'success' | 'error' | null;
}

const PIPELINE_ACTIONS: PipelineAction[] = ['process', 'download', 'validation', 'quality', 'upload', 'publish'];
const PIPELINE_ACTION_SET = new Set<string>(PIPELINE_ACTIONS);

function normalizeMessage(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function fallbackPipelineState(short: ShortsData): LivePipelineState {
  if (short.status === 'Pending') {
    return {
      live_stage: 'Queue Pending',
      live_message: 'Waiting for processing',
      live_at: short.updated_at,
      live_action: null,
      live_action_status: null,
    };
  }

  if (short.status === 'Downloaded') {
    return {
      live_stage: 'Downloaded',
      live_message: 'Video downloaded. Waiting for quality/upload stage.',
      live_at: short.updated_at,
      live_action: null,
      live_action_status: null,
    };
  }

  if (short.status === 'Uploading') {
    return {
      live_stage: 'Uploading',
      live_message: 'Upload in progress',
      live_at: short.updated_at,
      live_action: null,
      live_action_status: null,
    };
  }

  if (short.status === 'Failed') {
    return {
      live_stage: 'Failed',
      live_message: normalizeMessage(short.error_log) || 'Processing failed',
      live_at: short.updated_at,
      live_action: null,
      live_action_status: null,
    };
  }

  if (short.status === 'Uploaded') {
    if (short.scheduled_date) {
      return {
        live_stage: 'Scheduled',
        live_message: `Public publish scheduled at ${short.scheduled_date}`,
        live_at: short.updated_at,
        live_action: null,
        live_action_status: null,
      };
    }

    return {
      live_stage: 'Uploaded',
      live_message: short.target_video_id ? `Uploaded as ${short.target_video_id}` : 'Uploaded successfully',
      live_at: short.updated_at,
      live_action: null,
      live_action_status: null,
    };
  }

  return {
    live_stage: short.status,
    live_message: short.status,
    live_at: short.updated_at,
    live_action: null,
    live_action_status: null,
  };
}

function pipelineStateFromLog(short: ShortsData, log: PipelineLogRow): LivePipelineState {
  const action = log.action as PipelineAction;
  const message = normalizeMessage(log.message);

  if (log.status === 'error') {
    return {
      live_stage: `${action.toUpperCase()} Error`,
      live_message: message || `${action} failed`,
      live_at: log.created_at,
      live_action: action,
      live_action_status: log.status,
    };
  }

  if (action === 'process') {
    return {
      live_stage: 'Processing',
      live_message: message || 'Process started',
      live_at: log.created_at,
      live_action: action,
      live_action_status: log.status,
    };
  }

  if (action === 'download') {
    const stage = message.toLowerCase().includes('starting') ? 'Downloading' : 'Downloaded';
    return {
      live_stage: stage,
      live_message: message || 'Download completed',
      live_at: log.created_at,
      live_action: action,
      live_action_status: log.status,
    };
  }

  if (action === 'validation') {
    return {
      live_stage: 'Validating',
      live_message: message || 'Validation completed',
      live_at: log.created_at,
      live_action: action,
      live_action_status: log.status,
    };
  }

  if (action === 'quality') {
    const lower = message.toLowerCase();
    const stage = lower.includes('starting') ? 'Enhancing HD' : 'Quality Ready';
    return {
      live_stage: stage,
      live_message: message || 'Quality preparation completed',
      live_at: log.created_at,
      live_action: action,
      live_action_status: log.status,
    };
  }

  if (action === 'upload') {
    const lower = message.toLowerCase();
    const stage = lower.includes('starting') ? 'Uploading' : 'Upload Complete';
    return {
      live_stage: stage,
      live_message: message || 'Upload finished',
      live_at: log.created_at,
      live_action: action,
      live_action_status: log.status,
    };
  }

  if (action === 'publish') {
    const lower = message.toLowerCase();
    let stage = 'Publish';
    if (lower.includes('scheduled')) {
      stage = 'Scheduled';
    } else if (lower.includes('public')) {
      stage = 'Published';
    }

    return {
      live_stage: stage,
      live_message: message || 'Publish stage updated',
      live_at: log.created_at,
      live_action: action,
      live_action_status: log.status,
    };
  }

  return fallbackPipelineState(short);
}

async function attachLivePipelineState(shorts: ShortsData[]): Promise<Array<ShortsData & LivePipelineState>> {
  if (shorts.length === 0) {
    return [];
  }

  const shortIds = Array.from(new Set(shorts.map((short) => short.id).filter(Boolean)));
  if (shortIds.length === 0) {
    return shorts.map((short) => ({ ...short, ...fallbackPipelineState(short) }));
  }

  const logQueryLimit = Math.min(2500, Math.max(200, shortIds.length * 16));
  const { data: logRows, error } = await supabaseAdmin
    .from('upload_logs')
    .select('short_id, action, status, message, created_at')
    .in('short_id', shortIds)
    .order('created_at', { ascending: false })
    .limit(logQueryLimit);

  if (error || !logRows) {
    if (error) {
      console.error('Failed to load live pipeline logs:', error);
    }
    return shorts.map((short) => ({ ...short, ...fallbackPipelineState(short) }));
  }

  const latestByShortId = new Map<string, PipelineLogRow>();
  for (const row of logRows as PipelineLogRow[]) {
    const shortId = row.short_id?.trim();
    if (!shortId || latestByShortId.has(shortId)) {
      continue;
    }
    if (!PIPELINE_ACTION_SET.has(row.action)) {
      continue;
    }
    latestByShortId.set(shortId, row);
  }

  return shorts.map((short) => {
    const latestLog = latestByShortId.get(short.id);
    if (!latestLog) {
      return {
        ...short,
        ...fallbackPipelineState(short),
      };
    }

    return {
      ...short,
      ...pipelineStateFromLog(short, latestLog),
    };
  });
}

async function createScrapeRunLog(
  status: 'success' | 'error',
  message: string,
  details?: {
    source_channel_id?: string;
    source_channel_url?: string;
    mapping_id?: string;
    mapping_name?: string;
    total?: number;
    added?: number;
    duplicates?: number;
    errors?: number;
  }
) {
  await createLog(null, 'scrape', status, message, details);
}

// GET - Fetch all shorts
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const parsedLimit = Number.parseInt(searchParams.get('limit') || '50', 10);
    const parsedOffset = Number.parseInt(searchParams.get('offset') || '0', 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(200, Math.max(1, parsedLimit)) : 50;
    const offset = Number.isFinite(parsedOffset) ? Math.max(0, parsedOffset) : 0;
    const status = searchParams.get('status');
    const mappingId = searchParams.get('mappingId');
    const withTotal = searchParams.get('withTotal') !== 'false';
    const includeProgress = searchParams.get('includeProgress') !== 'false';
    
    if (status) {
      const { getShortsByStatus } = await import('@/lib/supabase/database');
      const shorts = await getShortsByStatus(status);
      const payload = includeProgress ? await attachLivePipelineState(shorts as ShortsData[]) : shorts;
      return NextResponse.json({ success: true, shorts: payload });
    }
    
    const { data, total } = await getAllShorts(limit, offset, withTotal);
    const payload = includeProgress ? await attachLivePipelineState(data as ShortsData[]) : data;
    return NextResponse.json({ success: true, shorts: payload, total });
  } catch (error) {
    console.error('Videos GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch videos' },
      { status: 500 }
    );
  }
}

// POST - Fetch shorts from channel and store
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, channelUrl, mappingId, ...data } = body;

    const persistShort = async (
      payload: Parameters<typeof createShort>[0],
      duplicateScope?: {
        mappingId?: string | null;
        sourceChannel?: string | null;
      }
    ) => {
      const created = await createShort(payload);
      if (created) {
        await createLog(created.id, 'fetch', 'success', 'Fetched from source channel');
        return 'added' as const;
      }

      // If insert failed but video exists now, treat as duplicate (safe on restart/re-scrape).
      const existing =
        payload.video_id
          ? await getShortByVideoIdForScope(payload.video_id, {
              mappingId:
                duplicateScope && Object.prototype.hasOwnProperty.call(duplicateScope, 'mappingId')
                  ? duplicateScope.mappingId ?? null
                  : undefined,
              sourceChannel: duplicateScope?.sourceChannel || null,
            })
          : null;
      if (existing) {
        return 'duplicate' as const;
      }

      return 'error' as const;
    };

    // Fetch shorts for one source channel (manual scraping without mapping)
    if (action === 'fetch-source') {
      const sourceChannelId = typeof body.sourceChannelId === 'string' ? body.sourceChannelId : '';
      const sourceChannelUrl = typeof body.sourceChannelUrl === 'string' ? body.sourceChannelUrl : '';

      if (!sourceChannelId || !sourceChannelUrl) {
        return NextResponse.json(
          { success: false, error: 'sourceChannelId and sourceChannelUrl are required' },
          { status: 400 }
        );
      }

      const sources = await getSourceChannels();
      const source = sources.find((item) => item.channel_id === sourceChannelId);

      if (!source) {
        return NextResponse.json(
          { success: false, error: 'Source channel not found' },
          { status: 404 }
        );
      }

      if (!source.is_active) {
        return NextResponse.json(
          { success: false, error: 'Scraping is stopped for this source channel. Start scraping first.' },
          { status: 400 }
        );
      }

      const result = await fetchShortsFromChannel(sourceChannelUrl, 500);

      if (!result.success) {
        await createScrapeRunLog('error', result.error || 'Scraping failed for source', {
          source_channel_id: sourceChannelId,
          source_channel_url: sourceChannelUrl,
        });

        return NextResponse.json(
          { success: false, error: result.error || 'Failed to scrape source channel' },
          { status: 400 }
        );
      }

      let added = 0;
      let duplicates = 0;
      let errors = 0;

      for (const short of result.shorts) {
        const outcome = await persistShort({
          video_id: short.videoId,
          video_url: short.videoUrl,
          title: short.title,
          description: short.description,
          tags: short.tags,
          thumbnail_url: short.thumbnailUrl,
          duration: short.duration,
          published_date: short.publishedDate,
          status: 'Pending',
          mapping_id: null,
          source_channel: sourceChannelId,
          target_channel: null,
        }, {
          mappingId: null,
          sourceChannel: sourceChannelId,
        });

        if (outcome === 'added') added++;
        else if (outcome === 'duplicate') duplicates++;
        else errors++;
      }

      await createScrapeRunLog('success', `Scrape completed for source ${source.channel_title}`, {
        source_channel_id: sourceChannelId,
        source_channel_url: sourceChannelUrl,
        total: result.shorts.length,
        added,
        duplicates,
        errors,
      });

      const message =
        result.shorts.length === 0
          ? 'No shorts found for this source. Verify channel has public shorts and correct URL.'
          : 'Scraping completed. Source shorts metadata synced to database.';

      return NextResponse.json({
        success: true,
        message,
        stats: { total: result.shorts.length, added, duplicates, errors },
      });
    }

    // Fetch shorts from all active sources (manual bulk scraping)
    if (action === 'fetch-all-sources') {
      const sources = (await getSourceChannels()).filter((source) => source.is_active);

      let totalAdded = 0;
      let totalDuplicates = 0;
      let totalErrors = 0;
      let totalFetched = 0;
      let sourcesWithNoShorts = 0;

      for (const source of sources) {
        const result = await fetchShortsFromChannel(source.channel_url, 500);

        if (!result.success) {
          await createScrapeRunLog('error', result.error || 'Scraping failed for source', {
            source_channel_id: source.channel_id,
            source_channel_url: source.channel_url,
          });
          continue;
        }

        let sourceAdded = 0;
        let sourceDuplicates = 0;
        let sourceErrors = 0;
        totalFetched += result.shorts.length;

        if (result.shorts.length === 0) {
          sourcesWithNoShorts++;
        }

        for (const short of result.shorts) {
          const outcome = await persistShort({
            video_id: short.videoId,
            video_url: short.videoUrl,
            title: short.title,
            description: short.description,
            tags: short.tags,
            thumbnail_url: short.thumbnailUrl,
            duration: short.duration,
            published_date: short.publishedDate,
            status: 'Pending',
            mapping_id: null,
            source_channel: source.channel_id,
            target_channel: null,
          }, {
            mappingId: null,
            sourceChannel: source.channel_id,
          });

          if (outcome === 'added') {
            sourceAdded++;
            totalAdded++;
          } else if (outcome === 'duplicate') {
            sourceDuplicates++;
            totalDuplicates++;
          } else {
            sourceErrors++;
            totalErrors++;
          }
        }

        await createScrapeRunLog('success', `Scrape completed for source ${source.channel_title}`, {
          source_channel_id: source.channel_id,
          source_channel_url: source.channel_url,
          total: result.shorts.length,
          added: sourceAdded,
          duplicates: sourceDuplicates,
          errors: sourceErrors,
        });
      }

      const noShortsSuffix =
        sourcesWithNoShorts > 0
          ? ` (${sourcesWithNoShorts} source${sourcesWithNoShorts > 1 ? 's' : ''} returned 0 shorts)`
          : '';

      return NextResponse.json({
        success: true,
        message: `Scraping completed for all active source channels.${noShortsSuffix}`,
        stats: {
          sources: sources.length,
          total: totalFetched,
          added: totalAdded,
          duplicates: totalDuplicates,
          errors: totalErrors,
        },
      });
    }
    
    // Fetch shorts from specific channel (with mapping)
    if (action === 'fetch') {
      if (!channelUrl) {
        return NextResponse.json(
          { success: false, error: 'Channel URL is required' },
          { status: 400 }
        );
      }

      const mapping = mappingId ? await getChannelMappingById(mappingId) : null;
      if (mappingId && !mapping) {
        return NextResponse.json(
          { success: false, error: 'Mapping not found' },
          { status: 404 }
        );
      }

      if (mapping?.source_channel_id) {
        const sources = await getSourceChannels();
        const source = sources.find((item) => item.channel_id === mapping.source_channel_id);
        if (source && !source.is_active) {
          return NextResponse.json(
            { success: false, error: 'Scraping is stopped for this source channel. Start scraping first.' },
            { status: 400 }
          );
        }
      }
      
      const result = await fetchShortsFromChannel(channelUrl, 500);
      
      if (!result.success) {
        await createScrapeRunLog('error', result.error || 'Scraping failed for mapped source', {
          source_channel_id: mapping?.source_channel_id,
          source_channel_url: mapping?.source_channel_url || channelUrl,
          mapping_id: mappingId || undefined,
          mapping_name: mapping?.name || undefined,
        });

        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        );
      }
      
      // Store shorts in database with mapping
      let added = 0;
      let duplicates = 0;
      let errors = 0;
      const sourceChannelValue = mapping?.source_channel_id || channelUrl;
      
      for (const short of result.shorts) {
        const outcome = await persistShort({
          video_id: short.videoId,
          video_url: short.videoUrl,
          title: short.title,
          description: short.description,
          tags: short.tags,
          thumbnail_url: short.thumbnailUrl,
          duration: short.duration,
          published_date: short.publishedDate,
          status: 'Pending',
          mapping_id: mappingId || null,
          source_channel: sourceChannelValue,
          target_channel: mapping?.target_channel_id || null
        }, {
          mappingId: mappingId || null,
          sourceChannel: sourceChannelValue,
        });
        
        if (outcome === 'added') added++;
        else if (outcome === 'duplicate') duplicates++;
        else errors++;
      }
      
      // Update last fetched time for mapping
      if (mappingId) {
        await updateLastFetched(mappingId);
      }

      await createScrapeRunLog('success', 'Scrape completed for mapped source', {
        source_channel_id: mapping?.source_channel_id,
        source_channel_url: mapping?.source_channel_url || channelUrl,
        mapping_id: mappingId || undefined,
        mapping_name: mapping?.name || undefined,
        total: result.shorts.length,
        added,
        duplicates,
        errors,
      });

      const message =
        result.shorts.length === 0
          ? 'No shorts found for this mapped source. Verify channel has public shorts and correct URL.'
          : 'Scraping completed. Source shorts metadata synced to database.';
      
      return NextResponse.json({
        success: true,
        message,
        stats: { total: result.shorts.length, added, duplicates, errors }
      });
    }
    
    // Fetch from all active mappings
    if (action === 'fetch-all') {
      const mappings = await getChannelMappings();
      const sourceChannels = await getSourceChannels();
      const sourceById = new Map(sourceChannels.map((source) => [source.channel_id, source]));
      const sourceByUrl = new Map(sourceChannels.map((source) => [source.channel_url, source]));

      const activeMappings = mappings.filter((mapping) => {
        if (!mapping.is_active) {
          return false;
        }

        const source = sourceById.get(mapping.source_channel_id) || sourceByUrl.get(mapping.source_channel_url);
        return source ? source.is_active : true;
      });
      
      let totalAdded = 0;
      let totalDuplicates = 0;
      let totalErrors = 0;
      let mappingsWithNoShorts = 0;
      
      for (const mapping of activeMappings) {
        const result = await fetchShortsFromChannel(mapping.source_channel_url, 500);
        
        if (!result.success) {
          await createScrapeRunLog('error', result.error || 'Scraping failed for mapping source', {
            source_channel_id: mapping.source_channel_id,
            source_channel_url: mapping.source_channel_url,
            mapping_id: mapping.id,
            mapping_name: mapping.name,
          });
          continue;
        }

        let mappingAdded = 0;
        let mappingDuplicates = 0;
        let mappingErrors = 0;

        if (result.shorts.length === 0) {
          mappingsWithNoShorts++;
        }
        const sourceChannelValue = mapping.source_channel_id || mapping.source_channel_url;
        
        for (const short of result.shorts) {
          const outcome = await persistShort({
            video_id: short.videoId,
            video_url: short.videoUrl,
            title: short.title,
            description: short.description,
            tags: short.tags,
            thumbnail_url: short.thumbnailUrl,
            duration: short.duration,
            published_date: short.publishedDate,
            status: 'Pending',
            mapping_id: mapping.id,
            source_channel: sourceChannelValue,
            target_channel: mapping.target_channel_id
          }, {
            mappingId: mapping.id,
            sourceChannel: sourceChannelValue,
          });
          
          if (outcome === 'added') {
            totalAdded++;
            mappingAdded++;
          } else if (outcome === 'duplicate') {
            totalDuplicates++;
            mappingDuplicates++;
          } else {
            totalErrors++;
            mappingErrors++;
          }
        }
        
        await updateLastFetched(mapping.id);

        await createScrapeRunLog('success', `Scrape completed for mapping ${mapping.name}`, {
          source_channel_id: mapping.source_channel_id,
          source_channel_url: mapping.source_channel_url,
          mapping_id: mapping.id,
          mapping_name: mapping.name,
          total: result.shorts.length,
          added: mappingAdded,
          duplicates: mappingDuplicates,
          errors: mappingErrors,
        });
      }

      const noShortsSuffix =
        mappingsWithNoShorts > 0
          ? ` (${mappingsWithNoShorts} mapping${mappingsWithNoShorts > 1 ? 's' : ''} returned 0 shorts)`
          : '';
      
      return NextResponse.json({
        success: true,
        message: `Scraping completed for all active source mappings.${noShortsSuffix}`,
        stats: { channels: activeMappings.length, total: totalAdded + totalDuplicates + totalErrors, added: totalAdded, duplicates: totalDuplicates, errors: totalErrors }
      });
    }
    
    // Create new short manually
    if (action === 'create') {
      const { video_id, video_url, title, description, tags, thumbnail_url, duration } = data;
      
      if (!video_id || !video_url || !title || !duration) {
        return NextResponse.json(
          { success: false, error: 'Missing required fields' },
          { status: 400 }
        );
      }
      
      // Check for duplicates
      const existing = await getShortByVideoIdForScope(video_id, {
        mappingId: mappingId || null,
      });
      if (existing) {
        return NextResponse.json(
          { success: false, error: 'Video already exists' },
          { status: 400 }
        );
      }
      
      const short = await createShort({
        video_id,
        video_url,
        title,
        description,
        tags,
        thumbnail_url,
        duration,
        status: 'Pending',
        mapping_id: mappingId || null
      });
      
      if (short) {
        await createLog(short.id, 'create', 'success', 'Manually added');
        return NextResponse.json({ success: true, short });
      }
      
      return NextResponse.json(
        { success: false, error: 'Failed to create short' },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Videos POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

// PUT - Update short
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...data } = body;
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID is required' },
        { status: 400 }
      );
    }
    
    const success = await updateShort(id, data);
    return NextResponse.json({ success });
  } catch (error) {
    console.error('Videos PUT error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update video' },
      { status: 500 }
    );
  }
}

// DELETE - Delete short
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID is required' },
        { status: 400 }
      );
    }
    
    const success = await deleteShort(id);
    return NextResponse.json({ success });
  } catch (error) {
    console.error('Videos DELETE error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete video' },
      { status: 500 }
    );
  }
}
