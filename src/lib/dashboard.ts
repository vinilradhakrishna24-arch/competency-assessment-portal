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

export async function getDashboardData(stream: CompetencyStream = 'technical'): Promise<DashboardData> {
  const supabase = await createSupabaseServerClient();

  const [{ data: assessmentsRaw }, { data: certificates }, { count: totalCandidates }, { data: streamCompetencies }] =
    await Promise.all([
      supabase
        .from('assessments')
        .select(
          'id, status, created_at, updated_at, link_expires_at, competency_id, competencies(code, competency_name, stream), candidates(full_name, project_contract, department)'
        )
        .order('created_at', { ascending: false })
        .limit(2000),
      supabase.from('certificates').select('id, competency_id, competencies(stream)'),
      supabase.from('candidates').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('competencies').select('code, competency_name').eq('stream', stream).eq('active', true).order('code'),
    ]);

  // Row-level security already means an HSE-scoped viewer never gets a
  // technical row back here -- this stream filter is for an unrestricted
  // Admin/Viewer, who sees every stream, to pick one at a time.
  const rows = (assessmentsRaw ?? []).filter(
    (r) => (r.competencies as unknown as { stream: string } | null)?.stream === stream
  );
  const certificatesInStream = (certificates ?? []).filter(
    (c) => (c.competencies as unknown as { stream: string } | null)?.stream === stream
  );

  const passedCount = rows.filter((r) => r.status === 'PASSED' || r.status === 'CERTIFIED').length;
  const failedCount = rows.filter((r) => r.status === 'FAILED').length;
  const decided = passedCount + failedCount;

  const kpis = {
    total: rows.length,
    totalCandidates: totalCandidates ?? 0,
    pending: rows.filter((r) => r.status === 'PENDING').length,
    inProgress: rows.filter((r) => r.status === 'STARTED').length,
    passed: passedCount,
    failed: failedCount,
    awaitingApproval: rows.filter((r) => r.status === 'AWAITING_APPROVAL').length,
    expired: rows.filter((r) => r.status === 'EXPIRED').length,
    passPercentage: decided ? Math.round((passedCount / decided) * 100) : 0,
    competentByCompetency: (streamCompetencies ?? []).map((c) => ({
      code: c.code,
      name: c.competency_name,
      count: rows.filter(
        (r) =>
          (r.status === 'PASSED' || r.status === 'CERTIFIED') &&
          (r.competencies as unknown as { code: string } | null)?.code === c.code
      ).length,
    })),
    certificatesIssued: certificatesInStream.length,
  };

  const monthMap = new Map<string, number>();
  rows.forEach((r) => {
    const d = new Date(r.created_at);
    const key = d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
  });
  const byMonth = Array.from(monthMap.entries())
    .map(([month, count]) => ({ month, count }))
    .slice(-12);

  const passVsFail = [
    { name: 'Passed', value: kpis.passed },
    { name: 'Failed', value: kpis.failed },
  ];

  const codes = (streamCompetencies ?? []).map((c) => c.code);
  const competencyDistribution = codes.map((code) => ({
    name: code,
    value: rows.filter((r) => (r.competencies as unknown as { code: string } | null)?.code === code).length,
  }));

  const passRateByCompetency = codes.map((code) => {
    const forCode = rows.filter((r) => (r.competencies as unknown as { code: string } | null)?.code === code);
    const decided = forCode.filter((r) => r.status === 'PASSED' || r.status === 'FAILED' || r.status === 'CERTIFIED');
    const passed = forCode.filter((r) => r.status === 'PASSED' || r.status === 'CERTIFIED').length;
    return { name: code, passRate: decided.length ? Math.round((passed / decided.length) * 100) : 0 };
  });

  function groupBy(key: 'project_contract' | 'department') {
    const map = new Map<string, { competent: number; total: number }>();
    rows.forEach((r) => {
      const candidate = r.candidates as unknown as { project_contract: string | null; department: string | null } | null;
      const label = candidate?.[key] || 'Unassigned';
      const entry = map.get(label) ?? { competent: 0, total: 0 };
      entry.total += 1;
      if (r.status === 'PASSED' || r.status === 'CERTIFIED') entry.competent += 1;
      map.set(label, entry);
    });
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }

  const recentActivity = [...rows]
    .sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime())
    .slice(0, 8)
    .map((r) => ({
      id: r.id,
      candidateName: (r.candidates as unknown as { full_name: string } | null)?.full_name ?? 'Unknown candidate',
      competencyCode: (r.competencies as unknown as { code: string } | null)?.code ?? '—',
      status: r.status,
      at: r.updated_at ?? r.created_at,
    }));

  const upcomingPending = rows
    .filter((r) => r.status === 'PENDING')
    .sort((a, b) => new Date(a.link_expires_at).getTime() - new Date(b.link_expires_at).getTime())
    .slice(0, 6)
    .map((r) => ({
      id: r.id,
      candidateName: (r.candidates as unknown as { full_name: string } | null)?.full_name ?? 'Unknown candidate',
      competencyCode: (r.competencies as unknown as { code: string } | null)?.code ?? '—',
      linkExpiresAt: r.link_expires_at ?? null,
    }));

  return {
    kpis,
    byMonth,
    passVsFail,
    competencyDistribution,
    passRateByCompetency,
    projectWise: groupBy('project_contract'),
    departmentWise: groupBy('department'),
    recentActivity,
    upcomingPending,
  };
}
