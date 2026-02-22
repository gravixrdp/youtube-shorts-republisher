import { NextRequest, NextResponse } from 'next/server';
import { 
  createShort, 
  getShortByVideoId, 
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

async function createScrapeRunLog(
  status: 'success' | 'error',
  message: string,
  details?: {
    source_channel_id?: string;
    source_channel_url?: string;
    mapping_id?: string;
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
    
    if (status) {
      const { getShortsByStatus } = await import('@/lib/supabase/database');
      const shorts = await getShortsByStatus(status);
      return NextResponse.json({ success: true, shorts });
    }
    
    const { data, total } = await getAllShorts(limit, offset, withTotal);
    return NextResponse.json({ success: true, shorts: data, total });
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

    const persistShort = async (payload: Parameters<typeof createShort>[0]) => {
      const created = await createShort(payload);
      if (created) {
        await createLog(created.id, 'fetch', 'success', 'Fetched from source channel');
        return 'added' as const;
      }

      // If insert failed but video exists now, treat as duplicate (safe on restart/re-scrape).
      const existing = payload.video_id ? await getShortByVideoId(payload.video_id) : null;
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
      
      for (const short of result.shorts) {
        // Check for duplicates
        const existing = await getShortByVideoId(short.videoId);
        if (existing) {
          duplicates++;
          continue;
        }
        
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
          source_channel: mapping?.source_channel_id || channelUrl,
          target_channel: mapping?.target_channel_id || null
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
          });
          continue;
        }

        let mappingAdded = 0;
        let mappingDuplicates = 0;
        let mappingErrors = 0;

        if (result.shorts.length === 0) {
          mappingsWithNoShorts++;
        }
        
        for (const short of result.shorts) {
          const existing = await getShortByVideoId(short.videoId);
          if (existing) {
            totalDuplicates++;
            mappingDuplicates++;
            continue;
          }
          
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
            source_channel: mapping.source_channel_id || mapping.source_channel_url,
            target_channel: mapping.target_channel_id
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
      const existing = await getShortByVideoId(video_id);
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
