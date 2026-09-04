'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select } from '@/components/ui/input';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDateTime } from '@/lib/utils';
import { getAuditLogs, type AuditLogRow, type AuditLogFilters } from '@/lib/actions/audit';

const ACTOR_TYPE_LABELS: Record<string, string> = {
  admin: 'Admin',
  viewer: 'Viewer',
  candidate: 'Candidate',
  system: 'System',
};

export function AuditLogViewer({ initialLogs, actions }: { initialLogs: AuditLogRow[]; actions: string[] }) {
  const [logs, setLogs] = React.useState(initialLogs);
  const [filters, setFilters] = React.useState<AuditLogFilters>({});
  const [loading, setLoading] = React.useState(false);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  function setField<K extends keyof AuditLogFilters>(key: K, value: AuditLogFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  async function applyFilters() {
    setLoading(true);
    const data = await getAuditLogs(filters);
    setLogs(data);
    setLoading(false);
  }

  function resetFilters() {
    setFilters({});
    setLogs(initialLogs);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <FormField label="Action" htmlFor="a_action">
            <Select id="a_action" value={filters.action ?? ''} onChange={(e) => setField('action', e.target.value)}>
              <option value="">All actions</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Actor Type" htmlFor="a_actor_type">
            <Select id="a_actor_type" value={filters.actorType ?? ''} onChange={(e) => setField('actorType', e.target.value as AuditLogFilters['actorType'])}>
              <option value="">All</option>
              <option value="admin">Admin</option>
              <option value="viewer">Viewer</option>
              <option value="candidate">Candidate</option>
              <option value="system">System</option>
            </Select>
          </FormField>
          <FormField label="From" htmlFor="a_from">
            <Input id="a_from" type="date" value={filters.dateFrom ?? ''} onChange={(e) => setField('dateFrom', e.target.value)} />
          </FormField>
          <FormField label="To" htmlFor="a_to">
            <Input id="a_to" type="date" value={filters.dateTo ?? ''} onChange={(e) => setField('dateTo', e.target.value)} />
          </FormField>
          <FormField label="Entity ID contains" htmlFor="a_search">
            <Input id="a_search" value={filters.search ?? ''} onChange={(e) => setField('search', e.target.value)} placeholder="e.g. assessment id" />
          </FormField>
        </div>
        <div className="mt-4 flex gap-2">
          <Button type="button" onClick={applyFilters} disabled={loading}>
            {loading ? 'Filtering…' : 'Apply Filters'}
          </Button>
          <Button type="button" variant="outline" onClick={resetFilters} disabled={loading}>
            Reset
          </Button>
        </div>
      </div>

      {logs.length === 0 ? (
        <EmptyState icon={ScrollText} title="No audit entries found" description="Adjust the filters above to widen the search." />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th />
              <Th>When</Th>
              <Th>Actor</Th>
              <Th>Action</Th>
              <Th>Entity</Th>
              <Th>IP</Th>
            </Tr>
          </Thead>
          <Tbody>
            {logs.map((log) => {
              const isOpen = expanded === log.id;
              const hasDetail = Boolean(log.old_value_json || log.new_value_json);
              return (
                <React.Fragment key={log.id}>
                  <Tr
                    className={hasDetail ? 'cursor-pointer' : ''}
                    onClick={() => hasDetail && setExpanded(isOpen ? null : log.id)}
                  >
                    <Td className="w-8">
                      {hasDetail && (isOpen ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />)}
                    </Td>
                    <Td className="text-slate-500">{formatDateTime(log.created_at)}</Td>
                    <Td>
                      <p className="font-medium text-slate-900">{log.profiles?.full_name ?? 'System'}</p>
                      <Badge className="mt-0.5 border-slate-200 bg-slate-100 text-slate-500">
                        {ACTOR_TYPE_LABELS[log.actor_type] ?? log.actor_type}
                      </Badge>
                    </Td>
                    <Td className="font-mono text-xs text-slate-700">{log.action}</Td>
                    <Td className="text-slate-500">
                      {log.entity_type ? `${log.entity_type} · ` : ''}
                      <span className="font-mono text-xs">{log.entity_id ?? '—'}</span>
                    </Td>
                    <Td className="text-xs text-slate-400">{log.ip_address ?? '—'}</Td>
                  </Tr>
                  {isOpen && hasDetail && (
                    <Tr>
                      <Td colSpan={6} className="bg-slate-50">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {log.old_value_json ? (
                            <div>
                              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Before</p>
                              <pre className="max-h-64 overflow-auto rounded-lg bg-white p-3 text-xs text-slate-600">
                                {JSON.stringify(log.old_value_json, null, 2)}
                              </pre>
                            </div>
                          ) : (
                            <div />
                          )}
                          {Boolean(log.new_value_json) && (
                            <div>
                              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">After</p>
                              <pre className="max-h-64 overflow-auto rounded-lg bg-white p-3 text-xs text-slate-600">
                                {JSON.stringify(log.new_value_json, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  )}
                </React.Fragment>
              );
            })}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
