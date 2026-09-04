import { AlertTriangle, Clock, Ban, CheckCircle2, WifiOff, ServerCrash } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  INVALID_LINK: AlertTriangle,
  EXPIRED_LINK: Clock,
  CANCELLED: Ban,
  ALREADY_COMPLETED: CheckCircle2,
  LOCKED: Ban,
  CONNECTION_LOST: WifiOff,
  SERVER_ERROR: ServerCrash,
  DEFAULT: AlertTriangle,
};

const TITLES: Record<string, string> = {
  INVALID_LINK: 'Invalid Link',
  EXPIRED_LINK: 'Link Expired',
  CANCELLED: 'Assessment Cancelled',
  ALREADY_COMPLETED: 'Assessment Already Completed',
  LOCKED: 'Too Many Attempts',
  CONNECTION_LOST: 'Connection Lost',
  SERVER_ERROR: 'Server Temporarily Unavailable',
  DEFAULT: 'Something Went Wrong',
};

export function ExamErrorScreen({
  code,
  message,
  portalName,
}: {
  code?: string;
  message: string;
  portalName: string;
}) {
  const Icon = ICONS[code ?? 'DEFAULT'] ?? ICONS.DEFAULT!;
  const title = TITLES[code ?? 'DEFAULT'] ?? TITLES.DEFAULT!;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <Icon className="h-7 w-7" aria-hidden="true" />
        </div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{portalName}</p>
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">{message}</p>
      </div>
    </div>
  );
}
