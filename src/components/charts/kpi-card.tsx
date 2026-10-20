import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
  trend,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: 'default' | 'navy' | 'emerald' | 'rose' | 'amber' | 'blue';
  /** Optional period-over-period delta, e.g. { delta: 3, label: 'vs last month' }.
   * `delta` of 0 renders as flat (neither up nor down) -- it is never
   * invented when there's no prior-period figure to compare against. */
  trend?: { delta: number; label: string };
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
      <div className="mt-3 flex items-baseline gap-2">
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
        {trend && (
          <span
            className={cn(
              'flex items-center gap-0.5 text-xs font-medium',
              trend.delta > 0 ? 'text-emerald-600' : trend.delta < 0 ? 'text-rose-600' : 'text-slate-400'
            )}
            title={trend.label}
          >
            {trend.delta > 0 ? (
              <ArrowUp className="h-3 w-3" aria-hidden="true" />
            ) : trend.delta < 0 ? (
              <ArrowDown className="h-3 w-3" aria-hidden="true" />
            ) : (
              <Minus className="h-3 w-3" aria-hidden="true" />
            )}
            {Math.abs(trend.delta)}
          </span>
        )}
      </div>
    </div>
  );
}
