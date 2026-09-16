'use client';

import * as React from 'react';
import { CheckCircle2, XCircle, Download, Loader2, Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatScore } from '@/lib/utils';

type ResultStatus = 'PASSED' | 'FAILED' | 'AWAITING_APPROVAL' | 'CERTIFIED';

export function ResultScreen({
  status,
  scorePercentage,
  competencyCode,
  competencyName,
  assessmentCode,
  portalName,
  onDownloadCertificate,
}: {
  status: ResultStatus;
  scorePercentage: number;
  competencyCode: string;
  competencyName: string;
  assessmentCode: string;
  portalName: string;
  onDownloadCertificate: () => Promise<{ ok: boolean; url?: string; message?: string }>;
}) {
  const [downloading, setDownloading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);

  async function handleDownload() {
    setDownloading(true);
    setDownloadError(null);
    const result = await onDownloadCertificate();
    setDownloading(false);
    if (!result.ok || !result.url) {
      setDownloadError(result.message ?? 'Unable to download the certificate right now.');
      return;
    }
    window.location.href = result.url;
  }

  // A HSE competency with requires_result_approval routes a passing score to
  // AWAITING_APPROVAL (pending manual sign-off) then CERTIFIED (approved) --
  // a technical assessment goes straight PASSED -> download, and never sees
  // either of the other two states.
  const isUnderReview = status === 'AWAITING_APPROVAL';
  const canDownload = status === 'PASSED' || status === 'CERTIFIED';
  const failed = status === 'FAILED';

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{portalName}</p>
        <div
          className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
            failed
              ? 'bg-rose-50 text-rose-700'
              : isUnderReview
                ? 'bg-amber-50 text-amber-700'
                : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {failed ? (
            <XCircle className="h-8 w-8" />
          ) : isUnderReview ? (
            <Clock3 className="h-8 w-8" />
          ) : (
            <CheckCircle2 className="h-8 w-8" />
          )}
        </div>

        <h1 className="text-lg font-semibold text-slate-900">ASSESSMENT COMPLETED</h1>
        <p className="mt-3 text-5xl font-bold tabular-nums text-slate-900">{formatScore(scorePercentage)}</p>
        <p
          className={`mt-2 text-lg font-semibold ${
            failed ? 'text-rose-700' : isUnderReview ? 'text-amber-700' : 'text-emerald-700'
          }`}
        >
          {failed ? 'NOT YET COMPETENT' : isUnderReview ? 'UNDER REVIEW' : 'PASS'}
        </p>

        {isUnderReview ? (
          <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            Your result has been submitted for management approval. Your certificate will be available here once
            it is approved.
          </div>
        ) : canDownload ? (
          <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            COMPETENCY STATUS: COMPETENT FOR {competencyName.toUpperCase()} ({competencyCode})
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">Reassessment requires Examiner authorization.</p>
        )}

        <p className="mt-4 text-xs text-slate-400">Assessment ID: {assessmentCode}</p>

        {canDownload && (
          <div className="mt-6">
            <Button size="lg" className="w-full" onClick={handleDownload} disabled={downloading}>
              {downloading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Preparing certificate…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" /> DOWNLOAD CERTIFICATE
                </>
              )}
            </Button>
            {downloadError && <p className="mt-2 text-sm text-rose-600">{downloadError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
