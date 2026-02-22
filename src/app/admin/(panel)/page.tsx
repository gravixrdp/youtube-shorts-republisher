'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { SidebarNav, MobileNav } from '@/components/sidebar-nav';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ThemeToggle } from '@/components/theme-toggle';
import { useToast } from '@/hooks/use-toast';
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  Edit,
  ExternalLink,
  Eye,
  Link2,
  LogOut,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Trash2,
  TrendingUp,
  Upload,
  Video,
  XCircle,
  Youtube,
  Zap,
} from 'lucide-react';

interface Short {
  id: string;
  video_id: string;
  video_url: string;
  title: string;
  description: string | null;
  tags: string[] | null;
  thumbnail_url: string | null;
  duration: number;
  status: string;
  mapping_id: string | null;
  source_channel: string | null;
  target_channel: string | null;
  scheduled_date: string | null;
  uploaded_date: string | null;
  target_video_id: string | null;
  retry_count: number;
  error_log: string | null;
  created_at: string;
}

interface Stats {
  total: number;
  pending: number;
  uploaded: number;
  failed: number;
  uploadedToday: number;
  activeMappings: number;
}

interface Log {
  id: string;
  short_id: string | null;
  action: string;
  status: string;
  message: string | null;
  created_at: string;
}

interface SchedulerState {
  is_running: boolean;
  uploads_today: number;
  last_run_at: string | null;
  current_status: string | null;
}

interface ChannelMapping {
  id: string;
  name: string;
  source_channel_id: string;
  source_channel_url: string;
  source_channel_name: string | null;
  target_channel_id: string;
  target_channel_name: string | null;
  is_active: boolean;
  uploads_per_day: number;
  upload_time_morning: string | null;
  upload_time_evening: string | null;
  default_visibility: string;
  ai_enhancement_enabled: boolean;
  last_fetched_at: string | null;
  total_fetched: number;
  total_uploaded: number;
  created_at: string;
}

interface Config {
  [key: string]: string;
}

interface DestinationChannel {
  channel_id: string;
  channel_title: string;
  connected_at: string;
  updated_at: string;
}

interface SourceChannel {
  channel_id: string;
  channel_title: string;
  channel_url: string;
  is_active: boolean;
  connected_at: string;
  updated_at: string;
}

interface SourceScrapeMonitor {
  channel_id: string;
  total_shorts: number;
  pending_shorts: number;
  uploaded_shorts: number;
  failed_shorts: number;
  last_short_added_at: string | null;
  last_scrape_at: string | null;
  last_scrape_status: string | null;
  last_scrape_message: string | null;
  last_scrape_stats: {
    total: number;
    added: number;
    duplicates: number;
    errors: number;
  };
}

interface ScrapeRun {
  id: string;
  status: string;
  message: string | null;
  created_at: string;
  source_channel_id: string | null;
  source_channel_url: string | null;
  stats: {
    total: number;
    added: number;
    duplicates: number;
    errors: number;
  };
}

interface UpcomingUploadSlot {
  id: string;
  kind: 'mapping' | 'global';
  mappingId: string | null;
  mappingName: string;
  slotLabel: string;
  slotTime: string;
  scheduledAt: number;
  pendingCount: number;
  nextVideoTitle: string | null;
}

interface ScheduledPublishItem {
  id: string;
  title: string;
  mappingName: string;
  scheduledAt: number;
}

type ActionKey =
  | 'refresh'
  | 'scrapeSource'
  | 'scrapeAllSources'
  | 'runScheduler'
  | 'uploadNext'
  | 'saveSource'
  | 'deleteSource'
  | 'saveDestination'
  | 'deleteDestination'
  | 'saveConfig'
  | 'saveMapping'
  | 'fetchMapping'
  | 'deleteMapping'
  | 'toggleMapping'
  | 'processShort'
  | 'deleteShort';

const DEFAULT_STATS: Stats = {
  total: 0,
  pending: 0,
  uploaded: 0,
  failed: 0,
  uploadedToday: 0,
  activeMappings: 0,
};

const DEFAULT_MAPPING_FORM = {
  name: '',
  source_channel_id: '',
  source_channel_url: '',
  target_channel_id: '',
  uploads_per_day: 2,
  upload_time_morning: '09:00',
  upload_time_evening: '18:00',
  default_visibility: 'public',
  ai_enhancement_enabled: false,
};

const DEFAULT_SOURCE_FORM = {
  channel_id: '',
  channel_title: '',
  channel_url: '',
  is_active: true,
};

const DEFAULT_ACTION_LOAD: Record<ActionKey, boolean> = {
  refresh: false,
  scrapeSource: false,
  scrapeAllSources: false,
  runScheduler: false,
  uploadNext: false,
  saveSource: false,
  deleteSource: false,
  saveDestination: false,
  deleteDestination: false,
  saveConfig: false,
  saveMapping: false,
  fetchMapping: false,
  deleteMapping: false,
  toggleMapping: false,
  processShort: false,
  deleteShort: false,
};

function normalizeTimeValue(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  const value = raw.trim();
  if (!value) return fallback;
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value) ? value : fallback;
}

function getDatePartsInTimezone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number.parseInt(map.get('year') || '0', 10),
    month: Number.parseInt(map.get('month') || '1', 10),
    day: Number.parseInt(map.get('day') || '1', 10),
    hour: Number.parseInt(map.get('hour') || '0', 10),
    minute: Number.parseInt(map.get('minute') || '0', 10),
  };
}

function convertZonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  let utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  for (let iteration = 0; iteration < 4; iteration++) {
    const guessParts = getDatePartsInTimezone(new Date(utcGuess), timeZone);
    const actualAsUtc = Date.UTC(
      guessParts.year,
      guessParts.month - 1,
      guessParts.day,
      guessParts.hour,
      guessParts.minute,
      0,
      0
    );
    const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    const delta = targetAsUtc - actualAsUtc;
    if (delta === 0) break;
    utcGuess += delta;
  }

  return new Date(utcGuess);
}

function getNextOccurrence(timeValue: string, timeZone: string, fromDate: Date): Date | null {
  const [hourRaw, minuteRaw] = timeValue.split(':');
  const hour = Number.parseInt(hourRaw || '', 10);
  const minute = Number.parseInt(minuteRaw || '', 10);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  const nowParts = getDatePartsInTimezone(fromDate, timeZone);
  const todayCandidate = convertZonedDateTimeToUtc(
    nowParts.year,
    nowParts.month,
    nowParts.day,
    hour,
    minute,
    timeZone
  );

  if (todayCandidate.getTime() > fromDate.getTime()) {
    return todayCandidate;
  }

  const todayUtc = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day, 0, 0, 0, 0));
  const tomorrowUtc = new Date(todayUtc.getTime() + 24 * 60 * 60 * 1000);

  return convertZonedDateTimeToUtc(
    tomorrowUtc.getUTCFullYear(),
    tomorrowUtc.getUTCMonth() + 1,
    tomorrowUtc.getUTCDate(),
    hour,
    minute,
    timeZone
  );
}

export default function GRAVIX() {
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [initialLoad, setInitialLoad] = useState(true);
  const [actionLoad, setActionLoad] = useState<Record<ActionKey, boolean>>(DEFAULT_ACTION_LOAD);
  const [connectLoad, setConnectLoad] = useState(false);

  const [stats, setStats] = useState<Stats>(DEFAULT_STATS);
  const [shorts, setShorts] = useState<Short[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [config, setConfig] = useState<Config>({});
  const [schedulerState, setSchedulerState] = useState<SchedulerState | null>(null);
  const [channelMappings, setChannelMappings] = useState<ChannelMapping[]>([]);
  const [sourceChannels, setSourceChannels] = useState<SourceChannel[]>([]);
  const [destinationChannels, setDestinationChannels] = useState<DestinationChannel[]>([]);
  const [sourceMonitor, setSourceMonitor] = useState<Record<string, SourceScrapeMonitor>>({});
  const [scrapeRuns, setScrapeRuns] = useState<ScrapeRun[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [selectedShort, setSelectedShort] = useState<Short | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showMappingDialog, setShowMappingDialog] = useState(false);
  const [showSourceDialog, setShowSourceDialog] = useState(false);
  const [editingMapping, setEditingMapping] = useState<ChannelMapping | null>(null);
  const [editingSource, setEditingSource] = useState<SourceChannel | null>(null);
  const [newMapping, setNewMapping] = useState(DEFAULT_MAPPING_FORM);
  const [newSource, setNewSource] = useState(DEFAULT_SOURCE_FORM);
  const [destinationTitleEdits, setDestinationTitleEdits] = useState<Record<string, string>>({});

  const [activeMappingId, setActiveMappingId] = useState<string | null>(null);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [activeDestinationId, setActiveDestinationId] = useState<string | null>(null);
  const [activeShortId, setActiveShortId] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [clockNow, setClockNow] = useState(() => Date.now());

  const setActionState = useCallback((key: ActionKey, value: boolean) => {
    setActionLoad((prev) => ({ ...prev, [key]: value }));
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/stats');
      const data = await response.json();
      if (data.success) {
        setStats(data.stats);
        setLogs(data.logs || []);
        setSchedulerState(data.scheduler);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, []);

  const fetchShorts = useCallback(async () => {
    try {
      const response = await fetch('/api/videos?limit=100');
      const data = await response.json();
      if (data.success) {
        setShorts(data.shorts || []);
      }
    } catch (error) {
      console.error('Failed to fetch shorts:', error);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/config');
      const data = await response.json();
      if (data.success) {
        setConfig(data.config || {});
      }
    } catch (error) {
      console.error('Failed to fetch config:', error);
    }
  }, []);

  const fetchMappings = useCallback(async () => {
    try {
      const response = await fetch('/api/mappings');
      const data = await response.json();
      if (data.success) {
        setChannelMappings(data.mappings || []);
      }
    } catch (error) {
      console.error('Failed to fetch mappings:', error);
    }
  }, []);

  const fetchSourceChannels = useCallback(async () => {
    try {
      const response = await fetch('/api/youtube/source-channels');
      const data = await response.json();
      if (data.success) {
        setSourceChannels(data.channels || []);
      }
    } catch (error) {
      console.error('Failed to fetch source channels:', error);
    }
  }, []);

  const fetchScrapingMonitor = useCallback(async () => {
    try {
      const response = await fetch('/api/scraping');
      const data = await response.json();
      if (data.success) {
        const sources = (data.monitor?.sources || []) as SourceScrapeMonitor[];
        const map: Record<string, SourceScrapeMonitor> = {};
        for (const source of sources) {
          map[source.channel_id] = source;
        }
        setSourceMonitor(map);
        setScrapeRuns((data.monitor?.runs || []) as ScrapeRun[]);
      }
    } catch (error) {
      console.error('Failed to fetch scraping monitor:', error);
    }
  }, []);

  const fetchDestinationChannels = useCallback(async () => {
    try {
      const response = await fetch('/api/youtube/destination-channels');
      const data = await response.json();
      if (data.success) {
        setDestinationChannels(data.channels || []);
      }
    } catch (error) {
      console.error('Failed to fetch destination channels:', error);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setInitialLoad(true);
      try {
        await Promise.all([
          fetchStats(),
          fetchShorts(),
          fetchConfig(),
          fetchMappings(),
          fetchSourceChannels(),
          fetchScrapingMonitor(),
          fetchDestinationChannels(),
        ]);
      } finally {
        if (mounted) {
          setInitialLoad(false);
        }
      }
    };

    void load();

    const interval = window.setInterval(() => {
      if (mounted) {
        void fetchStats();
      }
    }, 30000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [fetchConfig, fetchDestinationChannels, fetchMappings, fetchScrapingMonitor, fetchShorts, fetchSourceChannels, fetchStats]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      const data = event.data as {
        type?: string;
        success?: boolean;
        message?: string;
        primary_channel_id?: string;
      };

      if (!data || data.type !== 'youtube-oauth-result') {
        return;
      }

      setConnectLoad(false);

      if (data.success) {
        toast({
          title: 'Destination Connected',
          description: data.message || 'YouTube destination channel connected successfully',
        });

        if (data.primary_channel_id) {
          setNewMapping((prev) => ({
            ...prev,
            target_channel_id: data.primary_channel_id || prev.target_channel_id,
          }));
        }

        void fetchDestinationChannels();
      } else {
        toast({
          title: 'Connection Failed',
          description: data.message || 'Could not connect destination channel',
          variant: 'destructive',
        });
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [fetchDestinationChannels, toast]);

  useEffect(() => {
    setDestinationTitleEdits((prev) => {
      const next: Record<string, string> = {};
      for (const channel of destinationChannels) {
        next[channel.channel_id] = prev[channel.channel_id] ?? channel.channel_title;
      }
      return next;
    });
  }, [destinationChannels]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const refreshAll = useCallback(async () => {
    setActionState('refresh', true);
    try {
      await Promise.all([
        fetchStats(),
        fetchShorts(),
        fetchMappings(),
        fetchSourceChannels(),
        fetchScrapingMonitor(),
        fetchDestinationChannels(),
      ]);
    } finally {
      setActionState('refresh', false);
    }
  }, [fetchDestinationChannels, fetchMappings, fetchScrapingMonitor, fetchShorts, fetchSourceChannels, fetchStats, setActionState]);

  const connectDestinationChannel = () => {
    setConnectLoad(true);

    const popup = window.open(
      '/api/youtube/oauth/start',
      'youtube_destination_oauth',
      'width=540,height=740,menubar=no,toolbar=no,location=no,status=no',
    );

    if (!popup) {
      setConnectLoad(false);
      toast({
        title: 'Popup Blocked',
        description: 'Allow popups and try again.',
        variant: 'destructive',
      });
      return;
    }

    const watcher = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(watcher);
        setConnectLoad(false);
        void fetchDestinationChannels();
      }
    }, 600);
  };

  const openSourceDialog = (channel?: SourceChannel) => {
    if (channel) {
      setEditingSource(channel);
      setNewSource({
        channel_id: channel.channel_id,
        channel_title: channel.channel_title,
        channel_url: channel.channel_url,
        is_active: channel.is_active,
      });
    } else {
      setEditingSource(null);
      setNewSource(DEFAULT_SOURCE_FORM);
    }

    setShowSourceDialog(true);
  };

  const saveSourceChannel = async () => {
    if (!newSource.channel_url.trim()) {
      toast({ title: 'Error', description: 'Source channel URL is required', variant: 'destructive' });
      return;
    }

    setActionState('saveSource', true);
    try {
      const response = await fetch('/api/youtube/source-channels', {
        method: editingSource ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editingSource
            ? {
                channel_id: editingSource.channel_id,
                channel_title: newSource.channel_title,
                channel_url: newSource.channel_url,
                is_active: newSource.is_active,
              }
            : newSource,
        ),
      });
      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Success',
          description: editingSource ? 'Source channel updated' : 'Source channel added',
        });
        await Promise.all([fetchSourceChannels(), fetchMappings(), fetchScrapingMonitor()]);
        setShowSourceDialog(false);
        setEditingSource(null);
        setNewSource(DEFAULT_SOURCE_FORM);
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to save source channel', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to save source channel', variant: 'destructive' });
    } finally {
      setActionState('saveSource', false);
    }
  };

  const deleteSourceChannel = async (channel: SourceChannel) => {
    if (!confirm('Delete this source channel and all related mappings/videos?')) {
      return;
    }

    setActiveSourceId(channel.channel_id);
    setActionState('deleteSource', true);
    try {
      const response = await fetch(
        `/api/youtube/source-channels?channelId=${encodeURIComponent(channel.channel_id)}&cleanupMappings=true`,
        { method: 'DELETE' },
      );
      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Deleted',
          description: 'Source channel and related mappings were removed from database',
        });
        await Promise.all([fetchSourceChannels(), fetchMappings(), fetchShorts(), fetchStats(), fetchScrapingMonitor()]);
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to delete source channel', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to delete source channel', variant: 'destructive' });
    } finally {
      setActionState('deleteSource', false);
      setActiveSourceId(null);
    }
  };

  const setSourceActiveState = async (channel: SourceChannel, isActive: boolean) => {
    setActiveSourceId(channel.channel_id);
    setActionState('saveSource', true);
    try {
      const response = await fetch('/api/youtube/source-channels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_id: channel.channel_id,
          channel_title: channel.channel_title,
          channel_url: channel.channel_url,
          is_active: isActive,
        }),
      });
      const data = await response.json();
      if (data.success) {
        await Promise.all([fetchSourceChannels(), fetchMappings(), fetchScrapingMonitor()]);
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to update source channel', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update source channel', variant: 'destructive' });
    } finally {
      setActionState('saveSource', false);
      setActiveSourceId(null);
    }
  };

  const scrapeSourceNow = async (channel: SourceChannel) => {
    if (!channel.is_active) {
      toast({
        title: 'Scraping Stopped',
        description: 'Start scraping for this source first.',
        variant: 'destructive',
      });
      return;
    }

    setActiveSourceId(channel.channel_id);
    setActionState('scrapeSource', true);
    try {
      const response = await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'fetch-source',
          sourceChannelId: channel.channel_id,
          sourceChannelUrl: channel.channel_url,
        }),
      });
      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Scraping Completed',
          description: `Added ${data.stats?.added || 0}, duplicates ${data.stats?.duplicates || 0}`,
        });
        await Promise.all([fetchShorts(), fetchStats(), fetchScrapingMonitor()]);
      } else {
        toast({ title: 'Error', description: data.error || 'Scraping failed', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to scrape source channel', variant: 'destructive' });
    } finally {
      setActionState('scrapeSource', false);
      setActiveSourceId(null);
    }
  };

  const scrapeAllSources = async () => {
    setActionState('scrapeAllSources', true);
    try {
      const response = await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fetch-all-sources' }),
      });
      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Scraping Completed',
          description: `Added ${data.stats?.added || 0}, duplicates ${data.stats?.duplicates || 0}`,
        });
        await Promise.all([fetchShorts(), fetchStats(), fetchScrapingMonitor()]);
      } else {
        toast({ title: 'Error', description: data.error || 'Scraping failed', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to scrape all sources', variant: 'destructive' });
    } finally {
      setActionState('scrapeAllSources', false);
    }
  };

  const saveDestinationTitle = async (channelId: string) => {
    const channelTitle = (destinationTitleEdits[channelId] || '').trim();
    if (!channelTitle) {
      toast({ title: 'Error', description: 'Destination channel title is required', variant: 'destructive' });
      return;
    }

    setActiveDestinationId(channelId);
    setActionState('saveDestination', true);

    try {
      const response = await fetch('/api/youtube/destination-channels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channelId, channel_title: channelTitle }),
      });
      const data = await response.json();

      if (data.success) {
        toast({ title: 'Saved', description: 'Destination channel title updated' });
        await Promise.all([fetchDestinationChannels(), fetchMappings(), fetchScrapingMonitor()]);
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to update destination channel',
          variant: 'destructive',
        });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update destination channel', variant: 'destructive' });
    } finally {
      setActionState('saveDestination', false);
      setActiveDestinationId(null);
    }
  };

  const deleteDestinationChannel = async (channel: DestinationChannel) => {
    if (!confirm('Delete this destination channel and all related mappings/videos?')) {
      return;
    }

    setActiveDestinationId(channel.channel_id);
    setActionState('deleteDestination', true);

    try {
      const response = await fetch(
        `/api/youtube/destination-channels?channelId=${encodeURIComponent(channel.channel_id)}&cleanupMappings=true`,
        { method: 'DELETE' },
      );
      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Deleted',
          description: 'Destination channel and related mappings were removed from database',
        });
        await Promise.all([fetchDestinationChannels(), fetchMappings(), fetchShorts(), fetchStats(), fetchScrapingMonitor()]);
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to delete destination channel',
          variant: 'destructive',
        });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to delete destination channel', variant: 'destructive' });
    } finally {
      setActionState('deleteDestination', false);
      setActiveDestinationId(null);
    }
  };

  const fetchFromMapping = async (mappingId: string, channelUrl: string) => {
    setActiveMappingId(mappingId);
    setActionState('fetchMapping', true);
    try {
      const response = await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fetch', channelUrl, mappingId }),
      });
      const data = await response.json();

      if (data.success) {
        toast({ title: 'Success', description: data.message });
        await Promise.all([fetchShorts(), fetchStats(), fetchMappings(), fetchScrapingMonitor()]);
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to fetch shorts', variant: 'destructive' });
    } finally {
      setActionState('fetchMapping', false);
      setActiveMappingId(null);
    }
  };

  const processShort = async (shortId: string, key: 'uploadNext' | 'processShort' = 'processShort') => {
    if (!shortId) {
      return;
    }

    setActiveShortId(shortId);
    setActionState(key, true);

    try {
      const response = await fetch('/api/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'process', shortId }),
      });
      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Success',
          description: data.scheduledPublishAt
            ? `Uploaded. Auto publish scheduled at ${new Date(data.scheduledPublishAt).toLocaleString()}.`
            : 'Video uploaded successfully!',
        });
        await Promise.all([fetchShorts(), fetchStats(), fetchScrapingMonitor()]);
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to process video', variant: 'destructive' });
    } finally {
      setActionState(key, false);
      if (key !== 'uploadNext') {
        setActiveShortId(null);
      }
    }
  };

  const deleteShort = async (id: string) => {
    if (!confirm('Are you sure you want to delete this video?')) {
      return;
    }

    setActiveShortId(id);
    setActionState('deleteShort', true);

    try {
      const response = await fetch(`/api/videos?id=${id}`, { method: 'DELETE' });
      const data = await response.json();
      if (data.success) {
        toast({ title: 'Deleted', description: 'Video removed successfully' });
        await Promise.all([fetchShorts(), fetchStats(), fetchScrapingMonitor()]);
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
    } finally {
      setActionState('deleteShort', false);
      setActiveShortId(null);
    }
  };

  const saveConfig = async () => {
    setActionState('saveConfig', true);
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await response.json();
      if (data.success) {
        toast({ title: 'Saved', description: 'Configuration saved successfully' });
      } else {
        toast({ title: 'Error', description: 'Failed to save config', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to save config', variant: 'destructive' });
    } finally {
      setActionState('saveConfig', false);
    }
  };

  const saveMapping = async () => {
    if (!newMapping.name || !newMapping.source_channel_id || !newMapping.target_channel_id) {
      toast({ title: 'Error', description: 'Please fill all required fields', variant: 'destructive' });
      return;
    }

    setActionState('saveMapping', true);
    try {
      const selectedSource = sourceChannels.find((channel) => channel.channel_id === newMapping.source_channel_id);
      const selectedDestination = destinationChannels.find((channel) => channel.channel_id === newMapping.target_channel_id);
      const sourceUrl = selectedSource?.channel_url || newMapping.source_channel_url;

      if (!sourceUrl) {
        toast({ title: 'Error', description: 'Selected source channel is missing URL', variant: 'destructive' });
        return;
      }

      const payload = {
        ...newMapping,
        source_channel_url: sourceUrl,
        source_channel_name: selectedSource?.channel_title || newMapping.source_channel_id,
        target_channel_name: selectedDestination?.channel_title || null,
      };

      const response = await fetch('/api/mappings', {
        method: editingMapping ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingMapping ? { id: editingMapping.id, ...payload } : payload),
      });
      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Success',
          description: editingMapping
            ? 'Mapping updated'
            : `Mapping created. Linked ${data.linked_shorts || 0} already-scraped shorts.`,
        });
        await Promise.all([fetchMappings(), fetchStats(), fetchShorts(), fetchScrapingMonitor()]);
        setShowMappingDialog(false);
        setEditingMapping(null);
        setNewMapping(DEFAULT_MAPPING_FORM);
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to save mapping', variant: 'destructive' });
    } finally {
      setActionState('saveMapping', false);
    }
  };

  const deleteMapping = async (id: string) => {
    if (!confirm('Delete this channel mapping?')) {
      return;
    }

    setActiveMappingId(id);
    setActionState('deleteMapping', true);

    try {
      const response = await fetch(`/api/mappings?id=${id}&cleanupMappedShorts=true`, { method: 'DELETE' });
      const data = await response.json();
      if (data.success) {
        toast({ title: 'Deleted', description: 'Mapping and linked videos removed from database' });
        await Promise.all([fetchMappings(), fetchShorts(), fetchStats(), fetchScrapingMonitor()]);
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
    } finally {
      setActionState('deleteMapping', false);
      setActiveMappingId(null);
    }
  };

  const toggleMapping = async (id: string, isActive: boolean) => {
    setActiveMappingId(id);
    setActionState('toggleMapping', true);
    try {
      const response = await fetch('/api/mappings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: isActive }),
      });
      const data = await response.json();
      if (data.success) {
        await fetchMappings();
      }
    } catch (error) {
      console.error('Failed to toggle mapping:', error);
    } finally {
      setActionState('toggleMapping', false);
      setActiveMappingId(null);
    }
  };

  const triggerScheduler = async () => {
    setActionState('runScheduler', true);
    try {
      const response = await fetch('/api/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run' }),
      });
      const data = await response.json();
      if (data.success) {
        toast({ title: 'Started', description: 'Scheduler run initiated' });
        await fetchStats();
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to trigger scheduler', variant: 'destructive' });
    } finally {
      setActionState('runScheduler', false);
    }
  };

  const openMappingDialog = (mapping?: ChannelMapping) => {
    if (mapping) {
      const sourceMatch =
        sourceChannels.find((channel) => channel.channel_id === mapping.source_channel_id) ||
        sourceChannels.find((channel) => channel.channel_url === mapping.source_channel_url);

      setEditingMapping(mapping);
      setNewMapping({
        name: mapping.name,
        source_channel_id: sourceMatch?.channel_id || mapping.source_channel_id,
        source_channel_url: mapping.source_channel_url,
        target_channel_id: mapping.target_channel_id,
        uploads_per_day: mapping.uploads_per_day,
        upload_time_morning: mapping.upload_time_morning || '09:00',
        upload_time_evening: mapping.upload_time_evening || '18:00',
        default_visibility: mapping.default_visibility,
        ai_enhancement_enabled: mapping.ai_enhancement_enabled,
      });
    } else {
      setEditingMapping(null);
      setNewMapping(DEFAULT_MAPPING_FORM);
    }

    setShowMappingDialog(true);
  };

  const tabTitle = useMemo(() => {
    const map: Record<string, string> = {
      dashboard: 'Operations Dashboard',
      sources: 'Source Channels',
      destinations: 'Destination Channels',
      mappings: 'Channel Mappings',
      videos: 'Video Library',
      config: 'Configuration',
      logs: 'Activity Timeline',
    };
    return map[activeTab] || 'Dashboard';
  }, [activeTab]);

  const normalizedSearch = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery]);

  const filteredShorts = useMemo(() => {
    return shorts.filter((short) => {
      const matchesSearch =
        short.title.toLowerCase().includes(normalizedSearch) || short.video_id.toLowerCase().includes(normalizedSearch);
      const matchesStatus = statusFilter === 'all' || short.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [normalizedSearch, shorts, statusFilter]);

  const statCards = useMemo(
    () => [
      {
        label: 'Total Videos',
        value: stats.total,
        cls: 'stat-total',
        icon: <BarChart3 className="h-4 w-4 text-cyan-300" />,
      },
      {
        label: 'Pending',
        value: stats.pending,
        cls: 'stat-pending',
        icon: <Clock className="h-4 w-4 text-amber-300" />,
      },
      {
        label: 'Uploaded',
        value: stats.uploaded,
        cls: 'stat-uploaded',
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-300" />,
      },
      {
        label: 'Failed',
        value: stats.failed,
        cls: 'stat-failed',
        icon: <XCircle className="h-4 w-4 text-rose-300" />,
      },
      {
        label: 'Today',
        value: stats.uploadedToday,
        cls: 'stat-today',
        icon: <TrendingUp className="h-4 w-4 text-violet-300" />,
      },
      {
        label: 'Mappings',
        value: stats.activeMappings,
        cls: 'stat-mappings',
        icon: <Link2 className="h-4 w-4 text-sky-300" />,
      },
    ],
    [stats.activeMappings, stats.failed, stats.pending, stats.total, stats.uploaded, stats.uploadedToday],
  );

  const healthMetrics = useMemo(() => {
    const total = Math.max(stats.total, 1);
    return {
      uploaded: Math.round((stats.uploaded / total) * 100),
      pending: Math.round((stats.pending / total) * 100),
      failed: Math.round((stats.failed / total) * 100),
    };
  }, [stats.failed, stats.pending, stats.total, stats.uploaded]);

  const recentLogs = useMemo(() => logs.slice(0, 12), [logs]);
  const dashboardMappings = useMemo(() => channelMappings.slice(0, 5), [channelMappings]);
  const pendingShort = useMemo(() => shorts.find((short) => short.status === 'Pending')?.id || '', [shorts]);
  const schedulerTimezone = useMemo(() => (config.scheduler_timezone || 'UTC').trim() || 'UTC', [config.scheduler_timezone]);
  const currentMinuteKey = useMemo(() => Math.floor(clockNow / 60000), [clockNow]);

  const schedulerClockLabel = useMemo(() => {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: schedulerTimezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(clockNow));
  }, [clockNow, schedulerTimezone]);

  const schedulerClockDateLabel = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: schedulerTimezone,
      weekday: 'short',
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    }).format(new Date(clockNow));
  }, [clockNow, schedulerTimezone]);

  const localClockLabel = useMemo(() => {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(clockNow));
  }, [clockNow]);

  const pendingByMapping = useMemo(() => {
    const counts = new Map<string, number>();
    for (const short of shorts) {
      if (short.status !== 'Pending' || !short.mapping_id) {
        continue;
      }
      counts.set(short.mapping_id, (counts.get(short.mapping_id) || 0) + 1);
    }
    return counts;
  }, [shorts]);

  const pendingGlobalQueue = useMemo(() => {
    return shorts.filter((short) => short.status === 'Pending' && !short.mapping_id).length;
  }, [shorts]);
  const nextPendingTitleByMapping = useMemo(() => {
    const sortedPending = shorts
      .filter((short) => short.status === 'Pending' && !!short.mapping_id)
      .slice()
      .sort((first, second) => new Date(first.created_at).getTime() - new Date(second.created_at).getTime());

    const map = new Map<string, string>();
    for (const short of sortedPending) {
      if (!short.mapping_id || map.has(short.mapping_id)) {
        continue;
      }
      map.set(short.mapping_id, short.title);
    }
    return map;
  }, [shorts]);
  const nextGlobalPendingTitle = useMemo(() => {
    const pendingGlobal = shorts
      .filter((short) => short.status === 'Pending' && !short.mapping_id)
      .slice()
      .sort((first, second) => new Date(first.created_at).getTime() - new Date(second.created_at).getTime());

    return pendingGlobal[0]?.title || null;
  }, [shorts]);

  const destinationMappingCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const mapping of channelMappings) {
      const key = mapping.target_channel_id;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [channelMappings]);
  const sourceChannelById = useMemo(() => {
    return new Map(sourceChannels.map((channel) => [channel.channel_id, channel]));
  }, [sourceChannels]);
  const sourceChannelByUrl = useMemo(() => {
    return new Map(sourceChannels.map((channel) => [channel.channel_url, channel]));
  }, [sourceChannels]);
  const destinationChannelById = useMemo(() => {
    return new Map(destinationChannels.map((channel) => [channel.channel_id, channel]));
  }, [destinationChannels]);
  const mappingNameById = useMemo(() => {
    return new Map(channelMappings.map((mapping) => [mapping.id, mapping.name]));
  }, [channelMappings]);

  const upcomingUploadSlots = useMemo(() => {
    const now = new Date(currentMinuteKey * 60 * 1000);
    const activeMappings = channelMappings.filter((mapping) => mapping.is_active);
    const fallbackMorning = normalizeTimeValue(config.upload_time_morning, '09:00');
    const fallbackEvening = normalizeTimeValue(config.upload_time_evening, '18:00');
    const slots: UpcomingUploadSlot[] = [];

    for (const mapping of activeMappings) {
      const morningSlot = normalizeTimeValue(mapping.upload_time_morning, fallbackMorning);
      const eveningSlot = normalizeTimeValue(mapping.upload_time_evening, fallbackEvening);
      const mappingPending = pendingByMapping.get(mapping.id) || 0;
      const slotDefinitions = [
        { label: 'Morning', time: morningSlot },
        { label: 'Evening', time: eveningSlot },
      ];
      const deduped = new Set<string>();

      for (const slot of slotDefinitions) {
        const dedupeKey = `${slot.label}:${slot.time}`;
        if (deduped.has(dedupeKey)) {
          continue;
        }
        deduped.add(dedupeKey);

        const nextOccurrence = getNextOccurrence(slot.time, schedulerTimezone, now);
        if (!nextOccurrence) {
          continue;
        }

        slots.push({
          id: `${mapping.id}:${slot.label}:${slot.time}`,
          kind: 'mapping',
          mappingId: mapping.id,
          mappingName: mapping.name,
          slotLabel: slot.label,
          slotTime: slot.time,
          scheduledAt: nextOccurrence.getTime(),
          pendingCount: mappingPending,
          nextVideoTitle: nextPendingTitleByMapping.get(mapping.id) || null,
        });
      }
    }

    const globalSlots = [
      { label: 'Global Morning', time: fallbackMorning },
      { label: 'Global Evening', time: fallbackEvening },
    ];
    const globalDeduped = new Set<string>();

    for (const slot of globalSlots) {
      if (globalDeduped.has(slot.time)) {
        continue;
      }
      globalDeduped.add(slot.time);

      const nextOccurrence = getNextOccurrence(slot.time, schedulerTimezone, now);
      if (!nextOccurrence) {
        continue;
      }

      slots.push({
        id: `global:${slot.label}:${slot.time}`,
        kind: 'global',
        mappingId: null,
        mappingName: 'Global Queue',
        slotLabel: slot.label,
        slotTime: slot.time,
        scheduledAt: nextOccurrence.getTime(),
        pendingCount: pendingGlobalQueue,
        nextVideoTitle: nextGlobalPendingTitle,
      });
    }

    return slots.sort((first, second) => first.scheduledAt - second.scheduledAt).slice(0, 8);
  }, [
    channelMappings,
    currentMinuteKey,
    config.upload_time_evening,
    config.upload_time_morning,
    pendingByMapping,
    pendingGlobalQueue,
    nextGlobalPendingTitle,
    nextPendingTitleByMapping,
    schedulerTimezone,
  ]);

  const delayedPublishQueue = useMemo(() => {
    const queue: ScheduledPublishItem[] = [];

    for (const short of shorts) {
      if (short.status !== 'Uploaded' || !short.scheduled_date) {
        continue;
      }

      const scheduledAt = new Date(short.scheduled_date).getTime();
      if (!Number.isFinite(scheduledAt)) {
        continue;
      }

      queue.push({
        id: short.id,
        title: short.title,
        mappingName: short.mapping_id ? mappingNameById.get(short.mapping_id) || 'Mapped Video' : 'Global Video',
        scheduledAt,
      });
    }

    return queue.sort((first, second) => first.scheduledAt - second.scheduledAt).slice(0, 8);
  }, [shorts, mappingNameById, currentMinuteKey]);

  const statusBadge = useCallback((status: string) => {
    const map: Record<string, { cls: string; icon: JSX.Element }> = {
      Pending: {
        cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        icon: <Clock className="mr-1 h-3 w-3" />,
      },
      Downloaded: {
        cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
        icon: <Download className="mr-1 h-3 w-3" />,
      },
      Uploading: {
        cls: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
        icon: <Upload className="mr-1 h-3 w-3" />,
      },
      Uploaded: {
        cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        icon: <CheckCircle2 className="mr-1 h-3 w-3" />,
      },
      Failed: {
        cls: 'bg-red-500/10 text-red-400 border-red-500/30',
        icon: <XCircle className="mr-1 h-3 w-3" />,
      },
    };

    const value = map[status] || map.Pending;
    return (
      <Badge variant="outline" className={`text-[10px] font-medium ${value.cls}`}>
        {value.icon}
        {status}
      </Badge>
    );
  }, []);

  const fmtDate = useCallback((value: string | null) => {
    return value ? new Date(value).toLocaleString() : '—';
  }, []);

  const formatSchedulerDateTime = useCallback(
    (timestamp: number) => {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: schedulerTimezone,
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(new Date(timestamp));
    },
    [schedulerTimezone]
  );

  const relativeFromNow = useCallback(
    (timestamp: number) => {
      const diffMs = timestamp - clockNow;
      if (Math.abs(diffMs) < 30 * 1000) {
        return 'now';
      }

      const totalMinutes = Math.round(Math.abs(diffMs) / (60 * 1000));
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      const value = `${hours > 0 ? `${hours}h ` : ''}${minutes}m`;

      return diffMs > 0 ? `in ${value}` : `${value} ago`;
    },
    [clockNow]
  );

  const logout = useCallback(async () => {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } catch {
      // Always continue redirecting to login.
    } finally {
      window.location.href = '/admin/login';
    }
  }, [loggingOut]);

  return (
    <div className="app-shell flex min-h-screen bg-background text-foreground">
      <SidebarNav activeTab={activeTab} onTabChange={setActiveTab} stats={stats} />

      <div className="flex min-h-screen flex-1 flex-col md:ml-64">
        <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex items-center gap-2 md:hidden">
                <img src="/logo.svg" alt="GRAVIX" className="h-6 w-6" />
                <span className="font-heading text-sm font-bold accent-gradient-text">GRAVIX</span>
              </div>
              <div className="hidden min-w-0 md:block">
                <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Workspace</p>
                <h1 className="font-heading text-lg leading-tight">{tabTitle}</h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-lg border border-border/70 bg-muted/35 px-2.5 py-1.5 md:flex">
                <Clock className="h-3.5 w-3.5 text-primary" />
                <div className="leading-tight">
                  <p className="font-mono text-[11px] font-semibold text-foreground">
                    {schedulerClockLabel} <span className="text-muted-foreground">({schedulerTimezone})</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {schedulerClockDateLabel} · Local {localClockLabel}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void logout();
                }}
                disabled={loggingOut}
                className="h-8 px-3 text-xs"
              >
                <LogOut className={`mr-1.5 h-3.5 w-3.5 ${loggingOut ? 'animate-spin' : ''}`} />
                Logout
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void refreshAll();
                }}
                disabled={actionLoad.refresh}
                className="h-8 px-3 text-xs"
              >
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${actionLoad.refresh ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <ThemeToggle />
            </div>
          </div>
        </header>

        <MobileNav activeTab={activeTab} onTabChange={setActiveTab} />

        <main className="page-enter mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
          {activeTab === 'dashboard' && (
            <div className="space-y-4 sm:space-y-5">
              <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
                <Card className="ring-panel glass-panel">
                  <CardHeader className="pb-3">
                    <CardDescription className="text-[11px] uppercase tracking-[0.2em] text-cyan-200/80">
                      Control Deck
                    </CardDescription>
                    <CardTitle className="font-heading text-2xl">Pipeline Command Center</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Run fetch/upload operations, monitor scheduler health, and keep mappings synchronized in one place.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            void scrapeAllSources();
                          }}
                          disabled={actionLoad.scrapeAllSources}
                          className="accent-gradient text-white"
                        >
                          {actionLoad.scrapeAllSources ? (
                            <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ArrowDownCircle className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Scrape Sources
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            void triggerScheduler();
                          }}
                          disabled={actionLoad.runScheduler}
                        >
                          {actionLoad.runScheduler ? (
                            <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Play className="mr-1.5 h-3.5 w-3.5 text-emerald-400" />
                          )}
                          Run Scheduler
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            void processShort(pendingShort, 'uploadNext');
                          }}
                          disabled={!pendingShort || actionLoad.uploadNext}
                        >
                          {actionLoad.uploadNext ? (
                            <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Upload className="mr-1.5 h-3.5 w-3.5 text-blue-400" />
                          )}
                          Upload Next
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setActiveTab('mappings')}>
                          <Link2 className="mr-1.5 h-3.5 w-3.5" />
                          Go To Mappings
                        </Button>
                      </div>
                    </div>

                    <div className="glass-panel rounded-xl p-3">
                      <p className="mb-3 text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
                        Upload Health
                      </p>
                      <div className="space-y-2.5">
                        <div>
                          <div className="mb-1.5 flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Uploaded</span>
                            <span>{healthMetrics.uploaded}%</span>
                          </div>
                          <div className="metric-bar">
                            <span style={{ width: `${healthMetrics.uploaded}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="mb-1.5 flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Pending</span>
                            <span>{healthMetrics.pending}%</span>
                          </div>
                          <div className="metric-bar">
                            <span style={{ width: `${healthMetrics.pending}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="mb-1.5 flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Failed</span>
                            <span>{healthMetrics.failed}%</span>
                          </div>
                          <div className="metric-bar">
                            <span style={{ width: `${healthMetrics.failed}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-panel">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-heading text-base">Scheduler Pulse</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/35 px-3 py-2">
                      <div className={`status-dot ${schedulerState?.is_running ? 'online' : 'offline'}`} />
                      <span className="text-sm font-medium">{schedulerState?.is_running ? 'Running' : 'Idle'}</span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Uploads today</span>
                        <span className="font-semibold text-foreground">{schedulerState?.uploads_today ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Last run</span>
                        <span className="max-w-[12rem] truncate text-right text-foreground">
                          {fmtDate(schedulerState?.last_run_at ?? null)}
                        </span>
                      </div>
                      {schedulerState?.current_status && (
                        <div className="rounded-lg border border-border/60 bg-muted/25 px-2.5 py-2 text-[11px] text-muted-foreground">
                          {schedulerState.current_status}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                {statCards.map((card) => (
                  <Card key={card.label} className={`stat-card glass-panel ${card.cls}`}>
                    <CardContent className="p-4">
                      <div className="mb-2 flex items-center justify-between">{card.icon}</div>
                      <p className="font-heading text-2xl leading-none">{card.value}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{card.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
                <Card className="glass-panel">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-heading text-base">Next Upload Timeline</CardTitle>
                    <CardDescription className="text-xs">
                      Mapping-wise + global slots in <span className="font-medium">{schedulerTimezone}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {upcomingUploadSlots.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border/70 px-3 py-8 text-center text-muted-foreground">
                        <Clock className="mx-auto mb-2 h-7 w-7 opacity-40" />
                        <p className="text-sm">No upcoming slots found</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {upcomingUploadSlots.map((slot) => (
                          <div
                            key={slot.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/25 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-medium">{slot.mappingName}</p>
                                <Badge variant="outline" className="text-[10px]">
                                  {slot.kind === 'global' ? 'Global' : 'Mapping'}
                                </Badge>
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                {slot.slotLabel} ({slot.slotTime}) · {formatSchedulerDateTime(slot.scheduledAt)}
                              </p>
                              {slot.nextVideoTitle ? (
                                <p className="truncate text-[11px] text-muted-foreground/90">
                                  Next video: {slot.nextVideoTitle}
                                </p>
                              ) : (
                                <p className="text-[11px] text-muted-foreground/70">Next video: none in queue</p>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-semibold text-primary">{relativeFromNow(slot.scheduledAt)}</p>
                              <p className="text-[10px] text-muted-foreground">Pending: {slot.pendingCount}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="glass-panel">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-heading text-base">Scheduled Public Publish</CardTitle>
                    <CardDescription className="text-xs">
                      Videos waiting for delayed auto-public transition
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {delayedPublishQueue.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border/70 px-3 py-8 text-center text-muted-foreground">
                        <Zap className="mx-auto mb-2 h-7 w-7 opacity-40" />
                        <p className="text-sm">No delayed publish queue</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-56 pr-2">
                        <div className="space-y-2">
                          {delayedPublishQueue.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-lg border border-border/70 bg-muted/25 px-3 py-2"
                            >
                              <p className="truncate text-sm font-medium">{item.title}</p>
                              <p className="truncate text-[11px] text-muted-foreground">{item.mappingName}</p>
                              <div className="mt-1 flex items-center justify-between text-[11px]">
                                <span className="text-muted-foreground">{formatSchedulerDateTime(item.scheduledAt)}</span>
                                <span className="font-semibold text-primary">{relativeFromNow(item.scheduledAt)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
                <Card className="glass-panel">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="font-heading text-base">Active Mappings</CardTitle>
                      <Button size="sm" variant="outline" onClick={() => openMappingDialog()}>
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Add Mapping
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {dashboardMappings.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border/70 py-10 text-center text-muted-foreground">
                        <Link2 className="mx-auto mb-2 h-8 w-8 opacity-40" />
                        <p className="text-sm">No channel mappings yet</p>
                        <Button size="sm" variant="outline" className="mt-3" onClick={() => openMappingDialog()}>
                          Create First Mapping
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {dashboardMappings.map((mapping) => (
                          (() => {
                            const sourceMeta =
                              sourceChannelById.get(mapping.source_channel_id) ||
                              sourceChannelByUrl.get(mapping.source_channel_url);
                            const scrapingStopped = sourceMeta ? !sourceMeta.is_active : false;

                            return (
                              <div
                                key={mapping.id}
                                className="transition-ease flex items-center gap-3 rounded-xl border border-border/70 bg-muted/25 px-3 py-2.5 hover:border-primary/35"
                              >
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
                                  <Youtube className="h-4 w-4 text-primary" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium">{mapping.name}</p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {sourceMeta?.channel_title ||
                                      mapping.source_channel_name ||
                                      mapping.source_channel_id ||
                                      'Unknown Source'}
                                  </p>
                                </div>
                                <Badge variant={mapping.is_active ? 'default' : 'secondary'} className="text-[10px]">
                                  {mapping.is_active ? 'Active' : 'Paused'}
                                </Badge>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  onClick={() => {
                                    void fetchFromMapping(mapping.id, mapping.source_channel_url);
                                  }}
                                  disabled={scrapingStopped || (actionLoad.fetchMapping && activeMappingId === mapping.id)}
                                  title={scrapingStopped ? 'Scraping is stopped for this source' : 'Fetch shorts'}
                                >
                                  {actionLoad.fetchMapping && activeMappingId === mapping.id ? (
                                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Download className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </div>
                            );
                          })()
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="glass-panel">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-heading text-base">Recent Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-64 pr-2">
                      {recentLogs.length === 0 ? (
                        <div className="py-10 text-center text-muted-foreground">
                          <AlertCircle className="mx-auto mb-2 h-7 w-7 opacity-40" />
                          <p className="text-sm">No recent activity</p>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          {recentLogs.map((log) => (
                            <div key={log.id} className="timeline-item py-2.5">
                              <div className={`timeline-dot ${log.status === 'success' ? 'success' : 'error'}`} />
                              <div className="space-y-0.5">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="truncate text-sm font-medium">{log.action}</p>
                                  <span className="text-[10px] text-muted-foreground">
                                    {new Date(log.created_at).toLocaleTimeString()}
                                  </span>
                                </div>
                                {log.message && <p className="text-xs text-muted-foreground">{log.message}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {activeTab === 'sources' && (
            <div className="space-y-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h2 className="font-heading text-2xl">Source Channels</h2>
                  <p className="text-sm text-muted-foreground">
                    Add source channels, stop/start scraping anytime, then map them to destinations.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      void scrapeAllSources();
                    }}
                    variant="outline"
                    disabled={actionLoad.scrapeAllSources || sourceChannels.length === 0}
                  >
                    {actionLoad.scrapeAllSources ? (
                      <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-1.5 h-4 w-4" />
                    )}
                    Scrape All
                  </Button>
                  <Button onClick={() => openSourceDialog()} className="accent-gradient text-white">
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add Source
                  </Button>
                </div>
              </div>

              {sourceChannels.length === 0 ? (
                <Card className="glass-panel">
                  <CardContent className="py-14 text-center">
                    <Download className="mx-auto mb-3 h-10 w-10 text-muted-foreground/70" />
                    <h3 className="font-heading text-lg">No source channels</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Add at least one source channel before creating mappings.
                    </p>
                    <Button className="mt-4 accent-gradient text-white" onClick={() => openSourceDialog()}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add First Source
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {sourceChannels.map((channel) => {
                    const busy =
                      activeSourceId === channel.channel_id &&
                      (actionLoad.deleteSource || actionLoad.saveSource || actionLoad.scrapeSource);
                    const monitor = sourceMonitor[channel.channel_id];

                    return (
                      <Card key={channel.channel_id} className={`card-interactive glass-panel ${!channel.is_active ? 'opacity-70' : ''}`}>
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <CardTitle className="truncate font-heading text-base">{channel.channel_title}</CardTitle>
                              <CardDescription className="mt-1 font-mono text-[11px]">{channel.channel_id}</CardDescription>
                            </div>
                            <Badge variant={channel.is_active ? 'default' : 'secondary'} className="text-[10px]">
                              {channel.is_active ? 'Scraping On' : 'Scraping Off'}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3 pb-3">
                          <div className="rounded-lg border border-border/60 bg-muted/25 p-2.5">
                            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Source URL</p>
                            <p className="mt-1 truncate font-mono text-[11px]">{channel.channel_url}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                            <div className="rounded-md border border-border/60 bg-muted/25 px-2.5 py-2">
                              <p>Total</p>
                              <p className="font-medium text-foreground">{monitor?.total_shorts || 0}</p>
                            </div>
                            <div className="rounded-md border border-border/60 bg-muted/25 px-2.5 py-2">
                              <p>Pending</p>
                              <p className="font-medium text-foreground">{monitor?.pending_shorts || 0}</p>
                            </div>
                            <div className="rounded-md border border-border/60 bg-muted/25 px-2.5 py-2">
                              <p>Uploaded</p>
                              <p className="font-medium text-foreground">{monitor?.uploaded_shorts || 0}</p>
                            </div>
                            <div className="rounded-md border border-border/60 bg-muted/25 px-2.5 py-2">
                              <p>Failed</p>
                              <p className="font-medium text-foreground">{monitor?.failed_shorts || 0}</p>
                            </div>
                          </div>
                          {monitor?.last_scrape_at && (
                            <div className="rounded-lg border border-border/60 bg-muted/25 px-2.5 py-2 text-[10px] text-muted-foreground">
                              <p>Last scrape: {new Date(monitor.last_scrape_at).toLocaleString()}</p>
                              <p>
                                Added {monitor.last_scrape_stats.added}, duplicates {monitor.last_scrape_stats.duplicates},
                                errors {monitor.last_scrape_stats.errors}
                              </p>
                            </div>
                          )}
                        </CardContent>
                        <CardFooter className="flex-wrap gap-2 pt-0">
                          <Button
                            size="sm"
                            variant={channel.is_active ? 'outline' : 'secondary'}
                            onClick={() => {
                              void setSourceActiveState(channel, !channel.is_active);
                            }}
                            disabled={busy}
                          >
                            {busy && actionLoad.saveSource ? (
                              <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="mr-1 h-3.5 w-3.5" />
                            )}
                            {channel.is_active ? 'Stop Scraping' : 'Start Scraping'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              void scrapeSourceNow(channel);
                            }}
                            disabled={busy || !channel.is_active}
                          >
                            {busy && actionLoad.scrapeSource ? (
                              <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="mr-1 h-3.5 w-3.5" />
                            )}
                            Scrape Now
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openSourceDialog(channel)} disabled={busy}>
                            <Edit className="mr-1.5 h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingMapping(null);
                              setNewMapping({
                                ...DEFAULT_MAPPING_FORM,
                                source_channel_id: channel.channel_id,
                                source_channel_url: channel.channel_url,
                              });
                              setShowMappingDialog(true);
                              setActiveTab('mappings');
                            }}
                          >
                            <Link2 className="mr-1.5 h-3.5 w-3.5" />
                            Map
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ml-auto text-red-400"
                            onClick={() => {
                              void deleteSourceChannel(channel);
                            }}
                            disabled={busy}
                          >
                            {busy && actionLoad.deleteSource ? (
                              <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                            )}
                            Delete
                          </Button>
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              )}

              <Card className="glass-panel">
                <CardHeader className="pb-3">
                  <CardTitle className="font-heading text-base">Scraping Monitor</CardTitle>
                  <CardDescription className="text-xs">
                    Manual scrape history with added/duplicate/error counts from database logs.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-56 pr-2">
                    {scrapeRuns.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No scraping runs yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {scrapeRuns.slice(0, 25).map((run) => (
                          <div key={run.id} className="rounded-lg border border-border/60 bg-muted/25 p-2.5 text-xs">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span className="truncate font-medium">{run.message || 'Scrape run'}</span>
                              <Badge variant={run.status === 'success' ? 'default' : 'destructive'} className="h-5 text-[10px]">
                                {run.status}
                              </Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                              Added {run.stats.added}, duplicates {run.stats.duplicates}, errors {run.stats.errors}, total {run.stats.total}
                            </p>
                            <p className="text-[10px] text-muted-foreground">{new Date(run.created_at).toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'destinations' && (
            <div className="space-y-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h2 className="font-heading text-2xl">Destination Channels</h2>
                  <p className="text-sm text-muted-foreground">
                    Connect destination channels with OAuth, edit labels, and manage database cleanup from one place.
                  </p>
                </div>
                <Button onClick={connectDestinationChannel} disabled={connectLoad} className="accent-gradient text-white">
                  {connectLoad ? (
                    <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Youtube className="mr-1.5 h-4 w-4" />
                  )}
                  Connect Channel
                </Button>
              </div>

              {destinationChannels.length === 0 ? (
                <Card className="glass-panel">
                  <CardContent className="py-14 text-center">
                    <Upload className="mx-auto mb-3 h-10 w-10 text-muted-foreground/70" />
                    <h3 className="font-heading text-lg">No destination channels</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Connect at least one destination channel before creating mappings.
                    </p>
                    <Button className="mt-4 accent-gradient text-white" onClick={connectDestinationChannel} disabled={connectLoad}>
                      {connectLoad ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Youtube className="mr-2 h-4 w-4" />}
                      Connect Destination
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {destinationChannels.map((channel) => {
                    const busy =
                      activeDestinationId === channel.channel_id && (actionLoad.deleteDestination || actionLoad.saveDestination);
                    const mappingCount = destinationMappingCount.get(channel.channel_id) || 0;

                    return (
                      <Card key={channel.channel_id} className="card-interactive glass-panel">
                        <CardHeader className="pb-2">
                          <CardTitle className="font-heading text-base">Destination</CardTitle>
                          <CardDescription className="font-mono text-[11px]">{channel.channel_id}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 pb-3">
                          <div>
                            <Label className="text-xs">Channel Title</Label>
                            <Input
                              className="mt-1.5"
                              value={destinationTitleEdits[channel.channel_id] || ''}
                              onChange={(event) =>
                                setDestinationTitleEdits((prev) => ({
                                  ...prev,
                                  [channel.channel_id]: event.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Mappings</span>
                            <span className="font-medium text-foreground">{mappingCount}</span>
                          </div>
                        </CardContent>
                        <CardFooter className="flex-wrap gap-2 pt-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              void saveDestinationTitle(channel.channel_id);
                            }}
                            disabled={busy}
                          >
                            {busy && actionLoad.saveDestination ? (
                              <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Save className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingMapping(null);
                              setNewMapping({
                                ...DEFAULT_MAPPING_FORM,
                                target_channel_id: channel.channel_id,
                              });
                              setShowMappingDialog(true);
                              setActiveTab('mappings');
                            }}
                          >
                            <Link2 className="mr-1.5 h-3.5 w-3.5" />
                            Map
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ml-auto text-red-400"
                            onClick={() => {
                              void deleteDestinationChannel(channel);
                            }}
                            disabled={busy}
                          >
                            {busy && actionLoad.deleteDestination ? (
                              <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                            )}
                            Delete
                          </Button>
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'mappings' && (
            <div className="space-y-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h2 className="font-heading text-2xl">Channel Mappings</h2>
                  <p className="text-sm text-muted-foreground">
                    Map one source channel to one destination channel with per-flow controls.
                  </p>
                </div>
                <Button
                  onClick={() => openMappingDialog()}
                  className="accent-gradient text-white"
                  disabled={sourceChannels.length === 0 || destinationChannels.length === 0}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  New Mapping
                </Button>
              </div>

              {(sourceChannels.length === 0 || destinationChannels.length === 0) && (
                <Card className="glass-panel">
                  <CardContent className="flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">Add source and destination channels first</p>
                      <p className="text-sm text-muted-foreground">
                        Sources and destinations are managed in separate tabs before mapping.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setActiveTab('sources')}>
                        Go To Sources
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setActiveTab('destinations')}>
                        Go To Destinations
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {channelMappings.length === 0 ? (
                <Card className="glass-panel">
                  <CardContent className="py-14 text-center">
                    <Link2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/70" />
                    <h3 className="font-heading text-lg">No channel mappings</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Create a mapping to route source shorts into destination channels.
                    </p>
                    <Button className="mt-4 accent-gradient text-white" onClick={() => openMappingDialog()}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Mapping
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {channelMappings.map((mapping) => {
                    const isBusy =
                      activeMappingId === mapping.id &&
                      (actionLoad.fetchMapping || actionLoad.deleteMapping || actionLoad.toggleMapping);
                    const sourceMeta =
                      sourceChannelById.get(mapping.source_channel_id) ||
                      sourceChannelByUrl.get(mapping.source_channel_url);
                    const scrapingStopped = sourceMeta ? !sourceMeta.is_active : false;

                    return (
                      <Card key={mapping.id} className={`card-interactive glass-panel ${!mapping.is_active ? 'opacity-65' : ''}`}>
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <CardTitle className="truncate font-heading text-base">{mapping.name}</CardTitle>
                              <CardDescription className="mt-1 text-xs">
                                Created {new Date(mapping.created_at).toLocaleDateString()}
                              </CardDescription>
                            </div>
                            <div className="flex items-center gap-1">
                              <Switch
                                checked={mapping.is_active}
                                onCheckedChange={(checked) => {
                                  void toggleMapping(mapping.id, checked);
                                }}
                                disabled={isBusy}
                                className="scale-90"
                              />
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openMappingDialog(mapping)}>
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-red-400"
                                onClick={() => {
                                  void deleteMapping(mapping.id);
                                }}
                                disabled={isBusy}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="space-y-3 pb-3">
                          <div className="rounded-lg border border-border/60 bg-muted/25 p-2.5">
                            <div className="flex items-center gap-2 text-xs">
                              <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-500/15">
                                <Download className="h-3.5 w-3.5 text-blue-300" />
                              </div>
                              <span className="truncate font-mono text-[11px] opacity-80">{mapping.source_channel_url}</span>
                            </div>

                            {scrapingStopped && (
                              <p className="mt-1 text-[10px] text-amber-300">Scraping is currently stopped for this source</p>
                            )}

                            <div className="flow-arrow py-2">
                              <ArrowRight className="relative z-10 h-3.5 w-3.5 rotate-90 text-primary" />
                            </div>

                            <div className="flex items-center gap-2 text-xs">
                              <div className="flex h-6 w-6 items-center justify-center rounded bg-emerald-500/15">
                                <Upload className="h-3.5 w-3.5 text-emerald-300" />
                              </div>
                              <span className="truncate font-mono text-[11px] opacity-80">
                                {destinationChannelById.get(mapping.target_channel_id)?.channel_title ||
                                  mapping.target_channel_name ||
                                  mapping.target_channel_id}
                              </span>
                            </div>
                          </div>
                        </CardContent>

                        <CardFooter className="gap-2 pt-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => {
                              void fetchFromMapping(mapping.id, mapping.source_channel_url);
                            }}
                            disabled={scrapingStopped || (actionLoad.fetchMapping && activeMappingId === mapping.id)}
                          >
                            {actionLoad.fetchMapping && activeMappingId === mapping.id ? (
                              <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="mr-1 h-3.5 w-3.5" />
                            )}
                            Fetch
                          </Button>
                          <Badge variant="outline" className="text-[10px]">
                            {mapping.uploads_per_day}/day
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {mapping.upload_time_morning || '09:00'} / {mapping.upload_time_evening || '18:00'}
                          </Badge>
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'videos' && (
            <Card className="glass-panel">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="font-heading text-lg">Video Library</CardTitle>
                    <CardDescription className="text-xs">{filteredShorts.length} videos in current filter</CardDescription>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search title or ID..."
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        className="h-8 w-full pl-8 text-xs sm:w-56"
                      />
                    </div>

                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-8 w-full text-xs sm:w-32">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Downloaded">Downloaded</SelectItem>
                        <SelectItem value="Uploading">Uploading</SelectItem>
                        <SelectItem value="Uploaded">Uploaded</SelectItem>
                        <SelectItem value="Failed">Failed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <ScrollArea className="h-[460px] pr-2">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-16 text-[11px] uppercase tracking-[0.12em]">Thumb</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-[0.12em]">Title</TableHead>
                        <TableHead className="w-16 text-[11px] uppercase tracking-[0.12em]">Time</TableHead>
                        <TableHead className="w-24 text-[11px] uppercase tracking-[0.12em]">Status</TableHead>
                        <TableHead className="w-24 text-right text-[11px] uppercase tracking-[0.12em]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {initialLoad && filteredShorts.length === 0 ? (
                        Array.from({ length: 5 }).map((_, index) => (
                          <TableRow key={`video-skeleton-${index}`}>
                            <TableCell>
                              <div className="skeleton h-8 w-12" />
                            </TableCell>
                            <TableCell>
                              <div className="skeleton mb-1 h-3 w-44" />
                              <div className="skeleton h-2.5 w-24" />
                            </TableCell>
                            <TableCell>
                              <div className="skeleton h-3 w-10" />
                            </TableCell>
                            <TableCell>
                              <div className="skeleton h-5 w-16" />
                            </TableCell>
                            <TableCell>
                              <div className="ml-auto flex w-fit gap-1">
                                <div className="skeleton h-7 w-7" />
                                <div className="skeleton h-7 w-7" />
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : filteredShorts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                            <Video className="mx-auto mb-2 h-7 w-7 opacity-40" />
                            <p className="text-sm">No videos found</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredShorts.map((short) => {
                          const rowBusy =
                            activeShortId === short.id && (actionLoad.processShort || actionLoad.deleteShort || actionLoad.uploadNext);
                          const sourceName =
                            (short.source_channel
                              ? sourceChannelById.get(short.source_channel)?.channel_title ||
                                sourceChannelByUrl.get(short.source_channel)?.channel_title
                              : null) ||
                            short.source_channel ||
                            'Unmapped Source';
                          const destinationName =
                            (short.target_channel ? destinationChannelById.get(short.target_channel)?.channel_title : null) ||
                            short.target_channel ||
                            'Unmapped Destination';

                          return (
                            <TableRow key={short.id} className="group">
                              <TableCell>
                                <img
                                  src={short.thumbnail_url || '/placeholder.png'}
                                  alt={short.title}
                                  className="h-8 w-12 rounded object-cover"
                                />
                              </TableCell>
                              <TableCell>
                                <p className="max-w-[320px] truncate text-sm font-medium">{short.title}</p>
                                <p className="text-[10px] font-mono text-muted-foreground">{short.video_id}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {sourceName} → {destinationName}
                                </p>
                              </TableCell>
                              <TableCell>
                                <span className="text-xs text-muted-foreground">{short.duration}s</span>
                              </TableCell>
                              <TableCell>{statusBadge(short.status)}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                    onClick={() => {
                                      setSelectedShort(short);
                                      setShowDetails(true);
                                    }}
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>

                                  {short.status === 'Pending' && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0 text-primary"
                                      onClick={() => {
                                        void processShort(short.id);
                                      }}
                                      disabled={rowBusy}
                                    >
                                      {rowBusy && actionLoad.processShort ? (
                                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Upload className="h-3.5 w-3.5" />
                                      )}
                                    </Button>
                                  )}

                                  {short.target_video_id && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0 text-blue-400"
                                      onClick={() => window.open(`https://youtube.com/watch?v=${short.target_video_id}`, '_blank')}
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </Button>
                                  )}

                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-red-400"
                                    onClick={() => {
                                      void deleteShort(short.id);
                                    }}
                                    disabled={rowBusy}
                                  >
                                    {rowBusy && actionLoad.deleteShort ? (
                                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {activeTab === 'config' && (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="glass-panel">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-heading text-base flex items-center gap-2">
                      <Youtube className="h-4 w-4 text-red-400" />
                      YouTube Credentials
                    </CardTitle>
                    <CardDescription className="text-xs">Credentials used for fetching and uploads.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label className="text-xs">API Key</Label>
                      <Input
                        type="password"
                        placeholder="AIza..."
                        value={config.youtube_api_key || ''}
                        onChange={(event) => setConfig({ ...config, youtube_api_key: event.target.value })}
                        className="mt-1 h-9 text-xs"
                      />
                    </div>

                    <div>
                      <Label className="text-xs">OAuth Client ID</Label>
                      <Input
                        placeholder="xxx.apps.googleusercontent.com"
                        value={config.youtube_client_id || ''}
                        onChange={(event) => setConfig({ ...config, youtube_client_id: event.target.value })}
                        className="mt-1 h-9 text-xs"
                      />
                    </div>

                    <div>
                      <Label className="text-xs">OAuth Redirect URI</Label>
                      <Input
                        placeholder="http://210.79.129.69.nip.io:3000/api/youtube/oauth/callback"
                        value={config.youtube_redirect_uri || ''}
                        onChange={(event) => setConfig({ ...config, youtube_redirect_uri: event.target.value })}
                        className="mt-1 h-9 text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">Client Secret</Label>
                        <Input
                          type="password"
                          placeholder="GOCSPX-..."
                          value={config.youtube_client_secret || ''}
                          onChange={(event) => setConfig({ ...config, youtube_client_secret: event.target.value })}
                          className="mt-1 h-9 text-xs"
                        />
                      </div>

                      <div>
                        <Label className="text-xs">Refresh Token</Label>
                        <Input
                          type="password"
                          placeholder="1//..."
                          value={config.youtube_refresh_token || ''}
                          onChange={(event) => setConfig({ ...config, youtube_refresh_token: event.target.value })}
                          className="mt-1 h-9 text-xs"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-panel">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-heading text-base flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      Global Runtime
                    </CardTitle>
                    <CardDescription className="text-xs">Controls that affect all mappings and scheduler behavior.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">Default Visibility</Label>
                        <Select
                          value={config.default_visibility || 'public'}
                          onValueChange={(value) => setConfig({ ...config, default_visibility: value })}
                        >
                          <SelectTrigger className="mt-1 h-9 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="public">Public</SelectItem>
                            <SelectItem value="unlisted">Unlisted</SelectItem>
                            <SelectItem value="private">Private</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-xs">Max Retries</Label>
                        <Select
                          value={config.max_retry_count || '3'}
                          onValueChange={(value) => setConfig({ ...config, max_retry_count: value })}
                        >
                          <SelectTrigger className="mt-1 h-9 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 5].map((value) => (
                              <SelectItem key={value} value={value.toString()}>
                                {value}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                      <p className="text-xs font-medium">AI Content Engine (Gemini)</p>
                      <p className="mb-2 text-[10px] text-muted-foreground">
                        Used when AI Enhancement is enabled for title, description, tags, and hashtags.
                      </p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <Label className="text-xs">Gemini API Key</Label>
                          <Input
                            type="password"
                            placeholder="AIza..."
                            value={config.gemini_api_key || ''}
                            onChange={(event) =>
                              setConfig({
                                ...config,
                                gemini_api_key: event.target.value,
                              })
                            }
                            className="mt-1 h-9 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Gemini Model</Label>
                          <Select
                            value={config.gemini_model || 'gemini-2.5-flash'}
                            onValueChange={(value) =>
                              setConfig({
                                ...config,
                                gemini_model: value,
                              })
                            }
                          >
                            <SelectTrigger className="mt-1 h-9 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="gemini-2.5-flash">gemini-2.5-flash</SelectItem>
                              <SelectItem value="gemini-2.5-flash-lite">gemini-2.5-flash-lite</SelectItem>
                              <SelectItem value="gemini-2.0-flash">gemini-2.0-flash</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <div>
                        <Label className="text-xs">Uploads/Day</Label>
                        <Select
                          value={config.uploads_per_day || '2'}
                          onValueChange={(value) => setConfig({ ...config, uploads_per_day: value })}
                        >
                          <SelectTrigger className="mt-1 h-9 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5, 6, 8, 10].map((value) => (
                              <SelectItem key={value} value={value.toString()}>
                                {value}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-xs">Morning Time (UTC)</Label>
                        <Input
                          type="time"
                          value={config.upload_time_morning || '09:00'}
                          onChange={(event) =>
                            setConfig({
                              ...config,
                              upload_time_morning: event.target.value,
                            })
                          }
                          className="mt-1 h-9 text-xs"
                        />
                      </div>

                      <div>
                        <Label className="text-xs">Evening Time (UTC)</Label>
                        <Input
                          type="time"
                          value={config.upload_time_evening || '18:00'}
                          onChange={(event) =>
                            setConfig({
                              ...config,
                              upload_time_evening: event.target.value,
                            })
                          }
                          className="mt-1 h-9 text-xs"
                        />
                      </div>

                      <div>
                        <Label className="text-xs">Scheduler Timezone</Label>
                        <Select
                          value={config.scheduler_timezone || 'UTC'}
                          onValueChange={(value) =>
                            setConfig({
                              ...config,
                              scheduler_timezone: value,
                            })
                          }
                        >
                          <SelectTrigger className="mt-1 h-9 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="UTC">UTC</SelectItem>
                            <SelectItem value="Asia/Kolkata">Asia/Kolkata (IST)</SelectItem>
                            <SelectItem value="Asia/Dubai">Asia/Dubai (GST)</SelectItem>
                            <SelectItem value="Europe/London">Europe/London</SelectItem>
                            <SelectItem value="America/New_York">America/New_York (ET)</SelectItem>
                            <SelectItem value="America/Los_Angeles">America/Los_Angeles (PT)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-xs">Auto Publish Delay</Label>
                        <Select
                          value={config.unlisted_publish_delay_hours || '0'}
                          onValueChange={(value) =>
                            setConfig({
                              ...config,
                              unlisted_publish_delay_hours: value,
                            })
                          }
                        >
                          <SelectTrigger className="mt-1 h-9 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">Off</SelectItem>
                            <SelectItem value="1">1 hour</SelectItem>
                            <SelectItem value="2">2 hours</SelectItem>
                            <SelectItem value="3">3 hours</SelectItem>
                            <SelectItem value="6">6 hours</SelectItem>
                            <SelectItem value="12">12 hours</SelectItem>
                            <SelectItem value="24">24 hours</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Automation scheduler runs with selected timezone. Auto publish delay applies only to unlisted/private uploads.
                    </p>

                    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/25 px-3 py-3">
                      <div>
                        <Label className="text-sm font-medium">Enable Automation</Label>
                        <p className="text-xs text-muted-foreground">Run scheduler without manual triggers.</p>
                      </div>
                      <Switch
                        checked={config.automation_enabled === 'true'}
                        onCheckedChange={(checked) =>
                          setConfig({
                            ...config,
                            automation_enabled: checked ? 'true' : 'false',
                          })
                        }
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Button
                onClick={() => {
                  void saveConfig();
                }}
                disabled={actionLoad.saveConfig}
                className="w-full accent-gradient text-white"
              >
                {actionLoad.saveConfig ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Configuration
              </Button>
            </div>
          )}

          {activeTab === 'logs' && (
            <Card className="glass-panel">
              <CardHeader className="pb-3">
                <CardTitle className="font-heading text-lg">Activity Timeline</CardTitle>
                <CardDescription className="text-xs">Ordered events from fetch, upload, and scheduler operations.</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px] pr-2">
                  {logs.length === 0 ? (
                    <div className="py-14 text-center text-muted-foreground">
                      <AlertCircle className="mx-auto mb-2 h-8 w-8 opacity-40" />
                      <p className="text-sm">No logs available</p>
                    </div>
                  ) : (
                    <div>
                      {logs.map((log) => (
                        <div key={log.id} className="timeline-item py-3">
                          <div className={`timeline-dot ${log.status === 'success' ? 'success' : 'error'}`} />
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">{log.action}</span>
                              <Badge
                                variant={log.status === 'success' ? 'default' : 'destructive'}
                                className="h-5 text-[10px]"
                              >
                                {log.status}
                              </Badge>
                            </div>
                            {log.message && <p className="text-xs text-muted-foreground">{log.message}</p>}
                            <p className="text-[10px] text-muted-foreground">{new Date(log.created_at).toLocaleString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </main>
      </div>

      <Dialog
        open={showSourceDialog}
        onOpenChange={(open) => {
          setShowSourceDialog(open);
          if (!open) {
            setEditingSource(null);
            setNewSource(DEFAULT_SOURCE_FORM);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">{editingSource ? 'Edit Source Channel' : 'Add Source Channel'}</DialogTitle>
            <DialogDescription>Store source channel separately, then map it in the mappings section.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-xs">Source Channel Title</Label>
              <Input
                placeholder="My Source Channel"
                value={newSource.channel_title}
                onChange={(event) => setNewSource({ ...newSource, channel_title: event.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label className="text-xs">Source Channel URL *</Label>
              <Input
                placeholder="https://youtube.com/@channelname"
                value={newSource.channel_url}
                onChange={(event) => setNewSource({ ...newSource, channel_url: event.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label className="text-xs">Source Channel ID (optional)</Label>
              <Input
                placeholder="UC... or @handle"
                value={newSource.channel_id}
                onChange={(event) => setNewSource({ ...newSource, channel_id: event.target.value })}
                className="mt-1.5"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/25 px-3 py-3">
              <div>
                <Label className="text-xs font-medium">Source Active</Label>
                <p className="text-[10px] text-muted-foreground">Inactive sources are hidden from active mapping workflows.</p>
              </div>
              <Switch
                checked={newSource.is_active}
                onCheckedChange={(checked) =>
                  setNewSource({
                    ...newSource,
                    is_active: checked,
                  })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSourceDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                void saveSourceChannel();
              }}
              disabled={actionLoad.saveSource}
              className="accent-gradient text-white"
            >
              {actionLoad.saveSource ? <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {editingSource ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMappingDialog} onOpenChange={setShowMappingDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">{editingMapping ? 'Edit Mapping' : 'New Channel Mapping'}</DialogTitle>
            <DialogDescription>Link a source channel to a destination channel.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-xs">Mapping Name *</Label>
              <Input
                placeholder="My Channel Pair"
                value={newMapping.name}
                onChange={(event) => setNewMapping({ ...newMapping, name: event.target.value })}
                className="mt-1.5"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">Source Channel *</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowMappingDialog(false);
                    setActiveTab('sources');
                  }}
                >
                  Manage Sources
                </Button>
              </div>

              <Select
                value={newMapping.source_channel_id || '__none__'}
                onValueChange={(value) => {
                  const selected = sourceChannels.find((channel) => channel.channel_id === value);
                  setNewMapping({
                    ...newMapping,
                    source_channel_id: value === '__none__' ? '' : value,
                    source_channel_url: value === '__none__' ? '' : selected?.channel_url || '',
                  });
                }}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select source channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select source</SelectItem>
                  {sourceChannels.map((channel) => (
                    <SelectItem key={channel.channel_id} value={channel.channel_id}>
                      {channel.channel_title} ({channel.channel_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {newMapping.source_channel_id && (
                <p className="mt-1 truncate text-[10px] font-mono text-muted-foreground">
                  {sourceChannels.find((channel) => channel.channel_id === newMapping.source_channel_id)?.channel_url || ''}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">Target Channel ID *</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={connectDestinationChannel}
                  disabled={connectLoad}
                >
                  {connectLoad ? (
                    <>
                      <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Youtube className="mr-1 h-3.5 w-3.5" />
                      Connect
                    </>
                  )}
                </Button>
              </div>

              {destinationChannels.length > 0 && (
                <Select
                  value={newMapping.target_channel_id || '__none__'}
                  onValueChange={(value) =>
                    setNewMapping({
                      ...newMapping,
                      target_channel_id: value === '__none__' ? '' : value,
                    })
                  }
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Select destination channel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select channel</SelectItem>
                    {destinationChannels.map((channel) => (
                      <SelectItem key={channel.channel_id} value={channel.channel_id}>
                        {channel.channel_title} ({channel.channel_id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <p className="mt-1 text-[10px] text-muted-foreground">Use Connect to load your destination channels.</p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Uploads/Day</Label>
                <Select
                  value={newMapping.uploads_per_day.toString()}
                  onValueChange={(value) =>
                    setNewMapping({
                      ...newMapping,
                      uploads_per_day: parseInt(value, 10),
                    })
                  }
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 8, 10].map((value) => (
                      <SelectItem key={value} value={value.toString()}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Morning Slot</Label>
                <Input
                  type="time"
                  value={newMapping.upload_time_morning}
                  onChange={(event) =>
                    setNewMapping({
                      ...newMapping,
                      upload_time_morning: event.target.value,
                    })
                  }
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label className="text-xs">Evening Slot</Label>
                <Input
                  type="time"
                  value={newMapping.upload_time_evening}
                  onChange={(event) =>
                    setNewMapping({
                      ...newMapping,
                      upload_time_evening: event.target.value,
                    })
                  }
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label className="text-xs">Visibility</Label>
                <Select
                  value={newMapping.default_visibility}
                  onValueChange={(value) => setNewMapping({ ...newMapping, default_visibility: value })}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="unlisted">Unlisted</SelectItem>
                    <SelectItem value="private">Private</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              These mapping slots run in the Scheduler Timezone set under Configuration.
            </p>

            <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/25 px-3 py-3">
              <div>
                <Label className="text-xs font-medium">AI Enhancement</Label>
                <p className="text-[10px] text-muted-foreground">Optimize titles and hashtag metadata.</p>
              </div>
              <Switch
                checked={newMapping.ai_enhancement_enabled}
                onCheckedChange={(checked) =>
                  setNewMapping({
                    ...newMapping,
                    ai_enhancement_enabled: checked,
                  })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMappingDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                void saveMapping();
              }}
              disabled={actionLoad.saveMapping || sourceChannels.length === 0 || destinationChannels.length === 0}
              className="accent-gradient text-white"
            >
              {actionLoad.saveMapping ? <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {editingMapping ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading">Video Details</DialogTitle>
          </DialogHeader>

          {selectedShort && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <img
                  src={selectedShort.thumbnail_url || '/placeholder.png'}
                  alt={selectedShort.title}
                  className="h-20 w-full rounded-lg object-cover sm:h-16 sm:w-28"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium">{selectedShort.title}</h3>
                  <p className="text-[10px] font-mono text-muted-foreground">{selectedShort.video_id}</p>
                  <div className="mt-1.5">{statusBadge(selectedShort.status)}</div>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md border border-border/70 bg-muted/25 p-2.5">
                  <p className="text-[10px] text-muted-foreground">Duration</p>
                  <p className="text-xs font-medium">{selectedShort.duration}s</p>
                </div>
                <div className="rounded-md border border-border/70 bg-muted/25 p-2.5">
                  <p className="text-[10px] text-muted-foreground">Retries</p>
                  <p className="text-xs font-medium">{selectedShort.retry_count}</p>
                </div>
                <div className="rounded-md border border-border/70 bg-muted/25 p-2.5">
                  <p className="text-[10px] text-muted-foreground">Created</p>
                  <p className="text-[10px] font-medium">{fmtDate(selectedShort.created_at)}</p>
                </div>
                <div className="rounded-md border border-border/70 bg-muted/25 p-2.5">
                  <p className="text-[10px] text-muted-foreground">Uploaded</p>
                  <p className="text-[10px] font-medium">{fmtDate(selectedShort.uploaded_date)}</p>
                </div>
              </div>

              {selectedShort.error_log && (
                <>
                  <Separator />
                  <div>
                    <Label className="text-xs text-red-400">Error</Label>
                    <p className="mt-1 rounded-md border border-red-400/25 bg-red-500/10 p-2 text-xs text-red-300">
                      {selectedShort.error_log}
                    </p>
                  </div>
                </>
              )}

              {selectedShort.target_video_id && (
                <Button
                  className="w-full accent-gradient text-white"
                  onClick={() => window.open(`https://youtube.com/watch?v=${selectedShort.target_video_id}`, '_blank')}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View on YouTube
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
