import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { generateCertificateNumber } from '@/lib/exam/identifiers';
import { generateVerificationCode } from '@/lib/exam/token';
import { generateCertificatePdfBuffer } from '@/lib/certificate/generate';
import { getBranding } from '@/lib/branding';
import { writeAuditLog } from '@/lib/audit/log';
import { AUDIT_ACTIONS } from '@/lib/constants';
import type { Certificate } from '@/types/database';

const CERTIFICATES_BUCKET = 'certificates';

/**
 * Idempotently issue the certificate for a PASSED assessment: create the DB
 * record (if not already present), render the PDF, upload it to the
 * private Storage bucket, and record the storage path. Safe to call
 * multiple times — a certificate is only ever generated once per
 * assessment (unique constraint on certificates.assessment_id).
 */
export async function issueCertificateForAssessment(assessmentId: string): Promise<Certificate | null> {
  const admin = createSupabaseAdminClient();

  const { data: assessment, error: assessmentError } = await admin
    .from('assessments')
    .select('*, candidates(*), competencies(code, competency_name)')
    .eq('id', assessmentId)
    .single();

  if (assessmentError || !assessment || assessment.status !== 'PASSED') return null;

  const competency = assessment.competencies as { code: string; competency_name: string };
  const candidate = assessment.candidates as {
    full_name: string;
    employee_id: string;
    designation: string | null;
    project_contract: string | null;
  };

  const certificateNumber = await generateCertificateNumber(competency.code);
  const verificationCode = generateVerificationCode();

  const { data: certRecord, error: certError } = await admin.rpc('fn_create_certificate_record', {
    p_assessment_id: assessmentId,
    p_certificate_number: certificateNumber,
    p_verification_code: verificationCode,
  });

  if (certError || !certRecord || (certRecord as { error?: string }).error) {
    console.error('[certificate] failed to create record', certError, certRecord);
    return null;
  }

  const certificate = certRecord as Certificate;

  // Already has a PDF on file (idempotent re-call) — nothing more to do.
  if (certificate.storage_path) return certificate;

  const branding = await getBranding();

  const pdfBuffer = await generateCertificatePdfBuffer({
    companyName: branding.company_name,
    logoDataUrl: branding.logo_url,
    candidateName: candidate.full_name,
    employeeId: candidate.employee_id,
    designation: candidate.designation,
    projectContract: candidate.project_contract,
    competencyName: competency.competency_name,
    competencyCode: competency.code,
    scorePercentage: certificate.score_percentage,
    assessmentDate: assessment.submitted_at ?? assessment.created_at,
    certificateNumber: certificate.certificate_number,
    footerText: branding.certificate_footer,
  });

  const storagePath = `${certificate.id}.pdf`;
  const { error: uploadError } = await admin.storage
    .from(CERTIFICATES_BUCKET)
    .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true });

  if (uploadError) {
    console.error('[certificate] failed to upload PDF', uploadError);
    return certificate;
  }

  const { data: updated } = await admin
    .from('certificates')
    .update({ storage_path: storagePath })
    .eq('id', certificate.id)
    .select('*')
    .single();

  await writeAuditLog({
    actorType: 'system',
    action: AUDIT_ACTIONS.CERTIFICATE_GENERATED,
    entityType: 'certificate',
    entityId: certificate.id,
    newValue: { certificate_number: certificate.certificate_number, assessment_id: assessmentId },
  });

  return (updated as Certificate) ?? certificate;
}

/** Mint a short-lived signed URL for downloading a certificate PDF from the
 * private bucket. Never returns the raw storage path to the caller. */
export async function createCertificateDownloadUrl(storagePath: string, expiresInSeconds = 300): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(CERTIFICATES_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}
