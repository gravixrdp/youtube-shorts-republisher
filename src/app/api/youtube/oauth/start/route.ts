import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/lib/supabase/database';

export const runtime = 'nodejs';

interface OAuthState {
  nonce: string;
  ts: number;
  redirectUri: string;
  flow: 'destination';
}

interface RedirectResolution {
  redirectUri: string;
  canonicalStartUrl?: string;
}

function getRequestedOrigin(request: NextRequest): string {
  const host =
    request.headers.get('host') ||
    request.headers.get('x-forwarded-host') ||
    request.nextUrl.host;

  const protocolFromHeader = request.headers.get('x-forwarded-proto');
  const protocol = protocolFromHeader || request.nextUrl.protocol.replace(':', '');

  return `${protocol}://${host}`;
}

function encodeState(payload: OAuthState): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function readEnv(...keys: string[]): string | null {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) {
      return value;
    }
  }
  return null;
}

async function resolveRedirectUri(request: NextRequest): Promise<RedirectResolution> {
  const configured = await getConfig('youtube_redirect_uri');
  if (configured) {
    try {
      const configuredUrl = new URL(configured);
      const requestedOrigin = getRequestedOrigin(request);
      const configuredOrigin = configuredUrl.origin;
      const canonicalStartUrl = `${configuredOrigin}/api/youtube/oauth/start`;

      return {
        redirectUri: configured,
        canonicalStartUrl: requestedOrigin === configuredOrigin ? undefined : canonicalStartUrl,
      };
    } catch {
      // fallback below
    }
  }

  const fromEnv = readEnv('YOUTUBE_REDIRECT_URI');
  if (fromEnv) {
    try {
      const envUrl = new URL(fromEnv);
      const requestedOrigin = getRequestedOrigin(request);
      const envOrigin = envUrl.origin;
      const canonicalStartUrl = `${envOrigin}/api/youtube/oauth/start`;

      return {
        redirectUri: fromEnv,
        canonicalStartUrl: requestedOrigin === envOrigin ? undefined : canonicalStartUrl,
      };
    } catch {
      // fallback below
    }
  }

  return { redirectUri: `${request.nextUrl.origin}/api/youtube/oauth/callback` };
}

export async function GET(request: NextRequest) {
  try {
    const clientId = (await getConfig('youtube_client_id')) || readEnv('YOUTUBE_CLIENT_ID');

    if (!clientId) {
      return NextResponse.json(
        { success: false, error: 'YouTube OAuth Client ID not configured' },
        { status: 400 }
      );
    }

    const { redirectUri, canonicalStartUrl } = await resolveRedirectUri(request);

    // Ensure OAuth starts on the same host as redirect URI.
    // This prevents state-cookie host mismatch (e.g. raw IP app + nip.io callback).
    const canonicalized = request.nextUrl.searchParams.get('__canonical') === '1';
    if (canonicalStartUrl && !canonicalized) {
      const redirectUrl = new URL(canonicalStartUrl);
      redirectUrl.searchParams.set('__canonical', '1');
      return NextResponse.redirect(redirectUrl, 307);
    }

    const state = encodeState({
      nonce: crypto.randomUUID(),
      ts: Date.now(),
      redirectUri,
      flow: 'destination',
    });

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set(
      'scope',
      'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload'
    );
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('include_granted_scopes', 'true');
    authUrl.searchParams.set('state', state);

    const response = NextResponse.redirect(authUrl);
    response.cookies.set('yt_oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: 60 * 10,
    });

    return response;
  } catch (error) {
    console.error('OAuth start error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to start OAuth flow' },
      { status: 500 }
    );
  }
}
