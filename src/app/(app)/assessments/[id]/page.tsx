import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { AssessmentDetail } from '@/components/assessments/assessment-detail';
import { getAssessmentDetail } from '@/lib/actions/assessments';
import { getQuestionSets } from '@/lib/actions/taxonomy';
import { requireUser } from '@/lib/auth/session';

export default async function AssessmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, assessment] = await Promise.all([requireUser(), getAssessmentDetail(id)]);

  if (!assessment) notFound();

  const questionSets = await getQuestionSets(assessment.competency_id as string);

  return (
    <div>
      <PageHeader
        title={assessment.assessment_code as string}
        description="Full lifecycle detail for this assessment attempt."
      />
      <AssessmentDetail assessment={assessment as never} questionSets={questionSets as never} role={user.role} />
    </div>
  );
}
