import { PageHeader } from '@/components/ui/page-header';
import { CertificatesTable } from '@/components/certificates/certificates-table';
import { getCertificates } from '@/lib/actions/certificates';
import { getCompetencies } from '@/lib/actions/taxonomy';
import { requireUser } from '@/lib/auth/session';

export default async function CertificatesPage() {
  const [, certificates, competencies] = await Promise.all([
    requireUser(),
    getCertificates(),
    getCompetencies(),
  ]);

  return (
    <div>
      <PageHeader
        title="Certificates"
        description="Every certificate issued for a passed assessment, with QR-verified public proof."
      />
      <CertificatesTable initialCertificates={certificates as never} competencies={competencies} />
    </div>
  );
}
