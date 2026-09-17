import { PageHeader } from '@/components/ui/page-header';
import { CreateAssessmentForm } from '@/components/assessments/create-assessment-form';
import { getCompetencies, getQuestionSets, getActiveQuestionCounts } from '@/lib/actions/taxonomy';
import { getCandidates } from '@/lib/actions/candidates';
import { getDefaultPassMark, getTokenExpiryDefaultHours, getRandomizationDefaults } from '@/lib/settings';
import { requireManagerOrAdmin } from '@/lib/auth/session';

export default async function CreateAssessmentPage() {
  const currentUser = await requireManagerOrAdmin();

  const [competencies, questionSets, questionCounts, candidates, defaultPassMark, tokenExpiryHours, randomization] =
    await Promise.all([
      getCompetencies(),
      getQuestionSets(),
      getActiveQuestionCounts(),
      getCandidates(),
      getDefaultPassMark(),
      getTokenExpiryDefaultHours(),
      getRandomizationDefaults(),
    ]);

  // A manager-tier role (e.g. HSE Manager) only ever sees/creates within its
  // own stream_scope; full Admin has streamScope === null (unrestricted).
  const visibleCompetencies = currentUser.streamScope
    ? competencies.filter((c) => currentUser.streamScope!.includes(c.stream))
    : competencies;

  return (
    <div>
      <PageHeader
        title="Create Assessment"
        description="Generate a secure, one-time exam link for a candidate. Questions are frozen at the moment the link is created."
      />
      <CreateAssessmentForm
        competencies={visibleCompetencies}
        questionSets={questionSets as never}
        questionCounts={questionCounts}
        initialCandidates={candidates as never}
        defaultPassMark={defaultPassMark}
        tokenExpiryHours={tokenExpiryHours}
        defaultRandomizeOptions={randomization.randomize_options}
      />
    </div>
  );
}
