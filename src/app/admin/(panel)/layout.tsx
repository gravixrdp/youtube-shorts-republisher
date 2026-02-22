import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_SESSION_COOKIE, isValidAdminSessionToken } from '@/lib/auth/admin';

export default async function AdminPanelLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!token || !isValidAdminSessionToken(token)) {
    redirect('/admin/login');
  }

  return <>{children}</>;
}
