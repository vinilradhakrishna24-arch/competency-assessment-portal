'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { createQuestionSet, updateQuestionSetActive } from '@/lib/actions/taxonomy';

interface QuestionSetRow {
  id: string;
  competency_id: string;
  set_name: string;
  active: boolean;
  competencies: { code: string; competency_name: string } | null;
}

export function QuestionSetsDialog({
  open,
  onOpenChange,
  competencies,
  questionSets,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  competencies: { id: string; code: string; competency_name: string }[];
  questionSets: QuestionSetRow[];
  onChanged: () => void;
}) {
  const [competencyId, setCompetencyId] = React.useState(competencies[0]?.id ?? '');
  const [setName, setSetName] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = await createQuestionSet({ competency_id: competencyId, set_name: setName, description: '', active: true });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error ?? Object.values(result.fieldErrors ?? {})[0] ?? 'Failed to create set');
      return;
    }
    toast.success('Question set created');
    setSetName('');
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Manage Question Sets" className="w-[min(32rem,92vw)]">
      <form onSubmit={handleCreate} className="mb-5 flex items-end gap-2 border-b border-slate-100 pb-5">
        <FormField label="Competency" htmlFor="set_competency" required>
          <Select id="set_competency" value={competencyId} onChange={(e) => setCompetencyId(e.target.value)}>
            {competencies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Set Name" htmlFor="set_name" required>
          <Input id="set_name" value={setName} onChange={(e) => setSetName(e.target.value)} placeholder="e.g. Set D" />
        </FormField>
        <Button type="submit" disabled={saving || !setName.trim()}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>

      <div className="max-h-72 space-y-2 overflow-y-auto">
        {questionSets.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <div>
              <span className="font-medium text-slate-900">{s.set_name}</span>
              <span className="ml-2 text-xs text-slate-400">{s.competencies?.code}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={s.active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-500'}>
                {s.active ? 'Active' : 'Inactive'}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await updateQuestionSetActive(s.id, !s.active);
                  onChanged();
                }}
              >
                {s.active ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
