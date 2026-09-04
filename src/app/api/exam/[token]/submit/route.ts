import { NextResponse, type NextRequest } from 'next/server';
import { requireVerifiedExam } from '@/lib/exam/guard';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { writeAuditLog, getClientIp, getUserAgent } from '@/lib/audit/log';
import { AUDIT_ACTIONS } from '@/lib/constants';
import { issueCertificateForAssessment } from '@/lib/certificate/issue';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Allow PASSED/FAILED through too so a retried/duplicate submit click
  // (double-click, multi-tab, network retry) is answered idempotently
  // instead of erroring.
  const guard = await requireVerifiedExam(token, { allowStatuses: ['STARTED', 'PASSED', 'FAILED'] });
  if (!guard.ok) {
    return NextResponse.json({ ok: false, code: guard.code, message: guard.message }, { status: guard.status });
  }

  const wasAlreadyFinal = guard.assessment.status === 'PASSED' || guard.assessment.status === 'FAILED';
  const admin = createSupabaseAdminClient();

  const { data: result, error } = await admin.rpc('fn_submit_assessment', {
    p_assessment_id: guard.assessment.id,
  });

  if (error || !result || (result as { error?: string }).error) {
    return NextResponse.json({ ok: false, code: 'SERVER_ERROR', message: 'Unable to submit the assessment.' }, { status: 500 });
  }

  const scored = result as {
    status: string;
    score_percentage: number;
    earned_marks: number;
    available_marks: number;
    pass_mark_used: number;
    passed: boolean;
  };

  // Only log a fresh submission event the first time this attempt is
  // actually finalized — not on every idempotent retry.
  if (!wasAlreadyFinal) {
    const ip = getClientIp(request);
    const userAgent = getUserAgent(request);
    await writeAuditLog({
      actorType: 'candidate',
      action: AUDIT_ACTIONS.EXAM_SUBMITTED_MANUAL,
      entityType: 'assessment',
      entityId: guard.assessment.id,
      ipAddress: ip,
      userAgent,
      newValue: { score_percentage: scored.score_percentage },
    });
    await writeAuditLog({
      actorType: 'candidate',
      action: scored.passed ? AUDIT_ACTIONS.EXAM_PASSED : AUDIT_ACTIONS.EXAM_FAILED,
      entityType: 'assessment',
      entityId: guard.assessment.id,
      ipAddress: ip,
      userAgent,
      newValue: { score_percentage: scored.score_percentage },
    });
  }

  if (scored.passed) {
    // Fire-and-forget is tempting, but we want the certificate to exist by
    // the time the candidate clicks "Download Certificate" a second later.
    await issueCertificateForAssessment(guard.assessment.id);
  }

  return NextResponse.json({
    ok: true,
    status: scored.status,
    score_percentage: scored.score_percentage,
    passed: scored.passed,
    pass_mark_used: scored.pass_mark_used,
    assessment_code: guard.assessment.assessment_code,
  });
}
