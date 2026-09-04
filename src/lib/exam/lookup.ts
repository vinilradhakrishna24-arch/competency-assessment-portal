import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { hashToken } from '@/lib/exam/token';
import { writeAuditLog } from '@/lib/audit/log';
import { AUDIT_ACTIONS } from '@/lib/constants';
import type { Assessment, CandidateQuestionView } from '@/types/database';

export interface AssessmentLookupResult {
  assessment: Assessment;
  tokenHash: string;
}

/** Resolve a raw candidate token to its assessment row, and let the
 * database enforce the authoritative timer (auto-expiring PENDING links
 * past their window, and auto-finalizing STARTED exams past ends_at)
 * before returning. Every exam-facing route calls this first. */
export async function lookupAssessmentByToken(rawToken: string): Promise<AssessmentLookupResult | null> {
  const tokenHash = hashToken(rawToken);
  const admin = createSupabaseAdminClient();

  const { data: assessment, error } = await admin
    .from('assessments')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error || !assessment) return null;

  const statusBefore = assessment.status;
  const { data: refreshed, error: refreshError } = await admin.rpc('fn_check_and_expire_assessment', {
    p_assessment_id: assessment.id,
  });

  if (refreshError || !refreshed) return { assessment: assessment as Assessment, tokenHash };

  const result = refreshed as Assessment;

  // The server-authoritative timer may have just auto-finalized this
  // attempt as a side effect of this lookup (e.g. a /state poll after
  // ends_at passed) — record it exactly like an explicit auto-submission.
  if (statusBefore === 'STARTED' && (result.status === 'PASSED' || result.status === 'FAILED')) {
    await writeAuditLog({
      actorType: 'system',
      action: AUDIT_ACTIONS.EXAM_SUBMITTED_AUTO,
      entityType: 'assessment',
      entityId: result.id,
      newValue: { score_percentage: result.score_percentage, status: result.status },
    });
    await writeAuditLog({
      actorType: 'system',
      action: result.status === 'PASSED' ? AUDIT_ACTIONS.EXAM_PASSED : AUDIT_ACTIONS.EXAM_FAILED,
      entityType: 'assessment',
      entityId: result.id,
      newValue: { score_percentage: result.score_percentage },
    });

    if (result.status === 'PASSED') {
      const { issueCertificateForAssessment } = await import('@/lib/certificate/issue');
      await issueCertificateForAssessment(result.id);
    }
  }

  return { assessment: result, tokenHash };
}

/** Build the candidate-safe view of every frozen question + any saved
 * answer, with correct_option_ids stripped out entirely before this ever
 * leaves the server. */
export async function getCandidateQuestionViews(assessmentId: string): Promise<CandidateQuestionView[]> {
  const admin = createSupabaseAdminClient();

  const { data: questions, error } = await admin
    .from('assessment_questions')
    .select('id, display_order, question_text_snapshot, scenario_text_snapshot, question_type_snapshot, marks_snapshot, option_order_snapshot')
    .eq('assessment_id', assessmentId)
    .order('display_order', { ascending: true });

  if (error || !questions) return [];

  const { data: answers } = await admin
    .from('answers')
    .select('assessment_question_id, selected_option_ids')
    .eq('assessment_id', assessmentId);

  const answerMap = new Map<string, string[]>();
  (answers ?? []).forEach((a) => answerMap.set(a.assessment_question_id, a.selected_option_ids as string[]));

  return questions.map((q) => ({
    assessment_question_id: q.id,
    display_order: q.display_order,
    question_text: q.question_text_snapshot,
    scenario_text: q.scenario_text_snapshot,
    question_type: q.question_type_snapshot,
    marks: q.marks_snapshot,
    options: q.option_order_snapshot as CandidateQuestionView['options'],
    selected_option_ids: answerMap.get(q.id) ?? [],
  }));
}
