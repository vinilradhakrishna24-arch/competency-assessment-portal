import { PageHeader } from '@/components/ui/page-header';
import { ReportsExplorer } from '@/components/reports/reports-explorer';
import { getReportRows, getReportFilterOptions } from '@/lib/actions/reports';
import { getCompetencies } from '@/lib/actions/taxonomy';
import { requireUser } from '@/lib/auth/session';
import type { CompetencyStream } from '@/types/database';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ stream?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const stream: CompetencyStream = params.stream === 'hse' ? 'hse' : 'technical';
  const allCompetencies = await getCompetencies();
  const competencies = allCompetencies.filter((c) => c.stream === stream);
  const [rows, filterOptions] = await Promise.all([
    getReportRows({ competencyIds: competencies.map((c) => c.id) }),
    getReportFilterOptions(),
  ]);

  return (
    <div>
      <PageHeader
        title={stream === 'hse' ? 'HSE Reports' : 'Reports'}
        description="Filter assessment history across every competency and export it for offline analysis."
      />
      <ReportsExplorer initialRows={rows} competencies={competencies} filterOptions={filterOptions} />
    </div>
  );
}
