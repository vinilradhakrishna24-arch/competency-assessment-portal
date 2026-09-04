'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, requireUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createAssessmentSchema, type CreateAssessmentInput } from '@/lib/validation/schemas';
import { flattenZod } from '@/lib/validation/flatten';
import { generateCandidateToken, hashToken } from '@/lib/exam/token';
import { generateAssessmentCode } from '@/lib/exam/identifiers';
import { selectAndFreezeQuestions } from '@/lib/exam/freeze';
import { buildExamLink } from '@/lib/exam/link';
import { writeAuditLog } from '@/lib/audit/log';
import { AUDIT_ACTIONS } from '@/lib/constants';
import type { ActionResult } from '@/lib/actions/types';

export interface CreateAssessmentResult extends ActionResult {
  assessmentId?: string;
  assessmentCode?: string;
  examLink?: string;
}

export async function createAssessment(input: CreateAssessmentInput): Promise<CreateAssessmentResult> {
  const user = await requireAdmin();
  const parsed = createAssessmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: flattenZod(parsed.error) };
  const data = parsed.data;

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  // Resolve candidate (existing or newly created)
  let candidateId = data.candidate_id ?? null;
  if (!candidateId && data.new_candidate) {
    const nc = data.new_candidate;
    const { data: candidate, error: candErr } = await supabase
      .from('candidates')
      .insert({
        employee_id: nc.employee_id!,
        full_name: nc.full_name!,
        designation: nc.designation || null,
        email: nc.email || null,
        mobile: nc.mobile || null,
        project_contract: nc.project_contract || null,
        department: nc.department || null,
        active_status: true,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (candErr || !candidate) {
      if (candErr?.code === '23505') {
        return { ok: false, fieldErrors: { 'new_candidate.employee_id': 'This Employee ID already exists. Search for the existing candidate instead.' } };
      }
      return { ok: false, error: candErr?.message ?? 'Failed to create candidate' };
    }
    candidateId = candidate.id;
    await writeAuditLog({
      actorUserId: user.id,
      actorType: 'admin',
      action: AUDIT_ACTIONS.CANDIDATE_CREATED,
      entityType: 'candidate',
      entityId: candidateId ?? undefined,
      newValue: nc,
    });
  }

  if (!candidateId) return { ok: false, error: 'A candidate is required.' };

  const { data: competency, error: compErr } = await supabase
    .from('competencies')
    .select('*')
    .eq('id', data.competency_id)
    .single();
  if (compErr || !competency) return { ok: false, error: 'Selected competency was not found.' };

  let frozenQuestions;
  try {
    frozenQuestions = await selectAndFreezeQuestions({
      competencyId: data.competency_id,
      questionSource: data.question_source,
      questionSetId: data.question_set_id ?? null,
      numQuestions: data.num_questions,
      randomizeOptions: data.randomize_options,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to select questions' };
  }

  const rawToken = generateCandidateToken();
  const tokenHash = hashToken(rawToken);
  const assessmentCode = await generateAssessmentCode(competency.code);

  const { data: result, error: rpcError } = await admin.rpc('fn_create_assessment_with_questions', {
    p_payload: {
      assessment_code: assessmentCode,
      candidate_id: candidateId,
      competency_id: data.competency_id,
      question_set_id: data.question_source === 'specific_set' ? data.question_set_id : null,
      question_source: data.question_source,
      num_questions: data.num_questions,
      pass_mark: data.pass_mark,
      duration_minutes: data.duration_minutes,
      link_expires_at: new Date(data.link_expires_at).toISOString(),
      token_hash: tokenHash,
      randomize_options: data.randomize_options,
      created_by: user.id,
      attempt_number: 1,
      questions: frozenQuestions,
    },
  });

  if (rpcError || !result || (result as { error?: string }).error) {
    return {
      ok: false,
      error: rpcError?.message ?? (result as { error?: string })?.error ?? 'Failed to create assessment',
    };
  }

  const assessment = result as { id: string };

  await writeAuditLog({
    actorUserId: user.id,
    actorType: 'admin',
    action: AUDIT_ACTIONS.ASSESSMENT_CREATED,
    entityType: 'assessment',
    entityId: assessment.id,
    newValue: { assessment_code: assessmentCode, competency: competency.code, candidateId },
  });
  await writeAuditLog({
    actorUserId: user.id,
    actorType: 'admin',
    action: AUDIT_ACTIONS.ASSESSMENT_LINK_GENERATED,
    entityType: 'assessment',
    entityId: assessment.id,
  });

  revalidatePath('/assessments');
  revalidatePath('/dashboard');

  return {
    ok: true,
    assessmentId: assessment.id,
    assessmentCode,
    examLink: buildExamLink(rawToken),
  };
}

export async function cancelAssessment(id: string, reason: string): Promise<ActionResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin.from('assessments').select('status').eq('id', id).maybeSingle();
  if (!existing) return { ok: false, error: 'Assessment not found' };
  if (['PASSED', 'FAILED', 'CANCELLED'].includes(existing.status)) {
    return { ok: false, error: `Cannot cancel an assessment that is already ${existing.status}.` };
  }

  const { error } = await admin
    .from('assessments')
    .update({ status: 'CANCELLED', cancelled_at: new Date().toISOString(), cancelled_reason: reason })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    actorUserId: user.id,
    actorType: 'admin',
    action: AUDIT_ACTIONS.ASSESSMENT_CANCELLED,
    entityType: 'assessment',
    entityId: id,
    newValue: { reason },
  });

  revalidatePath('/assessments');
  revalidatePath(`/assessments/${id}`);
  return { ok: true };
}

export interface RegenerateLinkResult extends ActionResult {
  examLink?: string;
}

/** Issue a brand-new token for an assessment whose link the candidate never
 * used (PENDING) or that expired before they started (EXPIRED). This never
 * touches an assessment that has already been started/submitted/scored —
 * the frozen question snapshot and any recorded answers are untouched. */
export async function regenerateAssessmentLink(
  id: string,
  newLinkExpiresAt: string
): Promise<RegenerateLinkResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();

  const { data: existing, error: fetchErr } = await admin
    .from('assessments')
    .select('status')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !existing) return { ok: false, error: 'Assessment not found' };
  if (!['PENDING', 'EXPIRED'].includes(existing.status)) {
    return { ok: false, error: `Cannot regenerate a link for an assessment that is ${existing.status}.` };
  }

  const rawToken = generateCandidateToken();
  const tokenHash = hashToken(rawToken);

  const { error } = await admin
    .from('assessments')
    .update({
      token_hash: tokenHash,
      link_expires_at: new Date(newLinkExpiresAt).toISOString(),
      status: 'PENDING',
      verification_fail_count: 0,
      verification_locked_until: null,
    })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    actorUserId: user.id,
    actorType: 'admin',
    action: AUDIT_ACTIONS.ASSESSMENT_LINK_REGENERATED,
    entityType: 'assessment',
    entityId: id,
  });

  revalidatePath('/assessments');
  revalidatePath(`/assessments/${id}`);

  return { ok: true, examLink: buildExamLink(rawToken) };
}

export interface ReassessConfig {
  duration_minutes: number;
  link_expires_at: string;
  num_questions: number;
  question_source: 'specific_set' | 'random';
  question_set_id?: string | null;
  randomize_options: boolean;
}

export interface ReassessResult extends ActionResult {
  examLink?: string;
  assessmentCode?: string;
}

export async function authorizeReassessment(
  originalAssessmentId: string,
  config: ReassessConfig
): Promise<ReassessResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();

  const { data: original, error: origErr } = await admin
    .from('assessments')
    .select('*, competencies(code, pass_mark)')
    .eq('id', originalAssessmentId)
    .single();

  if (origErr || !original) return { ok: false, error: 'Original assessment not found' };
  if (original.status !== 'FAILED') {
    return { ok: false, error: 'Only a failed assessment can be reassessed.' };
  }

  let frozenQuestions;
  try {
    frozenQuestions = await selectAndFreezeQuestions({
      competencyId: original.competency_id,
      questionSource: config.question_source,
      questionSetId: config.question_set_id ?? null,
      numQuestions: config.num_questions,
      randomizeOptions: config.randomize_options,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to select questions' };
  }

  const rawToken = generateCandidateToken();
  const tokenHash = hashToken(rawToken);
  const competencyCode = (original.competencies as { code: string }).code;
  const assessmentCode = await generateAssessmentCode(competencyCode);

  const { data: result, error: rpcError } = await admin.rpc('fn_authorize_reassessment', {
    p_payload: {
      original_assessment_id: originalAssessmentId,
      assessment_code: assessmentCode,
      candidate_id: original.candidate_id,
      competency_id: original.competency_id,
      question_set_id: config.question_source === 'specific_set' ? config.question_set_id : null,
      question_source: config.question_source,
      num_questions: config.num_questions,
      pass_mark: original.pass_mark,
      duration_minutes: config.duration_minutes,
      link_expires_at: new Date(config.link_expires_at).toISOString(),
      token_hash: tokenHash,
      randomize_options: config.randomize_options,
      created_by: user.id,
      questions: frozenQuestions,
    },
  });

  if (rpcError || !result || (result as { error?: string }).error) {
    return {
      ok: false,
      error: rpcError?.message ?? (result as { error?: string })?.error ?? 'Failed to authorize reassessment',
    };
  }

  const newAssessment = result as { id: string };

  await writeAuditLog({
    actorUserId: user.id,
    actorType: 'admin',
    action: AUDIT_ACTIONS.REASSESSMENT_AUTHORIZED,
    entityType: 'assessment',
    entityId: newAssessment.id,
    oldValue: { original_assessment_id: originalAssessmentId },
    newValue: { assessment_code: assessmentCode },
  });

  revalidatePath('/assessments');
  revalidatePath(`/assessments/${originalAssessmentId}`);

  return { ok: true, examLink: buildExamLink(rawToken), assessmentCode };
}

export async function getAssessments(filters?: {
  status?: string;
  competencyId?: string;
  candidateId?: string;
}) {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('assessments')
    .select('*, candidates(full_name, employee_id, department, project_contract), competencies(code, competency_name)')
    .order('created_at', { ascending: false });

  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.competencyId) query = query.eq('competency_id', filters.competencyId);
  if (filters?.candidateId) query = query.eq('candidate_id', filters.candidateId);

  const { data, error } = await query.limit(500);
  if (error) throw new Error(error.message);
  return data;
}

export async function getAssessmentDetail(id: string) {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('assessments')
    .select(
      '*, candidates(*), competencies(code, competency_name), results(*), certificates(*)'
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
