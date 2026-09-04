'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Copy, Check, Download, RotateCcw, Ban, Link2, ArrowLeft } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { FormField, Input, Select, Textarea } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { CompetencyBadge } from '@/components/competency/competency-badge';
import { QUICK_DURATIONS_MINUTES } from '@/lib/constants';
import { formatDateTime, formatDuration, formatScore } from '@/lib/utils';
import {
  cancelAssessment,
  authorizeReassessment,
  regenerateAssessmentLink,
} from '@/lib/actions/assessments';
import type { AssessmentStatus, RoleName } from '@/types/database';

interface AssessmentDetailRow {
  id: string;
  assessment_code: string;
  status: AssessmentStatus;
  question_source: 'specific_set' | 'random';
  question_set_id: string | null;
  num_questions: number;
  pass_mark: number;
  duration_minutes: number;
  randomize_options: boolean;
  link_expires_at: string;
  started_at: string | null;
  ends_at: string | null;
  submitted_at: string | null;
  score_percentage: number | null;
  earned_marks: number | null;
  available_marks: number | null;
  attempt_number: number;
  parent_assessment_id: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  created_at: string;
  competency_id: string;
  candidates: {
    id: string;
    full_name: string;
    employee_id: string;
    department: string | null;
    project_contract: string | null;
    email: string | null;
    mobile: string | null;
  } | null;
  competencies: { code: string; competency_name: string } | null;
  results: { pass_mark_used: number; passed: boolean }[] | { pass_mark_used: number; passed: boolean } | null;
  certificates: { id: string; certificate_number: string }[] | { id: string; certificate_number: string } | null;
}

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function firstOf<T>(value: T[] | T | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function AssessmentDetail({
  assessment,
  questionSets,
  role,
}: {
  assessment: AssessmentDetailRow;
  questionSets: { id: string; set_name: string }[];
  role: RoleName;
}) {
  const canEdit = role === 'admin';
  const certificate = firstOf(assessment.certificates);

  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState('');
  const [cancelling, setCancelling] = React.useState(false);

  const [reassessOpen, setReassessOpen] = React.useState(false);
  const [reassessing, setReassessing] = React.useState(false);
  const [reassessConfig, setReassessConfig] = React.useState(() => ({
    question_source: assessment.question_source,
    question_set_id: assessment.question_set_id ?? '',
    num_questions: assessment.num_questions,
    duration_minutes: assessment.duration_minutes,
    randomize_options: assessment.randomize_options,
    link_expires_at: toDatetimeLocalValue(new Date(Date.now() + 72 * 60 * 60 * 1000)),
  }));

  const [regenOpen, setRegenOpen] = React.useState(false);
  const [regenerating, setRegenerating] = React.useState(false);
  const [regenExpiresAt, setRegenExpiresAt] = React.useState(() =>
    toDatetimeLocalValue(new Date(Date.now() + 72 * 60 * 60 * 1000))
  );

  const [newLink, setNewLink] = React.useState<{ examLink: string; assessmentCode?: string } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [downloadingCert, setDownloadingCert] = React.useState(false);

  async function handleCopy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy — select and copy the link manually.');
    }
  }

  async function handleCancel() {
    setCancelling(true);
    const res = await cancelAssessment(assessment.id, cancelReason);
    setCancelling(false);
    if (!res.ok) {
      toast.error(res.error ?? 'Failed to cancel assessment');
      return;
    }
    toast.success('Assessment cancelled');
    setCancelOpen(false);
  }

  async function handleReassess() {
    setReassessing(true);
    const res = await authorizeReassessment(assessment.id, {
      duration_minutes: reassessConfig.duration_minutes,
      link_expires_at: new Date(reassessConfig.link_expires_at).toISOString(),
      num_questions: reassessConfig.num_questions,
      question_source: reassessConfig.question_source,
      question_set_id: reassessConfig.question_source === 'specific_set' ? reassessConfig.question_set_id : null,
      randomize_options: reassessConfig.randomize_options,
    });
    setReassessing(false);
    if (!res.ok) {
      toast.error(res.error ?? 'Failed to authorize reassessment');
      return;
    }
    setReassessOpen(false);
    setNewLink({ examLink: res.examLink!, assessmentCode: res.assessmentCode });
    toast.success('Reassessment authorized — new exam link ready.');
  }

  async function handleRegenerate() {
    setRegenerating(true);
    const res = await regenerateAssessmentLink(assessment.id, new Date(regenExpiresAt).toISOString());
    setRegenerating(false);
    if (!res.ok) {
      toast.error(res.error ?? 'Failed to regenerate link');
      return;
    }
    setRegenOpen(false);
    setNewLink({ examLink: res.examLink! });
    toast.success('New exam link generated.');
  }

  async function handleDownloadCertificate() {
    if (!certificate) return;
    setDownloadingCert(true);
    try {
      const res = await fetch(`/api/certificates/${certificate.id}/download`);
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.message ?? 'Failed to generate download link');
        return;
      }
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloadingCert(false);
    }
  }

  const isCancellable = !['PASSED', 'FAILED', 'CANCELLED'].includes(assessment.status);
  const canReassess = assessment.status === 'FAILED';
  const canRegenerateLink = ['PENDING', 'EXPIRED'].includes(assessment.status);

  return (
    <div className="space-y-6">
      <Button variant="outline" size="sm" asChild>
        <Link href="/assessments">
          <ArrowLeft className="h-4 w-4" /> Back to Assessments
        </Link>
      </Button>

      {newLink && (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-emerald-700" /> New Exam Link Ready
            </CardTitle>
            <CardDescription>
              {newLink.assessmentCode && (
                <>Assessment code <span className="font-mono font-semibold">{newLink.assessmentCode}</span>. </>
              )}
              Share this with the candidate — it is shown only once.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
              <code className="flex-1 overflow-x-auto whitespace-nowrap text-sm text-slate-700">{newLink.examLink}</code>
              <Button type="button" size="sm" variant="outline" onClick={() => handleCopy(newLink.examLink)}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>{assessment.candidates?.full_name ?? 'Unknown candidate'}</CardTitle>
                <CardDescription>
                  {assessment.candidates?.employee_id} · {assessment.candidates?.department || 'No department'}
                </CardDescription>
              </div>
              <StatusBadge status={assessment.status} />
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Competency</p>
                {assessment.competencies && <CompetencyBadge code={assessment.competencies.code} />}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Attempt</p>
                <p className="font-medium text-slate-900">#{assessment.attempt_number}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Questions</p>
                <p className="font-medium text-slate-900">{assessment.num_questions}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Pass Mark</p>
                <p className="font-medium text-slate-900">{assessment.pass_mark}%</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Duration</p>
                <p className="font-medium text-slate-900">{formatDuration(assessment.duration_minutes)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Question Source</p>
                <p className="font-medium text-slate-900">
                  {assessment.question_source === 'specific_set' ? 'Specific Set' : 'Random from Bank'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Created</p>
                <p className="font-medium text-slate-900">{formatDateTime(assessment.created_at)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Link Expires</p>
                <p className="font-medium text-slate-900">{formatDateTime(assessment.link_expires_at)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Started</p>
                <p className="font-medium text-slate-900">{formatDateTime(assessment.started_at)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Ends At</p>
                <p className="font-medium text-slate-900">{formatDateTime(assessment.ends_at)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Submitted</p>
                <p className="font-medium text-slate-900">{formatDateTime(assessment.submitted_at)}</p>
              </div>
              {assessment.cancelled_at && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Cancelled</p>
                  <p className="font-medium text-slate-900">{formatDateTime(assessment.cancelled_at)}</p>
                  {assessment.cancelled_reason && (
                    <p className="mt-0.5 text-xs text-slate-500">{assessment.cancelled_reason}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {(assessment.status === 'PASSED' || assessment.status === 'FAILED') && (
            <Card>
              <CardHeader>
                <CardTitle>Result</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Score</p>
                  <p className="text-lg font-semibold text-slate-900">{formatScore(assessment.score_percentage)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Marks</p>
                  <p className="font-medium text-slate-900">
                    {assessment.earned_marks ?? '—'} / {assessment.available_marks ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Outcome</p>
                  <StatusBadge status={assessment.status} />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {canEdit && (
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {canRegenerateLink && (
                  <Button variant="outline" className="w-full" onClick={() => setRegenOpen(true)}>
                    <Link2 className="h-4 w-4" /> Regenerate Exam Link
                  </Button>
                )}
                {canReassess && (
                  <Button className="w-full" onClick={() => setReassessOpen(true)}>
                    <RotateCcw className="h-4 w-4" /> Authorize Reassessment
                  </Button>
                )}
                {isCancellable && (
                  <Button variant="destructive" className="w-full" onClick={() => setCancelOpen(true)}>
                    <Ban className="h-4 w-4" /> Cancel Assessment
                  </Button>
                )}
                {!isCancellable && !canReassess && !canRegenerateLink && (
                  <p className="text-sm text-slate-400">No actions available for this status.</p>
                )}
              </CardContent>
            </Card>
          )}

          {certificate && (
            <Card>
              <CardHeader>
                <CardTitle>Certificate</CardTitle>
                <CardDescription className="font-mono text-xs">{certificate.certificate_number}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full" onClick={handleDownloadCertificate} disabled={downloadingCert}>
                  <Download className="h-4 w-4" /> {downloadingCert ? 'Preparing…' : 'Download Certificate'}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this assessment?"
        confirmLabel="Cancel Assessment"
        destructive
        loading={cancelling}
        onConfirm={handleCancel}
      >
        <FormField label="Reason" htmlFor="cancel_reason" hint="Recorded in the audit log.">
          <Textarea id="cancel_reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={2} />
        </FormField>
      </ConfirmDialog>

      <Dialog open={reassessOpen} onOpenChange={setReassessOpen} title="Authorize Reassessment" className="w-[min(32rem,92vw)]">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            The original failed attempt is preserved. A new attempt, token, timer, and question snapshot will be created.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Question Source" htmlFor="reassess_source" required>
              <Select
                id="reassess_source"
                value={reassessConfig.question_source}
                onChange={(e) =>
                  setReassessConfig((p) => ({ ...p, question_source: e.target.value as 'specific_set' | 'random' }))
                }
              >
                <option value="specific_set">Specific Question Set</option>
                <option value="random">Random from Competency Bank</option>
              </Select>
            </FormField>
            {reassessConfig.question_source === 'specific_set' && (
              <FormField label="Question Set" htmlFor="reassess_set" required>
                <Select
                  id="reassess_set"
                  value={reassessConfig.question_set_id}
                  onChange={(e) => setReassessConfig((p) => ({ ...p, question_set_id: e.target.value }))}
                >
                  <option value="">Select a set…</option>
                  {questionSets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.set_name}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
            <FormField label="Number of Questions" htmlFor="reassess_num" required>
              <Input
                id="reassess_num"
                type="number"
                min={1}
                value={reassessConfig.num_questions}
                onChange={(e) => setReassessConfig((p) => ({ ...p, num_questions: Number(e.target.value) }))}
              />
            </FormField>
            <FormField label="Duration" htmlFor="reassess_duration" required>
              <Select
                id="reassess_duration"
                value={reassessConfig.duration_minutes}
                onChange={(e) => setReassessConfig((p) => ({ ...p, duration_minutes: Number(e.target.value) }))}
              >
                {QUICK_DURATIONS_MINUTES.map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Link Expiry" htmlFor="reassess_expiry" required>
              <Input
                id="reassess_expiry"
                type="datetime-local"
                value={reassessConfig.link_expires_at}
                onChange={(e) => setReassessConfig((p) => ({ ...p, link_expires_at: e.target.value }))}
              />
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={reassessConfig.randomize_options}
              onChange={(e) => setReassessConfig((p) => ({ ...p, randomize_options: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300"
            />
            Randomize answer option order
          </label>
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={() => setReassessOpen(false)} disabled={reassessing}>
              Cancel
            </Button>
            <Button type="button" onClick={handleReassess} disabled={reassessing}>
              {reassessing ? 'Authorizing…' : 'Authorize & Generate Link'}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={regenOpen} onOpenChange={setRegenOpen} title="Regenerate Exam Link" className="w-[min(28rem,92vw)]">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            The previous link will stop working immediately. Frozen questions and any prior state are unaffected.
          </p>
          <FormField label="New Link Expiry" htmlFor="regen_expiry" required>
            <Input
              id="regen_expiry"
              type="datetime-local"
              value={regenExpiresAt}
              onChange={(e) => setRegenExpiresAt(e.target.value)}
            />
          </FormField>
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={() => setRegenOpen(false)} disabled={regenerating}>
              Cancel
            </Button>
            <Button type="button" onClick={handleRegenerate} disabled={regenerating}>
              {regenerating ? 'Generating…' : 'Regenerate Link'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
