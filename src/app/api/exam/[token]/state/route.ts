import { NextResponse, type NextRequest } from 'next/server';
import { requireVerifiedExam } from '@/lib/exam/guard';
import { getCandidateQuestionViews } from '@/lib/exam/lookup';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getBranding } from '@/lib/branding';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guard = await requireVerifiedExam(token, { allowStatuses: ['PENDING', 'STARTED', 'PASSED', 'FAILED'] });
  if (!guard.ok) {
    return NextResponse.json({ ok: false, code: guard.code, message: guard.message }, { status: guard.status });
  }

  const { assessment } = guard;
  const admin = createSupabaseAdminClient();
  const branding = await getBranding();

  const [{ data: candidate }, { data: competency }] = await Promise.all([
    admin
      .from('candidates')
      .select('full_name, employee_id, designation, project_contract, department')
      .eq('id', assessment.candidate_id)
      .single(),
    admin.from('competencies').select('code, competency_name').eq('id', assessment.competency_id).single(),
  ]);

  const base = {
    ok: true as const,
    server_time: new Date().toISOString(),
    portal_name: branding.portal_name,
    assessment: {
      id: assessment.id,
      assessment_code: assessment.assessment_code,
      status: assessment.status,
      num_questions: assessment.num_questions,
      duration_minutes: assessment.duration_minutes,
      pass_mark: assessment.pass_mark,
      started_at: assessment.started_at,
      ends_at: assessment.ends_at,
      link_expires_at: assessment.link_expires_at,
      score_percentage: ['PASSED', 'FAILED'].includes(assessment.status) ? assessment.score_percentage : null,
    },
    candidate,
    competency,
  };

  if (assessment.status === 'STARTED') {
    const questions = await getCandidateQuestionViews(assessment.id);
    return NextResponse.json({ ...base, questions });
  }

  return NextResponse.json(base);
}
