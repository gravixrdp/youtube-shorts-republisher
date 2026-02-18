import { NextRequest, NextResponse } from 'next/server';
import { getConfig, setConfig, getAllConfig, setMultipleConfig } from '@/lib/supabase/database';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const key = searchParams.get('key');
    
    if (key) {
      const value = await getConfig(key);
      return NextResponse.json({ success: true, key, value });
    }
    
    const allConfig = await getAllConfig();
    return NextResponse.json({ success: true, config: allConfig });
  } catch (error) {
    console.error('Config GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get config' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (body.key && body.value !== undefined) {
      const success = await setConfig(body.key, body.value);
      return NextResponse.json({ success });
    }
    
    if (typeof body === 'object' && !body.key) {
      const success = await setMultipleConfig(body);
      return NextResponse.json({ success });
    }
    
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Config POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save config' },
      { status: 500 }
    );
  }
}
