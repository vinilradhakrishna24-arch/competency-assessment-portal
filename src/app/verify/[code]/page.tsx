import { ShieldCheck, ShieldX } from 'lucide-react';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getBranding } from '@/lib/branding';
import { maskEmployeeId, formatDate } from '@/lib/utils';
import { CompetencyBadge } from '@/components/competency/competency-badge';

export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [admin, branding] = await Promise.all([createSupabaseAdminClient(), getBranding()]);

  const { data: certificate } = await admin
    .from('certificates')
    .select('*, candidates(full_name, employee_id), competencies(code, competency_name), assessments(assessment_code, submitted_at)')
    .eq('verification_code', code)
    .maybeSingle();

  const isValid = !!certificate && !certificate.revoked;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div
            className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
              isValid ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
            }`}
          >
            {isValid ? <ShieldCheck className="h-7 w-7" /> : <ShieldX className="h-7 w-7" />}
          </div>
          <h1 className="text-lg font-semibold text-slate-900">
            {isValid ? 'Certificate Verified' : 'Certificate Not Valid'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{branding.portal_name}</p>
        </div>

        {isValid ? (
          <dl className="space-y-4 border-t border-slate-100 pt-5 text-sm">
            <Row label="Candidate Name" value={certificate.candidates.full_name} />
            <Row label="Employee ID" value={maskEmployeeId(certificate.candidates.employee_id)} />
            <Row
              label="Competency"
              value={<CompetencyBadge code={certificate.competencies.code} name={certificate.competencies.competency_name} />}
            />
            <Row label="Certificate Number" value={certificate.certificate_number} />
            <Row label="Assessment Date" value={formatDate(certificate.assessments?.submitted_at ?? certificate.issued_at)} />
            <Row label="Status" value={<span className="font-semibold text-emerald-700">VALID</span>} />
          </dl>
        ) : (
          <p className="border-t border-slate-100 pt-5 text-center text-sm text-slate-500">
            We could not verify a certificate for this code. It may not exist, or it may have been revoked. If you
            believe this is an error, please contact the issuing organization.
          </p>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  );
}
