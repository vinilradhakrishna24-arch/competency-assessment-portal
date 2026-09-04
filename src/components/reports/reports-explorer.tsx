'use client';

import * as React from 'react';
import { Download, FileSpreadsheet, FileText, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select } from '@/components/ui/input';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { CompetencyBadge } from '@/components/competency/competency-badge';
import { formatDateTime, formatScore } from '@/lib/utils';
import { getReportRows, type ReportRow, type ReportFilters, type ReportFilterOptions } from '@/lib/actions/reports';
import type { Competency } from '@/types/database';

const EMPTY_FILTERS: ReportFilters = {
  dateFrom: '',
  dateTo: '',
  competencyId: '',
  projectContract: '',
  department: '',
  designation: '',
  result: '',
};

export function ReportsExplorer({
  initialRows,
  competencies,
  filterOptions,
}: {
  initialRows: ReportRow[];
  competencies: Competency[];
  filterOptions: ReportFilterOptions;
}) {
  const [filters, setFilters] = React.useState<ReportFilters>(EMPTY_FILTERS);
  const [rows, setRows] = React.useState(initialRows);
  const [loading, setLoading] = React.useState(false);

  function setField<K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  async function applyFilters() {
    setLoading(true);
    const data = await getReportRows(filters);
    setRows(data);
    setLoading(false);
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    setRows(initialRows);
  }

  function buildExportUrl(format: 'csv' | 'xlsx') {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    params.set('format', format);
    return `/api/reports/export?${params.toString()}`;
  }

  const decided = rows.filter((r) => r.status === 'PASSED' || r.status === 'FAILED');
  const passRate = decided.length > 0 ? Math.round((rows.filter((r) => r.status === 'PASSED').length / decided.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <FormField label="From" htmlFor="f_from">
            <Input id="f_from" type="date" value={filters.dateFrom} onChange={(e) => setField('dateFrom', e.target.value)} />
          </FormField>
          <FormField label="To" htmlFor="f_to">
            <Input id="f_to" type="date" value={filters.dateTo} onChange={(e) => setField('dateTo', e.target.value)} />
          </FormField>
          <FormField label="Competency" htmlFor="f_competency">
            <Select id="f_competency" value={filters.competencyId} onChange={(e) => setField('competencyId', e.target.value)}>
              <option value="">All</option>
              {competencies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Result" htmlFor="f_result">
            <Select id="f_result" value={filters.result} onChange={(e) => setField('result', e.target.value as ReportFilters['result'])}>
              <option value="">All</option>
              <option value="PASSED">Passed</option>
              <option value="FAILED">Failed</option>
            </Select>
          </FormField>
          <FormField label="Project / Contract" htmlFor="f_project">
            <Select id="f_project" value={filters.projectContract} onChange={(e) => setField('projectContract', e.target.value)}>
              <option value="">All</option>
              {filterOptions.projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Department" htmlFor="f_department">
            <Select id="f_department" value={filters.department} onChange={(e) => setField('department', e.target.value)}>
              <option value="">All</option>
              {filterOptions.departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <Button type="button" onClick={applyFilters} disabled={loading}>
              {loading ? 'Filtering…' : 'Apply Filters'}
            </Button>
            <Button type="button" variant="outline" onClick={resetFilters} disabled={loading}>
              Reset
            </Button>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" asChild>
              <a href={buildExportUrl('csv')}>
                <FileText className="h-3.5 w-3.5" /> Export CSV
              </a>
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <a href={buildExportUrl('xlsx')}>
                <FileSpreadsheet className="h-3.5 w-3.5" /> Export Excel
              </a>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm">
          <BarChart3 className="h-4 w-4 text-slate-400" />
          <span className="text-slate-500">Results:</span>
          <span className="font-semibold text-slate-900">{rows.length}</span>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm">
          <span className="text-slate-500">Pass rate:</span>
          <span className="font-semibold text-slate-900">{passRate}%</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Download} title="No results for these filters" description="Try widening the date range or clearing a filter." />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Code</Th>
              <Th>Candidate</Th>
              <Th>Designation</Th>
              <Th>Project</Th>
              <Th>Department</Th>
              <Th>Competency</Th>
              <Th>Score</Th>
              <Th>Status</Th>
              <Th>Date</Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td className="font-mono text-xs text-slate-500">{r.assessment_code}</Td>
                <Td>
                  <p className="font-medium text-slate-900">{r.candidates?.full_name ?? '—'}</p>
                  <p className="text-xs text-slate-400">{r.candidates?.employee_id}</p>
                </Td>
                <Td className="text-slate-500">{r.candidates?.designation || '—'}</Td>
                <Td className="text-slate-500">{r.candidates?.project_contract || '—'}</Td>
                <Td className="text-slate-500">{r.candidates?.department || '—'}</Td>
                <Td>{r.competencies && <CompetencyBadge code={r.competencies.code} />}</Td>
                <Td className="text-slate-500">{formatScore(r.score_percentage)}</Td>
                <Td>
                  <StatusBadge status={r.status} />
                </Td>
                <Td className="text-slate-500">{formatDateTime(r.created_at)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
