import { ShieldCheck, HardHat, ClipboardCheck } from 'lucide-react';
import { COMPETENCY_THEME, DEFAULT_COMPETENCY_THEME } from '@/lib/constants';

const ICONS: Record<string, typeof ShieldCheck> = {
  LOA: ShieldCheck,
  SFT: HardHat,
  PTW: ClipboardCheck,
};

export function CompetencyBadge({ code, name }: { code: string; name?: string }) {
  const theme = COMPETENCY_THEME[code] ?? DEFAULT_COMPETENCY_THEME;
  const Icon = ICONS[code] ?? ShieldCheck;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: theme.bg, borderColor: theme.border, color: theme.color }}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {name ?? code}
    </span>
  );
}

export function CompetencyIcon({ code, className }: { code: string; className?: string }) {
  const theme = COMPETENCY_THEME[code] ?? DEFAULT_COMPETENCY_THEME;
  const Icon = ICONS[code] ?? ShieldCheck;
  return (
    <div
      className={`flex items-center justify-center rounded-xl ${className ?? 'h-10 w-10'}`}
      style={{ backgroundColor: theme.bg, color: theme.color }}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </div>
  );
}
