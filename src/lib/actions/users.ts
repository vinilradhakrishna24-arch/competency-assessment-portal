'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { inviteUserSchema } from '@/lib/validation/schemas';
import { flattenZod } from '@/lib/validation/flatten';
import { writeAuditLog } from '@/lib/audit/log';
import { AUDIT_ACTIONS } from '@/lib/constants';
import type { ActionResult } from '@/lib/actions/types';
import type { RoleName } from '@/types/database';

export async function getUsers() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('*, roles(id, name, permission_level, stream_scope)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

/** Every assignable role -- Admin/Examiner, the default Viewer, and any
 * stream-scoped viewer role such as HSE Manager (migration 0012). Used to
 * populate the Add User / change-role dropdowns instead of a hard-coded
 * admin/viewer binary. */
export async function getRoles() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('roles')
    .select('id, name, permission_level, stream_scope, description')
    .order('permission_level')
    .order('name');
  if (error) throw new Error(error.message);
  return data;
}

export async function createUser(
  input: import('zod').infer<typeof inviteUserSchema>
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = inviteUserSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: flattenZod(parsed.error) };

  const supabaseAdmin = createSupabaseAdminClient();

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name },
  });

  if (createError || !created.user) {
    return { ok: false, error: createError?.message ?? 'Failed to create user' };
  }

  // The DB trigger auto-creates a profile with the default 'viewer' role --
  // update it to whichever specific role row was requested.
  const { error: roleError } = await supabaseAdmin
    .from('profiles')
    .update({ role_id: parsed.data.role_id })
    .eq('id', created.user.id);

  if (roleError) return { ok: false, error: roleError.message };

  await writeAuditLog({
    actorUserId: admin.id,
    actorType: 'admin',
    action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
    entityType: 'profile',
    entityId: created.user.id,
    newValue: { email: parsed.data.email, role_id: parsed.data.role_id, action: 'created' },
  });

  revalidatePath('/users');
  return { ok: true };
}

export async function changeUserRole(userId: string, roleId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabaseAdmin = createSupabaseAdminClient();

  const { data: roleRow, error: roleLookupError } = await supabaseAdmin
    .from('roles')
    .select('id, permission_level')
    .eq('id', roleId)
    .maybeSingle();
  if (roleLookupError) return { ok: false, error: roleLookupError.message };
  if (!roleRow) return { ok: false, error: 'Invalid role' };

  // Guard against demoting the last active Admin/Examiner out of that
  // permission level, same protection deleteUser already applies.
  if (roleRow.permission_level !== 'admin') {
    const { data: current } = await supabaseAdmin
      .from('profiles')
      .select('id, roles!inner(permission_level)')
      .eq('id', userId)
      .maybeSingle();
    const currentLevel = (current?.roles as unknown as { permission_level: RoleName } | null)?.permission_level;
    if (currentLevel === 'admin') {
      const { count } = await supabaseAdmin
        .from('profiles')
        .select('id, roles!inner(permission_level)', { count: 'exact', head: true })
        .eq('roles.permission_level', 'admin')
        .eq('active', true)
        .is('deleted_at', null)
        .neq('id', userId);
      if (!count || count < 1) {
        return { ok: false, error: 'Cannot change the role of the last active Admin / Examiner. Promote another user first.' };
      }
    }
  }

  const { error } = await supabaseAdmin.from('profiles').update({ role_id: roleId }).eq('id', userId);
  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    actorUserId: admin.id,
    actorType: 'admin',
    action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
    entityType: 'profile',
    entityId: userId,
    newValue: { role_id: roleId },
  });

  revalidatePath('/users');
  return { ok: true };
}

/** Soft-delete: profiles.id has an ON DELETE CASCADE from auth.users, but
 * assessments/audit_logs/questions reference profiles(id) as created_by /
 * actor_user_id without cascade, so a hard delete on any admin with real
 * activity history would fail. Marking deleted_at (and forcing active
 * false, which every RLS policy already gates on) removes the user from
 * the Users list and blocks their next request immediately, while
 * preserving the audit trail. Guards against removing your own account or
 * the last remaining active admin, since either would lock the whole
 * portal out of Admin/Examiner access. */
export async function deleteUser(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (admin.id === userId) {
    return { ok: false, error: 'You cannot delete your own account.' };
  }

  const supabaseAdmin = createSupabaseAdminClient();

  const { data: target, error: fetchError } = await supabaseAdmin
    .from('profiles')
    .select('*, roles(name, permission_level)')
    .eq('id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (fetchError) return { ok: false, error: fetchError.message };
  if (!target) return { ok: false, error: 'User not found or already deleted.' };

  type RoleShape = { name: string; permission_level: RoleName };
  const targetRoleRow = (Array.isArray(target.roles) ? target.roles[0] : target.roles) as RoleShape | null;
  const targetRole = targetRoleRow?.permission_level;

  if (targetRole === 'admin') {
    const { count, error: countError } = await supabaseAdmin
      .from('profiles')
      .select('id, roles!inner(permission_level)', { count: 'exact', head: true })
      .eq('roles.permission_level', 'admin')
      .eq('active', true)
      .is('deleted_at', null)
      .neq('id', userId);

    if (countError) return { ok: false, error: countError.message };
    if (!count || count < 1) {
      return { ok: false, error: 'Cannot delete the last active Admin / Examiner. Promote another user first.' };
    }
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ deleted_at: new Date().toISOString(), active: false })
    .eq('id', userId);

  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    actorUserId: admin.id,
    actorType: 'admin',
    action: AUDIT_ACTIONS.USER_DELETED,
    entityType: 'profile',
    entityId: userId,
    oldValue: { email: target.email, role: targetRole },
  });

  revalidatePath('/users');
  return { ok: true };
}

export async function setUserActive(userId: string, active: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (admin.id === userId && !active) {
    return { ok: false, error: 'You cannot deactivate your own account.' };
  }
  const supabaseAdmin = createSupabaseAdminClient();
  const { error } = await supabaseAdmin.from('profiles').update({ active }).eq('id', userId);
  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    actorUserId: admin.id,
    actorType: 'admin',
    action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
    entityType: 'profile',
    entityId: userId,
    newValue: { active },
  });

  revalidatePath('/users');
  return { ok: true };
}
