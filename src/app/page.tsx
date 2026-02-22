'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Layers, Rocket, Sparkles, TimerReset, Video } from 'lucide-react';

const highlights = [
  {
    icon: <Video className="h-5 w-5" />,
    title: 'Multi-Channel Publishing',
    text: 'Scrape, enhance, and republish shorts across destination channels with controlled automation.',
  },
  {
    icon: <TimerReset className="h-5 w-5" />,
    title: 'Precision Scheduling',
    text: 'Run mapping-level morning/evening slots in your selected timezone without manual intervention.',
  },
  {
    icon: <Sparkles className="h-5 w-5" />,
    title: 'AI Optimization',
    text: 'Generate titles, descriptions, and tags tuned for high-retention short-form performance.',
  },
];

const stats = [
  { value: '24/7', label: 'Automation Runtime' },
  { value: '2-Step', label: 'Destination OAuth' },
  { value: '1 Panel', label: 'Admin Operations' },
];

export default function LandingPage() {
  return (
    <main className="premium-shell">
      <div className="premium-noise" />
      <div className="premium-orb premium-orb-left" />
      <div className="premium-orb premium-orb-right" />

      <header className="premium-nav">
        <Link href="/" className="premium-brand">
          <span className="premium-brand-dot" />
          <span>GRAVIX</span>
        </Link>
        <Link href="/admin/login" className="premium-nav-link">
          Admin Login
        </Link>
      </header>

      <section className="premium-hero">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, ease: 'easeOut' }}
          className="premium-hero-copy"
        >
          <p className="premium-tag">
            <Rocket className="h-4 w-4" />
            <span>Premium Automation Platform</span>
          </p>
          <h1>Launch a high-end shorts republishing engine with cinematic control.</h1>
          <p>
            GRAVIX combines source scraping, mapping-aware scheduling, delayed publish control, and AI metadata
            enhancement in one protected admin system.
          </p>
          <div className="premium-hero-actions">
            <Link href="/admin/login" className="premium-btn premium-btn-primary">
              Open Admin Panel
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#features" className="premium-btn premium-btn-ghost">
              Explore Features
            </a>
          </div>
          <div className="premium-stats">
            {stats.map((item) => (
              <div key={item.label} className="premium-stat-card">
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.75, delay: 0.2, ease: 'easeOut' }}
          className="premium-visual"
        >
          <div className="premium-tilt-card premium-tilt-main">
            <div className="premium-card-header">
              <Layers className="h-5 w-5" />
              <span>Real-Time Pipeline</span>
            </div>
            <div className="premium-pipeline">
              <span>Source Fetch</span>
              <span>AI Enhance</span>
              <span>Mapped Upload</span>
              <span>Auto Publish</span>
            </div>
          </div>
          <div className="premium-tilt-card premium-tilt-float">
            <Sparkles className="h-5 w-5" />
            <p>3D glass visuals, smooth gradients, and motion-first layout built for premium feel.</p>
          </div>
        </motion.div>
      </section>

      <section id="features" className="premium-features">
        {highlights.map((item, index) => (
          <motion.article
            key={item.title}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.45, delay: index * 0.1 }}
            className="premium-feature-card"
          >
            <div className="premium-feature-icon">{item.icon}</div>
            <h2>{item.title}</h2>
            <p>{item.text}</p>
          </motion.article>
        ))}
      </section>

      <section className="premium-cta">
        <h3>Only admin-authenticated users can access operations.</h3>
        <p>Sign-in is restricted. No public signup route is enabled.</p>
        <Link href="/admin/login" className="premium-btn premium-btn-primary">
          Continue to Login
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </main>
  );
}
