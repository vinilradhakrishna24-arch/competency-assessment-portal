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
import { KpiCard } from '@/components/charts/kpi-card';
import { DashboardCharts } from '@/components/charts/dashboard-charts';
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

  return (
    <div>
      <PageHeader
        title={stream === 'hse' ? 'HSE Dashboard' : 'Dashboard'}
        description={
          stream === 'hse'
            ? 'Overview of HSE Advisor and HSE Manager competency assessments.'
            : 'Overview of engineer competency assessments across LOA, SFT and PTW.'
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Total Candidates" value={data.kpis.totalCandidates} icon={Users} tone="navy" />
        <KpiCard label="Total Assessments" value={data.kpis.total} icon={ClipboardList} />
        <KpiCard label="Pending" value={data.kpis.pending} icon={Clock} tone="amber" />
        <KpiCard label="In Progress" value={data.kpis.inProgress} icon={Loader2} tone="blue" />
        <KpiCard label="Passed" value={data.kpis.passed} icon={CheckCircle2} tone="emerald" />
        <KpiCard label="Failed" value={data.kpis.failed} icon={XCircle} tone="rose" />
        {stream === 'hse' && (
          <KpiCard label="Awaiting Approval" value={data.kpis.awaitingApproval} icon={ClipboardCheck} tone="amber" />
        )}
        <KpiCard label="Pass Percentage" value={`${data.kpis.passPercentage}%`} icon={Percent} tone="navy" />
        <KpiCard label="Expired" value={data.kpis.expired} icon={Timer} />
        {data.kpis.competentByCompetency.map((c) => (
          <KpiCard key={c.code} label={`${c.code} Competent`} value={c.count} icon={ShieldCheck} tone="emerald" />
        ))}
        <KpiCard label="Certificates Issued" value={data.kpis.certificatesIssued} icon={Award} tone="blue" />
      </div>

      <DashboardCharts data={data} />

      <div className={`mt-6 grid grid-cols-1 gap-5 ${user.role === 'admin' ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
        <RecentActivityCard items={data.recentActivity} />
        <UpcomingPendingCard items={data.upcomingPending} />
        <QuickActionsCard role={user.role} />
      </div>
    </div>
  );
}
