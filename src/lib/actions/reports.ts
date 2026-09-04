'use server';

import { requireUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { AssessmentStatus } from '@/types/database';

export interface ReportFilters {
  dateFrom?: string;
  dateTo?: string;
  competencyId?: string;
  projectContract?: string;
  department?: string;
  candidateId?: string;
  designation?: string;
  result?: 'PASSED' | 'FAILED' | '';
  examinerId?: string;
}

export interface ReportRow {
  id: string;
  assessment_code: string;
  status: AssessmentStatus;
  score_percentage: number | null;
  pass_mark: number;
  attempt_number: number;
  created_at: string;
  submitted_at: string | null;
  candidates: {
    full_name: string;
    employee_id: string;
    designation: string | null;
    project_contract: string | null;
    department: string | null;
  } | null;
  competencies: { code: string; competency_name: string } | null;
  profiles: { full_name: string } | null;
}

export async function getReportRows(filters: ReportFilters = {}): Promise<ReportRow[]> {
  await requireUser();
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from('assessments')
    .select(
      '*, candidates(full_name, employee_id, designation, project_contract, department), competencies(code, competency_name), profiles(full_name)'
    )
    .order('created_at', { ascending: false });

  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo);
  if (filters.competencyId) query = query.eq('competency_id', filters.competencyId);
  if (filters.candidateId) query = query.eq('candidate_id', filters.candidateId);
  if (filters.result) query = query.eq('status', filters.result);
  if (filters.examinerId) query = query.eq('created_by', filters.examinerId);

  const { data, error } = await query.limit(2000);
  if (error) throw new Error(error.message);

  let rows = (data ?? []) as unknown as ReportRow[];

  if (filters.projectContract) {
    rows = rows.filter((r) => r.candidates?.project_contract === filters.projectContract);
  }
  if (filters.department) {
    rows = rows.filter((r) => r.candidates?.department === filters.department);
  }
  if (filters.designation) {
    rows = rows.filter((r) => r.candidates?.designation === filters.designation);
  }

  return rows;
}

export interface ReportFilterOptions {
  projects: string[];
  departments: string[];
  designations: string[];
}

export async function getReportFilterOptions(): Promise<ReportFilterOptions> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('candidates').select('project_contract, department, designation');

  const projects = Array.from(new Set((data ?? []).map((c) => c.project_contract).filter((v): v is string => !!v)));
  const departments = Array.from(new Set((data ?? []).map((c) => c.department).filter((v): v is string => !!v)));
  const designations = Array.from(new Set((data ?? []).map((c) => c.designation).filter((v): v is string => !!v)));

  return { projects, departments, designations };
}
