'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Search, Plus, Pencil, Trash2, Users as UsersIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/dialog';
import { CandidateFormDialog } from '@/components/candidates/candidate-form-dialog';
import { getCandidates, deleteCandidate } from '@/lib/actions/candidates';
import type { Candidate, RoleName } from '@/types/database';

export function CandidatesTable({ initialCandidates, role }: { initialCandidates: Candidate[]; role: RoleName }) {
  const router = useRouter();
  const [candidates, setCandidates] = React.useState(initialCandidates);
  const [search, setSearch] = React.useState('');
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Candidate | null>(null);
  const [deleting, setDeleting] = React.useState<Candidate | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const canEdit = role === 'admin';

  async function refresh(term?: string) {
    const data = await getCandidates(term ?? search);
    setCandidates(data as Candidate[]);
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    const result = await deleteCandidate(deleting.id);
    setDeleteBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? 'Failed to delete candidate');
      return;
    }
    toast.success('Candidate deleted');
    setDeleting(null);
    refresh();
    router.refresh();
  }

  // Skip the very first run: initialCandidates already came from the
  // server-rendered page, so re-fetching the same unfiltered list on mount
  // is a redundant duplicate API call — only refetch once the user actually
  // changes the search term.
  const didMountSearch = React.useRef(false);
  React.useEffect(() => {
    if (!didMountSearch.current) {
      didMountSearch.current = true;
      return;
    }
    const timer = setTimeout(() => refresh(search), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="Search by name, employee ID, department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {canEdit && (
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add Candidate
          </Button>
        )}
      </div>

      {candidates.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="No candidates found"
          description="Add a candidate to get started, or adjust your search."
        />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Employee ID</Th>
              <Th>Name</Th>
              <Th>Designation</Th>
              <Th>Project / Contract</Th>
              <Th>Department</Th>
              <Th>Status</Th>
              {canEdit && <Th />}
            </Tr>
          </Thead>
          <Tbody>
            {candidates.map((c) => (
              <Tr key={c.id}>
                <Td className="font-medium text-slate-900">{c.employee_id}</Td>
                <Td>{c.full_name}</Td>
                <Td>{c.designation || '—'}</Td>
                <Td>{c.project_contract || '—'}</Td>
                <Td>{c.department || '—'}</Td>
                <Td>
                  <Badge className={c.active_status ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-500'}>
                    {c.active_status ? 'Active' : 'Inactive'}
                  </Badge>
                </Td>
                {canEdit && (
                  <Td>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(c);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(c)}>
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    </div>
                  </Td>
                )}
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <CandidateFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        candidate={editing}
        onSaved={() => {
          refresh();
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete Candidate?"
        description={
          deleting
            ? `You're about to permanently remove ${deleting.full_name} (${deleting.employee_id}) from the candidate list. This action cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        loading={deleteBusy}
        onConfirm={handleDelete}
      />
    </div>
  );
}
