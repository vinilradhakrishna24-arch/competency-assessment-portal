import { PageHeader } from '@/components/ui/page-header';
import { ReportsExplorer } from '@/components/reports/reports-explorer';
import { getReportRows, getReportFilterOptions } from '@/lib/actions/reports';
import { getCompetencies } from '@/lib/actions/taxonomy';
import { requireUser } from '@/lib/auth/session';

export default async function ReportsPage() {
  await requireUser();
  const [rows, competencies, filterOptions] = await Promise.all([
    getReportRows(),
    getCompetencies(),
    getReportFilterOptions(),
  ]);

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Filter assessment history across every competency and export it for offline analysis."
      />
      <ReportsExplorer initialRows={rows} competencies={competencies} filterOptions={filterOptions} />
    </div>
  );
}
