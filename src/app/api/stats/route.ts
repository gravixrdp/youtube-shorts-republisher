import { NextResponse } from 'next/server';
import { getStats, getRecentLogs, getSchedulerState } from '@/lib/supabase/database';

export async function GET() {
  try {
    const [stats, logs, schedulerState] = await Promise.all([
      getStats(),
      getRecentLogs(20),
      getSchedulerState()
    ]);
    
    return NextResponse.json({
      success: true,
      stats,
      logs,
      scheduler: schedulerState
    });
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
