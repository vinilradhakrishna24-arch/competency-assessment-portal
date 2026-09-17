'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, ImagePlus, X, Loader2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField, Input, Textarea, Select } from '@/components/ui/input';
import { createQuestion, updateQuestion, uploadQuestionImage } from '@/lib/actions/questions';
import { MAX_QUESTION_IMAGE_BYTES, ALLOWED_QUESTION_IMAGE_TYPES, QUESTION_IMAGE_ACCEPT } from '@/lib/constants';
import type { QuestionInput } from '@/lib/validation/schemas';

export interface QuestionFormOption {
  option_key: string;
  option_text: string;
  is_correct: boolean;
}

export interface EditableQuestion {
  id: string;
  competency_id: string;
  competency_area_id: string | null;
  question_set_id: string | null;
  question_type: 'single' | 'multiple' | 'true_false';
  question_text: string;
  scenario_text: string | null;
  marks: number;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  explanation_admin_only: string | null;
  active: boolean;
  options: QuestionFormOption[];
  image_url: string | null;
}

const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

function emptyForm(competencyId: string, defaultAreaId: string | null = null): QuestionInput {
  return {
    competency_id: competencyId,
    competency_area_id: defaultAreaId,
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
    image_url: null,
  };
}

export function QuestionFormDialog({
  open,
  onOpenChange,
  competencies,
  questionSets,
  competencyAreas = [],
  question,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  competencies: { id: string; code: string; competency_name: string }[];
  questionSets: { id: string; competency_id: string; set_name: string }[];
  competencyAreas?: {
    id: string;
    competency_id: string;
    code: string;
    area_name: string;
    competency_type: 'knowledge' | 'skill';
  }[];
  question?: EditableQuestion | null;
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState<QuestionInput>(() => emptyForm(competencies[0]?.id ?? ''));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [uploadingImage, setUploadingImage] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    if (question) {
      setForm({
        competency_id: question.competency_id,
        competency_area_id: question.competency_area_id,
        question_set_id: question.question_set_id,
        question_type: question.question_type,
        question_text: question.question_text,
        scenario_text: question.scenario_text ?? '',
        marks: question.marks,
        difficulty: question.difficulty,
        explanation_admin_only: question.explanation_admin_only ?? '',
        active: question.active,
        options: question.options,
        image_url: question.image_url ?? null,
      });
    } else {
      const defaultCompetencyId = competencies[0]?.id ?? '';
      const defaultAreaId = competencyAreas.find((a) => a.competency_id === defaultCompetencyId)?.id ?? null;
      setForm(emptyForm(defaultCompetencyId, defaultAreaId));
    }
    setErrors({});
    setUploadingImage(false);
  }, [open, question, competencies, competencyAreas]);

  const availableSets = questionSets.filter((s) => s.competency_id === form.competency_id);
  const availableAreas = competencyAreas.filter((a) => a.competency_id === form.competency_id);
  // Competency Type is never entered manually -- it's always derived from
  // the selected Competency + Element via competency_areas.competency_type,
  // the single source of truth also used by bulk upload. Same rule: this
  // must be looked up per (competency, element), never assumed from the
  // element name alone (e.g. "Leadership and Commitment" is Knowledge under
  // HSE Advisor but Skill under HSE Manager).
  const selectedArea = availableAreas.find((a) => a.id === form.competency_area_id);

  // An HSE competency always has Elements configured -- Element is required
  // there (same rule bulk upload enforces). Rather than leaving a stale or
  // "Unassigned" Element selected after switching Competency, resolve both
  // fields together in the Competency select's own onChange (see below)
  // instead of a separate effect.
  function handleCompetencyChange(competencyId: string) {
    const areasForNext = competencyAreas.filter((a) => a.competency_id === competencyId);
    setForm((prev) => ({
      ...prev,
      competency_id: competencyId,
      competency_area_id: areasForNext[0]?.id ?? null,
    }));
  }

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

  async function handleImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later (e.g. after removing it)
    if (!file) return;

    if (!ALLOWED_QUESTION_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_QUESTION_IMAGE_TYPES)[number])) {
      toast.error('Only JPG, JPEG, PNG and WebP images are supported.');
      return;
    }
    if (file.size > MAX_QUESTION_IMAGE_BYTES) {
      toast.error(`Image is too large — the limit is ${Math.floor(MAX_QUESTION_IMAGE_BYTES / (1024 * 1024))}MB.`);
      return;
    }

    setUploadingImage(true);
    const fd = new FormData();
    fd.set('file', file);
    const result = await uploadQuestionImage(fd);
    setUploadingImage(false);

    if (!result.ok || !result.url) {
      toast.error(result.error ?? 'Failed to upload image.');
      return;
    }
    setField('image_url', result.url);
  }

  function removeImage() {
    setField('image_url', null);
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
              onChange={(e) => handleCompetencyChange(e.target.value)}
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
          {availableAreas.length > 0 && (
            <FormField
              label="Element"
              htmlFor="competency_area_id"
              hint="Competency Type (Knowledge/Skill) is derived automatically from Competency + Element."
            >
              <Select
                id="competency_area_id"
                value={form.competency_area_id ?? ''}
                onChange={(e) => setField('competency_area_id', e.target.value || null)}
              >
                {availableAreas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.area_name} ({a.competency_type === 'skill' ? 'Skill' : 'Knowledge'})
                  </option>
                ))}
              </Select>
              {selectedArea && (
                <p className="mt-1.5 text-xs text-slate-500">
                  Competency Type:{' '}
                  <span className="font-medium text-slate-700">
                    {selectedArea.competency_type === 'skill' ? 'Skill' : 'Knowledge'}
                  </span>
                </p>
              )}
            </FormField>
          )}
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

        <FormField
          label="Question Image (optional)"
          htmlFor="question_image"
          hint="JPG, JPEG, PNG or WebP, up to 5MB. Shown to the candidate above the question text."
        >
          <input
            ref={fileInputRef}
            id="question_image"
            type="file"
            accept={QUESTION_IMAGE_ACCEPT}
            className="hidden"
            onChange={handleImageSelected}
          />
          {form.image_url ? (
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.image_url}
                alt="Question preview"
                className="h-24 w-24 shrink-0 rounded-lg border border-slate-200 bg-white object-contain"
              />
              <div className="flex flex-1 flex-col gap-2">
                <p className="text-xs text-slate-500">Image uploaded. This will be saved with the question.</p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadingImage}>
                    {uploadingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                    Replace
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={removeImage} disabled={uploadingImage}>
                    <X className="h-3.5 w-3.5 text-slate-400" /> Remove
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadingImage}>
              {uploadingImage ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
                </>
              ) : (
                <>
                  <ImagePlus className="h-3.5 w-3.5" /> Upload Image
                </>
              )}
            </Button>
          )}
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
          <Button type="submit" disabled={saving || uploadingImage}>
            {saving ? 'Saving…' : question ? 'Save Changes' : 'Create Question'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
