import { PageHeader } from '@/components/ui/page-header';
import { CreateAssessmentForm } from '@/components/assessments/create-assessment-form';
import { getCompetencies, getQuestionSets } from '@/lib/actions/taxonomy';
import { getCandidates } from '@/lib/actions/candidates';
import { getDefaultPassMark, getTokenExpiryDefaultHours, getRandomizationDefaults } from '@/lib/settings';
import { requireAdmin } from '@/lib/auth/session';

export default async function CreateAssessmentPage() {
  await requireAdmin();

  const [competencies, questionSets, candidates, defaultPassMark, tokenExpiryHours, randomization] =
    await Promise.all([
      getCompetencies(),
      getQuestionSets(),
      getCandidates(),
      getDefaultPassMark(),
      getTokenExpiryDefaultHours(),
      getRandomizationDefaults(),
    ]);

  return (
    <div>
      <PageHeader
        title="Create Assessment"
        description="Generate a secure, one-time exam link for a candidate. Questions are frozen at the moment the link is created."
      />
      <CreateAssessmentForm
        competencies={competencies}
        questionSets={questionSets as never}
        initialCandidates={candidates as never}
        defaultPassMark={defaultPassMark}
        tokenExpiryHours={tokenExpiryHours}
        defaultRandomizeOptions={randomization.randomize_options}
      />
    </div>
  );
}
