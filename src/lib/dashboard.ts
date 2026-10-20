import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { CompetencyStream } from '@/types/database';

export interface DashboardData {
  kpis: {
    total: number;
    totalCandidates: number;
    pending: number;
    inProgress: number;
    passed: number;
    failed: number;
    awaitingApproval: number;
    expired: number;
    passPercentage: number;
    /** One entry per active competency in this stream, replacing the old
     * hardcoded LOA/SFT/PTW-only fields -- works for any stream, including
     * HSE's two (and counting) competencies. */
    competentByCompetency: { code: string; name: string; count: number }[];
    certificatesIssued: number;
  };
  byMonth: { month: string; count: number }[];
  passVsFail: { name: string; value: number }[];
  competencyDistribution: { name: string; value: number }[];
  passRateByCompetency: { name: string; passRate: number }[];
  projectWise: { name: string; competent: number; total: number }[];
  departmentWise: { name: string; competent: number; total: number }[];
  recentActivity: {
    id: string;
    candidateName: string;
    competencyCode: string;
    status: string;
    at: string;
  }[];
  upcomingPending: {
    id: string;
    candidateName: string;
    competencyCode: string;
    linkExpiresAt: string | null;
  }[];
}

/**
 * All dashboard aggregation (KPIs, trend/distribution charts, project- and
 * department-wise breakdowns, recent activity) is computed in a single
 * Postgres round trip by `fn_dashboard_data` (migration 0019), instead of
 * fetching up to 2,000 assessment rows plus the entire certificates table
 * and reducing them in JS on every request. `fn_dashboard_data` is a plain
 * (non-`security definer`) SQL function, so it runs with this request's own
 * authenticated role and every existing RLS policy (viewer_stream_scope()
 * etc., see migration 0012) applies to it exactly as it did to the old
 * direct `.select()` calls -- a stream-scoped viewer still can't see a
 * stream outside their scope.
 */
export async function getDashboardData(stream: CompetencyStream = 'technical'): Promise<DashboardData> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('fn_dashboard_data', { p_stream: stream });

  if (error) throw new Error(`fn_dashboard_data failed: ${error.message}`);

  return data as unknown as DashboardData;
}
