import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE } from '@/lib/auth/admin';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  const isSecureRequest = request.nextUrl.protocol === 'https:' || forwardedProto === 'https';

  response.cookies.set(ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest,
    path: '/',
    maxAge: 0,
  });

  return response;
}
