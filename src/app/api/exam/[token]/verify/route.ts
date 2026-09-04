import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { lookupAssessmentByToken } from '@/lib/exam/lookup';
import { signVerification, verificationCookieName } from '@/lib/exam/session-cookie';
import { verifyEmployeeIdSchema } from '@/lib/validation/schemas';
import { getVerificationRetrySettings } from '@/lib/settings';
import { writeAuditLog, getClientIp, getUserAgent } from '@/lib/audit/log';
import { AUDIT_ACTIONS, CANDIDATE_GENERIC_ERROR } from '@/lib/constants';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Invalid request.' }, { status: 400 });
  }

  const parsed = verifyEmployeeIdSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: CANDIDATE_GENERIC_ERROR }, { status: 400 });
  }

  const lookup = await lookupAssessmentByToken(token);
  if (!lookup) {
    await writeAuditLog({
      actorType: 'candidate',
      action: AUDIT_ACTIONS.CANDIDATE_VERIFICATION_FAILED,
      entityType: 'assessment',
      ipAddress: ip,
      userAgent,
      newValue: { reason: 'invalid_token' },
    });
    return NextResponse.json({ ok: false, code: 'INVALID_LINK', message: CANDIDATE_GENERIC_ERROR }, { status: 404 });
  }

  const { assessment, tokenHash } = lookup;
  const admin = createSupabaseAdminClient();

  if (assessment.status === 'CANCELLED') {
    return NextResponse.json({ ok: false, code: 'CANCELLED', message: 'This assessment has been cancelled by the examiner.' }, { status: 410 });
  }
  if (assessment.status === 'EXPIRED') {
    return NextResponse.json({ ok: false, code: 'EXPIRED_LINK', message: 'This exam link has expired.' }, { status: 410 });
  }
  if (!['PENDING', 'STARTED'].includes(assessment.status)) {
    return NextResponse.json({ ok: false, code: 'ALREADY_COMPLETED', message: 'This assessment has already been completed.' }, { status: 410 });
  }

  if (assessment.verification_locked_until && new Date(assessment.verification_locked_until) > new Date()) {
    return NextResponse.json(
      { ok: false, code: 'LOCKED', message: 'Too many failed attempts. Please try again later or contact your examiner.' },
      { status: 429 }
    );
  }

  const { data: candidate } = await admin
    .from('candidates')
    .select('employee_id')
    .eq('id', assessment.candidate_id)
    .single();

  const submittedId = parsed.data.employee_id.trim().toLowerCase();
  const actualId = (candidate?.employee_id ?? '').trim().toLowerCase();
  const match = candidate && submittedId === actualId;

  const retrySettings = await getVerificationRetrySettings();
  const { data: attemptResult } = await admin.rpc('fn_record_verification_attempt', {
    p_assessment_id: assessment.id,
    p_success: !!match,
    p_ip: ip,
    p_user_agent: userAgent,
    p_max_attempts: retrySettings.max_attempts,
    p_lock_minutes: retrySettings.lock_minutes,
  });

  if (!match) {
    await writeAuditLog({
      actorType: 'candidate',
      action: AUDIT_ACTIONS.CANDIDATE_VERIFICATION_FAILED,
      entityType: 'assessment',
      entityId: assessment.id,
      ipAddress: ip,
      userAgent,
    });

    const locked = (attemptResult as { locked?: boolean } | null)?.locked;
    if (locked) {
      return NextResponse.json(
        { ok: false, code: 'LOCKED', message: 'Too many failed attempts. Please try again later or contact your examiner.' },
        { status: 429 }
      );
    }
    return NextResponse.json({ ok: false, code: 'VERIFICATION_FAILED', message: CANDIDATE_GENERIC_ERROR }, { status: 401 });
  }

  await writeAuditLog({
    actorType: 'candidate',
    action: AUDIT_ACTIONS.CANDIDATE_VERIFICATION_SUCCESS,
    entityType: 'assessment',
    entityId: assessment.id,
    ipAddress: ip,
    userAgent,
  });

  const response = NextResponse.json({ ok: true });
  const signature = signVerification(assessment.id, tokenHash);
  const maxAgeSeconds = Math.max(
    60,
    Math.floor((new Date(assessment.link_expires_at).getTime() - Date.now()) / 1000)
  );

  response.cookies.set(verificationCookieName(assessment.id), signature, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  });

  return response;
}
