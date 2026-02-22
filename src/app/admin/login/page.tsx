'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Mail, ShieldCheck } from 'lucide-react';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('gravixrdp@gmail.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      try {
        const response = await fetch('/api/admin/session');
        const data = await response.json();
        if (mounted && data.authenticated) {
          router.replace('/admin');
        }
      } catch {
        // Ignore session check errors on login screen.
      }
    };

    void checkSession();
    return () => {
      mounted = false;
    };
  }, [router]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      if (!data.success) {
        setError(data.error || 'Login failed');
        return;
      }

      router.replace('/admin');
      router.refresh();
    } catch {
      setError('Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-bg-glow auth-bg-glow-one" />
      <div className="auth-bg-glow auth-bg-glow-two" />

      <section className="auth-card">
        <div className="auth-badge">
          <ShieldCheck className="h-4 w-4" />
          <span>Admin Access Only</span>
        </div>

        <h1 className="auth-title">GRAVIX Admin Login</h1>
        <p className="auth-subtitle">No signup available. Authorized admin credentials are required.</p>

        <form className="auth-form" onSubmit={onSubmit}>
          <label className="auth-label" htmlFor="admin-email">
            Email
          </label>
          <div className="auth-input-wrap">
            <Mail className="h-4 w-4 text-slate-400" />
            <input
              id="admin-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="username"
              className="auth-input"
              placeholder="admin@example.com"
            />
          </div>

          <label className="auth-label" htmlFor="admin-password">
            Password
          </label>
          <div className="auth-input-wrap">
            <Lock className="h-4 w-4 text-slate-400" />
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
              className="auth-input"
              placeholder="Enter password"
            />
          </div>

          {error ? <p className="auth-error">{error}</p> : null}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Login to Admin Panel'}
          </button>
        </form>
      </section>
    </main>
  );
}
