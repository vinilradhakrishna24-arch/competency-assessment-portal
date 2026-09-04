'use server';

import { requireUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function getCertificates(filters?: { competencyId?: string; search?: string }) {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('certificates')
    .select(
      '*, candidates(full_name, employee_id, department), competencies(code, competency_name), assessments(assessment_code)'
    )
    .order('issued_at', { ascending: false });

  if (filters?.competencyId) query = query.eq('competency_id', filters.competencyId);

  const { data, error } = await query.limit(500);
  if (error) throw new Error(error.message);

  if (filters?.search) {
    const term = filters.search.trim().toLowerCase();
    if (term) {
      return (data ?? []).filter((c) => {
        const candidate = c.candidates as unknown as { full_name: string; employee_id: string } | null;
        return (
          c.certificate_number.toLowerCase().includes(term) ||
          candidate?.full_name.toLowerCase().includes(term) ||
          candidate?.employee_id.toLowerCase().includes(term)
        );
      });
    }
  }

  return data;
}
