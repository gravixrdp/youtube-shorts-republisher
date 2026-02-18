import { NextRequest, NextResponse } from 'next/server';
import { 
  getSchedulerState, 
  updateSchedulerState, 
  getPendingShorts,
  updateShort,
  createLog,
  getConfig
} from '@/lib/supabase/database';
import { downloadVideo, validateVideo, deleteVideo } from '@/lib/youtube/video-handler';
import { uploadVideo } from '@/lib/youtube/uploader';
import { enhanceContent } from '@/lib/ai-enhancement';

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
      const result = await processNextPending();
      return NextResponse.json(result);
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
async function processNextPending(): Promise<{ success: boolean; message: string; videoId?: string }> {
  try {
    // Get uploads per day limit
    const uploadsPerDay = parseInt(await getConfig('uploads_per_day') || '2');
    const state = await getSchedulerState();
    
    if (state && state.uploads_today >= uploadsPerDay) {
      return { success: false, message: 'Daily upload limit reached' };
    }
    
    // Get next pending video
    const pending = await getPendingShorts(1);
    if (pending.length === 0) {
      return { success: false, message: 'No pending videos' };
    }
    
    const short = pending[0];
    
    await createLog(short.id, 'process', 'success', 'Starting automated upload');
    
    // Download
    const downloadResult = await downloadVideo(short.video_url, short.video_id);
    if (!downloadResult.success) {
      await updateShort(short.id, { 
        status: 'Failed', 
        error_log: downloadResult.error 
      });
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
      return { success: false, message: `Validation failed: ${validation.error}` };
    }
    
    // Prepare content
    const visibility = await getConfig('default_visibility') || 'public';
    const aiEnabled = await getConfig('ai_enhancement_enabled') === 'true';
    
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
    
    // Upload
    const uploadResult = await uploadVideo(
      downloadResult.filePath!,
      title,
      description,
      short.tags || [],
      visibility as 'public' | 'unlisted' | 'private'
    );
    
    // Clean up
    await deleteVideo(downloadResult.filePath!);
    
    if (!uploadResult.success) {
      await updateShort(short.id, { 
        status: 'Failed', 
        error_log: uploadResult.error 
      });
      return { success: false, message: `Upload failed: ${uploadResult.error}` };
    }
    
    // Update success
    await updateShort(short.id, {
      status: 'Uploaded',
      uploaded_date: new Date().toISOString(),
      target_video_id: uploadResult.videoId
    });
    
    // Update scheduler state
    await updateSchedulerState({
      uploads_today: (state?.uploads_today || 0) + 1,
      last_run_at: new Date().toISOString()
    });
    
    return { 
      success: true, 
      message: 'Upload successful', 
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
    
    // Get uploads per day
    const uploadsPerDay = parseInt(await getConfig('uploads_per_day') || '2');
    
    for (let i = 0; i < uploadsPerDay; i++) {
      const result = await processNextPending();
      if (!result.success) {
        console.log('Scheduler stopped:', result.message);
        break;
      }
      console.log('Uploaded:', result.videoId);
    }
    
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
