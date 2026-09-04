import 'server-only';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { RoleName } from '@/types/database';

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: RoleName;
  active: boolean;
}

/** Resolve the signed-in internal user (Admin/Examiner or Viewer) and their
 * role, for use in Server Components and Route Handlers. Returns null if
 * there is no session or the profile is inactive. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, active, roles(name)')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || !profile.active) return null;

  const roleRow = profile.roles as unknown as { name: RoleName } | { name: RoleName }[] | null;
  const role = Array.isArray(roleRow) ? roleRow[0]?.name : roleRow?.name;
  if (!role) return null;

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role,
    active: profile.active,
  };
}

/** Require any signed-in internal user; redirects to /login otherwise. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/** Require an Admin/Examiner; redirects Viewers to the dashboard. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== 'admin') redirect('/dashboard');
  return user;
}
