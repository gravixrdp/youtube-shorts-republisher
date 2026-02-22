import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  buildAdminSessionToken,
  getAdminSessionMaxAge,
  isValidAdminCredential,
} from '@/lib/auth/admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body?.email === 'string' ? body.email : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!isValidAdminCredential(email, password)) {
      return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
    }

    const token = buildAdminSessionToken(email.trim().toLowerCase());
    const response = NextResponse.json({ success: true });
    const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
    const isSecureRequest = request.nextUrl.protocol === 'https:' || forwardedProto === 'https';

    response.cookies.set(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isSecureRequest,
      path: '/',
      maxAge: getAdminSessionMaxAge(),
    });

    return response;
  } catch (error) {
    console.error('Admin login error:', error);
    return NextResponse.json({ success: false, error: 'Failed to login' }, { status: 500 });
  }
}
