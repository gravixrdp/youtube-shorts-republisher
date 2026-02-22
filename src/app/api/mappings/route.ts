import { NextRequest, NextResponse } from 'next/server';
import { 
  getChannelMappings, 
  getActiveChannelMappings,
  createChannelMapping, 
  updateChannelMapping, 
  deleteChannelMapping,
  linkUnmappedSourceShortsToMapping
} from '@/lib/supabase/database';

// GET - Fetch all channel mappings
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const activeOnly = searchParams.get('active') === 'true';
    
    const mappings = activeOnly 
      ? await getActiveChannelMappings() 
      : await getChannelMappings();
    
    return NextResponse.json({ success: true, mappings });
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
      ai_enhancement_enabled
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
      uploads_per_day: uploads_per_day || 2,
      upload_time_morning: upload_time_morning || '09:00',
      upload_time_evening: upload_time_evening || '18:00',
      default_visibility: default_visibility || 'public',
      ai_enhancement_enabled: ai_enhancement_enabled || false,
      is_active: true
    });
    
    if (mapping) {
      const linkedShorts = await linkUnmappedSourceShortsToMapping(
        mapping.id,
        source_channel_id,
        source_channel_url,
        target_channel_id
      );

      return NextResponse.json({ success: true, mapping, linked_shorts: linkedShorts });
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
    const { id, ...data } = body;
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID is required' },
        { status: 400 }
      );
    }
    
    const success = await updateChannelMapping(id, data);
    return NextResponse.json({ success });
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
