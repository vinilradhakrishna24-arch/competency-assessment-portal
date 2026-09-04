import { NextResponse, type NextRequest } from 'next/server';
import { requireVerifiedExam } from '@/lib/exam/guard';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getCandidateQuestionViews } from '@/lib/exam/lookup';
import { writeAuditLog, getClientIp, getUserAgent } from '@/lib/audit/log';
import { AUDIT_ACTIONS } from '@/lib/constants';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guard = await requireVerifiedExam(token, { allowStatuses: ['PENDING', 'STARTED'] });
  if (!guard.ok) {
    return NextResponse.json({ ok: false, code: guard.code, message: guard.message }, { status: guard.status });
  }

  const admin = createSupabaseAdminClient();
  // Atomic: only transitions PENDING -> STARTED exactly once, regardless of
  // double-clicks, multiple tabs, or retried requests (see fn_start_assessment).
  const { data: result, error } = await admin.rpc('fn_start_assessment', {
    p_assessment_id: guard.assessment.id,
  });

  if (error || !result) {
    return NextResponse.json({ ok: false, code: 'SERVER_ERROR', message: 'Unable to start the assessment.' }, { status: 500 });
  }

  const updated = result as { status: string; started_at: string; ends_at: string };

  if (updated.status === 'EXPIRED') {
    return NextResponse.json({ ok: false, code: 'EXPIRED_LINK', message: 'This exam link has expired.' }, { status: 410 });
  }

  await writeAuditLog({
    actorType: 'candidate',
    action: AUDIT_ACTIONS.EXAM_STARTED,
    entityType: 'assessment',
    entityId: guard.assessment.id,
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
    newValue: { started_at: updated.started_at, ends_at: updated.ends_at },
  });

  const questions = await getCandidateQuestionViews(guard.assessment.id);

  return NextResponse.json({
    ok: true,
    server_time: new Date().toISOString(),
    started_at: updated.started_at,
    ends_at: updated.ends_at,
    questions,
  });
}
