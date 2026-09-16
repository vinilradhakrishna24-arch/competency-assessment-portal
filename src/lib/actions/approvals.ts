'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { issueCertificateForAssessment } from '@/lib/certificate/issue';
import { writeAuditLog } from '@/lib/audit/log';
import { AUDIT_ACTIONS } from '@/lib/constants';
import type { ActionResult } from '@/lib/actions/types';

/** HSE assessments with `competencies.requires_result_approval` route a
 * passing score to AWAITING_APPROVAL instead of auto-issuing a certificate
 * (see fn_finalize_assessment, migration 0013). This is the admin queue
 * that resolves them. A technical (LOA/SFT/PTW) assessment never reaches
 * AWAITING_APPROVAL, so this list is naturally HSE-only. */
export async function getPendingApprovals() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('assessments')
    .select(
      '*, candidates(full_name, employee_id, designation, project_contract), competencies(code, competency_name)'
    )
    .eq('status', 'AWAITING_APPROVAL')
    .order('submitted_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

/** fn_approve_result/fn_reject_result are only ever called through the
 * service-role admin client, matching every other status-transition RPC in
 * this app (fn_authorize_reassessment, fn_create_assessment_with_questions)
 * -- requireAdmin() above is the actual authorization gate. */
export async function approveResult(assessmentId: string, comment?: string): Promise<ActionResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin.rpc('fn_approve_result', {
    p_assessment_id: assessmentId,
    p_decided_by: user.id,
    p_comment: comment?.trim() || null,
  });

  if (error || !data || (data as { error?: string }).error) {
    const errCode = (data as { error?: string })?.error;
    return {
      ok: false,
      error:
        errCode === 'not_awaiting_approval'
          ? 'This assessment is no longer awaiting approval.'
          : (error?.message ?? 'Failed to approve this result'),
    };
  }

  // Approval only flips the status -- issuing the certificate (PDF render +
  // storage upload) is the same idempotent path every PASSED assessment
  // already goes through.
  await issueCertificateForAssessment(assessmentId);

  await writeAuditLog({
    actorUserId: user.id,
    actorType: 'admin',
    action: AUDIT_ACTIONS.RESULT_APPROVED,
    entityType: 'assessment',
    entityId: assessmentId,
    newValue: { comment: comment?.trim() || null },
  });

  revalidatePath('/approvals');
  revalidatePath('/assessments');
  revalidatePath('/certificates');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function rejectResult(assessmentId: string, comment?: string): Promise<ActionResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin.rpc('fn_reject_result', {
    p_assessment_id: assessmentId,
    p_decided_by: user.id,
    p_comment: comment?.trim() || null,
  });

  if (error || !data || (data as { error?: string }).error) {
    const errCode = (data as { error?: string })?.error;
    return {
      ok: false,
      error:
        errCode === 'not_awaiting_approval'
          ? 'This assessment is no longer awaiting approval.'
          : (error?.message ?? 'Failed to reject this result'),
    };
  }

  await writeAuditLog({
    actorUserId: user.id,
    actorType: 'admin',
    action: AUDIT_ACTIONS.RESULT_REJECTED,
    entityType: 'assessment',
    entityId: assessmentId,
    newValue: { comment: comment?.trim() || null },
  });

  revalidatePath('/approvals');
  revalidatePath('/assessments');
  revalidatePath('/dashboard');
  return { ok: true };
}
