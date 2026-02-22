import { NextRequest, NextResponse } from 'next/server';
import {
  getSchedulerState,
  updateSchedulerState,
  getPendingShorts,
  getActiveChannelMappings,
  claimOldestUnmappedPendingShortForMapping,
  getNextGlobalPendingShort,
  updateShort,
  createLog,
  getConfig,
  getChannelMappingById,
  cleanupUploadedShortsForSingleDestination,
  getDueScheduledPublishShorts,
} from '@/lib/supabase/database';
import type { ShortsData } from '@/lib/supabase/client';
import { downloadVideo, validateVideo, deleteVideo } from '@/lib/youtube/video-handler';
import { uploadVideo, updateVideoVisibility } from '@/lib/youtube/uploader';
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
  return cleanupUploadedShortsForSingleDestination({ olderThanHours: Number.isNaN(cleanupHours) ? 5 : cleanupHours });
}

function buildUploadTags(existingTags: string[] | null, hashtags: string[]): string[] {
  const tags = [...(existingTags || []), ...hashtags]
    .map((value) => value.replace(/^#/, '').replace(/[^a-zA-Z0-9_]/g, '').trim())
    .filter(Boolean);

  return Array.from(new Set(tags)).slice(0, 20);
}

function parseMappingId(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }

  const trimmed = raw.trim();
  return trimmed || undefined;
}

function nextRetryTime(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function collectMappingSourceValues(
  mappings: Array<{ source_channel_id: string; source_channel_url: string }>
): string[] {
  return Array.from(
    new Set(
      mappings
        .flatMap((mapping) => [mapping.source_channel_id?.trim(), mapping.source_channel_url?.trim()])
        .filter((value): value is string => Boolean(value))
    )
  );
}

async function resolveNextPendingShort(mappingId?: string): Promise<ShortsData | null> {
  if (mappingId) {
    const mappedPending = await getPendingShorts(1, mappingId);
    if (mappedPending.length > 0) {
      return mappedPending[0];
    }

    const mapping = await getChannelMappingById(mappingId);
    if (!mapping) {
      return null;
    }

    const claimed = await claimOldestUnmappedPendingShortForMapping(
      mapping.id,
      mapping.source_channel_id,
      mapping.source_channel_url,
      mapping.target_channel_id
    );

    if (claimed) {
      await createLog(
        claimed.id,
        'mapping',
        'success',
        `Claimed unmapped source short for mapping ${mapping.name}`
      );
    }

    return claimed;
  }

  const activeMappings = await getActiveChannelMappings();
  const excludedSourceValues = collectMappingSourceValues(activeMappings);
  const globalPending = await getNextGlobalPendingShort(excludedSourceValues);

  return globalPending;
}

async function publishDueScheduledShorts(limit: number = 20): Promise<{ checked: number; published: number; failed: number }> {
  const dueShorts = await getDueScheduledPublishShorts(limit);
  let published = 0;
  let failed = 0;

  for (const short of dueShorts) {
    if (!short.target_video_id) {
      continue;
    }

    const destinationAuth = await resolveDestinationRefreshToken(short.mapping_id);
    if (destinationAuth.error) {
      failed++;
      await updateShort(short.id, {
        error_log: destinationAuth.error,
        scheduled_date: nextRetryTime(15),
      });
      await createLog(short.id, 'publish', 'error', destinationAuth.error);
      continue;
    }

    const publishResult = await updateVideoVisibility(short.target_video_id, 'public', {
      refreshToken: destinationAuth.refreshToken,
    });

    if (!publishResult.success) {
      const errorMessage = publishResult.error || 'Failed to switch visibility to public';
      failed++;
      await updateShort(short.id, {
        error_log: errorMessage,
        scheduled_date: nextRetryTime(15),
      });
      await createLog(short.id, 'publish', 'error', errorMessage);
      continue;
    }

    published++;
    await updateShort(short.id, {
      scheduled_date: null,
      error_log: null,
    });
    await createLog(short.id, 'publish', 'success', `Video ${short.target_video_id} switched to public`);
  }

  return {
    checked: dueShorts.length,
    published,
    failed,
  };
}

// GET - Get scheduler state
export async function GET() {
  try {
    const state = await getSchedulerState();
    return NextResponse.json({ success: true, state });
  } catch (error) {
    console.error('Scheduler GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get scheduler state' },
      { status: 500 }
    );
  }
}

// POST - Control scheduler or trigger upload
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    // Start scheduler run
    if (action === 'run') {
      const state = await getSchedulerState();

      if (state?.is_running) {
        return NextResponse.json(
          { success: false, error: 'Scheduler is already running' },
          { status: 400 }
        );
      }

      // Start async upload process
      runSchedulerProcess().catch(console.error);

      return NextResponse.json({
        success: true,
        message: 'Scheduler started'
      });
    }

    // Update scheduler settings
    if (action === 'update') {
      const { isRunning, uploadsToday } = body;
      const success = await updateSchedulerState({
        is_running: isRunning,
        uploads_today: uploadsToday
      });
      return NextResponse.json({ success });
    }

    // Process next pending video
    if (action === 'process_next') {
      const mappingId = parseMappingId(body.mappingId);
      const result = await processNextPending(mappingId);
      const publish = await publishDueScheduledShorts();
      await runUploadedCleanup();
      return NextResponse.json({ ...result, publish });
    }

    if (action === 'publish_due') {
      const publish = await publishDueScheduledShorts(typeof body.limit === 'number' ? body.limit : 20);
      return NextResponse.json({ success: true, publish });
    }

    // Cleanup uploaded shorts that can be safely removed
    if (action === 'cleanup_uploaded') {
      const cleanup = await runUploadedCleanup();
      return NextResponse.json({
        success: true,
        message: 'Uploaded shorts cleanup completed',
        cleanup
      });
    }

    if (action === 'run_cleanup') {
      const cleanup = await runUploadedCleanup();
      return NextResponse.json({
        success: true,
        message: 'Uploaded shorts cleanup completed',
        cleanup
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Scheduler POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

// Process the next pending video
async function processNextPending(mappingId?: string): Promise<{ success: boolean; message: string; videoId?: string }> {
  try {
    const state = await getSchedulerState();

    if (!mappingId) {
      const uploadsPerDay = parseInt((await getConfig('uploads_per_day')) || '2', 10);
      if (state && state.uploads_today >= uploadsPerDay) {
        return { success: false, message: 'Daily upload limit reached' };
      }
    }

    const short = await resolveNextPendingShort(mappingId);
    if (!short) {
      return {
        success: false,
        message: mappingId
          ? 'No pending videos for this mapping source queue'
          : 'No pending videos in global queue',
      };
    }

    await createLog(short.id, 'process', 'success', 'Starting automated upload');

    // Download
    const downloadResult = await downloadVideo(short.video_url, short.video_id);
    if (!downloadResult.success) {
      await updateShort(short.id, {
        status: 'Failed',
        error_log: downloadResult.error
      });
      await createLog(short.id, 'download', 'error', downloadResult.error || 'Download failed');
      return { success: false, message: `Download failed: ${downloadResult.error}` };
    }

    // Validate
    const validation = await validateVideo(downloadResult.filePath!);
    if (!validation.valid) {
      await deleteVideo(downloadResult.filePath!);
      await updateShort(short.id, {
        status: 'Failed',
        error_log: validation.error
      });
      await createLog(short.id, 'validation', 'error', validation.error || 'Validation failed');
      return { success: false, message: `Validation failed: ${validation.error}` };
    }

    await updateShort(short.id, { status: 'Downloaded' });
    await createLog(short.id, 'download', 'success', `Downloaded to ${downloadResult.filePath}`);

    // Prepare content
    const uploadBehavior = await resolveUploadBehavior(short.mapping_id || mappingId || null);
    const visibility = uploadBehavior.visibility;
    const aiEnabled = uploadBehavior.aiEnabled;

    let title = short.title;
    let description = short.description || '';
    let hashtags: string[] = [];

    if (aiEnabled) {
      try {
        const enhanced = await enhanceContent(short.title, short.description || '', short.tags || []);
        title = enhanced.title;
        description = enhanced.description;
        hashtags = enhanced.hashtags;
      } catch {
        // Use original content
      }
    }

    if (hashtags.length > 0) {
      description = `${description}\n\n${hashtags.join(' ')}`;
    }

    const destinationAuth = await resolveDestinationRefreshToken(short.mapping_id);
    if (destinationAuth.error) {
      await deleteVideo(downloadResult.filePath!);
      await updateShort(short.id, {
        status: 'Failed',
        error_log: destinationAuth.error
      });
      await createLog(short.id, 'upload', 'error', destinationAuth.error);
      return { success: false, message: destinationAuth.error };
    }

    await updateShort(short.id, { status: 'Uploading' });

    // Upload
    const uploadResult = await uploadVideo(
      downloadResult.filePath!,
      title,
      description,
      buildUploadTags(short.tags || [], hashtags),
      visibility,
      {
        refreshToken: destinationAuth.refreshToken
      }
    );

    // Clean up
    await deleteVideo(downloadResult.filePath!);

    if (!uploadResult.success) {
      await updateShort(short.id, {
        status: 'Failed',
        error_log: uploadResult.error
      });
      await createLog(short.id, 'upload', 'error', uploadResult.error || 'Upload failed');
      return { success: false, message: `Upload failed: ${uploadResult.error}` };
    }

    // Update success
    const uploadedAt = new Date().toISOString();
    await updateShort(short.id, {
      status: 'Uploaded',
      uploaded_date: uploadedAt,
      target_video_id: uploadResult.videoId || null,
      scheduled_date: uploadBehavior.scheduledPublishAt,
      error_log: null,
    });
    await createLog(short.id, 'upload', 'success', `Uploaded as ${uploadResult.videoId}`);

    if (uploadBehavior.scheduledPublishAt) {
      await createLog(
        short.id,
        'publish',
        'success',
        `Scheduled public publish at ${uploadBehavior.scheduledPublishAt} (${uploadBehavior.delayHours}h delay)`
      );
    }

    // Update scheduler state
    await updateSchedulerState({
      uploads_today: (state?.uploads_today || 0) + 1,
      last_run_at: uploadedAt
    });

    return {
      success: true,
      message: uploadBehavior.scheduledPublishAt
        ? `Upload successful, public publish scheduled after ${uploadBehavior.delayHours}h`
        : 'Upload successful',
      videoId: uploadResult.videoId
    };
  } catch (error) {
    console.error('Process error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Background scheduler process
async function runSchedulerProcess(): Promise<void> {
  try {
    await updateSchedulerState({
      is_running: true,
      current_status: 'Processing...'
    });

    // Process only one short per scheduler run.
    const result = await processNextPending();
    if (!result.success) {
      console.log('Scheduler stopped:', result.message);
    } else {
      console.log('Uploaded:', result.videoId);
    }

    await publishDueScheduledShorts();
    await runUploadedCleanup();

    await updateSchedulerState({
      is_running: false,
      current_status: 'Completed'
    });
  } catch (error) {
    console.error('Scheduler error:', error);
    await updateSchedulerState({
      is_running: false,
      current_status: 'Error'
    });
  }
}
