import { NextResponse } from 'next/server';
import { getRecentScrapeRuns, getSourceShortsStats } from '@/lib/supabase/database';
import { getSourceChannels } from '@/lib/youtube/source-channels';

interface ScrapeDetails {
  source_channel_id?: string;
  source_channel_url?: string;
  mapping_id?: string;
  mapping_name?: string;
  total?: number;
  added?: number;
  duplicates?: number;
  errors?: number;
}

function parseDetails(raw: string | null): ScrapeDetails {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as ScrapeDetails;
    return parsed || {};
  } catch {
    return {};
  }
}

export async function GET() {
  try {
    const [sourceChannels, recentRuns] = await Promise.all([
      getSourceChannels(),
      getRecentScrapeRuns(80),
    ]);

    const sources = await Promise.all(
      sourceChannels.map(async (source) => {
        const stats = await getSourceShortsStats(source.channel_id, source.channel_url);

        const lastRun = recentRuns.find((run) => {
          const details = parseDetails(run.details);
          return details.source_channel_id === source.channel_id || details.source_channel_url === source.channel_url;
        });

        const lastRunDetails = lastRun ? parseDetails(lastRun.details) : {};

        return {
          ...source,
          total_shorts: stats.total,
          pending_shorts: stats.pending,
          uploaded_shorts: stats.uploaded,
          failed_shorts: stats.failed,
          last_short_added_at: stats.lastCreatedAt,
          last_scrape_at: lastRun?.created_at || null,
          last_scrape_status: lastRun?.status || null,
          last_scrape_message: lastRun?.message || null,
          last_scrape_stats: {
            total: lastRunDetails.total || 0,
            added: lastRunDetails.added || 0,
            duplicates: lastRunDetails.duplicates || 0,
            errors: lastRunDetails.errors || 0,
          },
        };
      })
    );

    const runs = recentRuns.map((run) => {
      const details = parseDetails(run.details);
      return {
        id: run.id,
        status: run.status,
        message: run.message,
        created_at: run.created_at,
        source_channel_id: details.source_channel_id || null,
        source_channel_url: details.source_channel_url || null,
        mapping_id: details.mapping_id || null,
        mapping_name: details.mapping_name || null,
        stats: {
          total: details.total || 0,
          added: details.added || 0,
          duplicates: details.duplicates || 0,
          errors: details.errors || 0,
        },
      };
    });

    return NextResponse.json({ success: true, monitor: { sources, runs } });
  } catch (error) {
    console.error('Scraping monitor GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load scraping monitor' },
      { status: 500 }
    );
  }
}
