import { PageHeader } from '@/components/ui/page-header';
import { AssessmentsTable } from '@/components/assessments/assessments-table';
import { getAssessments } from '@/lib/actions/assessments';
import { getCompetencies } from '@/lib/actions/taxonomy';
import { requireUser } from '@/lib/auth/session';
import type { CompetencyStream } from '@/types/database';

export default async function AssessmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; competencyId?: string; stream?: string }>;
}) {
  const params = await searchParams;
  const stream: CompetencyStream = params.stream === 'hse' ? 'hse' : 'technical';
  const [user, allCompetencies] = await Promise.all([requireUser(), getCompetencies()]);
  const competencies = allCompetencies.filter((c) => c.stream === stream);
  const assessments = await getAssessments({
    status: params.status,
    competencyId: params.competencyId,
    competencyIds: competencies.map((c) => c.id),
  });

  return (
    <div>
      <PageHeader
        title={stream === 'hse' ? 'HSE Assessments' : 'Assessments'}
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
