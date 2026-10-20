import {
  ClipboardList,
  Users,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  Timer,
  Award,
  ShieldCheck,
  ClipboardCheck,
  Percent,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { KpiCard } from '@/components/charts/kpi-card';
import {
  AssessmentOverviewCharts,
  CompetencyOverviewCharts,
  OrganizationalCompetencyCharts,
} from '@/components/charts/dashboard-charts';
import { RecentActivityCard, UpcomingPendingCard, QuickActionsCard } from '@/components/dashboard/dashboard-panels';
import { getDashboardData } from '@/lib/dashboard';
import { requireUser } from '@/lib/auth/session';
import type { CompetencyStream } from '@/types/database';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ stream?: string }>;
}) {
  const params = await searchParams;
  const stream: CompetencyStream = params.stream === 'hse' ? 'hse' : 'technical';
  const [user, data] = await Promise.all([requireUser(), getDashboardData(stream)]);

  // Mirrors Sidebar.canSeeStream -- null streamScope means this role is
  // unrestricted and can flip between both dashboards; a stream-scoped role
  // (e.g. HSE Manager) only ever has the one, so no switcher is shown.
  const canSeeStream = (s: CompetencyStream) => !user.streamScope || user.streamScope.includes(s);
  const streamOptions = [
    canSeeStream('technical') && { value: 'technical', label: 'Technical', href: '/dashboard?stream=technical' },
    canSeeStream('hse') && { value: 'hse', label: 'HSE', href: '/dashboard?stream=hse' },
  ].filter((v): v is { value: string; label: string; href: string } => Boolean(v));

  // Cheap, honest trend: this calendar month's assessment count vs last
  // month's, both already present in the aggregated byMonth series -- never
  // a fabricated delta for a KPI with no prior-period figure behind it.
  const months = data.byMonth;
  const thisMonth = months.at(-1)?.count ?? 0;
  const lastMonth = months.at(-2)?.count ?? 0;
  const totalTrend = months.length >= 2 ? { delta: thisMonth - lastMonth, label: 'vs last month' } : undefined;

  return (
    <div>
      <PageHeader
        title={stream === 'hse' ? 'HSE Dashboard' : 'Dashboard'}
        description={
          stream === 'hse'
            ? 'Overview of HSE Advisor and HSE Manager competency assessments.'
            : 'Overview of engineer competency assessments across LOA, SFT and PTW.'
        }
        actions={<SegmentedControl options={streamOptions} value={stream} />}
      />

      {/* Assessment Outcomes */}
      <div className="mb-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Total Candidates" value={data.kpis.totalCandidates} icon={Users} tone="navy" />
        <KpiCard label="Total Assessments" value={data.kpis.total} icon={ClipboardList} trend={totalTrend} />
        <KpiCard label="Pending" value={data.kpis.pending} icon={Clock} tone="amber" />
        <KpiCard label="In Progress" value={data.kpis.inProgress} icon={Loader2} tone="blue" />
        <KpiCard label="Passed" value={data.kpis.passed} icon={CheckCircle2} tone="emerald" />
        <KpiCard label="Failed" value={data.kpis.failed} icon={XCircle} tone="rose" />
      </div>

      {/* Competency-specific outcomes */}
      <div className="mb-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {stream === 'hse' && (
          <KpiCard label="Awaiting Approval" value={data.kpis.awaitingApproval} icon={ClipboardCheck} tone="amber" />
        )}
        <KpiCard label="Pass Percentage" value={`${data.kpis.passPercentage}%`} icon={Percent} tone="navy" />
        <KpiCard label="Expired" value={data.kpis.expired} icon={Timer} />
        {data.kpis.competentByCompetency.map((c) => (
          <KpiCard key={c.code} label={`${c.code} Competent`} value={c.count} icon={ShieldCheck} tone="emerald" />
        ))}
      </div>

      {/* Certificates */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Certificates Issued" value={data.kpis.certificatesIssued} icon={Award} tone="blue" />
      </div>

      <div className="flex flex-col gap-8">
        <AssessmentOverviewCharts data={data} />
        <CompetencyOverviewCharts data={data} stream={stream} />
        <OrganizationalCompetencyCharts data={data} />

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Operational Information</h2>
          <div className={`grid grid-cols-1 gap-5 ${user.role === 'admin' ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
            <RecentActivityCard items={data.recentActivity} />
            <UpcomingPendingCard items={data.upcomingPending} />
            <QuickActionsCard role={user.role} />
          </div>
        </section>
      </div>
    </div>
  );
}
