import { PageHeader } from '@/components/ui/page-header';
import { AssessmentsTable } from '@/components/assessments/assessments-table';
import { getAssessments } from '@/lib/actions/assessments';
import { getCompetencies } from '@/lib/actions/taxonomy';
import { requireUser } from '@/lib/auth/session';

export default async function AssessmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; competencyId?: string }>;
}) {
  const params = await searchParams;
  const [user, assessments, competencies] = await Promise.all([
    requireUser(),
    getAssessments({ status: params.status, competencyId: params.competencyId }),
    getCompetencies(),
  ]);

  return (
    <div>
      <PageHeader
        title="Assessments"
        description="Every exam link ever generated — pending, in progress, and completed."
      />
      <AssessmentsTable
        initialAssessments={assessments as never}
        competencies={competencies}
        role={user.role}
        initialFilters={{ status: params.status ?? '', competencyId: params.competencyId ?? '' }}
      />
    </div>
  );
}
