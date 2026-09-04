import 'server-only';
import { cookies } from 'next/headers';
import { lookupAssessmentByToken } from '@/lib/exam/lookup';
import { verifyVerificationCookie, verificationCookieName } from '@/lib/exam/session-cookie';
import type { Assessment } from '@/types/database';

export type ExamGuardError =
  | 'INVALID_LINK'
  | 'EXPIRED_LINK'
  | 'CANCELLED'
  | 'ALREADY_COMPLETED'
  | 'NOT_VERIFIED';

export interface ExamGuardResult {
  ok: true;
  assessment: Assessment;
  tokenHash: string;
}
export interface ExamGuardFailure {
  ok: false;
  code: ExamGuardError;
  status: number;
  message: string;
}

const MESSAGES: Record<ExamGuardError, { status: number; message: string }> = {
  INVALID_LINK: { status: 404, message: 'This exam link is not valid.' },
  EXPIRED_LINK: { status: 410, message: 'This exam link has expired.' },
  CANCELLED: { status: 410, message: 'This assessment has been cancelled by the examiner.' },
  ALREADY_COMPLETED: { status: 410, message: 'This assessment has already been completed.' },
  NOT_VERIFIED: { status: 401, message: 'Please verify your Employee ID again to continue.' },
};

/** Shared authorization gate for every candidate exam API route beyond
 * /verify: the token must resolve to a live assessment, and the caller
 * must already hold the signed "verified" cookie issued by /verify for
 * this exact assessment + token. Requiring both means the exam token
 * alone is never sufficient to read/write exam data — the same explicit
 * identity check applies on every request, not just the first page load. */
export async function requireVerifiedExam(
  rawToken: string,
  options?: { allowStatuses?: Assessment['status'][] }
): Promise<ExamGuardResult | ExamGuardFailure> {
  const lookup = await lookupAssessmentByToken(rawToken);
  if (!lookup) return { ok: false, code: 'INVALID_LINK', ...MESSAGES.INVALID_LINK };

  const { assessment, tokenHash } = lookup;

  if (assessment.status === 'CANCELLED') return { ok: false, code: 'CANCELLED', ...MESSAGES.CANCELLED };
  if (assessment.status === 'EXPIRED') return { ok: false, code: 'EXPIRED_LINK', ...MESSAGES.EXPIRED_LINK };

  const allowed = options?.allowStatuses ?? ['PENDING', 'STARTED'];
  if (!allowed.includes(assessment.status)) {
    return { ok: false, code: 'ALREADY_COMPLETED', ...MESSAGES.ALREADY_COMPLETED };
  }

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(verificationCookieName(assessment.id))?.value;
  if (!verifyVerificationCookie(cookieValue, assessment.id, tokenHash)) {
    return { ok: false, code: 'NOT_VERIFIED', ...MESSAGES.NOT_VERIFIED };
  }

  return { ok: true, assessment, tokenHash };
}
