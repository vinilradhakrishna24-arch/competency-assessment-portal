'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Search, Download, ShieldCheck, ExternalLink } from 'lucide-react';
import { Input, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { CompetencyBadge } from '@/components/competency/competency-badge';
import { formatDateTime, formatScore } from '@/lib/utils';
import { getCertificates } from '@/lib/actions/certificates';
import type { Competency } from '@/types/database';

interface CertificateRow {
  id: string;
  certificate_number: string;
  verification_code: string;
  score_percentage: number;
  issued_at: string;
  revoked: boolean;
  candidates: { full_name: string; employee_id: string; department: string | null } | null;
  competencies: { code: string; competency_name: string } | null;
  assessments: { assessment_code: string } | null;
}

export function CertificatesTable({
  initialCertificates,
  competencies,
}: {
  initialCertificates: CertificateRow[];
  competencies: Competency[];
}) {
  const [certificates, setCertificates] = React.useState(initialCertificates);
  const [search, setSearch] = React.useState('');
  const [competencyId, setCompetencyId] = React.useState('');
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);

  // Skip the first run — initialCertificates is already server-rendered;
  // only refetch once the user changes the search or competency filter.
  const didMountFilters = React.useRef(false);
  React.useEffect(() => {
    if (!didMountFilters.current) {
      didMountFilters.current = true;
      return;
    }
    const timer = setTimeout(async () => {
      const data = await getCertificates({ search, competencyId: competencyId || undefined });
      setCertificates(data as unknown as CertificateRow[]);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, competencyId]);

  async function handleDownload(id: string) {
    setDownloadingId(id);
    try {
      const res = await fetch(`/api/certificates/${id}/download`);
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.message ?? 'Failed to generate download link');
        return;
      }
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search certificate #, name, employee ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select className="w-auto" value={competencyId} onChange={(e) => setCompetencyId(e.target.value)}>
            <option value="">All Competencies</option>
            {competencies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {certificates.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No certificates found"
          description="Certificates appear here automatically once a candidate passes an assessment."
        />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Certificate #</Th>
              <Th>Candidate</Th>
              <Th>Competency</Th>
              <Th>Score</Th>
              <Th>Issued</Th>
              <Th>Status</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {certificates.map((c) => (
              <Tr key={c.id}>
                <Td className="font-mono text-xs text-slate-500">{c.certificate_number}</Td>
                <Td>
                  <p className="font-medium text-slate-900">{c.candidates?.full_name ?? '—'}</p>
                  <p className="text-xs text-slate-400">{c.candidates?.employee_id}</p>
                </Td>
                <Td>{c.competencies && <CompetencyBadge code={c.competencies.code} />}</Td>
                <Td className="text-slate-500">{formatScore(c.score_percentage)}</Td>
                <Td className="text-slate-500">{formatDateTime(c.issued_at)}</Td>
                <Td>
                  <Badge
                    className={
                      c.revoked
                        ? 'border-rose-200 bg-rose-50 text-rose-700'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    }
                  >
                    {c.revoked ? 'Revoked' : 'Valid'}
                  </Badge>
                </Td>
                <Td>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(c.id)}
                      disabled={downloadingId === c.id}
                    >
                      <Download className="h-3.5 w-3.5" /> PDF
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <a href={`/verify/${c.verification_code}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" /> Verify
                      </a>
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
