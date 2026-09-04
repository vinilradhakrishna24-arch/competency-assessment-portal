'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, requireUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { candidateSchema, type CandidateInput } from '@/lib/validation/schemas';
import { writeAuditLog } from '@/lib/audit/log';
import { AUDIT_ACTIONS } from '@/lib/constants';
import { flattenZod } from '@/lib/validation/flatten';
import type { ActionResult } from '@/lib/actions/types';

function toNullable(value: string | undefined): string | null {
  return value && value.trim() !== '' ? value.trim() : null;
}

export async function createCandidate(input: CandidateInput): Promise<ActionResult> {
  const user = await requireAdmin();
  const parsed = candidateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: flattenZod(parsed.error) };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('candidates')
    .insert({
      employee_id: parsed.data.employee_id,
      full_name: parsed.data.full_name,
      designation: toNullable(parsed.data.designation),
      email: toNullable(parsed.data.email),
      mobile: toNullable(parsed.data.mobile),
      project_contract: toNullable(parsed.data.project_contract),
      department: toNullable(parsed.data.department),
      active_status: parsed.data.active_status,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { ok: false, fieldErrors: { employee_id: 'This Employee ID is already in use.' } };
    }
    return { ok: false, error: error.message };
  }

  await writeAuditLog({
    actorUserId: user.id,
    actorType: 'admin',
    action: AUDIT_ACTIONS.CANDIDATE_CREATED,
    entityType: 'candidate',
    entityId: data.id,
    newValue: parsed.data,
  });

  revalidatePath('/candidates');
  return { ok: true };
}

export async function updateCandidate(id: string, input: CandidateInput): Promise<ActionResult> {
  const user = await requireAdmin();
  const parsed = candidateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: flattenZod(parsed.error) };
  }

  const supabase = await createSupabaseServerClient();
  const { data: before } = await supabase.from('candidates').select('*').eq('id', id).maybeSingle();

  const { error } = await supabase
    .from('candidates')
    .update({
      employee_id: parsed.data.employee_id,
      full_name: parsed.data.full_name,
      designation: toNullable(parsed.data.designation),
      email: toNullable(parsed.data.email),
      mobile: toNullable(parsed.data.mobile),
      project_contract: toNullable(parsed.data.project_contract),
      department: toNullable(parsed.data.department),
      active_status: parsed.data.active_status,
    })
    .eq('id', id);

  if (error) {
    if (error.code === '23505') {
      return { ok: false, fieldErrors: { employee_id: 'This Employee ID is already in use.' } };
    }
    return { ok: false, error: error.message };
  }

  await writeAuditLog({
    actorUserId: user.id,
    actorType: 'admin',
    action: AUDIT_ACTIONS.CANDIDATE_UPDATED,
    entityType: 'candidate',
    entityId: id,
    oldValue: before,
    newValue: parsed.data,
  });

  revalidatePath('/candidates');
  revalidatePath(`/candidates/${id}`);
  return { ok: true };
}

export async function getCandidates(search?: string) {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('candidates')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (search && search.trim() !== '') {
    const term = search.trim();
    query = query.or(
      `full_name.ilike.%${term}%,employee_id.ilike.%${term}%,department.ilike.%${term}%,project_contract.ilike.%${term}%`
    );
  }

  const { data, error } = await query.limit(500);
  if (error) throw new Error(error.message);
  return data;
}

/** Soft-delete: hard DELETE is unsafe here because assessments,
 * audit_logs, and other tables reference candidates without cascade —
 * deleting a candidate with any assessment history would fail on the FK
 * constraint. Marking deleted_at instead removes the candidate from every
 * active list/dropdown (getCandidates filters it out) while preserving
 * their full assessment/certificate history for audit purposes. */
export async function deleteCandidate(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: before, error: fetchError } = await supabase
    .from('candidates')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (fetchError) return { ok: false, error: fetchError.message };
  if (!before) return { ok: false, error: 'Candidate not found or already deleted.' };

  const { error } = await supabase
    .from('candidates')
    .update({ deleted_at: new Date().toISOString(), active_status: false })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    actorUserId: admin.id,
    actorType: 'admin',
    action: AUDIT_ACTIONS.CANDIDATE_DELETED,
    entityType: 'candidate',
    entityId: id,
    oldValue: before,
  });

  revalidatePath('/candidates');
  return { ok: true };
}
