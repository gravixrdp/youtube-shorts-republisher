import { NextRequest, NextResponse } from 'next/server';
import { getStats, getRecentLogs, getSchedulerState } from '@/lib/supabase/database';

const SUMMARY_CACHE_TTL_MS = 5000;
let summaryCache:
  | {
      expiresAt: number;
      stats: Awaited<ReturnType<typeof getStats>>;
      scheduler: Awaited<ReturnType<typeof getSchedulerState>>;
    }
  | null = null;

export async function GET(request: NextRequest) {
  try {
    const includeLogs = request.nextUrl.searchParams.get('includeLogs') !== 'false';

    if (!includeLogs && summaryCache && summaryCache.expiresAt > Date.now()) {
      return NextResponse.json({
        success: true,
        stats: summaryCache.stats,
        logs: [],
        scheduler: summaryCache.scheduler,
      });
    }

    const [stats, schedulerState, logs] = await Promise.all([
      getStats(),
      getSchedulerState(),
      includeLogs ? getRecentLogs(20) : Promise.resolve([]),
    ]);

    if (!includeLogs) {
      summaryCache = {
        expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS,
        stats,
        scheduler: schedulerState,
      };
    }
    
    return NextResponse.json({
      success: true,
      stats,
      logs: includeLogs ? logs : [],
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
