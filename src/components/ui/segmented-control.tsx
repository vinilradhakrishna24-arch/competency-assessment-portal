import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface SegmentedControlOption {
  value: string;
  label: string;
  href: string;
}

/** Link-based segmented control (not client-side state) so each option is a
 * real navigable URL -- used to move the stream switcher (Technical/HSE)
 * out of duplicated sidebar nav rows and into the page header itself, per
 * docs/ui-performance-audit.md section 9. Renders nothing for a single
 * option, since a stream-scoped role never needs to choose. */
export function SegmentedControl({ options, value }: { options: SegmentedControlOption[]; value: string }) {
  if (options.length <= 1) return null;

  return (
    <div
      role="tablist"
      className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Link
            key={opt.value}
            href={opt.href}
            role="tab"
            aria-selected={active}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              active ? 'bg-white text-brand-navy-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            )}
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}
