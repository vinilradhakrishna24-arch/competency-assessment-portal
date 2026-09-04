import { NextResponse, type NextRequest } from 'next/server';
import { requireVerifiedExam } from '@/lib/exam/guard';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { saveAnswerSchema } from '@/lib/validation/schemas';
import { writeAuditLog, getClientIp, getUserAgent } from '@/lib/audit/log';
import { AUDIT_ACTIONS } from '@/lib/constants';
import type { CandidateOption } from '@/types/database';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guard = await requireVerifiedExam(token, { allowStatuses: ['STARTED', 'PENDING'] });
  if (!guard.ok) {
    return NextResponse.json({ ok: false, code: guard.code, message: guard.message }, { status: guard.status });
  }

  if (guard.assessment.status !== 'STARTED') {
    return NextResponse.json(
      { ok: false, code: 'NOT_ACTIVE', message: 'This assessment is no longer in progress.', status: guard.assessment.status },
      { status: 409 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Invalid request.' }, { status: 400 });
  }

  const parsed = saveAnswerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Invalid answer payload.' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: aq, error: aqError } = await admin
    .from('assessment_questions')
    .select('id, option_order_snapshot')
    .eq('id', parsed.data.assessment_question_id)
    .eq('assessment_id', guard.assessment.id)
    .maybeSingle();

  if (aqError || !aq) {
    return NextResponse.json({ ok: false, code: 'NOT_FOUND', message: 'Question not found for this assessment.' }, { status: 404 });
  }

  const validOptionIds = new Set(
    (aq.option_order_snapshot as CandidateOption[]).map((o) => o.option_id)
  );
  const allValid = parsed.data.selected_option_ids.every((id) => validOptionIds.has(id));
  if (!allValid) {
    return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'One or more selected options are invalid.' }, { status: 400 });
  }

  const { data: saveResult, error: saveError } = await admin.rpc('fn_save_answer', {
    p_assessment_id: guard.assessment.id,
    p_assessment_question_id: parsed.data.assessment_question_id,
    p_selected_option_ids: parsed.data.selected_option_ids,
  });

  if (saveError || (saveResult as { error?: string })?.error) {
    await writeAuditLog({
      actorType: 'candidate',
      action: AUDIT_ACTIONS.ANSWER_SAVE_ERROR,
      entityType: 'assessment',
      entityId: guard.assessment.id,
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
      newValue: { error: saveError?.message ?? (saveResult as { error?: string })?.error },
    });
    const status = (saveResult as { error?: string })?.error === 'not_active' ? 409 : 500;
    return NextResponse.json({ ok: false, code: 'SAVE_FAILED', message: 'Could not save your answer. It will be retried automatically.' }, { status });
  }

  return NextResponse.json({ ok: true, saved_at: (saveResult as { saved_at: string }).saved_at });
}
