import { PageHeader } from '@/components/ui/page-header';
import { QuestionsManager } from '@/components/questions/questions-manager';
import { getQuestions } from '@/lib/actions/questions';
import { getCompetencies, getQuestionSets } from '@/lib/actions/taxonomy';
import { requireUser } from '@/lib/auth/session';

export default async function QuestionsPage() {
  const [user, questions, competencies, questionSets] = await Promise.all([
    requireUser(),
    getQuestions(),
    getCompetencies(),
    getQuestionSets(),
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
        role={user.role}
      />
    </div>
  );
}
