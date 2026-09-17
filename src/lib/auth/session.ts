import 'server-only';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { RoleName, CompetencyStream } from '@/types/database';

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  /** The actual authorization key -- roles.permission_level (migration
   * 0012). Never derive gating from roleName, which is a free-text label
   * ("HSE Manager") that can vary per organization. */
  role: RoleName;
  /** Display label for the profile's role row, e.g. "Viewer / Management"
   * or "HSE Manager". Purely cosmetic. */
  roleName: string;
  /** Null = unrestricted (sees every competency stream, e.g. Admin or the
   * default Viewer role). A non-null array restricts a viewer-tier role to
   * only those streams -- e.g. HSE Manager -> ['hse'], which is how the
   * "HSE Manager must never see technical data" requirement is enforced
   * both here (nav) and at the RLS layer (migration 0012). */
  streamScope: CompetencyStream[] | null;
  /** True when this profile's role has can_manage set (e.g. HSE Manager) --
   * grants create/edit rights on assessments, questions and candidates
   * (scoped to streamScope) without being a full Admin. See
   * requireManagerOrAdmin() and migration 0017. */
  canManage: boolean;
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
    .select('id, full_name, email, active, roles(name, permission_level, stream_scope, can_manage)')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || !profile.active) return null;

  type RoleShape = {
    name: string;
    permission_level: RoleName;
    stream_scope: CompetencyStream[] | null;
    can_manage: boolean;
  };
  const roleRow = profile.roles as unknown as RoleShape | RoleShape[] | null;
  const roleData = Array.isArray(roleRow) ? roleRow[0] : roleRow;
  if (!roleData) return null;

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: roleData.permission_level,
    roleName: roleData.name,
    streamScope: roleData.stream_scope,
    canManage: roleData.can_manage,
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

/** Require an Admin/Examiner OR a manager-capable viewer-tier role (e.g.
 * HSE Manager, roles.can_manage = true) -- redirects a plain read-only
 * Viewer to the dashboard. Callers that create/edit within a stream (e.g.
 * createAssessment, createQuestion) must still check the caller's
 * streamScope themselves for non-admins -- this only gates who gets past
 * the door, not which stream they may act on. */
export async function requireManagerOrAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== 'admin' && !user.canManage) redirect('/dashboard');
  return user;
}
