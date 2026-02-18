'use client';

import { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
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
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { 
  Play, 
  Pause, 
  RefreshCw, 
  Download, 
  Upload, 
  Settings, 
  Database,
  Youtube,
  Trash2,
  Eye,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Activity,
  TrendingUp,
  Calendar,
  Zap,
  ExternalLink,
  Copy,
  Save,
  Plus,
  Search,
  Filter
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
  scheduled_date: string | null;
  uploaded_date: string | null;
  target_video_id: string | null;
  retry_count: number;
  error_log: string | null;
  ai_title: string | null;
  ai_description: string | null;
  created_at: string;
}

interface Stats {
  total: number;
  pending: number;
  uploaded: number;
  failed: number;
  uploadedToday: number;
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

interface Config {
  [key: string]: string;
}

export default function YouTubeShortsRepublisher() {
  const { toast } = useToast();
  
  // State
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, uploaded: 0, failed: 0, uploadedToday: 0 });
  const [shorts, setShorts] = useState<Short[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [config, setConfig] = useState<Config>({});
  const [schedulerState, setSchedulerState] = useState<SchedulerState | null>(null);
  
  // Form state
  const [channelUrl, setChannelUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Dialog state
  const [selectedShort, setSelectedShort] = useState<Short | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  
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
  
  useEffect(() => {
    // Initial data fetch
    let mounted = true;
    
    const loadInitialData = async () => {
      if (!mounted) return;
      await Promise.all([
        fetchStats(),
        fetchShorts(),
        fetchConfig()
      ]);
    };
    
    loadInitialData();
    
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      if (mounted) fetchStats();
    }, 30000);
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [fetchStats, fetchShorts, fetchConfig]);
  
  // Actions
  const fetchShortsFromChannel = async () => {
    if (!channelUrl.trim()) {
      toast({ title: 'Error', description: 'Please enter a channel URL', variant: 'destructive' });
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fetch', channelUrl })
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast({ title: 'Success', description: data.message });
        fetchShorts();
        fetchStats();
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to fetch shorts', variant: 'destructive' });
    }
    setLoading(false);
  };
  
  const processShort = async (shortId: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'process', shortId })
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast({ 
          title: 'Success', 
          description: `Video uploaded: ${data.targetUrl}` 
        });
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
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to trigger scheduler', variant: 'destructive' });
    }
  };
  
  const toggleAutomation = async (enabled: boolean) => {
    setConfig({ ...config, automation_enabled: enabled ? 'true' : 'false' });
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
    const styles: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
      Pending: { variant: 'secondary', icon: <Clock className="w-3 h-3 mr-1" /> },
      Downloaded: { variant: 'default', icon: <Download className="w-3 h-3 mr-1" /> },
      Uploading: { variant: 'default', icon: <Upload className="w-3 h-3 mr-1" /> },
      Uploaded: { variant: 'default', icon: <CheckCircle className="w-3 h-3 mr-1" /> },
      Failed: { variant: 'destructive', icon: <XCircle className="w-3 h-3 mr-1" /> }
    };
    const style = styles[status] || styles.Pending;
    return (
      <Badge variant={style.variant} className="flex items-center">
        {style.icon}
        {status}
      </Badge>
    );
  };
  
  // Format date
  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleString();
  };
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Youtube className="w-8 h-8 text-red-500" />
              <div>
                <h1 className="text-2xl font-bold">YouTube Shorts Republisher</h1>
                <p className="text-sm text-muted-foreground">Automated shorts management with Supabase backend</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Automation</span>
                <Switch 
                  checked={config.automation_enabled === 'true'}
                  onCheckedChange={toggleAutomation}
                />
              </div>
              <Button variant="outline" onClick={() => { fetchStats(); fetchShorts(); fetchConfig(); }}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5 mb-6">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="videos" className="flex items-center gap-2">
              <Database className="w-4 h-4" />
              Videos
            </TabsTrigger>
            <TabsTrigger value="config" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Configuration
            </TabsTrigger>
            <TabsTrigger value="scheduler" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Scheduler
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Logs
            </TabsTrigger>
          </TabsList>
          
          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Videos</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{stats.total}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-yellow-500">{stats.pending}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Uploaded</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-500">{stats.uploaded}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Failed</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-red-500">{stats.failed}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Today</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-500">{stats.uploadedToday}</div>
                </CardContent>
              </Card>
            </div>
            
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-yellow-500" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <Label htmlFor="channel-url">Source Channel URL</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        id="channel-url"
                        placeholder="https://youtube.com/@channelname"
                        value={channelUrl}
                        onChange={(e) => setChannelUrl(e.target.value)}
                      />
                      <Button onClick={fetchShortsFromChannel} disabled={loading}>
                        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Fetch
                      </Button>
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={triggerScheduler}>
                    <Play className="w-4 h-4 mr-2" />
                    Run Scheduler Now
                  </Button>
                  <Button variant="outline" onClick={() => processShort(shorts.find(s => s.status === 'Pending')?.id || '')}>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Next Pending
                  </Button>
                  <Button variant="outline" onClick={() => setActiveTab('config')}>
                    <Settings className="w-4 h-4 mr-2" />
                    Configure Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64">
                  {logs.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No recent activity</p>
                  ) : (
                    <div className="space-y-2">
                      {logs.map((log) => (
                        <div key={log.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                          {log.status === 'success' ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500" />
                          )}
                          <div className="flex-1">
                            <p className="text-sm font-medium">{log.action}</p>
                            <p className="text-xs text-muted-foreground">{log.message}</p>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(log.created_at).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Videos Tab */}
          <TabsContent value="videos" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Video Library</CardTitle>
                  <div className="flex gap-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search videos..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8 w-64"
                      />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-40">
                        <Filter className="w-4 h-4 mr-2" />
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Uploaded">Uploaded</SelectItem>
                        <SelectItem value="Failed">Failed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Thumbnail</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Uploaded</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredShorts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            No videos found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredShorts.map((short) => (
                          <TableRow key={short.id}>
                            <TableCell>
                              <img 
                                src={short.thumbnail_url || '/placeholder.png'} 
                                alt={short.title}
                                className="w-16 h-12 object-cover rounded"
                              />
                            </TableCell>
                            <TableCell>
                              <div className="max-w-xs">
                                <p className="font-medium truncate">{short.title}</p>
                                <p className="text-xs text-muted-foreground">{short.video_id}</p>
                              </div>
                            </TableCell>
                            <TableCell>{short.duration}s</TableCell>
                            <TableCell>{getStatusBadge(short.status)}</TableCell>
                            <TableCell className="text-sm">{formatDate(short.uploaded_date)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  onClick={() => { setSelectedShort(short); setShowDetails(true); }}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                {short.status === 'Pending' && (
                                  <Button 
                                    size="sm" 
                                    variant="ghost"
                                    onClick={() => processShort(short.id)}
                                    disabled={loading}
                                  >
                                    <Upload className="w-4 h-4" />
                                  </Button>
                                )}
                                {short.target_video_id && (
                                  <Button 
                                    size="sm" 
                                    variant="ghost"
                                    onClick={() => window.open(`https://youtube.com/watch?v=${short.target_video_id}`, '_blank')}
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </Button>
                                )}
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  onClick={() => deleteShort(short.id)}
                                  className="text-red-500 hover:text-red-600"
                                >
                                  <Trash2 className="w-4 h-4" />
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
          <TabsContent value="config" className="space-y-6">
            <div className="grid gap-6">
              {/* YouTube API Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Youtube className="w-5 h-5 text-red-500" />
                    YouTube API Configuration
                  </CardTitle>
                  <CardDescription>
                    Configure YouTube Data API and OAuth credentials
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="youtube_api_key">YouTube API Key</Label>
                      <Input
                        id="youtube_api_key"
                        type="password"
                        placeholder="AIza..."
                        value={config.youtube_api_key || ''}
                        onChange={(e) => setConfig({ ...config, youtube_api_key: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="youtube_client_id">OAuth Client ID</Label>
                      <Input
                        id="youtube_client_id"
                        placeholder="xxx.apps.googleusercontent.com"
                        value={config.youtube_client_id || ''}
                        onChange={(e) => setConfig({ ...config, youtube_client_id: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="youtube_client_secret">OAuth Client Secret</Label>
                      <Input
                        id="youtube_client_secret"
                        type="password"
                        placeholder="GOCSPX-..."
                        value={config.youtube_client_secret || ''}
                        onChange={(e) => setConfig({ ...config, youtube_client_secret: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="youtube_refresh_token">Refresh Token</Label>
                      <Input
                        id="youtube_refresh_token"
                        type="password"
                        placeholder="1//..."
                        value={config.youtube_refresh_token || ''}
                        onChange={(e) => setConfig({ ...config, youtube_refresh_token: e.target.value })}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Channel Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    Channel Settings
                  </CardTitle>
                  <CardDescription>
                    Source and target channel configuration
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="source_channel_id">Source Channel URL/ID</Label>
                      <Input
                        id="source_channel_id"
                        placeholder="https://youtube.com/@channelname"
                        value={config.source_channel_id || ''}
                        onChange={(e) => setConfig({ ...config, source_channel_id: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="target_channel_id">Target Channel ID</Label>
                      <Input
                        id="target_channel_id"
                        placeholder="UC..."
                        value={config.target_channel_id || ''}
                        onChange={(e) => setConfig({ ...config, target_channel_id: e.target.value })}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Upload Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="w-5 h-5" />
                    Upload Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-4">
                    <div>
                      <Label htmlFor="uploads_per_day">Uploads Per Day</Label>
                      <Select 
                        value={config.uploads_per_day || '2'} 
                        onValueChange={(value) => setConfig({ ...config, uploads_per_day: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[1,2,3,4,5,6,8,10].map(n => (
                            <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="upload_time_morning">Morning Upload</Label>
                      <Input
                        id="upload_time_morning"
                        type="time"
                        value={config.upload_time_morning || '09:00'}
                        onChange={(e) => setConfig({ ...config, upload_time_morning: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="upload_time_evening">Evening Upload</Label>
                      <Input
                        id="upload_time_evening"
                        type="time"
                        value={config.upload_time_evening || '18:00'}
                        onChange={(e) => setConfig({ ...config, upload_time_evening: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="default_visibility">Visibility</Label>
                      <Select 
                        value={config.default_visibility || 'public'} 
                        onValueChange={(value) => setConfig({ ...config, default_visibility: value })}
                      >
                        <SelectTrigger>
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
                </CardContent>
              </Card>
              
              {/* AI Enhancement */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-yellow-500" />
                    AI Enhancement
                  </CardTitle>
                  <CardDescription>
                    Use AI to optimize titles, descriptions, and hashtags
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Enable AI Enhancement</Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically generate optimized titles, descriptions, and hashtags
                      </p>
                    </div>
                    <Switch 
                      checked={config.ai_enhancement_enabled === 'true'}
                      onCheckedChange={(checked) => setConfig({ ...config, ai_enhancement_enabled: checked ? 'true' : 'false' })}
                    />
                  </div>
                </CardContent>
              </Card>
              
              {/* Save Button */}
              <Button onClick={saveConfig} disabled={loading} className="w-full" size="lg">
                {loading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Configuration
              </Button>
            </div>
          </TabsContent>
          
          {/* Scheduler Tab */}
          <TabsContent value="scheduler" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Scheduler Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="p-4 rounded-lg bg-muted">
                    <p className="text-sm text-muted-foreground">Status</p>
                    <p className="text-lg font-semibold flex items-center gap-2">
                      {schedulerState?.is_running ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                          Running
                        </>
                      ) : (
                        <>
                          <span className="w-2 h-2 rounded-full bg-gray-400" />
                          Idle
                        </>
                      )}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted">
                    <p className="text-sm text-muted-foreground">Uploads Today</p>
                    <p className="text-lg font-semibold">
                      {schedulerState?.uploads_today || 0} / {config.uploads_per_day || 2}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted">
                    <p className="text-sm text-muted-foreground">Last Run</p>
                    <p className="text-lg font-semibold">
                      {schedulerState?.last_run_at ? formatDate(schedulerState.last_run_at) : 'Never'}
                    </p>
                  </div>
                </div>
                
                <Separator />
                
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Automation</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically upload scheduled videos
                    </p>
                  </div>
                  <Switch 
                    checked={config.automation_enabled === 'true'}
                    onCheckedChange={toggleAutomation}
                  />
                </div>
                
                <div className="flex gap-2">
                  <Button onClick={triggerScheduler} disabled={schedulerState?.is_running}>
                    <Play className="w-4 h-4 mr-2" />
                    Run Now
                  </Button>
                  <Button variant="outline" onClick={fetchStats}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh Status
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Schedule
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                    <Clock className="w-5 h-5 text-blue-500" />
                    <div>
                      <p className="font-medium">Morning Upload</p>
                      <p className="text-sm text-muted-foreground">
                        {config.upload_time_morning || '09:00'} UTC daily
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                    <Clock className="w-5 h-5 text-orange-500" />
                    <div>
                      <p className="font-medium">Evening Upload</p>
                      <p className="text-sm text-muted-foreground">
                        {config.upload_time_evening || '18:00'} UTC daily
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Logs Tab */}
          <TabsContent value="logs" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Activity Logs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  {logs.length === 0 ? (
                    <div className="text-center text-muted-foreground py-12">
                      <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No logs available</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {logs.map((log) => (
                        <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border">
                          {log.status === 'success' ? (
                            <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{log.action}</Badge>
                              <Badge variant={log.status === 'success' ? 'default' : 'destructive'}>
                                {log.status}
                              </Badge>
                            </div>
                            {log.message && (
                              <p className="text-sm mt-1 text-muted-foreground">{log.message}</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(log.created_at).toLocaleString()}
                            </p>
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
      
      {/* Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Video Details</DialogTitle>
          </DialogHeader>
          {selectedShort && (
            <div className="space-y-4">
              <div className="flex gap-4">
                <img 
                  src={selectedShort.thumbnail_url || '/placeholder.png'} 
                  alt={selectedShort.title}
                  className="w-32 h-20 object-cover rounded"
                />
                <div className="flex-1">
                  <h3 className="font-semibold">{selectedShort.title}</h3>
                  <p className="text-sm text-muted-foreground">{selectedShort.video_id}</p>
                  <div className="mt-2">{getStatusBadge(selectedShort.status)}</div>
                </div>
              </div>
              
              <Separator />
              
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duration:</span>
                  <span>{selectedShort.duration}s</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Retry Count:</span>
                  <span>{selectedShort.retry_count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created:</span>
                  <span>{formatDate(selectedShort.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Uploaded:</span>
                  <span>{formatDate(selectedShort.uploaded_date)}</span>
                </div>
              </div>
              
              {selectedShort.description && (
                <>
                  <Separator />
                  <div>
                    <Label>Description</Label>
                    <p className="text-sm text-muted-foreground mt-1">{selectedShort.description}</p>
                  </div>
                </>
              )}
              
              {selectedShort.ai_title && (
                <>
                  <Separator />
                  <div>
                    <Label>AI Enhanced Title</Label>
                    <p className="text-sm mt-1">{selectedShort.ai_title}</p>
                  </div>
                </>
              )}
              
              {selectedShort.error_log && (
                <>
                  <Separator />
                  <div>
                    <Label className="text-red-500">Error Log</Label>
                    <p className="text-sm text-red-500 mt-1">{selectedShort.error_log}</p>
                  </div>
                </>
              )}
              
              {selectedShort.target_video_id && (
                <Button 
                  className="w-full"
                  onClick={() => window.open(`https://youtube.com/watch?v=${selectedShort.target_video_id}`, '_blank')}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View on YouTube
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Footer */}
      <footer className="border-t mt-auto py-4 bg-card">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>YouTube Shorts Republisher v1.0</p>
            <p>Powered by Supabase</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
