import Link from 'next/link';
import { UserPlus, FilePlus2, BookOpen, Users2, ArrowRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS, STATUS_BADGE_CLASSES } from '@/lib/constants';
import { formatDateTime } from '@/lib/utils';
import type { DashboardData } from '@/lib/dashboard';
import type { RoleName } from '@/types/database';

export function RecentActivityCard({ items }: { items: DashboardData['recentActivity'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No assessment activity yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">{item.candidateName}</p>
                  <p className="text-xs text-slate-400">
                    {item.competencyCode} &middot; {formatDateTime(item.at)}
                  </p>
                </div>
                <Badge className={STATUS_BADGE_CLASSES[item.status as keyof typeof STATUS_BADGE_CLASSES] ?? ''}>
                  {STATUS_LABELS[item.status as keyof typeof STATUS_LABELS] ?? item.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function UpcomingPendingCard({ items }: { items: DashboardData['upcomingPending'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming / Pending</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No pending assessments right now.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">{item.candidateName}</p>
                  <p className="text-xs text-slate-400">{item.competencyCode}</p>
                </div>
                <p className="shrink-0 text-xs text-amber-700">
                  {item.linkExpiresAt ? `Expires ${formatDateTime(item.linkExpiresAt)}` : 'No expiry set'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function QuickActionsCard({ role }: { role: RoleName }) {
  if (role !== 'admin') return null;

  const actions = [
    { href: '/create-assessment', label: 'Create Assessment', icon: FilePlus2 },
    { href: '/candidates', label: 'Add Candidate', icon: UserPlus },
    { href: '/questions', label: 'Question Bank', icon: BookOpen },
    { href: '/users', label: 'Manage Users', icon: Users2 },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="group flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3.5 py-3 text-sm font-medium text-slate-700 transition-colors hover:border-brand-navy-800 hover:bg-brand-navy-50 hover:text-brand-navy-900"
            >
              <span className="flex items-center gap-2.5">
                <a.icon className="h-4 w-4 text-slate-400 group-hover:text-brand-navy-800" aria-hidden="true" />
                {a.label}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-navy-800" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
