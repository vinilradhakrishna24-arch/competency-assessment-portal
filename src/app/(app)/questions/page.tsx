import { PageHeader } from '@/components/ui/page-header';
import { QuestionsManager } from '@/components/questions/questions-manager';
import { getQuestions } from '@/lib/actions/questions';
import { getCompetencies, getQuestionSets, getCompetencyAreas } from '@/lib/actions/taxonomy';
import { requireUser } from '@/lib/auth/session';

export default async function QuestionsPage() {
  const [user, questions, competencies, questionSets, competencyAreas] = await Promise.all([
    requireUser(),
    getQuestions(),
    getCompetencies(),
    getQuestionSets(),
    getCompetencyAreas(),
  ]);

  return (
    <div>
      <PageHeader
        title="Question Bank"
        description="Manage questions across all competencies. Candidates never see correct answers or admin notes."
      />
      <QuestionsManager
        initialQuestions={questions as never}
        competencies={competencies}
        questionSets={questionSets as never}
        competencyAreas={competencyAreas as never}
        role={user.role}
      />
    </div>
  );
}
