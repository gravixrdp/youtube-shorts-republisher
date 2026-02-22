import { NextRequest, NextResponse } from 'next/server';
import { deleteMappingsByTargetChannelId } from '@/lib/supabase/database';
import {
  getDestinationChannelsPublic,
  getDestinationChannelsWithTokens,
  saveDestinationChannels,
} from '@/lib/youtube/destination-channels';

export async function GET() {
  try {
    const channels = await getDestinationChannelsPublic();
    return NextResponse.json({ success: true, channels });
  } catch (error) {
    console.error('Destination channels GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch destination channels' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { channel_id, channel_title, refresh_token } = body;

    if (!channel_id || !channel_title || !refresh_token) {
      return NextResponse.json(
        { success: false, error: 'channel_id, channel_title and refresh_token are required' },
        { status: 400 }
      );
    }

    const existing = await getDestinationChannelsWithTokens();
    const now = new Date().toISOString();
    const index = existing.findIndex((channel) => channel.channel_id === channel_id);

    if (index >= 0) {
      existing[index] = {
        ...existing[index],
        channel_title,
        refresh_token,
        updated_at: now,
      };
    } else {
      existing.unshift({
        channel_id,
        channel_title,
        refresh_token,
        connected_at: now,
        updated_at: now,
      });
    }

    const success = await saveDestinationChannels(existing);

    return NextResponse.json({
      success,
      channels: existing.map((channel) => ({
        channel_id: channel.channel_id,
        channel_title: channel.channel_title,
        connected_at: channel.connected_at,
        updated_at: channel.updated_at,
      })),
    });
  } catch (error) {
    console.error('Destination channels POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save destination channel' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { channel_id, channel_title } = body;

    if (!channel_id || !channel_title) {
      return NextResponse.json(
        { success: false, error: 'channel_id and channel_title are required' },
        { status: 400 }
      );
    }

    const existing = await getDestinationChannelsWithTokens();
    const index = existing.findIndex((channel) => channel.channel_id === channel_id);

    if (index < 0) {
      return NextResponse.json(
        { success: false, error: 'Destination channel not found' },
        { status: 404 }
      );
    }

    existing[index] = {
      ...existing[index],
      channel_title,
      updated_at: new Date().toISOString(),
    };

    const success = await saveDestinationChannels(existing);

    return NextResponse.json({
      success,
      channel: {
        channel_id: existing[index].channel_id,
        channel_title: existing[index].channel_title,
        connected_at: existing[index].connected_at,
        updated_at: existing[index].updated_at,
      },
    });
  } catch (error) {
    console.error('Destination channels PUT error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update destination channel' },
      { status: 500 }
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
        { status: 400 }
      );
    }

    const existing = await getDestinationChannelsWithTokens();
    const filtered = existing.filter((channel) => channel.channel_id !== channelId);

    if (cleanupMappings) {
      const cleanupSuccess = await deleteMappingsByTargetChannelId(channelId);
      if (!cleanupSuccess) {
        return NextResponse.json(
          { success: false, error: 'Failed to cleanup mappings for destination channel' },
          { status: 500 }
        );
      }
    }

    const success = await saveDestinationChannels(filtered);

    return NextResponse.json({
      success,
      cleanupMappings,
      channels: filtered.map((channel) => ({
        channel_id: channel.channel_id,
        channel_title: channel.channel_title,
        connected_at: channel.connected_at,
        updated_at: channel.updated_at,
      })),
    });
  } catch (error) {
    console.error('Destination channels DELETE error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove destination channel' },
      { status: 500 }
    );
  }
}
