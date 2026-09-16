'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { CompetencyBadge } from '@/components/competency/competency-badge';
import { formatDateTime, formatScore } from '@/lib/utils';
import { getPendingApprovals, approveResult, rejectResult } from '@/lib/actions/approvals';

interface ApprovalRow {
  id: string;
  assessment_code: string;
  score_percentage: number | null;
  pass_mark: number;
  submitted_at: string | null;
  candidates: { full_name: string; employee_id: string; designation: string | null; project_contract: string | null } | null;
  competencies: { code: string; competency_name: string } | null;
}

export function ApprovalsTable({ initialRows }: { initialRows: ApprovalRow[] }) {
  const [rows, setRows] = React.useState(initialRows);
  const [decision, setDecision] = React.useState<{ row: ApprovalRow; action: 'approve' | 'reject' } | null>(null);
  const [comment, setComment] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function refresh() {
    const data = await getPendingApprovals();
    setRows(data as unknown as ApprovalRow[]);
  }

  function openDialog(row: ApprovalRow, action: 'approve' | 'reject') {
    setDecision({ row, action });
    setComment('');
  }

  async function handleConfirm() {
    if (!decision) return;
    setBusy(true);
    const fn = decision.action === 'approve' ? approveResult : rejectResult;
    const result = await fn(decision.row.id, comment);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? `Failed to ${decision.action} this result`);
      return;
    }
    toast.success(decision.action === 'approve' ? 'Result approved — certificate issued' : 'Result rejected');
    setDecision(null);
    refresh();
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Nothing awaiting approval"
        description="HSE assessments that require management sign-off before a certificate is issued will appear here."
      />
    );
  }

  return (
    <div>
      <Table>
        <Thead>
          <Tr>
            <Th>Candidate</Th>
            <Th>Competency</Th>
            <Th>Score</Th>
            <Th>Submitted</Th>
            <Th>Assessment</Th>
            <Th />
          </Tr>
        </Thead>
        <Tbody>
          {rows.map((r) => (
            <Tr key={r.id}>
              <Td className="font-medium text-slate-900">
                {r.candidates?.full_name ?? '—'}
                <span className="ml-1.5 font-normal text-slate-400">{r.candidates?.employee_id}</span>
              </Td>
              <Td>{r.competencies && <CompetencyBadge code={r.competencies.code} name={r.competencies.competency_name} />}</Td>
              <Td className="tabular-nums">
                {r.score_percentage !== null ? formatScore(r.score_percentage) : '—'}
                <span className="ml-1 text-xs text-slate-400">(pass {r.pass_mark}%)</span>
              </Td>
              <Td className="text-slate-500">{r.submitted_at ? formatDateTime(r.submitted_at) : '—'}</Td>
              <Td className="text-slate-500">{r.assessment_code}</Td>
              <Td>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => openDialog(r, 'approve')}>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Approve
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openDialog(r, 'reject')}>
                    <XCircle className="h-3.5 w-3.5 text-rose-500" /> Reject
                  </Button>
                </div>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>

      <Dialog
        open={!!decision}
        onOpenChange={(open) => !open && setDecision(null)}
        title={decision?.action === 'approve' ? 'Approve this result?' : 'Reject this result?'}
        className="w-[min(28rem,92vw)]"
      >
        {decision && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {decision.action === 'approve' ? (
                <>
                  <strong>{decision.row.candidates?.full_name}</strong> will be marked Certified and their certificate
                  will be issued for <strong>{decision.row.competencies?.competency_name}</strong>.
                </>
              ) : (
                <>
                  <strong>{decision.row.candidates?.full_name}</strong>&apos;s result will be marked Failed. This routes
                  through the normal reassessment-authorization flow.
                </>
              )}
            </p>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optional comment for the audit trail"
              rows={3}
            />
            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <Button type="button" variant="outline" onClick={() => setDecision(null)} disabled={busy}>
                Cancel
              </Button>
              <Button type="button" onClick={handleConfirm} disabled={busy}>
                {busy ? 'Saving…' : decision.action === 'approve' ? 'Approve & Issue Certificate' : 'Reject'}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
