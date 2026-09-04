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
    .select('*, roles(name)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
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

  // The DB trigger auto-creates a profile with the 'viewer' role by default —
  // update it to the requested role right after.
  const { data: roleRow } = await supabaseAdmin
    .from('roles')
    .select('id')
    .eq('name', parsed.data.role)
    .single();

  if (roleRow) {
    await supabaseAdmin.from('profiles').update({ role_id: roleRow.id }).eq('id', created.user.id);
  }

  await writeAuditLog({
    actorUserId: admin.id,
    actorType: 'admin',
    action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
    entityType: 'profile',
    entityId: created.user.id,
    newValue: { email: parsed.data.email, role: parsed.data.role, action: 'created' },
  });

  revalidatePath('/users');
  return { ok: true };
}

export async function changeUserRole(userId: string, role: RoleName): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabaseAdmin = createSupabaseAdminClient();

  const { data: roleRow } = await supabaseAdmin.from('roles').select('id').eq('name', role).single();
  if (!roleRow) return { ok: false, error: 'Invalid role' };

  const { error } = await supabaseAdmin.from('profiles').update({ role_id: roleRow.id }).eq('id', userId);
  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    actorUserId: admin.id,
    actorType: 'admin',
    action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
    entityType: 'profile',
    entityId: userId,
    newValue: { role },
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
    .select('*, roles(name)')
    .eq('id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (fetchError) return { ok: false, error: fetchError.message };
  if (!target) return { ok: false, error: 'User not found or already deleted.' };

  const targetRole = Array.isArray(target.roles) ? target.roles[0]?.name : (target.roles as { name: RoleName } | null)?.name;

  if (targetRole === 'admin') {
    const { count, error: countError } = await supabaseAdmin
      .from('profiles')
      .select('id, roles!inner(name)', { count: 'exact', head: true })
      .eq('roles.name', 'admin')
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
