import { NextResponse, type NextRequest } from 'next/server';
import { lookupAssessmentByToken } from '@/lib/exam/lookup';
import { CANDIDATE_GENERIC_ERROR } from '@/lib/constants';

export const runtime = 'nodejs';

/** Link-level validity check only — no candidate-sensitive data returned,
 * and no Employee ID required. Lets the exam page show a branded
 * Invalid/Expired/Cancelled/Already-Completed screen immediately, before
 * asking anyone to identify themselves. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lookup = await lookupAssessmentByToken(token);

  if (!lookup) {
    return NextResponse.json({ ok: false, code: 'INVALID_LINK', message: CANDIDATE_GENERIC_ERROR }, { status: 404 });
  }

  const { assessment } = lookup;

  if (assessment.status === 'CANCELLED') {
    return NextResponse.json({ ok: false, code: 'CANCELLED', message: 'This assessment has been cancelled by the examiner.' }, { status: 410 });
  }
  if (assessment.status === 'EXPIRED') {
    return NextResponse.json({ ok: false, code: 'EXPIRED_LINK', message: 'This exam link has expired.' }, { status: 410 });
  }
  if (!['PENDING', 'STARTED'].includes(assessment.status)) {
    return NextResponse.json({ ok: false, code: 'ALREADY_COMPLETED', message: 'This assessment has already been completed.' }, { status: 410 });
  }

  return NextResponse.json({ ok: true, requires_verification: true });
}
