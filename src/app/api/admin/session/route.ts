import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, isValidAdminSessionToken } from '@/lib/auth/admin';

export async function GET(request: NextRequest) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  return NextResponse.json({ authenticated: !!token && isValidAdminSessionToken(token) });
}
