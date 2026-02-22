'use client';

import { Activity, Eye, Link2, Settings, Sparkles, UploadCloud, UserRoundPlus, Video, Zap } from 'lucide-react';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: Activity },
  { id: 'sources', label: 'Sources', icon: UserRoundPlus },
  { id: 'destinations', label: 'Destinations', icon: UploadCloud },
  { id: 'mappings', label: 'Mappings', icon: Link2 },
  { id: 'videos', label: 'Videos', icon: Video },
  { id: 'config', label: 'Settings', icon: Settings },
  { id: 'logs', label: 'Logs', icon: Eye },
];

interface SidebarNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  stats: { pending: number; uploadedToday: number };
}

export function SidebarNav({ activeTab, onTabChange, stats }: SidebarNavProps) {
  return (
    <aside className="sidebar fixed left-0 top-0 z-40 hidden min-h-screen w-64 flex-col border-r border-white/[0.08] md:flex">
      <div className="flex h-16 items-center gap-3 border-b border-white/[0.08] px-5">
        <img src="/logo.svg" alt="GRAVIX" className="h-8 w-8 shrink-0" />
        <div className="min-w-0">
          <p className="font-heading text-base font-bold tracking-tight accent-gradient-text">GRAVIX</p>
          <p className="truncate text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--sidebar-fg)/0.42)]">
            Shorts Automation
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1.5 px-3 py-4" aria-label="Primary navigation">
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onTabChange(id)}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="nav-icon h-4 w-4" />
              <span className="font-medium">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-white/[0.08] px-4 py-4">
        <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/8 p-3">
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-cyan-300/80">
            <Sparkles className="h-3.5 w-3.5" />
            Live Queue
          </div>
          <p className="font-heading text-xl leading-none text-[hsl(var(--sidebar-fg))]">{stats.pending}</p>
          <p className="mt-1 text-[11px] text-[hsl(var(--sidebar-fg)/0.56)]">Pending uploads</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[hsl(var(--sidebar-fg)/0.58)]">
          <Zap className="h-3.5 w-3.5 text-cyan-300" />
          <span>{stats.uploadedToday} published today</span>
        </div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--sidebar-fg)/0.35)]">GRAVIX v1.0</p>
      </div>
    </aside>
  );
}

export function MobileNav({ activeTab, onTabChange }: { activeTab: string; onTabChange: (tab: string) => void }) {
  return (
    <nav
      className="scrollbar-thin border-b border-border/60 bg-card/70 px-4 py-2 backdrop-blur md:hidden"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              className={`mobile-nav-pill ${isActive ? 'active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
