import { NextRequest, NextResponse } from 'next/server';
import { deleteMappingsBySourceChannel } from '@/lib/supabase/database';
import {
  getSourceChannels,
  removeSourceChannel,
  updateSourceChannel,
  upsertSourceChannel,
} from '@/lib/youtube/source-channels';

export async function GET() {
  try {
    const channels = await getSourceChannels();
    return NextResponse.json({ success: true, channels });
  } catch (error) {
    console.error('Source channels GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch source channels' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { channel_id, channel_title, channel_url, is_active } = body;

    if (!channel_url || typeof channel_url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'channel_url is required' },
        { status: 400 },
      );
    }

    const channel = await upsertSourceChannel({
      channel_id,
      channel_title,
      channel_url,
      is_active,
    });

    if (!channel) {
      return NextResponse.json(
        { success: false, error: 'Failed to save source channel' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, channel });
  } catch (error) {
    console.error('Source channels POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save source channel' },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { channel_id, channel_title, channel_url, is_active } = body;

    if (!channel_id || typeof channel_id !== 'string') {
      return NextResponse.json(
        { success: false, error: 'channel_id is required' },
        { status: 400 },
      );
    }

    const channel = await updateSourceChannel(channel_id, {
      channel_title,
      channel_url,
      is_active,
    });

    if (!channel) {
      return NextResponse.json(
        { success: false, error: 'Source channel not found or update failed' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, channel });
  } catch (error) {
    console.error('Source channels PUT error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update source channel' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const channelId = request.nextUrl.searchParams.get('channelId');
    const cleanupMappings = request.nextUrl.searchParams.get('cleanupMappings') !== 'false';

    if (!channelId) {
      return NextResponse.json(
        { success: false, error: 'channelId is required' },
        { status: 400 },
      );
    }

    const result = await removeSourceChannel(channelId);

    if (!result.success || !result.removed) {
      return NextResponse.json(
        { success: false, error: 'Source channel not found' },
        { status: 404 },
      );
    }

    if (cleanupMappings) {
      const cleaned = await deleteMappingsBySourceChannel(result.removed.channel_id, result.removed.channel_url);
      if (!cleaned) {
        return NextResponse.json(
          { success: false, error: 'Source channel removed but mapping cleanup failed' },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      success: true,
      removed: result.removed,
      cleanupMappings,
    });
  } catch (error) {
    console.error('Source channels DELETE error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove source channel' },
      { status: 500 },
    );
  }
}
