import { NextRequest, NextResponse } from 'next/server';
import { 
  createShort, 
  getShortByVideoId, 
  getAllShorts, 
  updateShort, 
  deleteShort,
  createLog 
} from '@/lib/supabase/database';
import { fetchShortsFromChannel } from '@/lib/youtube/scraper';

// GET - Fetch all shorts
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const status = searchParams.get('status');
    
    if (status) {
      // Import additional function
      const { getShortsByStatus } = await import('@/lib/supabase/database');
      const shorts = await getShortsByStatus(status);
      return NextResponse.json({ success: true, shorts });
    }
    
    const { data, total } = await getAllShorts(limit, offset);
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
    const { action, channelUrl, ...data } = body;
    
    // Fetch shorts from channel
    if (action === 'fetch') {
      if (!channelUrl) {
        return NextResponse.json(
          { success: false, error: 'Channel URL is required' },
          { status: 400 }
        );
      }
      
      const result = await fetchShortsFromChannel(channelUrl);
      
      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        );
      }
      
      // Store shorts in database
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
        
        // Create new entry
        const created = await createShort({
          video_id: short.videoId,
          video_url: short.videoUrl,
          title: short.title,
          description: short.description,
          tags: short.tags,
          thumbnail_url: short.thumbnailUrl,
          duration: short.duration,
          published_date: short.publishedDate,
          status: 'Pending'
        });
        
        if (created) {
          added++;
          await createLog(created.id, 'fetch', 'success', 'Fetched from source channel');
        } else {
          errors++;
        }
      }
      
      return NextResponse.json({
        success: true,
        message: `Fetched ${result.shorts.length} shorts. Added: ${added}, Duplicates: ${duplicates}, Errors: ${errors}`,
        stats: { total: result.shorts.length, added, duplicates, errors }
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
        status: 'Pending'
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
