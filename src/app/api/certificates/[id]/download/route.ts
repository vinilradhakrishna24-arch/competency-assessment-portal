import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createCertificateDownloadUrl } from '@/lib/certificate/issue';
import { writeAuditLog, getClientIp, getUserAgent } from '@/lib/audit/log';
import { AUDIT_ACTIONS } from '@/lib/constants';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(); // admin or viewer — both may download; RLS also backs this at the row level
  const { id } = await params;

  const admin = createSupabaseAdminClient();
  const { data: certificate, error } = await admin.from('certificates').select('*').eq('id', id).maybeSingle();

  if (error || !certificate || !certificate.storage_path) {
    return NextResponse.json({ ok: false, message: 'Certificate not found.' }, { status: 404 });
  }

  const url = await createCertificateDownloadUrl(certificate.storage_path);
  if (!url) {
    return NextResponse.json({ ok: false, message: 'Unable to generate a download link.' }, { status: 500 });
  }

  await writeAuditLog({
    actorUserId: user.id,
    actorType: user.role,
    action: AUDIT_ACTIONS.CERTIFICATE_DOWNLOADED,
    entityType: 'certificate',
    entityId: certificate.id,
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  return NextResponse.json({ ok: true, url });
}
