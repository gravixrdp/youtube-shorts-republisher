import { NextRequest, NextResponse } from 'next/server';
import { getConfig, setConfig } from '@/lib/supabase/database';
import { upsertDestinationChannelsFromOAuth } from '@/lib/youtube/destination-channels';

export const runtime = 'nodejs';

interface OAuthState {
  nonce: string;
  ts: number;
  redirectUri: string;
  flow: 'destination';
}

interface PopupMessage {
  type: 'youtube-oauth-result';
  success: boolean;
  message: string;
  channels?: Array<{ channel_id: string; channel_title: string }>;
  primary_channel_id?: string;
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

function decodeState(state: string): OAuthState | null {
  try {
    const json = Buffer.from(state, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as Partial<OAuthState>;

    if (
      typeof parsed.nonce === 'string' &&
      typeof parsed.ts === 'number' &&
      typeof parsed.redirectUri === 'string' &&
      parsed.flow === 'destination'
    ) {
      return parsed as OAuthState;
    }

    return null;
  } catch {
    return null;
  }
}

function popupResponse(payload: PopupMessage): NextResponse {
  const serialized = JSON.stringify(payload).replace(/</g, '\\u003c');

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>YouTube Connect</title>
</head>
<body>
  <p>You can close this window.</p>
  <script>
    (function () {
      var payload = ${serialized};
      try {
        if (window.opener && window.opener !== window) {
          window.opener.postMessage(payload, window.location.origin);
        }
      } catch (_) {}
      window.close();
      setTimeout(function () {
        document.body.innerHTML = '<p>' + payload.message + '</p>';
      }, 500);
    })();
  </script>
</body>
</html>`;

  const response = new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });

  response.cookies.set('yt_oauth_state', '', {
    path: '/',
    maxAge: 0,
  });

  return response;
}

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');
    const error = request.nextUrl.searchParams.get('error');
    const storedState = request.cookies.get('yt_oauth_state')?.value;

    if (error) {
      return popupResponse({
        type: 'youtube-oauth-result',
        success: false,
        message: `Google auth failed: ${error}`,
      });
    }

    if (!code || !state || !storedState || state !== storedState) {
      return popupResponse({
        type: 'youtube-oauth-result',
        success: false,
        message: 'Invalid OAuth state. Open app with configured domain and try again (not raw IP).',
      });
    }

    const decodedState = decodeState(state);
    if (!decodedState) {
      return popupResponse({
        type: 'youtube-oauth-result',
        success: false,
        message: 'Invalid OAuth state payload.',
      });
    }

    const stateAge = Date.now() - decodedState.ts;
    if (stateAge > 10 * 60 * 1000) {
      return popupResponse({
        type: 'youtube-oauth-result',
        success: false,
        message: 'OAuth session expired. Please connect again.',
      });
    }

    const clientId = (await getConfig('youtube_client_id')) || readEnv('YOUTUBE_CLIENT_ID');
    const clientSecret = (await getConfig('youtube_client_secret')) || readEnv('YOUTUBE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      return popupResponse({
        type: 'youtube-oauth-result',
        success: false,
        message: 'YouTube OAuth client credentials are missing in configuration.',
      });
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: decodedState.redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      console.error('OAuth token exchange failed:', body);
      return popupResponse({
        type: 'youtube-oauth-result',
        success: false,
        message: 'Token exchange failed. Check OAuth redirect URI and test users.',
      });
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
    };

    if (!tokenData.access_token) {
      return popupResponse({
        type: 'youtube-oauth-result',
        success: false,
        message: 'No access token received from Google.',
      });
    }

    if (!tokenData.refresh_token) {
      return popupResponse({
        type: 'youtube-oauth-result',
        success: false,
        message: 'No refresh token received. Remove old app access and reconnect.',
      });
    }

    const channelsResponse = await fetch('https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!channelsResponse.ok) {
      const body = await channelsResponse.text();
      console.error('Fetching channels failed:', body);
      return popupResponse({
        type: 'youtube-oauth-result',
        success: false,
        message: 'Failed to fetch your YouTube channels.',
      });
    }

    const channelsData = (await channelsResponse.json()) as {
      items?: Array<{ id?: string; snippet?: { title?: string } }>;
    };

    const channels = (channelsData.items || [])
      .map((item) => ({
        channel_id: item.id || '',
        channel_title: item.snippet?.title || 'Untitled Channel',
      }))
      .filter((channel) => channel.channel_id.startsWith('UC'));

    if (channels.length === 0) {
      return popupResponse({
        type: 'youtube-oauth-result',
        success: false,
        message: 'No valid YouTube channel found for this account.',
      });
    }

    await upsertDestinationChannelsFromOAuth(channels, tokenData.refresh_token);

    // Keep backward compatibility: if global refresh token is empty, set first channel token.
    const existingGlobalToken = await getConfig('youtube_refresh_token');
    if (!existingGlobalToken) {
      await setConfig('youtube_refresh_token', tokenData.refresh_token);
    }

    return popupResponse({
      type: 'youtube-oauth-result',
      success: true,
      message: `Connected ${channels.length} destination channel(s).`,
      channels,
      primary_channel_id: channels[0].channel_id,
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    return popupResponse({
      type: 'youtube-oauth-result',
      success: false,
      message: 'Unexpected error during channel connection.',
    });
  }
}
