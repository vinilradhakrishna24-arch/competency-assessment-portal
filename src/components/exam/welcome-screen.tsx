'use client';

import { ShieldCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CompetencyBadge } from '@/components/competency/competency-badge';
import { formatDuration, formatDateTime } from '@/lib/utils';

export interface WelcomeInfo {
  portalName: string;
  logoUrl: string | null;
  candidateName: string;
  employeeId: string;
  designation: string | null;
  projectContract: string | null;
  competencyCode: string;
  competencyName: string;
  numQuestions: number;
  durationMinutes: number;
  passMark: number;
  linkExpiresAt: string;
  resuming: boolean;
}

export function WelcomeScreen({
  info,
  onStart,
  starting,
}: {
  info: WelcomeInfo;
  onStart: () => void;
  starting: boolean;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {info.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={info.logoUrl} alt="" className="mb-3 h-12 w-12 rounded-xl object-contain" />
          ) : (
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-navy-900 text-white">
              <ShieldCheck className="h-6 w-6" />
            </div>
          )}
          <h1 className="text-base font-semibold text-slate-900">{info.portalName}</h1>
          <CompetencyBadge code={info.competencyCode} name={info.competencyName} />
        </div>

        {info.resuming && (
          <p className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-center text-sm font-medium text-blue-700">
            Session restored. Your saved answers have been recovered.
          </p>
        )}

        <dl className="mb-6 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-slate-50 p-4 text-sm">
          <Field label="Candidate Name" value={info.candidateName} />
          <Field label="Employee ID" value={info.employeeId} />
          <Field label="Designation" value={info.designation ?? '—'} />
          <Field label="Project / Contract" value={info.projectContract ?? '—'} />
          <Field label="Number of Questions" value={String(info.numQuestions)} />
          <Field label="Duration" value={formatDuration(info.durationMinutes)} />
          <Field label="Pass Mark" value={`${info.passMark}%`} />
          <Field label="Link Expiry" value={formatDateTime(info.linkExpiresAt)} />
        </dl>

        <div className="mb-6 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
          <p className="font-semibold">Before you begin:</p>
          <ul className="list-inside list-disc space-y-1">
            <li>Once started, the timer cannot be paused.</li>
            <li>Closing the browser does not stop the timer.</li>
            <li>You may reopen this same link and continue with your remaining time.</li>
            <li>Your answers are automatically saved as you go.</li>
            <li>The assessment submits automatically when time reaches zero.</li>
            <li>Correct answers will not be displayed after submission.</li>
          </ul>
        </div>

        <Button className="w-full" size="lg" onClick={onStart} disabled={starting}>
          {starting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Starting…
            </>
          ) : (
            'START ASSESSMENT'
          )}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-800">{value}</dd>
    </div>
  );
}
