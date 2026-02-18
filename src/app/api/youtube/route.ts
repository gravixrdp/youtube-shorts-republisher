import { NextRequest, NextResponse } from 'next/server';
import { 
  getShortById, 
  updateShort, 
  createLog,
  getConfig 
} from '@/lib/supabase/database';
import { downloadVideo, validateVideo, deleteVideo } from '@/lib/youtube/video-handler';
import { uploadVideo, getVideoStatus } from '@/lib/youtube/uploader';
import { enhanceContent } from '@/lib/ai-enhancement';

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
      
      // Get visibility setting
      const visibility = await getConfig('default_visibility') || 'public';
      
      // Check if AI enhancement is enabled
      const aiEnabled = await getConfig('ai_enhancement_enabled') === 'true';
      let title = short.title;
      let description = short.description || '';
      let hashtags: string[] = [];
      
      if (aiEnabled) {
        try {
          const enhanced = await enhanceContent(
            short.title, 
            short.description || '', 
            short.tags || []
          );
          title = enhanced.title;
          description = enhanced.description;
          hashtags = enhanced.hashtags;
          
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
      
      // Upload to YouTube
      const result = await uploadVideo(
        filePath,
        title,
        description,
        short.tags || [],
        visibility as 'public' | 'unlisted' | 'private'
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
        target_video_id: result.videoId
      });
      
      await deleteVideo(filePath);
      await createLog(shortId, 'upload', 'success', `Uploaded as ${result.videoId}`);
      
      return NextResponse.json({ 
        success: true, 
        videoId: result.videoId,
        targetUrl: `https://youtube.com/watch?v=${result.videoId}`
      });
    }
    
    // Process complete workflow (download + upload)
    if (action === 'process') {
      // Download
      const downloadResult = await downloadVideo(short.video_url, short.video_id);
      if (!downloadResult.success) {
        await updateShort(shortId, { 
          status: 'Failed', 
          error_log: downloadResult.error 
        });
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
        return NextResponse.json({ success: false, error: validation.error });
      }
      
      // Upload
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
        await updateShort(shortId, { 
          status: 'Failed', 
          error_log: uploadResult.error 
        });
        return NextResponse.json({ success: false, error: uploadResult.error });
      }
      
      await updateShort(shortId, {
        status: 'Uploaded',
        uploaded_date: new Date().toISOString(),
        target_video_id: uploadResult.videoId,
        ai_title: title !== short.title ? title : null,
        ai_description: description !== short.description ? description : null
      });
      
      return NextResponse.json({ 
        success: true, 
        videoId: uploadResult.videoId,
        targetUrl: `https://youtube.com/watch?v=${uploadResult.videoId}`
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
