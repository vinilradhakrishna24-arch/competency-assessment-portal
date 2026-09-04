'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { brandingSchema } from '@/lib/validation/schemas';
import { flattenZod } from '@/lib/validation/flatten';
import { writeAuditLog } from '@/lib/audit/log';
import { AUDIT_ACTIONS } from '@/lib/constants';
import type { ActionResult } from '@/lib/actions/types';
import type { z } from 'zod';

export async function getAllSettings() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('system_settings').select('*');
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
}

export async function updateBranding(input: z.infer<typeof brandingSchema>): Promise<ActionResult> {
  const user = await requireAdmin();
  const parsed = brandingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: flattenZod(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { data: before } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'branding')
    .maybeSingle();

  const { error } = await supabase.from('system_settings').upsert({
    key: 'branding',
    value: { ...parsed.data, logo_url: parsed.data.logo_url || null },
    updated_by: user.id,
  });

  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    actorUserId: user.id,
    actorType: 'admin',
    action: AUDIT_ACTIONS.SETTINGS_CHANGED,
    entityType: 'system_settings',
    entityId: 'branding',
    oldValue: before?.value,
    newValue: parsed.data,
  });

  revalidatePath('/settings');
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function updateOperationalSettings(
  key: 'default_pass_mark' | 'default_durations_minutes' | 'token_expiry_defaults' | 'randomization_defaults' | 'verification_retry_settings',
  value: Record<string, unknown>
): Promise<ActionResult> {
  const user = await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: before } = await supabase.from('system_settings').select('value').eq('key', key).maybeSingle();

  const { error } = await supabase.from('system_settings').upsert({ key, value, updated_by: user.id });
  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    actorUserId: user.id,
    actorType: 'admin',
    action: AUDIT_ACTIONS.SETTINGS_CHANGED,
    entityType: 'system_settings',
    entityId: key,
    oldValue: before?.value,
    newValue: value,
  });

  revalidatePath('/settings');
  return { ok: true };
}
