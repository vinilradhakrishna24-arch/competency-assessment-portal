import { NextResponse, type NextRequest } from 'next/server';
import { requireVerifiedExam } from '@/lib/exam/guard';
import { issueCertificateForAssessment, createCertificateDownloadUrl } from '@/lib/certificate/issue';
import { writeAuditLog, getClientIp, getUserAgent } from '@/lib/audit/log';
import { AUDIT_ACTIONS } from '@/lib/constants';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guard = await requireVerifiedExam(token, { allowStatuses: ['PASSED', 'FAILED'] });
  if (!guard.ok) {
    return NextResponse.json({ ok: false, code: guard.code, message: guard.message }, { status: guard.status });
  }

  if (guard.assessment.status !== 'PASSED') {
    return NextResponse.json(
      { ok: false, code: 'NOT_PASSED', message: 'A certificate is only available for a passed assessment.' },
      { status: 403 }
    );
  }

  const certificate = await issueCertificateForAssessment(guard.assessment.id);
  if (!certificate || !certificate.storage_path) {
    return NextResponse.json({ ok: false, code: 'SERVER_ERROR', message: 'Certificate is not ready yet. Please try again shortly.' }, { status: 503 });
  }

  const url = await createCertificateDownloadUrl(certificate.storage_path);
  if (!url) {
    return NextResponse.json({ ok: false, code: 'SERVER_ERROR', message: 'Unable to generate a download link.' }, { status: 500 });
  }

  await writeAuditLog({
    actorType: 'candidate',
    action: AUDIT_ACTIONS.CERTIFICATE_DOWNLOADED,
    entityType: 'certificate',
    entityId: certificate.id,
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  return NextResponse.json({ ok: true, url, certificate_number: certificate.certificate_number });
}
