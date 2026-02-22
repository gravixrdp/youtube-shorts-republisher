import { NextRequest, NextResponse } from 'next/server';
import { 
  getShortById, 
  updateShort, 
  createLog,
  getConfig,
  getChannelMappingById,
  cleanupUploadedShortsForSingleDestination,
  type ChannelMapping
} from '@/lib/supabase/database';
import { downloadVideo, validateVideo, deleteVideo } from '@/lib/youtube/video-handler';
import { uploadVideo, getVideoStatus } from '@/lib/youtube/uploader';
import { enhanceContent } from '@/lib/ai-enhancement';
import { getRefreshTokenForDestinationChannel } from '@/lib/youtube/destination-channels';
import { resolveUploadBehavior } from '@/lib/youtube/upload-settings';

async function resolveDestinationRefreshToken(mappingId: string | null): Promise<{ refreshToken?: string; error?: string }> {
  if (!mappingId) {
    return {};
  }

  const mapping = await getChannelMappingById(mappingId);
  if (!mapping || !mapping.target_channel_id) {
    return {};
  }

  const refreshToken = await getRefreshTokenForDestinationChannel(mapping.target_channel_id);
  if (!refreshToken) {
    return {
      error: `Destination channel ${mapping.target_channel_id} is not connected. Connect it from mapping screen.`,
    };
  }

  return { refreshToken };
}

async function runUploadedCleanup() {
  const cleanupHours = parseInt((await getConfig('uploaded_cleanup_hours')) || '5', 10);
  return cleanupUploadedShortsForSingleDestination({
    olderThanHours: Number.isNaN(cleanupHours) ? 5 : cleanupHours,
  });
}

function normalizeComparableTag(value: string): string {
  return value
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function extractHandleFromChannelUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/@([a-zA-Z0-9._-]+)/);
  return match?.[1] || null;
}

function buildSourceTagBlockList(sourceChannel: string | null | undefined, mapping: ChannelMapping | null): string[] {
  const values = [
    sourceChannel?.trim(),
    mapping?.source_channel_id?.trim(),
    mapping?.source_channel_url?.trim(),
    mapping?.source_channel_name?.trim() || null,
    extractHandleFromChannelUrl(sourceChannel),
    extractHandleFromChannelUrl(mapping?.source_channel_url),
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(values));
}

function shouldFilterByBlockedTerms(value: string, blockedComparables: Set<string>): boolean {
  if (blockedComparables.size === 0) {
    return false;
  }

  const comparable = normalizeComparableTag(value);
  if (!comparable) {
    return false;
  }

  for (const blocked of blockedComparables) {
    if (comparable === blocked || comparable.includes(blocked) || blocked.includes(comparable)) {
      return true;
    }
  }

  return false;
}

function filterBlockedTagValues(values: string[], blockedTerms: string[]): string[] {
  if (values.length === 0 || blockedTerms.length === 0) {
    return values;
  }

  const blockedComparables = new Set(
    blockedTerms
      .map((term) => normalizeComparableTag(term))
      .filter((term) => term.length >= 3)
  );

  return values.filter((value) => !shouldFilterByBlockedTerms(value, blockedComparables));
}

function stripBlockedHashtagsFromDescription(description: string, blockedTerms: string[]): string {
  if (!description || blockedTerms.length === 0) {
    return description;
  }

  const blockedComparables = new Set(
    blockedTerms
      .map((term) => normalizeComparableTag(term))
      .filter((term) => term.length >= 3)
  );

  if (blockedComparables.size === 0) {
    return description;
  }

  return description
    .replace(/#[a-zA-Z0-9_]+/g, (tag) => (shouldFilterByBlockedTerms(tag, blockedComparables) ? '' : tag))
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildUploadTags(existingTags: string[] | null, hashtags: string[], blockedTerms: string[]): string[] {
  const tags = [...(existingTags || []), ...hashtags]
    .map((value) => value.replace(/^#/, '').replace(/[^a-zA-Z0-9_]/g, '').trim())
    .filter(Boolean);

  return Array.from(new Set(filterBlockedTagValues(tags, blockedTerms))).slice(0, 20);
}

// POST - Download or Upload video
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, shortId } = body;
    
    if (!shortId) {
      return NextResponse.json(
        { success: false, error: 'Short ID is required' },
        { status: 400 }
      );
    }
    
    const short = await getShortById(shortId);
    if (!short) {
      return NextResponse.json(
        { success: false, error: 'Short not found' },
        { status: 404 }
      );
    }
    
    // Download video
    if (action === 'download') {
      await createLog(shortId, 'download', 'success', 'Starting download');
      
      const result = await downloadVideo(short.video_url, short.video_id);
      
      if (!result.success) {
        await updateShort(shortId, { 
          status: 'Failed', 
          error_log: result.error 
        });
        await createLog(shortId, 'download', 'error', result.error || 'Download failed');
        return NextResponse.json({ success: false, error: result.error });
      }
      
      // Validate video
      const validation = await validateVideo(result.filePath!);
      if (!validation.valid) {
        await deleteVideo(result.filePath!);
        await updateShort(shortId, { 
          status: 'Failed', 
          error_log: validation.error 
        });
        await createLog(shortId, 'validation', 'error', validation.error || 'Validation failed');
        return NextResponse.json({ success: false, error: validation.error });
      }
      
      await updateShort(shortId, { status: 'Downloaded' });
      await createLog(shortId, 'download', 'success', `Downloaded to ${result.filePath}`);
      
      return NextResponse.json({ 
        success: true, 
        filePath: result.filePath,
        validation 
      });
    }
    
    // Upload video
    if (action === 'upload') {
      const filePath = body.filePath;
      
      if (!filePath) {
        return NextResponse.json(
          { success: false, error: 'File path is required' },
          { status: 400 }
        );
      }
      
      await createLog(shortId, 'upload', 'success', 'Starting upload');
      await updateShort(shortId, { status: 'Uploading' });
      
      const uploadBehavior = await resolveUploadBehavior(short.mapping_id);
      const visibility = uploadBehavior.visibility;
      const aiEnabled = uploadBehavior.aiEnabled;
      const sourceTagBlockList = buildSourceTagBlockList(short.source_channel, uploadBehavior.mapping);
      let title = short.title;
      let description = stripBlockedHashtagsFromDescription(short.description || '', sourceTagBlockList);
      let hashtags: string[] = [];
      
      if (aiEnabled) {
        try {
          const enhanced = await enhanceContent(
            short.title, 
            short.description || '', 
            short.tags || [],
            {
              blockedTerms: sourceTagBlockList,
            }
          );
          title = enhanced.title;
          description = stripBlockedHashtagsFromDescription(enhanced.description, sourceTagBlockList);
          hashtags = filterBlockedTagValues(enhanced.hashtags, sourceTagBlockList);
          
          await updateShort(shortId, {
            ai_title: enhanced.title,
            ai_description: enhanced.description,
            ai_hashtags: enhanced.hashtags.join(', ')
          });
        } catch (error) {
          console.error('AI enhancement failed, using original content');
        }
      }
      
      // Add hashtags to description
      if (hashtags.length > 0) {
        description = `${description}\n\n${hashtags.join(' ')}`;
      }

      const destinationAuth = await resolveDestinationRefreshToken(short.mapping_id);
      if (destinationAuth.error) {
        await updateShort(shortId, {
          status: 'Failed',
          error_log: destinationAuth.error
        });
        await createLog(shortId, 'upload', 'error', destinationAuth.error);
        return NextResponse.json({ success: false, error: destinationAuth.error }, { status: 400 });
      }
      
      // Upload to YouTube
      const result = await uploadVideo(
        filePath,
        title,
        description,
        buildUploadTags(short.tags || [], hashtags, sourceTagBlockList),
        visibility,
        {
          refreshToken: destinationAuth.refreshToken
        }
      );
      
      if (!result.success) {
        await updateShort(shortId, { 
          status: 'Failed', 
          error_log: result.error 
        });
        await createLog(shortId, 'upload', 'error', result.error || 'Upload failed');
        return NextResponse.json({ success: false, error: result.error });
      }
      
      // Update status and delete temp file
      await updateShort(shortId, {
        status: 'Uploaded',
        uploaded_date: new Date().toISOString(),
        target_video_id: result.videoId,
        scheduled_date: uploadBehavior.scheduledPublishAt,
        error_log: null,
      });

      await runUploadedCleanup();
      
      await deleteVideo(filePath);
      await createLog(shortId, 'upload', 'success', `Uploaded as ${result.videoId}`);

      if (uploadBehavior.scheduledPublishAt) {
        await createLog(
          shortId,
          'publish',
          'success',
          `Scheduled public publish at ${uploadBehavior.scheduledPublishAt} (${uploadBehavior.delayHours}h delay)`
        );
      }
      
      return NextResponse.json({ 
        success: true, 
        videoId: result.videoId,
        targetUrl: `https://youtube.com/watch?v=${result.videoId}`,
        scheduledPublishAt: uploadBehavior.scheduledPublishAt,
      });
    }
    
    // Process complete workflow (download + upload)
    if (action === 'process') {
      await createLog(shortId, 'process', 'success', 'Starting process workflow');

      // Download
      const downloadResult = await downloadVideo(short.video_url, short.video_id);
      if (!downloadResult.success) {
        await updateShort(shortId, { 
          status: 'Failed', 
          error_log: downloadResult.error 
        });
        await createLog(shortId, 'download', 'error', downloadResult.error || 'Download failed');
        return NextResponse.json({ success: false, error: downloadResult.error });
      }
      
      // Validate
      const validation = await validateVideo(downloadResult.filePath!);
      if (!validation.valid) {
        await deleteVideo(downloadResult.filePath!);
        await updateShort(shortId, { 
          status: 'Failed', 
          error_log: validation.error 
        });
        await createLog(shortId, 'validation', 'error', validation.error || 'Validation failed');
        return NextResponse.json({ success: false, error: validation.error });
      }

      await updateShort(shortId, { status: 'Downloaded' });
      await createLog(shortId, 'download', 'success', `Downloaded to ${downloadResult.filePath}`);
      
      // Upload
      const uploadBehavior = await resolveUploadBehavior(short.mapping_id);
      const visibility = uploadBehavior.visibility;
      const aiEnabled = uploadBehavior.aiEnabled;
      const sourceTagBlockList = buildSourceTagBlockList(short.source_channel, uploadBehavior.mapping);
      await updateShort(shortId, { status: 'Uploading' });
      
      let title = short.title;
      let description = stripBlockedHashtagsFromDescription(short.description || '', sourceTagBlockList);
      let hashtags: string[] = [];
      
      if (aiEnabled) {
        try {
          const enhanced = await enhanceContent(short.title, short.description || '', short.tags || [], {
            blockedTerms: sourceTagBlockList,
          });
          title = enhanced.title;
          description = stripBlockedHashtagsFromDescription(enhanced.description, sourceTagBlockList);
          hashtags = filterBlockedTagValues(enhanced.hashtags, sourceTagBlockList);
        } catch {
          // Use original content
        }
      }
      
      if (hashtags.length > 0) {
        description = `${description}\n\n${hashtags.join(' ')}`;
      }

      const destinationAuth = await resolveDestinationRefreshToken(short.mapping_id);
      if (destinationAuth.error) {
        await updateShort(shortId, {
          status: 'Failed',
          error_log: destinationAuth.error
        });
        await createLog(shortId, 'upload', 'error', destinationAuth.error);
        return NextResponse.json({ success: false, error: destinationAuth.error }, { status: 400 });
      }
      
      const uploadResult = await uploadVideo(
        downloadResult.filePath!,
        title,
        description,
        buildUploadTags(short.tags || [], hashtags, sourceTagBlockList),
        visibility,
        {
          refreshToken: destinationAuth.refreshToken
        }
      );
      
      // Clean up
      await deleteVideo(downloadResult.filePath!);
      
      if (!uploadResult.success) {
        await updateShort(shortId, { 
          status: 'Failed', 
          error_log: uploadResult.error 
        });
        await createLog(shortId, 'upload', 'error', uploadResult.error || 'Upload failed');
        return NextResponse.json({ success: false, error: uploadResult.error });
      }
      
      await updateShort(shortId, {
        status: 'Uploaded',
        uploaded_date: new Date().toISOString(),
        target_video_id: uploadResult.videoId,
        scheduled_date: uploadBehavior.scheduledPublishAt,
        error_log: null,
        ai_title: title !== short.title ? title : null,
        ai_description: description !== short.description ? description : null
      });

      if (uploadBehavior.scheduledPublishAt) {
        await createLog(
          shortId,
          'publish',
          'success',
          `Scheduled public publish at ${uploadBehavior.scheduledPublishAt} (${uploadBehavior.delayHours}h delay)`
        );
      }

      await runUploadedCleanup();
      await createLog(shortId, 'process', 'success', `Uploaded as ${uploadResult.videoId}`);
      
      return NextResponse.json({ 
        success: true, 
        videoId: uploadResult.videoId,
        targetUrl: `https://youtube.com/watch?v=${uploadResult.videoId}`,
        scheduledPublishAt: uploadBehavior.scheduledPublishAt,
      });
    }
    
    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('YouTube API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET - Get upload status
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');
    const videoId = searchParams.get('videoId');
    
    if (action === 'status' && videoId) {
      const result = await getVideoStatus(videoId);
      return NextResponse.json(result);
    }
    
    return NextResponse.json(
      { success: false, error: 'Invalid request' },
      { status: 400 }
    );
  } catch (error) {
    console.error('YouTube GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get status' },
      { status: 500 }
    );
  }
}
