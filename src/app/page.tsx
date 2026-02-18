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
import { ThemeToggle } from '@/components/theme-toggle';
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
  Filter,
  Sparkles,
  BarChart3,
  Users,
  Video,
  Timer,
  Moon,
  Sun,
  ChevronRight,
  Star,
  Shield,
  Rocket
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
        toast({ 
          title: 'Success', 
          description: `Video uploaded successfully!` 
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
  
  // Format date
  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleString();
  };
  
  return (
    <div className="min-h-screen bg-background">
      {/* Premium Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl gradient-bg shadow-lg shadow-primary/25">
                <Youtube className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">
                  <span className="gradient-text">Shorts</span> Republisher
                </h1>
                <p className="text-xs text-muted-foreground hidden sm:block">Automated YouTube Shorts Management</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Automation Toggle */}
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50">
                <span className="text-xs font-medium text-muted-foreground">Auto</span>
                <Switch 
                  checked={config.automation_enabled === 'true'}
                  onCheckedChange={toggleAutomation}
                  className="scale-75"
                />
              </div>
              
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => { fetchStats(); fetchShorts(); fetchConfig(); }}
                className="gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="container mx-auto px-6 lg:px-12 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <TabsList className="bg-muted/50 p-1 rounded-xl">
              <TabsTrigger value="dashboard" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2">
                <Activity className="w-4 h-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </TabsTrigger>
              <TabsTrigger value="videos" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2">
                <Video className="w-4 h-4" />
                <span className="hidden sm:inline">Videos</span>
              </TabsTrigger>
              <TabsTrigger value="config" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2">
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">Config</span>
              </TabsTrigger>
              <TabsTrigger value="scheduler" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2">
                <Clock className="w-4 h-4" />
                <span className="hidden sm:inline">Scheduler</span>
              </TabsTrigger>
              <TabsTrigger value="logs" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2">
                <Eye className="w-4 h-4" />
                <span className="hidden sm:inline">Logs</span>
              </TabsTrigger>
            </TabsList>
            
            {/* Quick Stats */}
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-muted-foreground">{stats.pending} pending</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">{stats.uploadedToday} today</span>
              </div>
            </div>
          </div>
          
          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-8">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <Card className="relative overflow-hidden card-hover">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total</p>
                      <p className="text-3xl font-bold mt-1">{stats.total}</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Database className="w-6 h-6 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="relative overflow-hidden card-hover">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pending</p>
                      <p className="text-3xl font-bold mt-1 text-amber-500">{stats.pending}</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                      <Timer className="w-6 h-6 text-amber-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="relative overflow-hidden card-hover">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Uploaded</p>
                      <p className="text-3xl font-bold mt-1 text-emerald-500">{stats.uploaded}</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="relative overflow-hidden card-hover">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Failed</p>
                      <p className="text-3xl font-bold mt-1 text-red-500">{stats.failed}</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center">
                      <XCircle className="w-6 h-6 text-red-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="relative overflow-hidden card-hover col-span-2 lg:col-span-1">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today</p>
                      <p className="text-3xl font-bold mt-1 text-primary">{stats.uploadedToday}</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* Quick Actions */}
            <Card className="gradient-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  Quick Actions
                </CardTitle>
                <CardDescription>Fetch shorts from a YouTube channel and manage uploads</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <Label htmlFor="channel-url" className="text-sm font-medium">Source Channel</Label>
                    <div className="flex gap-2 mt-2">
                      <Input
                        id="channel-url"
                        placeholder="https://youtube.com/@channelname"
                        value={channelUrl}
                        onChange={(e) => setChannelUrl(e.target.value)}
                        className="flex-1"
                      />
                      <Button onClick={fetchShortsFromChannel} disabled={loading} className="gradient-bg text-white shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all">
                        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                        <span className="hidden sm:inline">Fetch</span>
                      </Button>
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={triggerScheduler} className="gap-2">
                    <Play className="w-4 h-4 text-emerald-500" />
                    Run Scheduler
                  </Button>
                  <Button variant="outline" onClick={() => processShort(shorts.find(s => s.status === 'Pending')?.id || '')} className="gap-2">
                    <Upload className="w-4 h-4 text-blue-500" />
                    Upload Next
                  </Button>
                  <Button variant="outline" onClick={() => setActiveTab('config')} className="gap-2">
                    <Settings className="w-4 h-4" />
                    Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-72 scrollbar-thin">
                  {logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <AlertCircle className="w-12 h-12 mb-4 opacity-50" />
                      <p>No recent activity</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {logs.map((log) => (
                        <div key={log.id} className="flex items-start gap-3 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                          {log.status === 'success' ? (
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                              <XCircle className="w-4 h-4 text-red-500" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{log.action}</span>
                              <Badge variant="outline" className={`text-xs ${log.status === 'success' ? 'border-emerald-500/30 text-emerald-600' : 'border-red-500/30 text-red-600'}`}>
                                {log.status}
                              </Badge>
                            </div>
                            {log.message && (
                              <p className="text-sm text-muted-foreground mt-1 truncate">{log.message}</p>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
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
          
          {/* Videos Tab */}
          <TabsContent value="videos" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle>Video Library</CardTitle>
                    <CardDescription>Manage your shorts collection</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 w-48"
                      />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-32">
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
                <ScrollArea className="h-[500px] scrollbar-thin">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-20">Preview</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead className="w-20">Duration</TableHead>
                        <TableHead className="w-28">Status</TableHead>
                        <TableHead className="w-36">Uploaded</TableHead>
                        <TableHead className="w-28 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredShorts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-12">
                            <div className="flex flex-col items-center text-muted-foreground">
                              <Video className="w-12 h-12 mb-4 opacity-50" />
                              <p>No videos found</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredShorts.map((short) => (
                          <TableRow key={short.id} className="group">
                            <TableCell>
                              <img 
                                src={short.thumbnail_url || '/placeholder.png'} 
                                alt={short.title}
                                className="w-16 h-10 object-cover rounded-md"
                              />
                            </TableCell>
                            <TableCell>
                              <div className="max-w-xs">
                                <p className="font-medium truncate group-hover:text-primary transition-colors">{short.title}</p>
                                <p className="text-xs text-muted-foreground font-mono">{short.video_id}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-mono text-xs">
                                {short.duration}s
                              </Badge>
                            </TableCell>
                            <TableCell>{getStatusBadge(short.status)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatDate(short.uploaded_date)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button 
                                  size="icon" 
                                  variant="ghost"
                                  onClick={() => { setSelectedShort(short); setShowDetails(true); }}
                                  className="h-8 w-8"
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                {short.status === 'Pending' && (
                                  <Button 
                                    size="icon" 
                                    variant="ghost"
                                    onClick={() => processShort(short.id)}
                                    disabled={loading}
                                    className="h-8 w-8 text-primary"
                                  >
                                    <Upload className="w-4 h-4" />
                                  </Button>
                                )}
                                {short.target_video_id && (
                                  <Button 
                                    size="icon" 
                                    variant="ghost"
                                    onClick={() => window.open(`https://youtube.com/watch?v=${short.target_video_id}`, '_blank')}
                                    className="h-8 w-8 text-blue-500"
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </Button>
                                )}
                                <Button 
                                  size="icon" 
                                  variant="ghost"
                                  onClick={() => deleteShort(short.id)}
                                  className="h-8 w-8 text-red-500 hover:text-red-600"
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
            <div className="grid gap-6 lg:grid-cols-2">
              {/* YouTube API Configuration */}
              <Card className="card-hover">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                      <Youtube className="w-4 h-4 text-red-500" />
                    </div>
                    YouTube API
                  </CardTitle>
                  <CardDescription>Configure YouTube Data API and OAuth credentials</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="youtube_api_key" className="text-sm">API Key</Label>
                    <Input
                      id="youtube_api_key"
                      type="password"
                      placeholder="AIza..."
                      value={config.youtube_api_key || ''}
                      onChange={(e) => setConfig({ ...config, youtube_api_key: e.target.value })}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="youtube_client_id" className="text-sm">OAuth Client ID</Label>
                    <Input
                      id="youtube_client_id"
                      placeholder="xxx.apps.googleusercontent.com"
                      value={config.youtube_client_id || ''}
                      onChange={(e) => setConfig({ ...config, youtube_client_id: e.target.value })}
                      className="mt-1.5"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="youtube_client_secret" className="text-sm">Client Secret</Label>
                      <Input
                        id="youtube_client_secret"
                        type="password"
                        placeholder="GOCSPX-..."
                        value={config.youtube_client_secret || ''}
                        onChange={(e) => setConfig({ ...config, youtube_client_secret: e.target.value })}
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="youtube_refresh_token" className="text-sm">Refresh Token</Label>
                      <Input
                        id="youtube_refresh_token"
                        type="password"
                        placeholder="1//..."
                        value={config.youtube_refresh_token || ''}
                        onChange={(e) => setConfig({ ...config, youtube_refresh_token: e.target.value })}
                        className="mt-1.5"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Channel Settings */}
              <Card className="card-hover">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Users className="w-4 h-4 text-blue-500" />
                    </div>
                    Channels
                  </CardTitle>
                  <CardDescription>Source and target channel configuration</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="source_channel_id" className="text-sm">Source Channel</Label>
                    <Input
                      id="source_channel_id"
                      placeholder="https://youtube.com/@channel"
                      value={config.source_channel_id || ''}
                      onChange={(e) => setConfig({ ...config, source_channel_id: e.target.value })}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="target_channel_id" className="text-sm">Target Channel ID</Label>
                    <Input
                      id="target_channel_id"
                      placeholder="UC..."
                      value={config.target_channel_id || ''}
                      onChange={(e) => setConfig({ ...config, target_channel_id: e.target.value })}
                      className="mt-1.5"
                    />
                  </div>
                </CardContent>
              </Card>
              
              {/* Upload Settings */}
              <Card className="card-hover">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <Upload className="w-4 h-4 text-emerald-500" />
                    </div>
                    Upload Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm">Uploads/Day</Label>
                      <Select 
                        value={config.uploads_per_day || '2'} 
                        onValueChange={(value) => setConfig({ ...config, uploads_per_day: value })}
                      >
                        <SelectTrigger className="mt-1.5">
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
                      <Label className="text-sm">Visibility</Label>
                      <Select 
                        value={config.default_visibility || 'public'} 
                        onValueChange={(value) => setConfig({ ...config, default_visibility: value })}
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
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="upload_time_morning" className="text-sm">Morning</Label>
                      <Input
                        id="upload_time_morning"
                        type="time"
                        value={config.upload_time_morning || '09:00'}
                        onChange={(e) => setConfig({ ...config, upload_time_morning: e.target.value })}
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="upload_time_evening" className="text-sm">Evening</Label>
                      <Input
                        id="upload_time_evening"
                        type="time"
                        value={config.upload_time_evening || '18:00'}
                        onChange={(e) => setConfig({ ...config, upload_time_evening: e.target.value })}
                        className="mt-1.5"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* AI Enhancement */}
              <Card className="card-hover">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-violet-500" />
                    </div>
                    AI Enhancement
                  </CardTitle>
                  <CardDescription>Use AI to optimize content</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
                    <div>
                      <Label className="font-medium">Enable AI Enhancement</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Auto-generate optimized titles & hashtags
                      </p>
                    </div>
                    <Switch 
                      checked={config.ai_enhancement_enabled === 'true'}
                      onCheckedChange={(checked) => setConfig({ ...config, ai_enhancement_enabled: checked ? 'true' : 'false' })}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* Save Button */}
            <Button onClick={saveConfig} disabled={loading} size="lg" className="w-full gradient-bg text-white shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all">
              {loading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Configuration
            </Button>
          </TabsContent>
          
          {/* Scheduler Tab */}
          <TabsContent value="scheduler" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="card-hover">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Scheduler Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-muted/50">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Status</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`w-2 h-2 rounded-full ${schedulerState?.is_running ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                        <span className="font-semibold">{schedulerState?.is_running ? 'Running' : 'Idle'}</span>
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-muted/50">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Today</p>
                      <p className="font-semibold mt-2">
                        {schedulerState?.uploads_today || 0} / {config.uploads_per_day || 2}
                      </p>
                    </div>
                  </div>
                  
                  <div className="p-4 rounded-xl bg-muted/50">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Last Run</p>
                    <p className="font-medium mt-2">
                      {schedulerState?.last_run_at ? formatDate(schedulerState.last_run_at) : 'Never'}
                    </p>
                  </div>
                  
                  <Separator />
                  
                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
                    <div>
                      <Label className="font-medium">Automation</Label>
                      <p className="text-sm text-muted-foreground">Enable scheduled uploads</p>
                    </div>
                    <Switch 
                      checked={config.automation_enabled === 'true'}
                      onCheckedChange={toggleAutomation}
                    />
                  </div>
                  
                  <div className="flex gap-3">
                    <Button onClick={triggerScheduler} disabled={schedulerState?.is_running} className="gradient-bg text-white">
                      <Play className="w-4 h-4 mr-2" />
                      Run Now
                    </Button>
                    <Button variant="outline" onClick={fetchStats}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Refresh
                    </Button>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="card-hover">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Schedule
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <Sun className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="font-medium">Morning Upload</p>
                      <p className="text-sm text-muted-foreground">{config.upload_time_morning || '09:00'} UTC daily</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                      <Moon className="w-5 h-5 text-orange-500" />
                    </div>
                    <div>
                      <p className="font-medium">Evening Upload</p>
                      <p className="text-sm text-muted-foreground">{config.upload_time_evening || '18:00'} UTC daily</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
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
                <ScrollArea className="h-[500px] scrollbar-thin">
                  {logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <AlertCircle className="w-16 h-16 mb-4 opacity-50" />
                      <p className="text-lg">No logs available</p>
                      <p className="text-sm">Activity will appear here</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {logs.map((log) => (
                        <div key={log.id} className="flex items-start gap-3 p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                          {log.status === 'success' ? (
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
                              <XCircle className="w-5 h-5 text-red-500" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold">{log.action}</span>
                              <Badge variant={log.status === 'success' ? 'default' : 'destructive'} className="text-xs">
                                {log.status}
                              </Badge>
                            </div>
                            {log.message && (
                              <p className="text-sm text-muted-foreground">{log.message}</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-2">
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
      
      {/* Premium Footer */}
      <footer className="border-t mt-12 py-6 bg-muted/30">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Youtube className="w-4 h-4 text-primary" />
              <span>YouTube Shorts Republisher v1.0</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <Shield className="w-4 h-4" />
                Powered by Supabase
              </span>
            </div>
          </div>
        </div>
      </footer>
      
      {/* Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Video Details</DialogTitle>
            <DialogDescription>Full information about this short</DialogDescription>
          </DialogHeader>
          {selectedShort && (
            <div className="space-y-4">
              <div className="flex gap-4">
                <img 
                  src={selectedShort.thumbnail_url || '/placeholder.png'} 
                  alt={selectedShort.title}
                  className="w-32 h-20 object-cover rounded-xl"
                />
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{selectedShort.title}</h3>
                  <p className="text-sm text-muted-foreground font-mono">{selectedShort.video_id}</p>
                  <div className="mt-2">{getStatusBadge(selectedShort.status)}</div>
                </div>
              </div>
              
              <Separator />
              
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-muted-foreground">Duration</p>
                  <p className="font-semibold">{selectedShort.duration}s</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-muted-foreground">Retries</p>
                  <p className="font-semibold">{selectedShort.retry_count}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-muted-foreground">Created</p>
                  <p className="font-medium">{formatDate(selectedShort.created_at)}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-muted-foreground">Uploaded</p>
                  <p className="font-medium">{formatDate(selectedShort.uploaded_date)}</p>
                </div>
              </div>
              
              {selectedShort.description && (
                <>
                  <Separator />
                  <div>
                    <Label className="text-muted-foreground">Description</Label>
                    <p className="text-sm mt-1 p-3 rounded-lg bg-muted/50">{selectedShort.description}</p>
                  </div>
                </>
              )}
              
              {selectedShort.ai_title && (
                <>
                  <Separator />
                  <div>
                    <Label className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-violet-500" />
                      AI Enhanced Title
                    </Label>
                    <p className="text-sm mt-1 p-3 rounded-lg bg-violet-500/10">{selectedShort.ai_title}</p>
                  </div>
                </>
              )}
              
              {selectedShort.error_log && (
                <>
                  <Separator />
                  <div>
                    <Label className="text-red-500">Error Log</Label>
                    <p className="text-sm mt-1 p-3 rounded-lg bg-red-500/10 text-red-600">{selectedShort.error_log}</p>
                  </div>
                </>
              )}
              
              {selectedShort.target_video_id && (
                <Button 
                  className="w-full gradient-bg text-white"
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
    </div>
  );
}
