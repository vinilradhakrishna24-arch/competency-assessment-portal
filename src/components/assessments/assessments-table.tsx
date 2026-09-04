'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardList, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { CompetencyBadge } from '@/components/competency/competency-badge';
import { ASSESSMENT_STATUSES, STATUS_LABELS } from '@/lib/constants';
import { formatDateTime, formatScore } from '@/lib/utils';
import { getAssessments } from '@/lib/actions/assessments';
import type { AssessmentStatus, Competency, RoleName } from '@/types/database';

interface AssessmentRow {
  id: string;
  assessment_code: string;
  status: AssessmentStatus;
  attempt_number: number;
  score_percentage: number | null;
  created_at: string;
  candidates: { full_name: string; employee_id: string; department: string | null } | null;
  competencies: { code: string; competency_name: string } | null;
}

export function AssessmentsTable({
  initialAssessments,
  competencies,
  role,
  initialFilters,
}: {
  initialAssessments: AssessmentRow[];
  competencies: Competency[];
  role: RoleName;
  initialFilters: { status: string; competencyId: string };
}) {
  const router = useRouter();
  const [assessments, setAssessments] = React.useState(initialAssessments);
  const [status, setStatus] = React.useState(initialFilters.status);
  const [competencyId, setCompetencyId] = React.useState(initialFilters.competencyId);

  async function applyFilters(nextStatus: string, nextCompetencyId: string) {
    const data = await getAssessments({
      status: nextStatus || undefined,
      competencyId: nextCompetencyId || undefined,
    });
    setAssessments(data as unknown as AssessmentRow[]);

    const params = new URLSearchParams();
    if (nextStatus) params.set('status', nextStatus);
    if (nextCompetencyId) params.set('competencyId', nextCompetencyId);
    router.replace(`/assessments${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Select
            className="w-auto"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              applyFilters(e.target.value, competencyId);
            }}
          >
            <option value="">All Statuses</option>
            {ASSESSMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          <Select
            className="w-auto"
            value={competencyId}
            onChange={(e) => {
              setCompetencyId(e.target.value);
              applyFilters(status, e.target.value);
            }}
          >
            <option value="">All Competencies</option>
            {competencies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </Select>
        </div>

        {role === 'admin' && (
          <Button asChild>
            <Link href="/create-assessment">
              <Plus className="h-4 w-4" /> Create Assessment
            </Link>
          </Button>
        )}
      </div>

      {assessments.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No assessments found"
          description="Adjust your filters, or create a new assessment to get started."
        />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Code</Th>
              <Th>Candidate</Th>
              <Th>Competency</Th>
              <Th>Attempt</Th>
              <Th>Score</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {assessments.map((a) => (
              <Tr key={a.id}>
                <Td className="font-mono text-xs text-slate-500">{a.assessment_code}</Td>
                <Td>
                  <p className="font-medium text-slate-900">{a.candidates?.full_name ?? '—'}</p>
                  <p className="text-xs text-slate-400">{a.candidates?.employee_id}</p>
                </Td>
                <Td>{a.competencies && <CompetencyBadge code={a.competencies.code} />}</Td>
                <Td className="text-slate-500">#{a.attempt_number}</Td>
                <Td className="text-slate-500">{formatScore(a.score_percentage)}</Td>
                <Td>
                  <StatusBadge status={a.status} />
                </Td>
                <Td className="text-slate-500">{formatDateTime(a.created_at)}</Td>
                <Td>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/assessments/${a.id}`}>View</Link>
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
