import { PageHeader } from '@/components/ui/page-header';
import { QuestionsManager } from '@/components/questions/questions-manager';
import { getQuestions } from '@/lib/actions/questions';
import { getCompetencies, getQuestionSets, getCompetencyAreas } from '@/lib/actions/taxonomy';
import { requireUser } from '@/lib/auth/session';
import type { CompetencyStream } from '@/types/database';

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ stream?: string }>;
}) {
  const params = await searchParams;
  const stream: CompetencyStream = params.stream === 'hse' ? 'hse' : 'technical';
  const [user, allQuestions, allCompetencies, allQuestionSets, allCompetencyAreas] = await Promise.all([
    requireUser(),
    getQuestions(),
    getCompetencies(),
    getQuestionSets(),
    getCompetencyAreas(),
  ]);

  const competencies = allCompetencies.filter((c) => c.stream === stream);
  const competencyIds = new Set(competencies.map((c) => c.id));
  const questions = allQuestions.filter((q) => competencyIds.has(q.competency_id));
  const questionSets = allQuestionSets.filter((s) => competencyIds.has(s.competency_id));
  const competencyAreas = allCompetencyAreas.filter((a) => competencyIds.has(a.competency_id));

  return (
    <div>
      <PageHeader
        title={stream === 'hse' ? 'HSE Question Bank' : 'Question Bank'}
        description="Manage questions across all competencies. Candidates never see correct answers or admin notes."
      />
      <QuestionsManager
        initialQuestions={questions as never}
        competencies={competencies}
        questionSets={questionSets as never}
        competencyAreas={competencyAreas as never}
        role={user.role}
        canManage={user.canManage}
      />
    </div>
  );
}
