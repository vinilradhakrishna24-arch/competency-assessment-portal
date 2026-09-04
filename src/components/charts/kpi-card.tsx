import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: 'default' | 'navy' | 'emerald' | 'rose' | 'amber' | 'blue';
}) {
  const toneClasses: Record<string, string> = {
    default: 'bg-slate-50 text-slate-700',
    navy: 'bg-brand-navy-50 text-brand-navy-900',
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', toneClasses[tone])}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-3 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
