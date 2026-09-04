'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField, Input } from '@/components/ui/input';
import { createCandidate, updateCandidate } from '@/lib/actions/candidates';
import type { Candidate } from '@/types/database';
import type { CandidateInput } from '@/lib/validation/schemas';

const EMPTY: CandidateInput = {
  employee_id: '',
  full_name: '',
  designation: '',
  email: '',
  mobile: '',
  project_contract: '',
  department: '',
  active_status: true,
};

export function CandidateFormDialog({
  open,
  onOpenChange,
  candidate,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate?: Candidate | null;
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState<CandidateInput>(EMPTY);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setForm(
        candidate
          ? {
              employee_id: candidate.employee_id,
              full_name: candidate.full_name,
              designation: candidate.designation ?? '',
              email: candidate.email ?? '',
              mobile: candidate.mobile ?? '',
              project_contract: candidate.project_contract ?? '',
              department: candidate.department ?? '',
              active_status: candidate.active_status,
            }
          : EMPTY
      );
      setErrors({});
    }
  }, [open, candidate]);

  function set<K extends keyof CandidateInput>(key: K, value: CandidateInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const result = candidate ? await updateCandidate(candidate.id, form) : await createCandidate(form);
    setSaving(false);

    if (!result.ok) {
      if (result.fieldErrors) setErrors(result.fieldErrors);
      if (result.error) toast.error(result.error);
      return;
    }

    toast.success(candidate ? 'Candidate updated' : 'Candidate created');
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={candidate ? 'Edit Candidate' : 'Add Candidate'}
      className="w-[min(36rem,92vw)]"
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Employee ID" htmlFor="employee_id" required error={errors.employee_id}>
            <Input id="employee_id" value={form.employee_id} onChange={(e) => set('employee_id', e.target.value)} />
          </FormField>
          <FormField label="Full Name" htmlFor="full_name" required error={errors.full_name}>
            <Input id="full_name" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
          </FormField>
          <FormField label="Designation" htmlFor="designation">
            <Input id="designation" value={form.designation} onChange={(e) => set('designation', e.target.value)} />
          </FormField>
          <FormField label="Department" htmlFor="department">
            <Input id="department" value={form.department} onChange={(e) => set('department', e.target.value)} />
          </FormField>
          <FormField label="Email" htmlFor="email" error={errors.email}>
            <Input id="email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </FormField>
          <FormField label="Mobile" htmlFor="mobile">
            <Input id="mobile" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} />
          </FormField>
          <FormField label="Project / Contract" htmlFor="project_contract">
            <Input
              id="project_contract"
              value={form.project_contract}
              onChange={(e) => set('project_contract', e.target.value)}
            />
          </FormField>
          <FormField label="Active" htmlFor="active_status">
            <label className="flex h-10 items-center gap-2 text-sm text-slate-600">
              <input
                id="active_status"
                type="checkbox"
                checked={form.active_status}
                onChange={(e) => set('active_status', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Active
            </label>
          </FormField>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : candidate ? 'Save Changes' : 'Add Candidate'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
