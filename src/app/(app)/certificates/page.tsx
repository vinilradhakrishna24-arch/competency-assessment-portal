import { PageHeader } from '@/components/ui/page-header';
import { CertificatesTable } from '@/components/certificates/certificates-table';
import { getCertificates } from '@/lib/actions/certificates';
import { getCompetencies } from '@/lib/actions/taxonomy';
import { requireUser } from '@/lib/auth/session';
import type { CompetencyStream } from '@/types/database';

export default async function CertificatesPage({
  searchParams,
}: {
  searchParams: Promise<{ stream?: string }>;
}) {
  const params = await searchParams;
  const stream: CompetencyStream = params.stream === 'hse' ? 'hse' : 'technical';
  const [, allCompetencies] = await Promise.all([requireUser(), getCompetencies()]);
  const competencies = allCompetencies.filter((c) => c.stream === stream);
  const certificates = await getCertificates({ competencyIds: competencies.map((c) => c.id) });

  return (
    <div>
      <PageHeader
        title={stream === 'hse' ? 'HSE Certificates' : 'Certificates'}
        description="Every certificate issued for a passed assessment, with QR-verified public proof."
      />
      <CertificatesTable initialCertificates={certificates as never} competencies={competencies} />
    </div>
  );
}
