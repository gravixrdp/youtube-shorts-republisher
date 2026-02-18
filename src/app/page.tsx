'use client';

import { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ThemeToggle } from '@/components/theme-toggle';
import { 
  Play, 
  RefreshCw, 
  Download, 
  Upload, 
  Settings, 
  Database,
  Youtube,
  Trash2,
  Eye,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Activity,
  TrendingUp,
  Calendar,
  Zap,
  ExternalLink,
  Save,
  Search,
  Sparkles,
  Video,
  Timer,
  Moon,
  Sun,
  Plus,
  Link2,
  ArrowRight,
  Edit,
  Power,
  Globe
} from 'lucide-react';

// Types
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
  short_id: string;
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
  upload_time_morning: string;
  upload_time_evening: string;
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

export default function GRAVIX() {
  const { toast } = useToast();
  
  // State
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, uploaded: 0, failed: 0, uploadedToday: 0, activeMappings: 0 });
  const [shorts, setShorts] = useState<Short[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [config, setConfig] = useState<Config>({});
  const [schedulerState, setSchedulerState] = useState<SchedulerState | null>(null);
  const [channelMappings, setChannelMappings] = useState<ChannelMapping[]>([]);
  
  // Form state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Dialog state
  const [selectedShort, setSelectedShort] = useState<Short | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showMappingDialog, setShowMappingDialog] = useState(false);
  const [editingMapping, setEditingMapping] = useState<ChannelMapping | null>(null);
  
  // New mapping form
  const [newMapping, setNewMapping] = useState({
    name: '',
    source_channel_url: '',
    target_channel_id: '',
    uploads_per_day: 2,
    default_visibility: 'public',
    ai_enhancement_enabled: false
  });
  
  // Fetch data
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
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
      const res = await fetch(`/api/videos?limit=100`);
      const data = await res.json();
      if (data.success) {
        setShorts(data.shorts);
      }
    } catch (error) {
      console.error('Failed to fetch shorts:', error);
    }
  }, []);
  
  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data.success) {
        setConfig(data.config || {});
      }
    } catch (error) {
      console.error('Failed to fetch config:', error);
    }
  }, []);
  
  const fetchMappings = useCallback(async () => {
    try {
      const res = await fetch('/api/mappings');
      const data = await res.json();
      if (data.success) {
        setChannelMappings(data.mappings || []);
      }
    } catch (error) {
      console.error('Failed to fetch mappings:', error);
    }
  }, []);
  
  useEffect(() => {
    let mounted = true;
    
    const loadInitialData = async () => {
      if (!mounted) return;
      await Promise.all([
        fetchStats(),
        fetchShorts(),
        fetchConfig(),
        fetchMappings()
      ]);
    };
    
    loadInitialData();
    
    const interval = setInterval(() => {
      if (mounted) fetchStats();
    }, 30000);
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [fetchStats, fetchShorts, fetchConfig, fetchMappings]);
  
  // Actions
  const fetchFromAllMappings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fetch-all' })
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast({ title: 'Success', description: data.message });
        fetchShorts();
        fetchStats();
        fetchMappings();
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to fetch shorts', variant: 'destructive' });
    }
    setLoading(false);
  };
  
  const fetchFromMapping = async (mappingId: string, channelUrl: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fetch', channelUrl, mappingId })
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast({ title: 'Success', description: data.message });
        fetchShorts();
        fetchStats();
        fetchMappings();
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to fetch shorts', variant: 'destructive' });
    }
    setLoading(false);
  };
  
  const processShort = async (shortId: string) => {
    if (!shortId) return;
    setLoading(true);
    try {
      const res = await fetch('/api/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'process', shortId })
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast({ title: 'Success', description: 'Video uploaded successfully!' });
        fetchShorts();
        fetchStats();
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to process video', variant: 'destructive' });
    }
    setLoading(false);
  };
  
  const deleteShort = async (id: string) => {
    if (!confirm('Are you sure you want to delete this video?')) return;
    
    try {
      const res = await fetch(`/api/videos?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      
      if (data.success) {
        toast({ title: 'Deleted', description: 'Video removed successfully' });
        fetchShorts();
        fetchStats();
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
    }
  };
  
  const saveConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast({ title: 'Saved', description: 'Configuration saved successfully' });
      } else {
        toast({ title: 'Error', description: 'Failed to save config', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save config', variant: 'destructive' });
    }
    setLoading(false);
  };
  
  const saveMapping = async () => {
    if (!newMapping.name || !newMapping.source_channel_url || !newMapping.target_channel_id) {
      toast({ title: 'Error', description: 'Please fill all required fields', variant: 'destructive' });
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch('/api/mappings', {
        method: editingMapping ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingMapping ? { id: editingMapping.id, ...newMapping } : newMapping)
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast({ title: 'Success', description: editingMapping ? 'Mapping updated' : 'Mapping created' });
        fetchMappings();
        setShowMappingDialog(false);
        setEditingMapping(null);
        setNewMapping({
          name: '',
          source_channel_url: '',
          target_channel_id: '',
          uploads_per_day: 2,
          default_visibility: 'public',
          ai_enhancement_enabled: false
        });
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save mapping', variant: 'destructive' });
    }
    setLoading(false);
  };
  
  const deleteMapping = async (id: string) => {
    if (!confirm('Delete this channel mapping?')) return;
    
    try {
      const res = await fetch(`/api/mappings?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      
      if (data.success) {
        toast({ title: 'Deleted', description: 'Mapping removed' });
        fetchMappings();
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
    }
  };
  
  const toggleMapping = async (id: string, isActive: boolean) => {
    try {
      const res = await fetch('/api/mappings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: isActive })
      });
      
      if ((await res.json()).success) {
        fetchMappings();
      }
    } catch (error) {
      console.error('Failed to toggle mapping:', error);
    }
  };
  
  const triggerScheduler = async () => {
    try {
      const res = await fetch('/api/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run' })
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast({ title: 'Started', description: 'Scheduler run initiated' });
        fetchStats();
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to trigger scheduler', variant: 'destructive' });
    }
  };
  
  // Filter shorts
  const filteredShorts = shorts.filter(short => {
    const matchesSearch = short.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          short.video_id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || short.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  
  // Status badge
  const getStatusBadge = (status: string) => {
    const styles: Record<string, { className: string; icon: React.ReactNode }> = {
      Pending: { className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', icon: <Clock className="w-3 h-3 mr-1.5" /> },
      Downloaded: { className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', icon: <Download className="w-3 h-3 mr-1.5" /> },
      Uploading: { className: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20', icon: <Upload className="w-3 h-3 mr-1.5" /> },
      Uploaded: { className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', icon: <CheckCircle2 className="w-3 h-3 mr-1.5" /> },
      Failed: { className: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20', icon: <XCircle className="w-3 h-3 mr-1.5" /> }
    };
    const style = styles[status] || styles.Pending;
    return (
      <Badge variant="outline" className={`font-medium ${style.className}`}>
        {style.icon}
        {status}
      </Badge>
    );
  };
  
  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleString();
  };
  
  const openMappingDialog = (mapping?: ChannelMapping) => {
    if (mapping) {
      setEditingMapping(mapping);
      setNewMapping({
        name: mapping.name,
        source_channel_url: mapping.source_channel_url,
        target_channel_id: mapping.target_channel_id,
        uploads_per_day: mapping.uploads_per_day,
        default_visibility: mapping.default_visibility,
        ai_enhancement_enabled: mapping.ai_enhancement_enabled
      });
    } else {
      setEditingMapping(null);
      setNewMapping({
        name: '',
        source_channel_url: '',
        target_channel_id: '',
        uploads_per_day: 2,
        default_visibility: 'public',
        ai_enhancement_enabled: false
      });
    }
    setShowMappingDialog(true);
  };
  
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Premium Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg gradient-bg shadow-md shadow-primary/20">
                <Globe className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">
                  <span className="gradient-text font-extrabold">GRAVIX</span>
                </h1>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full bg-muted/50 text-xs">
                <span className="text-muted-foreground">{stats.pending} pending</span>
                <Separator orientation="vertical" className="h-4" />
                <span className="text-muted-foreground">{stats.uploadedToday} today</span>
              </div>
              
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => { fetchStats(); fetchShorts(); fetchMappings(); }}
                className="h-8 w-8 p-0"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
              
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted/50 p-1 rounded-lg mb-6">
            <TabsTrigger value="dashboard" className="rounded-md text-xs sm:text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="mappings" className="rounded-md text-xs sm:text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1.5">
              <Link2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Mappings</span>
            </TabsTrigger>
            <TabsTrigger value="videos" className="rounded-md text-xs sm:text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1.5">
              <Video className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Videos</span>
            </TabsTrigger>
            <TabsTrigger value="config" className="rounded-md text-xs sm:text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1.5">
              <Settings className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Config</span>
            </TabsTrigger>
            <TabsTrigger value="logs" className="rounded-md text-xs sm:text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1.5">
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logs</span>
            </TabsTrigger>
          </TabsList>
          
          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
              <Card className="overflow-hidden">
                <CardContent className="p-4">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total</p>
                  <p className="text-2xl font-bold mt-1">{stats.total}</p>
                </CardContent>
              </Card>
              
              <Card className="overflow-hidden">
                <CardContent className="p-4">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Pending</p>
                  <p className="text-2xl font-bold mt-1 text-amber-500">{stats.pending}</p>
                </CardContent>
              </Card>
              
              <Card className="overflow-hidden">
                <CardContent className="p-4">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Uploaded</p>
                  <p className="text-2xl font-bold mt-1 text-emerald-500">{stats.uploaded}</p>
                </CardContent>
              </Card>
              
              <Card className="overflow-hidden">
                <CardContent className="p-4">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Failed</p>
                  <p className="text-2xl font-bold mt-1 text-red-500">{stats.failed}</p>
                </CardContent>
              </Card>
              
              <Card className="overflow-hidden">
                <CardContent className="p-4">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Today</p>
                  <p className="text-2xl font-bold mt-1 text-primary">{stats.uploadedToday}</p>
                </CardContent>
              </Card>
              
              <Card className="overflow-hidden">
                <CardContent className="p-4">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Mappings</p>
                  <p className="text-2xl font-bold mt-1 text-violet-500">{stats.activeMappings}</p>
                </CardContent>
              </Card>
            </div>
            
            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button onClick={fetchFromAllMappings} disabled={loading} className="gradient-bg text-white">
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                  Fetch All Channels
                </Button>
                <Button variant="outline" onClick={triggerScheduler}>
                  <Play className="w-4 h-4 mr-2 text-emerald-500" />
                  Run Scheduler
                </Button>
                <Button variant="outline" onClick={() => processShort(shorts.find(s => s.status === 'Pending')?.id || '')}>
                  <Upload className="w-4 h-4 mr-2 text-blue-500" />
                  Upload Next
                </Button>
                <Button variant="outline" onClick={() => setActiveTab('mappings')}>
                  <Link2 className="w-4 h-4 mr-2" />
                  Manage Mappings
                </Button>
              </CardContent>
            </Card>
            
            {/* Channel Mappings Overview */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Active Mappings</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => openMappingDialog()}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {channelMappings.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Link2 className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No channel mappings yet</p>
                    <Button size="sm" variant="outline" className="mt-3" onClick={() => openMappingDialog()}>
                      Create First Mapping
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {channelMappings.slice(0, 5).map((mapping) => (
                      <div key={mapping.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Youtube className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{mapping.name}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <span className="truncate max-w-[120px]">{mapping.source_channel_url}</span>
                            <ArrowRight className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate max-w-[80px]">{mapping.target_channel_id}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={mapping.is_active ? 'default' : 'secondary'} className="text-xs">
                            {mapping.is_active ? 'Active' : 'Paused'}
                          </Badge>
                          <Button size="sm" variant="ghost" onClick={() => fetchFromMapping(mapping.id, mapping.source_channel_url)}>
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {channelMappings.length > 5 && (
                      <Button variant="ghost" className="w-full text-sm" onClick={() => setActiveTab('mappings')}>
                        View all {channelMappings.length} mappings
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Recent Activity */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-48">
                  {logs.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No recent activity</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {logs.slice(0, 10).map((log) => (
                        <div key={log.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-sm">
                          {log.status === 'success' ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                          )}
                          <span className="font-medium">{log.action}</span>
                          {log.message && <span className="text-muted-foreground truncate">- {log.message}</span>}
                          <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
                            {new Date(log.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Mappings Tab */}
          <TabsContent value="mappings" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Channel Mappings</h2>
                <p className="text-sm text-muted-foreground">Link source channels to destination channels</p>
              </div>
              <Button onClick={() => openMappingDialog()} className="gradient-bg text-white">
                <Plus className="w-4 h-4 mr-2" />
                New Mapping
              </Button>
            </div>
            
            {channelMappings.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Link2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="font-medium mb-2">No channel mappings</h3>
                  <p className="text-sm text-muted-foreground mb-4">Create a mapping to link source and destination channels</p>
                  <Button onClick={() => openMappingDialog()} className="gradient-bg text-white">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Mapping
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {channelMappings.map((mapping) => (
                  <Card key={mapping.id} className={!mapping.is_active ? 'opacity-60' : ''}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{mapping.name}</CardTitle>
                        <div className="flex items-center gap-1">
                          <Switch 
                            checked={mapping.is_active} 
                            onCheckedChange={(checked) => toggleMapping(mapping.id, checked)}
                            className="scale-75"
                          />
                          <Button size="sm" variant="ghost" onClick={() => openMappingDialog(mapping)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteMapping(mapping.id)} className="text-red-500">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-6 h-6 rounded bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                          <Download className="w-3 h-3 text-blue-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-muted-foreground">Source</p>
                          <p className="truncate font-mono text-xs">{mapping.source_channel_url}</p>
                        </div>
                      </div>
                      
                      <div className="flex justify-center">
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                      
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-6 h-6 rounded bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                          <Upload className="w-3 h-3 text-emerald-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-muted-foreground">Destination</p>
                          <p className="truncate font-mono text-xs">{mapping.target_channel_id}</p>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="pt-0 gap-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => fetchFromMapping(mapping.id, mapping.source_channel_url)}>
                        <Download className="w-3 h-3 mr-1" />
                        Fetch
                      </Button>
                      <div className="text-xs text-muted-foreground">
                        {mapping.uploads_per_day}/day
                      </div>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
          
          {/* Videos Tab */}
          <TabsContent value="videos" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Video Library</CardTitle>
                    <CardDescription className="text-sm">{filteredShorts.length} videos</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8 w-40 h-8"
                      />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-28 h-8">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Uploaded">Uploaded</SelectItem>
                        <SelectItem value="Failed">Failed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-16">Thumb</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead className="w-16">Time</TableHead>
                        <TableHead className="w-24">Status</TableHead>
                        <TableHead className="w-20 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredShorts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8">
                            <Video className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                            <p className="text-sm text-muted-foreground">No videos found</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredShorts.map((short) => (
                          <TableRow key={short.id} className="group">
                            <TableCell>
                              <img 
                                src={short.thumbnail_url || '/placeholder.png'} 
                                alt={short.title}
                                className="w-12 h-8 object-cover rounded"
                              />
                            </TableCell>
                            <TableCell>
                              <p className="font-medium text-sm truncate max-w-[200px]">{short.title}</p>
                              <p className="text-xs text-muted-foreground font-mono">{short.video_id}</p>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-mono text-xs">{short.duration}s</Badge>
                            </TableCell>
                            <TableCell>{getStatusBadge(short.status)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setSelectedShort(short); setShowDetails(true); }}>
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                                {short.status === 'Pending' && (
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-primary" onClick={() => processShort(short.id)}>
                                    <Upload className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                {short.target_video_id && (
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-500" onClick={() => window.open(`https://youtube.com/watch?v=${short.target_video_id}`, '_blank')}>
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => deleteShort(short.id)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Configuration Tab */}
          <TabsContent value="config" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Youtube className="w-4 h-4 text-red-500" />
                    YouTube API
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-xs">API Key</Label>
                    <Input type="password" placeholder="AIza..." value={config.youtube_api_key || ''} onChange={(e) => setConfig({ ...config, youtube_api_key: e.target.value })} className="h-8 mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">OAuth Client ID</Label>
                    <Input placeholder="xxx.apps.googleusercontent.com" value={config.youtube_client_id || ''} onChange={(e) => setConfig({ ...config, youtube_client_id: e.target.value })} className="h-8 mt-1" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Client Secret</Label>
                      <Input type="password" placeholder="GOCSPX-..." value={config.youtube_client_secret || ''} onChange={(e) => setConfig({ ...config, youtube_client_secret: e.target.value })} className="h-8 mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs">Refresh Token</Label>
                      <Input type="password" placeholder="1//..." value={config.youtube_refresh_token || ''} onChange={(e) => setConfig({ ...config, youtube_refresh_token: e.target.value })} className="h-8 mt-1" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    Global Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Default Visibility</Label>
                      <Select value={config.default_visibility || 'public'} onValueChange={(v) => setConfig({ ...config, default_visibility: v })}>
                        <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="public">Public</SelectItem>
                          <SelectItem value="unlisted">Unlisted</SelectItem>
                          <SelectItem value="private">Private</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Max Retries</Label>
                      <Select value={config.max_retry_count || '3'} onValueChange={(v) => setConfig({ ...config, max_retry_count: v })}>
                        <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[1,2,3,5].map(n => <SelectItem key={n} value={n.toString()}>{n}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <Label className="text-sm font-medium">Enable Automation</Label>
                      <p className="text-xs text-muted-foreground">Run scheduler automatically</p>
                    </div>
                    <Switch checked={config.automation_enabled === 'true'} onCheckedChange={(c) => setConfig({ ...config, automation_enabled: c ? 'true' : 'false' })} />
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <Button onClick={saveConfig} disabled={loading} className="w-full gradient-bg text-white">
              {loading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Configuration
            </Button>
          </TabsContent>
          
          {/* Logs Tab */}
          <TabsContent value="logs" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Activity Logs</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  {logs.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">No logs available</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {logs.map((log) => (
                        <div key={log.id} className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
                          {log.status === 'success' ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{log.action}</span>
                              <Badge variant={log.status === 'success' ? 'default' : 'destructive'} className="text-xs">{log.status}</Badge>
                            </div>
                            {log.message && <p className="text-xs text-muted-foreground mt-1">{log.message}</p>}
                            <p className="text-xs text-muted-foreground mt-1">{new Date(log.created_at).toLocaleString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      
      {/* Footer */}
      <footer className="border-t py-4 bg-muted/30 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold gradient-text">GRAVIX</span>
            <span>YouTube Shorts Republisher v1.0</span>
          </div>
        </div>
      </footer>
      
      {/* Mapping Dialog */}
      <Dialog open={showMappingDialog} onOpenChange={setShowMappingDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingMapping ? 'Edit Mapping' : 'New Channel Mapping'}</DialogTitle>
            <DialogDescription>Link a source channel to a destination channel</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Mapping Name *</Label>
              <Input placeholder="My Channel Pair" value={newMapping.name} onChange={(e) => setNewMapping({ ...newMapping, name: e.target.value })} className="mt-1.5" />
            </div>
            
            <div>
              <Label>Source Channel URL *</Label>
              <Input placeholder="https://youtube.com/@channelname" value={newMapping.source_channel_url} onChange={(e) => setNewMapping({ ...newMapping, source_channel_url: e.target.value })} className="mt-1.5" />
              <p className="text-xs text-muted-foreground mt-1">The channel to fetch shorts from</p>
            </div>
            
            <div>
              <Label>Target Channel ID *</Label>
              <Input placeholder="UC..." value={newMapping.target_channel_id} onChange={(e) => setNewMapping({ ...newMapping, target_channel_id: e.target.value })} className="mt-1.5" />
              <p className="text-xs text-muted-foreground mt-1">Your channel ID to upload to</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Uploads/Day</Label>
                <Select value={newMapping.uploads_per_day.toString()} onValueChange={(v) => setNewMapping({ ...newMapping, uploads_per_day: parseInt(v) })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4,5,6,8,10].map(n => <SelectItem key={n} value={n.toString()}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Visibility</Label>
                <Select value={newMapping.default_visibility} onValueChange={(v) => setNewMapping({ ...newMapping, default_visibility: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="unlisted">Unlisted</SelectItem>
                    <SelectItem value="private">Private</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <Label className="font-medium">AI Enhancement</Label>
                <p className="text-xs text-muted-foreground">Optimize titles & hashtags</p>
              </div>
              <Switch checked={newMapping.ai_enhancement_enabled} onCheckedChange={(c) => setNewMapping({ ...newMapping, ai_enhancement_enabled: c })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMappingDialog(false)}>Cancel</Button>
            <Button onClick={saveMapping} disabled={loading} className="gradient-bg text-white">
              {editingMapping ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Video Details</DialogTitle>
          </DialogHeader>
          {selectedShort && (
            <div className="space-y-3">
              <div className="flex gap-3">
                <img src={selectedShort.thumbnail_url || '/placeholder.png'} alt={selectedShort.title} className="w-24 h-14 object-cover rounded-lg" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium truncate">{selectedShort.title}</h3>
                  <p className="text-xs text-muted-foreground font-mono">{selectedShort.video_id}</p>
                  {getStatusBadge(selectedShort.status)}
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2 rounded bg-muted/50"><p className="text-xs text-muted-foreground">Duration</p><p className="font-medium">{selectedShort.duration}s</p></div>
                <div className="p-2 rounded bg-muted/50"><p className="text-xs text-muted-foreground">Retries</p><p className="font-medium">{selectedShort.retry_count}</p></div>
                <div className="p-2 rounded bg-muted/50"><p className="text-xs text-muted-foreground">Created</p><p className="font-medium text-xs">{formatDate(selectedShort.created_at)}</p></div>
                <div className="p-2 rounded bg-muted/50"><p className="text-xs text-muted-foreground">Uploaded</p><p className="font-medium text-xs">{formatDate(selectedShort.uploaded_date)}</p></div>
              </div>
              {selectedShort.error_log && (
                <>
                  <Separator />
                  <div>
                    <Label className="text-red-500 text-xs">Error</Label>
                    <p className="text-xs p-2 rounded bg-red-500/10 text-red-600 mt-1">{selectedShort.error_log}</p>
                  </div>
                </>
              )}
              {selectedShort.target_video_id && (
                <Button className="w-full gradient-bg text-white" onClick={() => window.open(`https://youtube.com/watch?v=${selectedShort.target_video_id}`, '_blank')}>
                  <ExternalLink className="w-4 h-4 mr-2" />
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
