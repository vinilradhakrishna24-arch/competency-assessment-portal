'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField, Input, Textarea, Select } from '@/components/ui/input';
import { createQuestion, updateQuestion } from '@/lib/actions/questions';
import type { QuestionInput } from '@/lib/validation/schemas';

export interface QuestionFormOption {
  option_key: string;
  option_text: string;
  is_correct: boolean;
}

export interface EditableQuestion {
  id: string;
  competency_id: string;
  question_set_id: string | null;
  question_type: 'single' | 'multiple' | 'true_false';
  question_text: string;
  scenario_text: string | null;
  marks: number;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  explanation_admin_only: string | null;
  active: boolean;
  options: QuestionFormOption[];
}

const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

function emptyForm(competencyId: string): QuestionInput {
  return {
    competency_id: competencyId,
    question_set_id: null,
    question_type: 'single',
    question_text: '',
    scenario_text: '',
    marks: 1,
    difficulty: 'medium',
    explanation_admin_only: '',
    active: true,
    options: [
      { option_key: 'A', option_text: '', is_correct: true },
      { option_key: 'B', option_text: '', is_correct: false },
    ],
  };
}

export function QuestionFormDialog({
  open,
  onOpenChange,
  competencies,
  questionSets,
  question,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  competencies: { id: string; code: string; competency_name: string }[];
  questionSets: { id: string; competency_id: string; set_name: string }[];
  question?: EditableQuestion | null;
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState<QuestionInput>(() => emptyForm(competencies[0]?.id ?? ''));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (question) {
      setForm({
        competency_id: question.competency_id,
        question_set_id: question.question_set_id,
        question_type: question.question_type,
        question_text: question.question_text,
        scenario_text: question.scenario_text ?? '',
        marks: question.marks,
        difficulty: question.difficulty,
        explanation_admin_only: question.explanation_admin_only ?? '',
        active: question.active,
        options: question.options,
      });
    } else {
      setForm(emptyForm(competencies[0]?.id ?? ''));
    }
    setErrors({});
  }, [open, question, competencies]);

  const availableSets = questionSets.filter((s) => s.competency_id === form.competency_id);

  function setField<K extends keyof QuestionInput>(key: K, value: QuestionInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleTypeChange(type: QuestionInput['question_type']) {
    if (type === 'true_false') {
      setForm((prev) => ({
        ...prev,
        question_type: type,
        options: [
          { option_key: 'A', option_text: 'True', is_correct: true },
          { option_key: 'B', option_text: 'False', is_correct: false },
        ],
      }));
    } else {
      setForm((prev) => ({ ...prev, question_type: type }));
    }
  }

  function updateOption(index: number, patch: Partial<QuestionFormOption>) {
    setForm((prev) => ({
      ...prev,
      options: prev.options.map((o, i) => {
        if (i !== index) {
          // single-answer: selecting a new correct option clears the others
          if (prev.question_type === 'single' && patch.is_correct) return { ...o, is_correct: false };
          return o;
        }
        return { ...o, ...patch };
      }),
    }));
  }

  function addOption() {
    if (form.options.length >= KEYS.length) return;
    const key = KEYS[form.options.length]!;
    setForm((prev) => ({ ...prev, options: [...prev.options, { option_key: key, option_text: '', is_correct: false }] }));
  }

  function removeOption(index: number) {
    setForm((prev) => ({ ...prev, options: prev.options.filter((_, i) => i !== index) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const result = question ? await updateQuestion(question.id, form) : await createQuestion(form);
    setSaving(false);

    if (!result.ok) {
      if (result.fieldErrors) setErrors(result.fieldErrors);
      if (result.error) toast.error(result.error);
      return;
    }

    toast.success(question ? 'Question updated' : 'Question created');
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={question ? 'Edit Question' : 'Add Question'}
      className="w-[min(42rem,94vw)]"
    >
      <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Competency" htmlFor="competency_id" required>
            <Select
              id="competency_id"
              value={form.competency_id}
              onChange={(e) => setField('competency_id', e.target.value)}
            >
              {competencies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.competency_name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Question Set" htmlFor="question_set_id">
            <Select
              id="question_set_id"
              value={form.question_set_id ?? ''}
              onChange={(e) => setField('question_set_id', e.target.value || null)}
            >
              <option value="">Unassigned</option>
              {availableSets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.set_name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Question Type" htmlFor="question_type" required>
            <Select
              id="question_type"
              value={form.question_type}
              onChange={(e) => handleTypeChange(e.target.value as QuestionInput['question_type'])}
            >
              <option value="single">Single Answer</option>
              <option value="multiple">Multiple Answer</option>
              <option value="true_false">True / False</option>
            </Select>
          </FormField>
          <FormField label="Marks" htmlFor="marks" required>
            <Input id="marks" type="number" min={0.5} step={0.5} value={form.marks} onChange={(e) => setField('marks', Number(e.target.value))} />
          </FormField>
          <FormField label="Difficulty" htmlFor="difficulty">
            <Select
              id="difficulty"
              value={form.difficulty ?? ''}
              onChange={(e) => setField('difficulty', (e.target.value || null) as QuestionInput['difficulty'])}
            >
              <option value="">—</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </Select>
          </FormField>
          <FormField label="Active" htmlFor="active">
            <label className="flex h-10 items-center gap-2 text-sm text-slate-600">
              <input
                id="active"
                type="checkbox"
                checked={form.active}
                onChange={(e) => setField('active', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Active
            </label>
          </FormField>
        </div>

        <FormField label="Scenario Text (optional)" htmlFor="scenario_text" hint="Displayed above the question as context.">
          <Textarea id="scenario_text" value={form.scenario_text} onChange={(e) => setField('scenario_text', e.target.value)} rows={2} />
        </FormField>

        <FormField label="Question Text" htmlFor="question_text" required>
          <Textarea id="question_text" value={form.question_text} onChange={(e) => setField('question_text', e.target.value)} rows={2} />
        </FormField>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">Answer Options</p>
            {form.question_type !== 'true_false' && (
              <Button type="button" variant="outline" size="sm" onClick={addOption} disabled={form.options.length >= KEYS.length}>
                <Plus className="h-3.5 w-3.5" /> Add Option
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {form.options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type={form.question_type === 'multiple' ? 'checkbox' : 'radio'}
                  name="correct-option"
                  checked={opt.is_correct}
                  onChange={(e) => updateOption(idx, { is_correct: e.target.checked })}
                  className="h-4 w-4 shrink-0"
                  aria-label={`Mark option ${opt.option_key} as correct`}
                />
                <span className="w-5 shrink-0 text-sm font-medium text-slate-500">{opt.option_key}</span>
                <Input
                  value={opt.option_text}
                  onChange={(e) => updateOption(idx, { option_text: e.target.value })}
                  disabled={form.question_type === 'true_false'}
                  placeholder={`Option ${opt.option_key} text`}
                />
                {form.question_type !== 'true_false' && form.options.length > 2 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeOption(idx)} aria-label="Remove option">
                    <Trash2 className="h-4 w-4 text-slate-400" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          {errors.options && <p className="mt-2 text-xs font-medium text-rose-600">{errors.options}</p>}
        </div>

        <FormField
          label="Explanation (Admin Only)"
          htmlFor="explanation_admin_only"
          hint="Never shown to candidates — for examiner reference only."
        >
          <Textarea
            id="explanation_admin_only"
            value={form.explanation_admin_only}
            onChange={(e) => setField('explanation_admin_only', e.target.value)}
            rows={2}
          />
        </FormField>

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : question ? 'Save Changes' : 'Create Question'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
