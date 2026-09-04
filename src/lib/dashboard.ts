import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface DashboardData {
  kpis: {
    total: number;
    totalCandidates: number;
    pending: number;
    inProgress: number;
    passed: number;
    failed: number;
    expired: number;
    passPercentage: number;
    loaCompetent: number;
    sftCompetent: number;
    ptwCompetent: number;
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

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createSupabaseServerClient();

  const [{ data: assessments }, { data: certificates }, { count: totalCandidates }] = await Promise.all([
    supabase
      .from('assessments')
      .select(
        'id, status, created_at, updated_at, link_expires_at, competency_id, competencies(code), candidates(full_name, project_contract, department)'
      )
      .order('created_at', { ascending: false })
      .limit(2000),
    supabase.from('certificates').select('id'),
    supabase.from('candidates').select('id', { count: 'exact', head: true }).is('deleted_at', null),
  ]);

  const rows = assessments ?? [];
  const decided = rows.filter((r) => r.status === 'PASSED' || r.status === 'FAILED').length;
  const passedCount = rows.filter((r) => r.status === 'PASSED').length;

  const kpis = {
    total: rows.length,
    totalCandidates: totalCandidates ?? 0,
    pending: rows.filter((r) => r.status === 'PENDING').length,
    inProgress: rows.filter((r) => r.status === 'STARTED').length,
    passed: passedCount,
    failed: rows.filter((r) => r.status === 'FAILED').length,
    expired: rows.filter((r) => r.status === 'EXPIRED').length,
    passPercentage: decided ? Math.round((passedCount / decided) * 100) : 0,
    loaCompetent: rows.filter((r) => r.status === 'PASSED' && (r.competencies as unknown as { code: string } | null)?.code === 'LOA').length,
    sftCompetent: rows.filter((r) => r.status === 'PASSED' && (r.competencies as unknown as { code: string } | null)?.code === 'SFT').length,
    ptwCompetent: rows.filter((r) => r.status === 'PASSED' && (r.competencies as unknown as { code: string } | null)?.code === 'PTW').length,
    certificatesIssued: certificates?.length ?? 0,
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

  const competencyDistribution = [
    { name: 'LOA', value: rows.filter((r) => (r.competencies as unknown as { code: string } | null)?.code === 'LOA').length },
    { name: 'SFT', value: rows.filter((r) => (r.competencies as unknown as { code: string } | null)?.code === 'SFT').length },
    { name: 'PTW', value: rows.filter((r) => (r.competencies as unknown as { code: string } | null)?.code === 'PTW').length },
  ];

  const codes = ['LOA', 'SFT', 'PTW'];
  const passRateByCompetency = codes.map((code) => {
    const forCode = rows.filter((r) => (r.competencies as unknown as { code: string } | null)?.code === code);
    const decided = forCode.filter((r) => r.status === 'PASSED' || r.status === 'FAILED');
    const passed = forCode.filter((r) => r.status === 'PASSED').length;
    return { name: code, passRate: decided.length ? Math.round((passed / decided.length) * 100) : 0 };
  });

  function groupBy(key: 'project_contract' | 'department') {
    const map = new Map<string, { competent: number; total: number }>();
    rows.forEach((r) => {
      const candidate = r.candidates as unknown as { project_contract: string | null; department: string | null } | null;
      const label = candidate?.[key] || 'Unassigned';
      const entry = map.get(label) ?? { competent: 0, total: 0 };
      entry.total += 1;
      if (r.status === 'PASSED') entry.competent += 1;
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
